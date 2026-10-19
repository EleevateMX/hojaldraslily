-- (Parte de «Mandar a hacer TODOS los panes». El por qué completo está en
--  20261019070006_produccion_de_los_panes_en_piezas_1_columna.sql; se aplicó
--  en cinco pasos porque el MCP de Supabase no traga bloques grandes de una
--  sola vez, y el registro de la base guarda uno por paso.)

-- ---------------------------------------------------------------------------
-- 2. Mandar a hacer, en moldes o en piezas
-- ---------------------------------------------------------------------------
-- Misma firma, así que REEMPLAZA y no duplica (§4).

create or replace function public.fn_produccion_mandar_a_hacer(
  p_items jsonb,
  p_nota text default null
) returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid; v_quien text; v_item jsonb; v_n int := 0;
  v_molde int; v_def int; v_unidad text;
begin
  if fn_rol_staff() is null then
    raise exception 'Solo el personal puede mandar a producir.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'No hay nada que mandar a hacer.';
  end if;

  select coalesce(min(cuadros_por_molde), 48) into v_def from parametros;

  select e.nombre into v_quien
    from empleados e where e.auth_user_id = auth.uid() and e.activo limit 1;

  insert into ordenes_produccion (nota, creada_por)
  values (nullif(trim(coalesce(p_nota, '')), ''), v_quien)
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    -- Sin `unidad` se asume molde, que es lo que mandaban todas las pantallas
    -- antes de esta migracion. Una pantalla vieja sigue funcionando igual.
    v_unidad := coalesce(nullif(trim(coalesce(v_item->>'unidad', '')), ''), 'molde');
    if v_unidad not in ('molde', 'pieza') then
      raise exception 'La unidad tiene que ser molde o pieza, no %.', v_unidad;
    end if;

    if v_unidad = 'molde' then
      -- Sin molde explícito manda el de siempre. Así una pantalla vieja que no
      -- sabe de moldes sigue funcionando en vez de reventar.
      v_molde := coalesce((v_item->>'molde')::int, v_def);
      if v_molde not in (24, 48) then
        raise exception 'El molde tiene que ser de 24 o de 48, no de %.', v_molde;
      end if;
    else
      -- Una rosca no tiene molde. Se guarda null, no un 48 de relleno.
      v_molde := null;
    end if;

    if coalesce((v_item->>'moldes')::int, 0) > 0
       and length(coalesce(v_item->>'sabor', '')) > 0 then
      insert into orden_produccion_items
        (orden_id, sabor, moldes, cantidad_hecha, cuadros_por_molde, unidad)
      values
        (v_id, v_item->>'sabor', (v_item->>'moldes')::int, 0, v_molde, v_unidad);
      v_n := v_n + 1;
    end if;
  end loop;

  if v_n = 0 then
    raise exception 'Todos los renglones venían en cero.';
  end if;
  return v_id;
end;
$function$;

comment on function public.fn_produccion_mandar_a_hacer(jsonb, text) is
  'Manda a hacer. Cada renglon trae `sabor`, `moldes` (cuantos) y su `unidad`: '
  'molde (con `molde` de 48 o 24) o pieza, para lo que se hornea al pedido y '
  'no se cuenta en cuadros. Sin `unidad` se asume molde.';
