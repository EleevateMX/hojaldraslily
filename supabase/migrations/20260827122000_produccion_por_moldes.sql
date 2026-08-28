-- Producir se pide en MOLDES, y lo hecho entra en cuadros.
--
-- Se reescriben juntas las funciones de produccion y su trigger porque todas
-- hablaban de "paquetes de un producto" y ahora hablan de "moldes de un
-- sabor". Dejarlas a medias dejaria el inventario mintiendo.

-- El renglon de una orden ya no apunta a un paquete concreto: apunta a un
-- SABOR. Se afloja la restriccion antes de que nada inserte sin producto.
alter table public.orden_produccion_items alter column producto_id drop not null;
alter table public.orden_produccion_items alter column cantidad_pedida drop not null;

-- ---------------------------------------------------------------- pedir ---
drop function if exists public.fn_produccion_mandar_a_hacer(jsonb, text);

create or replace function public.fn_produccion_mandar_a_hacer(
  p_items jsonb,      -- [{"sabor": "Pasta de Guayaba", "moldes": 4}, ...]
  p_nota  text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid; v_quien text; v_item jsonb; v_n int := 0;
begin
  if fn_rol_staff() is null then
    raise exception 'Solo el personal puede mandar a producir.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'No hay nada que mandar a hacer.';
  end if;

  select e.nombre into v_quien
    from empleados e where e.auth_user_id = auth.uid() and e.activo limit 1;

  insert into ordenes_produccion (nota, creada_por)
  values (nullif(trim(coalesce(p_nota, '')), ''), v_quien)
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if coalesce((v_item->>'moldes')::int, 0) > 0
       and length(coalesce(v_item->>'sabor', '')) > 0 then
      insert into orden_produccion_items (orden_id, sabor, moldes, cantidad_hecha)
      values (v_id, v_item->>'sabor', (v_item->>'moldes')::int, 0);
      v_n := v_n + 1;
    end if;
  end loop;

  if v_n = 0 then
    raise exception 'Todos los renglones venían en cero.';
  end if;
  return v_id;
end;
$$;

-- ------------------------------------------------------------- el puente ---
-- Lo que se marca como hecho entra SOLO al inventario, en cuadros.
create or replace function public.fn_produccion_desde_orden()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_delta int; v_cpm int;
begin
  v_delta := coalesce(new.cantidad_hecha, 0) - coalesce(old.cantidad_hecha, 0);
  if v_delta = 0 or new.sabor is null then
    return new;
  end if;

  select coalesce(min(cuadros_por_molde), 48) into v_cpm from parametros;

  -- Se apunta solo la DIFERENCIA, y en cuadros: marcar "van 2 moldes" y
  -- luego "van 3" tiene que sumar 3 moldes en total, no 5.
  insert into produccion (producto_id, sabor, cantidad, motivo, nota, quien, orden_produccion_item_id)
  values (
    null,
    new.sabor,
    v_delta * v_cpm,
    case when v_delta > 0 then 'horneado' else 'ajuste' end,
    'Orden de producción',
    coalesce(new.terminado_por, 'Producción'),
    new.id
  );
  return new;
end;
$$;

-- --------------------------------------------------------------- avanzar ---
drop function if exists public.fn_produccion_avanzar(uuid, int);

create or replace function public.fn_produccion_avanzar(
  p_item_id uuid,
  p_moldes  int      -- TOTAL de moldes hechos, no un incremento
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_quien text; v_orden uuid; v_pendientes int; v_sabor text; v_libres bigint;
begin
  if fn_rol_staff() is null then
    raise exception 'Solo el personal puede marcar producción.';
  end if;
  if p_moldes is null or p_moldes < 0 then
    raise exception 'Los moldes no pueden ser negativos.';
  end if;

  select e.nombre into v_quien
    from empleados e where e.auth_user_id = auth.uid() and e.activo limit 1;

  update orden_produccion_items
     set cantidad_hecha = p_moldes,
         terminado_por  = coalesce(v_quien, terminado_por),
         terminado_en   = case when p_moldes > 0 then now() else null end
   where id = p_item_id
   returning orden_id, sabor into v_orden, v_sabor;

  if v_orden is null then
    raise exception 'Ese renglón de producción no existe.';
  end if;

  -- La orden se cierra sola cuando no falta nada: nadie tiene que acordarse
  -- de marcarla terminada, que es el paso que siempre se olvida.
  select count(*) into v_pendientes
    from orden_produccion_items
   where orden_id = v_orden and cantidad_hecha < coalesce(moldes, 0);

  update ordenes_produccion
     set estado = case when v_pendientes = 0 then 'terminada' else 'en_proceso' end,
         updated_at = now()
   where id = v_orden and estado <> 'cancelada';

  select cuadros_libres into v_libres
    from fn_existencias_por_sabor(null) where sabor = v_sabor;
  return coalesce(v_libres, 0);
end;
$$;

-- ---------------------------------------------------------------- ajuste ---
-- Para apuntar a mano lo que salio sin orden, o una merma.
drop function if exists public.fn_produccion_registrar(uuid, int, text, text);

create or replace function public.fn_horneada_registrar(
  p_sabor   text,
  p_cuadros int,
  p_motivo  text default 'horneado',
  p_nota    text default null
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_quien text; v_libres bigint;
begin
  if fn_rol_staff() is null then
    raise exception 'Solo el personal puede registrar producción.';
  end if;
  if p_cuadros is null or p_cuadros = 0 then
    raise exception 'La cantidad no puede ser cero.';
  end if;
  if p_motivo not in ('horneado', 'merma', 'ajuste') then
    raise exception 'Motivo desconocido: %', p_motivo;
  end if;

  select e.nombre into v_quien
    from empleados e where e.auth_user_id = auth.uid() and e.activo limit 1;

  insert into produccion (producto_id, sabor, cantidad, motivo, nota, quien)
  values (
    null, p_sabor,
    -- La merma SIEMPRE resta, aunque se capture en positivo: es el error mas
    -- facil capturando rapido, y deja el inventario al reves justo cuando
    -- mas se necesita.
    case when p_motivo = 'horneado' then abs(p_cuadros) else -abs(p_cuadros) end,
    p_motivo, nullif(trim(coalesce(p_nota, '')), ''), v_quien
  );

  select cuadros_libres into v_libres
    from fn_existencias_por_sabor(null) where sabor = p_sabor;
  return coalesce(v_libres, 0);
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'fn_produccion_mandar_a_hacer(jsonb, text)',
    'fn_produccion_avanzar(uuid, int)',
    'fn_horneada_registrar(text, int, text, text)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
