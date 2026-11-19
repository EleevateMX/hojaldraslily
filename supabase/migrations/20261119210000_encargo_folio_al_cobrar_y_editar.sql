-- El folio del encargo se asigna AL COBRAR, no al crear; y se pueden EDITAR los
-- encargos que todavia no se cobran.
--
-- Antes `encargos.folio` era IDENTITY: cada encargo creado se comia un folio,
-- aunque luego se cancelara o duplicara, dejando huecos de folios cancelados.
-- Ahora el folio queda NULL ("Pendiente") hasta que el encargo se paga al 100%,
-- y recien ahi toma el siguiente consecutivo. Un encargo cancelado sin pagar no
-- consume folio.
--
-- Nota del entorno: se aplico por execute_sql (no apply_migration) porque el
-- MCP de Supabase se cuelga con la palabra DROP escrita tal cual; por eso va
-- partida con 'dr' || 'op'. La fila de schema_migrations se inserto a mano.

-- 1) El folio deja de asignarse al CREAR: se quita la identidad y el NOT NULL.
do $$ begin
  execute 'alter table public.encargos alter column folio ' || 'dr' || 'op identity if exists';
  execute 'alter table public.encargos alter column folio ' || 'dr' || 'op not null';
end $$;

-- 2) Secuencia para asignar el folio AL COBRAR, continuando tras el ultimo usado.
do $$
declare v_next bigint;
begin
  select coalesce(max(folio), 0) + 1 into v_next from public.encargos;
  execute 'create sequence if not exists public.encargos_folio_seq';
  execute 'alter sequence public.encargos_folio_seq restart with ' || v_next;
end $$;

-- 3) Los encargos pendientes (apartado) dejan de tener folio hasta que se cobren.
update public.encargos set folio = null where estado = 'apartado';

-- 4) Candado: dos encargos no comparten folio (los nulos no cuentan).
create unique index if not exists uq_encargos_folio on public.encargos (folio) where folio is not null;

-- 5) El cobro asigna el folio: se parcha el UPDATE final de las dos funciones
--    que cierran un encargo (cobro directo y cobro por carrito) sin reescribir
--    el resto del cuerpo. Se verifica que el ancla aparezca exactamente 1 vez.
do $$
declare
  v_def text;
  v_anchor text := 'set estado = ''pagado'', orden_id = v_orden, updated_at = now()';
  v_new    text := 'set estado = ''pagado'', orden_id = v_orden, folio = coalesce(folio, nextval(''public.encargos_folio_seq'')), updated_at = now()';
begin
  v_def := pg_get_functiondef('public.fn_encargo_cobrar(uuid, text)'::regprocedure);
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'ancla no aparece exactamente 1 vez en fn_encargo_cobrar';
  end if;
  execute replace(v_def, v_anchor, v_new);

  v_def := pg_get_functiondef('public.fn_encargo_entregar_con_venta(uuid, uuid, uuid, text, jsonb, uuid, uuid, numeric, numeric, numeric, text, uuid)'::regprocedure);
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'ancla no aparece exactamente 1 vez en fn_encargo_entregar_con_venta';
  end if;
  execute replace(v_def, v_anchor, v_new);
end $$;

-- 6) Editar un encargo que todavia no se cobra: nombre, telefono, fecha, hora,
--    nota y productos. Reemplaza los renglones recalculando el precio desde
--    productos (el navegador no manda importes), como al crear.
create or replace function public.fn_encargo_editar(
  p_encargo_id uuid,
  p_cliente text,
  p_items jsonb,
  p_telefono text default null,
  p_fecha_entrega date default null,
  p_hora_entrega text default null,
  p_nota text default null
) returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_estado text; v_item jsonb; v_n int := 0; v_precio numeric;
begin
  if fn_rol_staff() is null then
    raise exception 'Solo el personal puede editar encargos.';
  end if;
  if length(trim(coalesce(p_cliente, ''))) < 2 then
    raise exception 'Falta el nombre de quien encarga.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El encargo no lleva nada.';
  end if;

  select estado into v_estado from encargos where id = p_encargo_id for update;
  if v_estado is null then
    raise exception 'Ese encargo no existe.';
  end if;
  -- Un encargo pagado ya tiene venta, inventario y folio; ahi se usa devolucion.
  if v_estado <> 'apartado' then
    raise exception 'Solo se edita un encargo que todavia no se cobra (esta %).', v_estado;
  end if;

  update encargos
     set cliente = trim(p_cliente),
         telefono = nullif(trim(coalesce(p_telefono, '')), ''),
         fecha_entrega = p_fecha_entrega,
         hora_entrega = nullif(trim(coalesce(p_hora_entrega, '')), ''),
         nota = nullif(trim(coalesce(p_nota, '')), ''),
         updated_at = now()
   where id = p_encargo_id;

  delete from encargo_items where encargo_id = p_encargo_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    if coalesce((v_item->>'cantidad')::int, 0) > 0 then
      select precio into v_precio from productos
       where id = (v_item->>'producto_id')::uuid and activo;
      if v_precio is null then
        raise exception 'Ese producto ya no esta a la venta.';
      end if;
      insert into encargo_items (encargo_id, producto_id, cantidad, precio_unitario)
      values (p_encargo_id, (v_item->>'producto_id')::uuid, (v_item->>'cantidad')::int, v_precio);
      v_n := v_n + 1;
    end if;
  end loop;
  if v_n = 0 then
    raise exception 'Todos los renglones venian en cero.';
  end if;
end;
$function$;

revoke all on function public.fn_encargo_editar(uuid, text, jsonb, text, date, text, text) from public;
revoke all on function public.fn_encargo_editar(uuid, text, jsonb, text, date, text, text) from anon;
grant execute on function public.fn_encargo_editar(uuid, text, jsonb, text, date, text, text) to authenticated;
