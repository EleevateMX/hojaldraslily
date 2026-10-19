-- (Parte de «Mandar a hacer TODOS los panes». El por qué completo está en
--  20261019070006_produccion_de_los_panes_en_piezas_1_columna.sql; se aplicó
--  en cinco pasos porque el MCP de Supabase no traga bloques grandes de una
--  sola vez, y el registro de la base guarda uno por paso.)

-- ---------------------------------------------------------------------------
-- 3. Lo que sale del horno entra al inventario… si se cuenta en cuadros
-- ---------------------------------------------------------------------------
-- Sigue en TRIGGER y no en la RPC a propósito: la regla se cumple venga de
-- donde venga el UPDATE (§2.0).

create or replace function public.fn_produccion_desde_orden()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_delta int;
begin
  -- `cantidad_hecha` cuenta los moldes que YA SALIERON DEL HORNO. Ese es el
  -- momento en que hay pan de verdad, y por eso es el que mueve inventario.
  v_delta := coalesce(new.cantidad_hecha, 0) - coalesce(old.cantidad_hecha, 0);
  if v_delta = 0 or new.sabor is null then
    return new;
  end if;

  -- Lo que se cuenta en piezas no tiene cuadros que mover. Multiplicar por un
  -- molde inventado metería al inventario cuadros de un pan que no se cuenta
  -- en cuadros, y ese numero se sumaria en todos los reportes. El trabajo
  -- queda apuntado en `cantidad_hecha`, que es lo que miran la mesa y el
  -- horno.
  if new.unidad = 'pieza' or new.cuadros_por_molde is null then
    return new;
  end if;

  insert into produccion (producto_id, sabor, cantidad, motivo, nota, quien,
                          orden_produccion_item_id, cuadros_por_molde)
  values (
    null,
    new.sabor,
    v_delta * new.cuadros_por_molde,
    case when v_delta > 0 then 'horneado' else 'ajuste' end,
    'Orden de producción · molde de ' || new.cuadros_por_molde,
    coalesce(new.terminado_por, 'Producción'),
    new.id,
    -- Antes esto solo iba en la nota, o sea en texto que nadie puede sumar.
    new.cuadros_por_molde
  );
  return new;
end;
$function$;
