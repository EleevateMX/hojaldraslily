-- Las tres manos: armar, meter al horno, sacar del horno.
--
-- Una función por gesto, y cada una revisa lo suyo. No hay un
-- `avanzar(etapa)` genérico a propósito: las reglas de cada paso son
-- distintas, y una sola función con un `case` termina siendo el lugar donde
-- se cuelan los estados imposibles.
--
-- Las tres son idempotentes en el sentido que importa en una pantalla táctil:
-- mandan el TOTAL o la CANTIDAD del gesto, y la base valida contra lo que ya
-- hay. Dos toques seguidos por nervios no hornean el doble.

-- ------------------------------------------------------------------------
-- P: producción armó moldes.
-- ------------------------------------------------------------------------
create or replace function public.fn_produccion_armar(
  p_item_id uuid,
  p_moldes  int
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_quien text; v_orden uuid; v_fila orden_produccion_items%rowtype;
begin
  if fn_rol_staff() is null then
    raise exception 'Solo el personal puede marcar producción.';
  end if;

  select e.nombre into v_quien
    from empleados e where e.auth_user_id = auth.uid() and e.activo limit 1;

  select * into v_fila from orden_produccion_items where id = p_item_id for update;
  if v_fila.id is null then
    raise exception 'Ese renglón de producción no existe.';
  end if;

  -- Se manda el TOTAL armado, no un incremento: la pantalla muestra «van 3»
  -- y quien corrige pone el número que ve, no la diferencia.
  if p_moldes is null or p_moldes < 0 then
    raise exception 'Los moldes no pueden ser negativos.';
  end if;
  if p_moldes > coalesce(v_fila.moldes, 0) then
    raise exception 'Se pidieron % moldes y estás marcando %.', v_fila.moldes, p_moldes;
  end if;
  -- No se puede desarmar lo que ya está en el horno o ya salió.
  if p_moldes < v_fila.cantidad_hecha + v_fila.moldes_en_horno then
    raise exception 'Ya hay % moldes en el horno o fuera de él: no se puede bajar a %.',
      v_fila.cantidad_hecha + v_fila.moldes_en_horno, p_moldes;
  end if;

  update orden_produccion_items
     set moldes_armados = p_moldes,
         terminado_por  = coalesce(v_quien, terminado_por)
   where id = p_item_id
   returning orden_id into v_orden;

  perform fn_produccion_refrescar_estado(v_orden);

  return jsonb_build_object('armados', p_moldes, 'pedidos', v_fila.moldes);
end $$;

-- ------------------------------------------------------------------------
-- H: al horno.
-- ------------------------------------------------------------------------
create or replace function public.fn_horno_meter(
  p_item_id uuid,
  p_moldes  int default 1
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_fila orden_produccion_items%rowtype; v_disponibles int; v_min int; v_listo timestamptz;
begin
  if fn_rol_staff() is null then
    raise exception 'Solo el personal puede usar el horno.';
  end if;

  select * into v_fila from orden_produccion_items where id = p_item_id for update;
  if v_fila.id is null then
    raise exception 'Ese renglón de producción no existe.';
  end if;

  if coalesce(p_moldes, 0) <= 0 then
    raise exception '¿Cuántos moldes entran? Tiene que ser más de cero.';
  end if;

  -- Lo que se puede meter: lo armado, menos lo que ya salió, menos lo que ya
  -- está adentro.
  v_disponibles := v_fila.moldes_armados - v_fila.cantidad_hecha - v_fila.moldes_en_horno;
  if p_moldes > v_disponibles then
    raise exception 'Solo hay % moldes listos para entrar (pediste %).', v_disponibles, p_moldes;
  end if;

  update orden_produccion_items
     set moldes_en_horno = moldes_en_horno + p_moldes,
         -- El reloj arranca con esta tanda. Si ya había algo adentro, se
         -- reinicia a propósito: lo que importa es cuándo sale lo ÚLTIMO que
         -- entró, no lo primero -- sacar antes quemaría a medias la tanda nueva.
         horno_entro_en = now()
   where id = p_item_id;

  select coalesce(min(minutos_horneado_default), 50) into v_min from parametros;
  select coalesce(min(p.minutos_horneado), v_min) into v_min
    from productos p where p.sabor = v_fila.sabor and p.minutos_horneado is not null;
  v_listo := now() + make_interval(mins => v_min);

  perform fn_produccion_refrescar_estado(v_fila.orden_id);

  return jsonb_build_object(
    'en_horno', v_fila.moldes_en_horno + p_moldes,
    'minutos',  v_min,
    'listo_en', v_listo
  );
end $$;

-- ------------------------------------------------------------------------
-- H: del horno al inventario.
--
-- Este es el momento en que hay pan. Subir `cantidad_hecha` dispara el
-- trigger que lo mete al inventario, con el molde del renglón.
-- ------------------------------------------------------------------------
create or replace function public.fn_horno_sacar(
  p_item_id uuid,
  p_moldes  int default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_fila orden_produccion_items%rowtype; v_quien text; v_saca int; v_libres bigint;
begin
  if fn_rol_staff() is null then
    raise exception 'Solo el personal puede usar el horno.';
  end if;

  select e.nombre into v_quien
    from empleados e where e.auth_user_id = auth.uid() and e.activo limit 1;

  select * into v_fila from orden_produccion_items where id = p_item_id for update;
  if v_fila.id is null then
    raise exception 'Ese renglón de producción no existe.';
  end if;

  -- Sin número, sale todo lo que hay adentro: es el gesto de siempre y el que
  -- conviene que sea de un solo toque.
  v_saca := coalesce(p_moldes, v_fila.moldes_en_horno);
  if v_saca <= 0 then
    raise exception 'No hay nada de eso en el horno.';
  end if;
  if v_saca > v_fila.moldes_en_horno then
    raise exception 'En el horno hay % moldes, no %.', v_fila.moldes_en_horno, v_saca;
  end if;

  update orden_produccion_items
     set moldes_en_horno = moldes_en_horno - v_saca,
         cantidad_hecha  = cantidad_hecha + v_saca,
         terminado_por   = coalesce(v_quien, terminado_por),
         terminado_en    = now(),
         horno_entro_en  = case when moldes_en_horno - v_saca = 0 then null else horno_entro_en end
   where id = p_item_id;

  perform fn_produccion_refrescar_estado(v_fila.orden_id);

  select cuadros_libres into v_libres
    from fn_existencias_por_sabor(null) where sabor = v_fila.sabor;

  return jsonb_build_object(
    'sacados', v_saca,
    'sabor',   v_fila.sabor,
    'cuadros', v_saca * v_fila.cuadros_por_molde,
    'libres',  coalesce(v_libres, 0)
  );
end $$;

-- ------------------------------------------------------------------------
-- El estado de la orden se DEDUCE de sus renglones.
--
-- Nadie tiene que acordarse de marcarla terminada: ese es el paso que siempre
-- se olvida, y una orden que se queda «en proceso» para siempre ensucia la
-- pantalla hasta que se deja de leer.
-- ------------------------------------------------------------------------
create or replace function public.fn_produccion_refrescar_estado(p_orden_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_falta int; v_horno int; v_tocado int;
begin
  select count(*) filter (where cantidad_hecha < coalesce(moldes, 0)),
         count(*) filter (where moldes_en_horno > 0),
         count(*) filter (where moldes_armados > 0)
    into v_falta, v_horno, v_tocado
    from orden_produccion_items where orden_id = p_orden_id;

  update ordenes_produccion
     set estado = case
           when v_falta = 0   then 'terminada'
           when v_horno > 0   then 'en_horno'
           when v_tocado > 0  then 'en_proceso'
           else 'pendiente' end,
         updated_at = now()
   where id = p_orden_id and estado <> 'cancelada';
end $$;

grant execute on function public.fn_produccion_armar(uuid, int)  to authenticated;
grant execute on function public.fn_horno_meter(uuid, int)        to authenticated;
grant execute on function public.fn_horno_sacar(uuid, int)        to authenticated;
revoke all on function public.fn_produccion_armar(uuid, int) from public, anon;
revoke all on function public.fn_horno_meter(uuid, int)       from public, anon;
revoke all on function public.fn_horno_sacar(uuid, int)       from public, anon;
revoke all on function public.fn_produccion_refrescar_estado(uuid) from public, anon;
