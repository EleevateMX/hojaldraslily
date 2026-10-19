-- (Parte de «Mandar a hacer TODOS los panes». El por qué completo está en
--  20261019070006_produccion_de_los_panes_en_piezas_1_columna.sql; se aplicó
--  en cinco pasos porque el MCP de Supabase no traga bloques grandes de una
--  sola vez, y el registro de la base guarda uno por paso.)

-- ---------------------------------------------------------------------------
-- 5. Sacar del horno
-- ---------------------------------------------------------------------------
-- Devuelve `cuadros` en null cuando el renglón se cuenta en piezas, por la
-- misma razón: no hay cuadros que anunciar. El inventario lo mueve el trigger
-- de arriba, no esta función.

create or replace function public.fn_horno_sacar(
  p_item_id uuid,
  p_moldes integer default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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

  if v_fila.unidad = 'molde' then
    select cuadros_libres into v_libres
      from fn_existencias_por_sabor(null) where sabor = v_fila.sabor;
  end if;

  return jsonb_build_object(
    'sacados', v_saca,
    'sabor',   v_fila.sabor,
    'unidad',  v_fila.unidad,
    -- En piezas no hay cuadros que anunciar, y un 0 se leeria como «no quedo
    -- nada». Va null, que es lo que de verdad pasa: eso no se cuenta asi.
    'cuadros', case when v_fila.unidad = 'molde'
                    then v_saca * v_fila.cuadros_por_molde end,
    'libres',  v_libres
  );
end $function$;
