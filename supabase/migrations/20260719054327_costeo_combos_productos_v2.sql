alter table public.productos add column if not exists es_combo boolean not null default false;

create table if not exists public.combo_items (
  combo_id uuid not null references public.productos(id) on delete cascade,
  producto_id uuid not null references public.productos(id),
  cantidad numeric not null check (cantidad > 0),
  primary key (combo_id, producto_id)
);
create index if not exists ix_combo_items_producto on public.combo_items(producto_id);

alter table public.combo_items enable row level security;
drop policy if exists sel_combo_items on public.combo_items;
create policy sel_combo_items on public.combo_items for select using (true);
drop policy if exists ins_combo_items on public.combo_items;
create policy ins_combo_items on public.combo_items for insert with check (true);
drop policy if exists upd_combo_items on public.combo_items;
create policy upd_combo_items on public.combo_items for update using (true);
drop policy if exists del_combo_items on public.combo_items;
create policy del_combo_items on public.combo_items for delete using (true);

create or replace function public.fn_cocina_de_producto(p_producto_id uuid)
returns uuid
language sql stable
security definer
set search_path = public
as $function$
  select coalesce(c.cocina_id, (select id from cocinas where slug = 'bebidas'))
  from productos p left join categorias c on c.id = p.categoria_id
  where p.id = p_producto_id;
$function$;

create or replace function public.fn_combo_items_validar()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_combo_es_combo boolean;
  v_componente_es_combo boolean;
  v_cocina_nueva uuid;
  v_cocina_otra uuid;
  v_combo_categoria uuid;
  v_cocina_combo uuid;
begin
  if new.combo_id = new.producto_id then
    raise exception 'Un combo no puede incluirse a sí mismo';
  end if;

  select es_combo into v_combo_es_combo from productos where id = new.combo_id;
  if not found or not coalesce(v_combo_es_combo, false) then
    raise exception 'combo_id debe apuntar a un producto marcado es_combo = true';
  end if;

  select es_combo into v_componente_es_combo from productos where id = new.producto_id;
  if not found then
    raise exception 'El producto componente % no existe', new.producto_id;
  end if;
  if coalesce(v_componente_es_combo, false) then
    raise exception 'Un combo no puede incluir otro combo (no soportado en esta versión)';
  end if;

  v_cocina_nueva := fn_cocina_de_producto(new.producto_id);

  select fn_cocina_de_producto(ci.producto_id) into v_cocina_otra
  from combo_items ci
  where ci.combo_id = new.combo_id and ci.producto_id <> new.producto_id
  limit 1;
  if v_cocina_otra is not null and v_cocina_otra is distinct from v_cocina_nueva then
    raise exception 'Todos los productos de un combo deben ser de la misma estación (cocina) en esta versión — no se pueden mezclar Alimentos y Bebidas en un mismo combo';
  end if;

  select categoria_id into v_combo_categoria from productos where id = new.combo_id;
  if v_combo_categoria is not null then
    select cocina_id into v_cocina_combo from categorias where id = v_combo_categoria;
    if v_cocina_combo is not null and v_cocina_combo is distinct from v_cocina_nueva then
      raise exception 'La categoría del combo no corresponde a la estación de este producto componente';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_combo_items_validar on public.combo_items;
create trigger trg_combo_items_validar
  before insert or update on public.combo_items
  for each row execute function public.fn_combo_items_validar();

create or replace function public.fn_combo_recalcular(p_combo_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  delete from recetas where producto_id = p_combo_id;
  insert into recetas (producto_id, insumo_id, cantidad, nota)
  select p_combo_id, r.insumo_id, sum(r.cantidad * ci.cantidad), 'combo'
  from combo_items ci
  join recetas r on r.producto_id = ci.producto_id
  where ci.combo_id = p_combo_id
  group by r.insumo_id;
end;
$function$;

create or replace function public.trg_combo_items_recalcular()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  perform fn_combo_recalcular(coalesce(new.combo_id, old.combo_id));
  return coalesce(new, old);
end;
$function$;

drop trigger if exists trg_combo_items_recalcular on public.combo_items;
create trigger trg_combo_items_recalcular
  after insert or update or delete on public.combo_items
  for each row execute function public.trg_combo_items_recalcular();

create or replace function public.trg_recetas_actualiza_combos()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_pid uuid;
  v_combo record;
begin
  v_pid := coalesce(new.producto_id, old.producto_id);
  for v_combo in select distinct combo_id from combo_items where producto_id = v_pid loop
    perform fn_combo_recalcular(v_combo.combo_id);
  end loop;
  return coalesce(new, old);
end;
$function$;

drop trigger if exists trg_recetas_actualiza_combos on public.recetas;
create trigger trg_recetas_actualiza_combos
  after insert or update or delete on public.recetas
  for each row execute function public.trg_recetas_actualiza_combos();

create or replace function public.trg_producto_desactiva_combos()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if new.activo = false and old.activo is distinct from false then
    update productos set activo = false
    where es_combo = true and activo = true
      and id in (select combo_id from combo_items where producto_id = new.id);
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_producto_desactiva_combos on public.productos;
create trigger trg_producto_desactiva_combos
  after update of activo on public.productos
  for each row execute function public.trg_producto_desactiva_combos();

create or replace view public.vw_costeo_producto as
 with p as (
    select parametros.id, parametros.iva, parametros.food_cost_meta, parametros.merma_default,
      parametros.mano_obra, parametros.clave_traspaso, parametros.clave_compras, parametros.updated_at
    from parametros where parametros.id = 'default'::text
  ), costos as (
    select pr.id as producto_id,
      coalesce(sum(r.cantidad * i.costo_unitario), 0::numeric) as costo_insumos,
      coalesce(sum(r.cantidad * i.costo_unitario) filter (where i.tipo = 'empaque'::tipo_insumo), 0::numeric) as costo_empaque,
      coalesce(sum(r.cantidad * i.costo_unitario) filter (where i.tipo <> 'empaque'::tipo_insumo), 0::numeric) as costo_receta
    from productos pr
      left join recetas r on r.producto_id = pr.id
      left join insumos i on i.id = r.insumo_id
    group by pr.id
  ), calc as (
    select pr.id, pr.nombre, pr.codigo, pr.precio, pr.iva_incluido, pr.es_reventa,
      c.costo_insumos, c.costo_empaque, c.costo_receta,
      coalesce(pr.merma_pct, p.merma_default) as merma,
      case when pr.mano_obra > 0::numeric then pr.mano_obra else p.mano_obra end as mano_efectiva,
      c.costo_receta * (1::numeric + coalesce(pr.merma_pct, p.merma_default)) as con_merma,
      c.costo_receta * (1::numeric + coalesce(pr.merma_pct, p.merma_default)) + c.costo_empaque +
        case when pr.mano_obra > 0::numeric then pr.mano_obra else p.mano_obra end as total,
      case when pr.iva_incluido then pr.precio / (1::numeric + p.iva) else pr.precio end as sin_iva,
      case when pr.iva_incluido then pr.precio else pr.precio * (1::numeric + p.iva) end as con_iva,
      p.iva, p.food_cost_meta, pr.es_combo
    from productos pr join costos c on c.producto_id = pr.id cross join p
  )
 select id, nombre, codigo, precio, iva_incluido, es_reventa,
    costo_insumos, round(con_merma, 2) as costo_con_merma, mano_efectiva as mano_obra,
    round(total, 2) as costo_total, round(sin_iva, 2) as precio_sin_iva,
    round(total / nullif(sin_iva, 0::numeric), 4) as food_cost_pct,
    round(sin_iva - total, 2) as margen,
    round(round(total / nullif(food_cost_meta, 0::numeric) * (1::numeric + iva) / 5.0) * 5.0, 2) as precio_sugerido,
    round(costo_empaque, 2) as costo_empaque, round(costo_receta, 2) as costo_receta,
    round(con_iva, 2) as precio_con_iva,
    round((sin_iva - total) / nullif(sin_iva, 0::numeric), 4) as margen_pct,
    es_combo
   from calc;

create or replace view public.vw_combos as
select
  combo.id, combo.nombre, combo.precio, combo.activo, combo.categoria_id, cat.nombre as categoria_nombre,
  coalesce(jsonb_agg(jsonb_build_object(
    'producto_id', comp.id, 'nombre', comp.nombre, 'cantidad', ci.cantidad, 'activo', comp.activo
  ) order by comp.nombre) filter (where comp.id is not null), '[]'::jsonb) as componentes,
  bool_and(comp.activo) as todos_componentes_activos,
  vc.costo_total, vc.costo_insumos, vc.precio_sin_iva, vc.margen, vc.margen_pct, vc.food_cost_pct, vc.precio_sugerido
from productos combo
left join categorias cat on cat.id = combo.categoria_id
left join combo_items ci on ci.combo_id = combo.id
left join productos comp on comp.id = ci.producto_id
left join vw_costeo_producto vc on vc.id = combo.id
where combo.es_combo = true
group by combo.id, combo.nombre, combo.precio, combo.activo, combo.categoria_id, cat.nombre,
  vc.costo_total, vc.costo_insumos, vc.precio_sin_iva, vc.margen, vc.margen_pct, vc.food_cost_pct, vc.precio_sugerido;

grant select on public.vw_combos to anon, authenticated;