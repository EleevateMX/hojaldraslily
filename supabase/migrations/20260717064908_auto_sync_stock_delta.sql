create table if not exists public.costos_stock_sync (
  insumo_id   uuid not null references public.insumos(id)    on delete cascade,
  almacen_id  uuid not null references public.almacenes(id)  on delete cascade,
  ultimo_valor numeric not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (insumo_id, almacen_id)
);

alter table public.costos_stock_sync enable row level security;
drop policy if exists costos_stock_sync_no_anon on public.costos_stock_sync;
create policy costos_stock_sync_no_anon on public.costos_stock_sync
  for select using (false);

create or replace function public._aplicar_delta_almacen(
  p_almacen uuid, p_cual text, p_tipo tipo_movimiento
) returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into inventario_movimientos (insumo_id, almacen_id, cantidad, tipo, nota)
  select t.insumo_id, p_almacen, t.nuevo - t.anterior, p_tipo,
         'Sync costosshake (' || p_cual || ')'
  from (
    select s.insumo_id,
           case when p_cual='kiosko' then s.kiosko_val else s.bodega_val end as nuevo,
           coalesce(ss.ultimo_valor, 0) as anterior
    from _stk s
    left join costos_stock_sync ss on ss.insumo_id = s.insumo_id and ss.almacen_id = p_almacen
  ) t
  where t.nuevo - t.anterior <> 0;

  insert into inventario_stock (almacen_id, insumo_id, stock_actual, stock_minimo)
  select p_almacen, t.insumo_id, t.nuevo - t.anterior, 0
  from (
    select s.insumo_id,
           case when p_cual='kiosko' then s.kiosko_val else s.bodega_val end as nuevo,
           coalesce(ss.ultimo_valor, 0) as anterior
    from _stk s
    left join costos_stock_sync ss on ss.insumo_id = s.insumo_id and ss.almacen_id = p_almacen
  ) t
  where t.nuevo - t.anterior <> 0
  on conflict (almacen_id, insumo_id)
  do update set stock_actual = inventario_stock.stock_actual + excluded.stock_actual;

  insert into costos_stock_sync (insumo_id, almacen_id, ultimo_valor)
  select s.insumo_id, p_almacen,
         case when p_cual='kiosko' then s.kiosko_val else s.bodega_val end
  from _stk s
  on conflict (insumo_id, almacen_id)
  do update set ultimo_valor = excluded.ultimo_valor, updated_at = now();
end $function$;

create or replace function public.fn_sync_stock_costos()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_kiosko uuid;
  v_bodega uuid;
begin
  select id into v_kiosko from almacenes where tipo = 'kiosko' order by id limit 1;
  select id into v_bodega from almacenes where tipo = 'bodega' order by id limit 1;
  if v_kiosko is null then
    return;
  end if;

  create temp table _stk on commit drop as
  select distinct on (i.id)
    i.id as insumo_id,
    coalesce(nullif(c.kiosko, '')::numeric, 0) as kiosko_val,
    coalesce(nullif(c.bodega, '')::numeric, 0) as bodega_val
  from (
    select trim(x->>'marca') || ' - ' || trim(x->>'sabor') nombre,
           x->>'invIndividual' kiosko, x->>'invOriginal' bodega
    from app_data, jsonb_array_elements(data->'proteins') x
    where coalesce(trim(x->>'marca'),'')<>'' or coalesce(trim(x->>'sabor'),'')<>''
    union all
    select trim(x->>'nombre'), x->>'invIndividual', x->>'invOriginal'
    from app_data, jsonb_array_elements(data->'shakeIngs') x where coalesce(trim(x->>'nombre'),'')<>''
    union all
    select trim(x->>'nombre'), x->>'invIndividual', x->>'invOriginal'
    from app_data, jsonb_array_elements(data->'foodIngs') x where coalesce(trim(x->>'nombre'),'')<>''
    union all
    select trim(x->>'nombre'), x->>'invIndividual', x->>'invOriginal'
    from app_data, jsonb_array_elements(data->'empaque') x where coalesce(trim(x->>'nombre'),'')<>''
    union all
    select trim(x->>'nombre'), x->>'invIndividual', x->>'invOriginal'
    from app_data, jsonb_array_elements(data->'bebidas') x where coalesce(trim(x->>'nombre'),'')<>''
    union all
    select trim(x->>'nombre'), x->>'invIndividual', x->>'invOriginal'
    from app_data, jsonb_array_elements(data->'snacks') x where coalesce(trim(x->>'nombre'),'')<>''
  ) c
  join insumos i on lower(i.nombre) = lower(c.nombre)
  order by i.id, coalesce(nullif(c.kiosko,'')::numeric,0) desc, coalesce(nullif(c.bodega,'')::numeric,0) desc;

  perform _aplicar_delta_almacen(v_kiosko, 'kiosko', 'traspaso');
  if v_bodega is not null then
    perform _aplicar_delta_almacen(v_bodega, 'bodega', 'ajuste');
  end if;
end $function$;

create or replace function public.trg_sync_app_data()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform fn_sync_app_data();
  perform fn_sync_stock_costos();
  return new;
end $function$;