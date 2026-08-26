insert into public.categorias (nombre, cocina_id, activa, orden)
select 'Suplementos', (select id from cocinas where slug='bebidas'), true, 5
where not exists (select 1 from categorias where nombre='Suplementos');

insert into public.categorias (nombre, cocina_id, activa, orden)
select 'Extras', (select id from cocinas where slug='alimentos'), true, 99
where not exists (select 1 from categorias where nombre='Extras');

alter table public.productos add column if not exists es_extra boolean not null default false;

create table if not exists public.producto_extras (
  producto_id uuid not null references public.productos(id) on delete cascade,
  extra_id uuid not null references public.productos(id) on delete cascade,
  primary key (producto_id, extra_id)
);
create index if not exists ix_producto_extras_extra on public.producto_extras(extra_id);

alter table public.producto_extras enable row level security;
drop policy if exists sel_producto_extras on public.producto_extras;
create policy sel_producto_extras on public.producto_extras for select using (true);
drop policy if exists ins_producto_extras on public.producto_extras;
create policy ins_producto_extras on public.producto_extras for insert with check (true);
drop policy if exists del_producto_extras on public.producto_extras;
create policy del_producto_extras on public.producto_extras for delete using (true);

create or replace function public.fn_producto_extras_validar()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare v_es_extra boolean;
begin
  if new.producto_id = new.extra_id then
    raise exception 'Un producto no puede ofrecerse como extra de sí mismo';
  end if;
  select es_extra into v_es_extra from productos where id = new.extra_id;
  if not found then
    raise exception 'El extra % no existe', new.extra_id;
  end if;
  if not coalesce(v_es_extra, false) then
    raise exception 'Solo un producto marcado es_extra puede ofrecerse como extra';
  end if;
  return new;
end;
$function$;
revoke execute on function public.fn_producto_extras_validar() from public;

drop trigger if exists trg_producto_extras_validar on public.producto_extras;
create trigger trg_producto_extras_validar
  before insert or update on public.producto_extras
  for each row execute function public.fn_producto_extras_validar();

create or replace function public.fn_extras_disponibles(p_producto_id uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'insumo_id', i.id,
    'nombre', i.nombre,
    'unidad', i.unidad,
    'cantidad_receta', r.cantidad,
    'costo_unitario', i.costo_unitario,
    'costo_en_receta', round(coalesce(r.cantidad,0) * coalesce(i.costo_unitario,0), 2),
    'ya_es_extra', exists (
      select 1 from producto_extras pe
      join recetas re on re.producto_id = pe.extra_id and re.insumo_id = i.id
      where pe.producto_id = p_producto_id
    )
  ) order by i.nombre), '[]'::jsonb)
  from recetas r
  join insumos i on i.id = r.insumo_id
  where r.producto_id = p_producto_id and i.tipo <> 'empaque';
$function$;

create or replace function public.fn_guardar_extra(
  p_producto_id uuid,
  p_insumo_id uuid,
  p_nombre text,
  p_precio numeric,
  p_cantidad numeric default null
) returns public.productos
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_extra productos;
  v_cat uuid;
  v_cant numeric;
begin
  if p_precio is null or p_precio < 0 then
    raise exception 'El precio del extra no puede ser negativo';
  end if;
  select id into v_cat from categorias where nombre = 'Extras';

  v_cant := coalesce(p_cantidad,
    (select cantidad from recetas where producto_id = p_producto_id and insumo_id = p_insumo_id),
    0);

  select p.* into v_extra
  from productos p
  join recetas r on r.producto_id = p.id and r.insumo_id = p_insumo_id
  where p.es_extra = true
  limit 1;

  if found then
    update productos set
      nombre = coalesce(nullif(trim(p_nombre), ''), nombre),
      precio = p_precio,
      activo = (p_precio > 0)
    where id = v_extra.id
    returning * into v_extra;
    update recetas set cantidad = v_cant
    where producto_id = v_extra.id and insumo_id = p_insumo_id;
  else
    insert into productos (nombre, precio, iva_incluido, es_reventa, es_extra, activo, categoria_id)
    values (
      coalesce(nullif(trim(p_nombre), ''), 'Extra ' || (select nombre from insumos where id = p_insumo_id)),
      p_precio, true, false, true, (p_precio > 0), v_cat
    )
    returning * into v_extra;
    insert into recetas (producto_id, insumo_id, cantidad, nota)
    values (v_extra.id, p_insumo_id, v_cant, 'extra');
  end if;

  insert into producto_extras (producto_id, extra_id)
  values (p_producto_id, v_extra.id)
  on conflict do nothing;

  return v_extra;
end;
$function$;

create or replace function public.fn_quitar_extra(
  p_producto_id uuid,
  p_extra_id uuid
) returns void
language sql
security definer
set search_path = public
as $function$
  delete from producto_extras where producto_id = p_producto_id and extra_id = p_extra_id;
$function$;

grant execute on function public.fn_extras_disponibles(uuid) to anon, authenticated;
grant execute on function public.fn_guardar_extra(uuid, uuid, text, numeric, numeric) to anon, authenticated;
grant execute on function public.fn_quitar_extra(uuid, uuid) to anon, authenticated;

create or replace view public.vw_producto_extras as
select
  pe.producto_id,
  e.id as extra_id,
  e.nombre,
  e.precio,
  e.activo
from producto_extras pe
join productos e on e.id = pe.extra_id;
alter view public.vw_producto_extras set (security_invoker = true);
grant select on public.vw_producto_extras to anon, authenticated;