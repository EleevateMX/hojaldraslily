-- Mandar a hacer ya no es "tantos moldes": es "tantos moldes DE QUE tamano".
--
-- La casa hornea en moldes de 48 y de 24, y el tamano lo decide quien manda a
-- hacer, no un parametro global. Se guarda por RENGLON
-- (`orden_produccion_items.cuadros_por_molde`) porque en una misma orden
-- caben las dos cosas: 3 moldes de 48 de guayaba y 2 de 24 de queso.
--
-- Ojo con el `coalesce`: sin molde explicito se usa el de siempre. Asi una
-- pantalla vieja que todavia no sabe de moldes sigue mandando a hacer en vez
-- de reventar.
--
-- No cambia la firma, asi que `create or replace` si la reemplaza. Si algun
-- dia cambian los parametros hay que hacer `drop function` de la firma vieja:
-- cambiar la firma no reemplaza, DUPLICA (CLAUDE.md §4).

create or replace function public.fn_produccion_mandar_a_hacer(p_items jsonb, p_nota text default null)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_id uuid; v_quien text; v_item jsonb; v_n int := 0; v_molde int; v_def int;
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
    -- Sin molde explícito manda el de siempre. Así una pantalla vieja que no
    -- sabe de moldes sigue funcionando en vez de reventar.
    v_molde := coalesce((v_item->>'molde')::int, v_def);
    if v_molde not in (24, 48) then
      raise exception 'El molde tiene que ser de 24 o de 48, no de %.', v_molde;
    end if;

    if coalesce((v_item->>'moldes')::int, 0) > 0
       and length(coalesce(v_item->>'sabor', '')) > 0 then
      insert into orden_produccion_items
        (orden_id, sabor, moldes, cantidad_hecha, cuadros_por_molde)
      values
        (v_id, v_item->>'sabor', (v_item->>'moldes')::int, 0, v_molde);
      v_n := v_n + 1;
    end if;
  end loop;

  if v_n = 0 then
    raise exception 'Todos los renglones venían en cero.';
  end if;
  return v_id;
end;
$function$;
