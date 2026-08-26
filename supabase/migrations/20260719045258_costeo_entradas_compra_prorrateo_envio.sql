create table if not exists public.entradas_compra (
  id uuid primary key default gen_random_uuid(),
  almacen_id uuid not null references public.almacenes(id),
  proveedor text,
  factura text,
  forma_pago text,
  fecha date not null,
  costo_envio numeric not null default 0 check (costo_envio >= 0),
  subtotal_mercancia numeric not null default 0,
  total numeric not null default 0,
  estado text not null default 'confirmada' check (estado in ('confirmada','cancelada')),
  created_at timestamptz not null default now(),
  cancelada_at timestamptz
);

create table if not exists public.entrada_lineas (
  id uuid primary key default gen_random_uuid(),
  entrada_id uuid not null references public.entradas_compra(id) on delete cascade,
  insumo_id uuid not null references public.insumos(id),
  cantidad numeric not null check (cantidad > 0),
  costo_unitario_capturado numeric not null check (costo_unitario_capturado >= 0),
  contenido_capturado numeric,
  presentacion_capturada text,
  caducidad date,
  subtotal numeric not null,
  envio_prorrateado numeric not null default 0,
  costo_unitario_final numeric not null,
  costo_compra_insumo_antes numeric,
  contenido_insumo_antes numeric,
  lote_id uuid references public.lotes(id),
  created_at timestamptz not null default now()
);

create index if not exists ix_entrada_lineas_entrada on public.entrada_lineas(entrada_id);
create index if not exists ix_entrada_lineas_insumo on public.entrada_lineas(insumo_id, created_at desc);

alter table public.entradas_compra enable row level security;
alter table public.entrada_lineas enable row level security;

revoke all on public.entradas_compra from anon, authenticated;
revoke all on public.entrada_lineas from anon, authenticated;
grant select on public.entradas_compra to anon, authenticated;
grant select on public.entrada_lineas to anon, authenticated;

drop policy if exists sel_entradas_compra on public.entradas_compra;
create policy sel_entradas_compra on public.entradas_compra for select using (true);
drop policy if exists sel_entrada_lineas on public.entrada_lineas;
create policy sel_entrada_lineas on public.entrada_lineas for select using (true);

create or replace function public.fn_entrada_previsualizar(
  p_lineas jsonb,
  p_costo_envio numeric default 0
) returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_subtotal_total numeric;
  v_n integer;
  v_envio numeric := greatest(0, coalesce(p_costo_envio, 0));
  v_result jsonb;
begin
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'La entrada no tiene productos';
  end if;

  drop table if exists _prev;
  create temp table _prev on commit drop as
  select
    ord::int as ord,
    (l->>'insumo_id')::uuid as insumo_id,
    coalesce((l->>'cantidad')::numeric, 0) as cantidad,
    coalesce((l->>'costo_unitario')::numeric, 0) as costo_unitario
  from jsonb_array_elements(p_lineas) with ordinality as t(l, ord);

  if exists (select 1 from _prev where insumo_id is null or cantidad <= 0 or costo_unitario < 0) then
    raise exception 'Hay líneas con producto sin resolver, cantidad inválida o costo negativo';
  end if;
  if exists (select 1 from _prev p where not exists (select 1 from insumos i where i.id = p.insumo_id)) then
    raise exception 'Algún producto de la entrada no existe en el catálogo real';
  end if;

  select coalesce(sum(cantidad * costo_unitario), 0), count(*) into v_subtotal_total, v_n from _prev;

  select jsonb_build_object(
    'costo_envio', v_envio,
    'subtotal_mercancia', v_subtotal_total,
    'total', v_subtotal_total + v_envio,
    'lineas', coalesce(jsonb_agg(jsonb_build_object(
      'insumo_id', p.insumo_id,
      'nombre', i.nombre,
      'tipo', i.tipo,
      'cantidad', p.cantidad,
      'costo_unitario_capturado', p.costo_unitario,
      'subtotal', round(p.cantidad * p.costo_unitario, 4),
      'envio_prorrateado', round(e.envio_linea, 2),
      'costo_unitario_final', round(p.costo_unitario + e.envio_linea / p.cantidad, 4),
      'importe_final', round(p.cantidad * p.costo_unitario + e.envio_linea, 2)
    ) order by p.ord), '[]'::jsonb)
  ) into v_result
  from _prev p
  join insumos i on i.id = p.insumo_id
  cross join lateral (
    select case
      when v_subtotal_total > 0 then
        case when p.ord = (select max(ord) from _prev)
          then v_envio - coalesce((select sum(round(v_envio * (p2.cantidad*p2.costo_unitario)/v_subtotal_total, 2))
                                    from _prev p2 where p2.ord <> (select max(ord) from _prev)), 0)
          else round(v_envio * (p.cantidad * p.costo_unitario) / v_subtotal_total, 2)
        end
      else
        case when p.ord = (select max(ord) from _prev)
          then v_envio - coalesce((select sum(round(v_envio / v_n, 2)) from _prev p2 where p2.ord <> (select max(ord) from _prev)), 0)
          else round(v_envio / v_n, 2)
        end
    end as envio_linea
  ) e;

  return v_result;
end;
$function$;

create or replace function public.fn_entrada_confirmar(
  p_almacen_id uuid,
  p_proveedor text,
  p_factura text,
  p_forma_pago text,
  p_fecha date,
  p_costo_envio numeric,
  p_lineas jsonb,
  p_clave text
) returns public.entradas_compra
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_clave_real text;
  v_envio numeric := greatest(0, coalesce(p_costo_envio, 0));
  v_subtotal_total numeric;
  v_n integer;
  v_entrada entradas_compra;
  v_row record;
  v_envio_linea numeric;
  v_costo_final numeric;
  v_subtotal numeric;
  v_max_ord integer;
  v_envio_acum numeric := 0;
  v_lote_id uuid;
  v_costo_antes numeric;
  v_contenido_antes numeric;
begin
  select clave_compras into v_clave_real from parametros where id = 'default';
  if v_clave_real is null or p_clave is null or p_clave <> v_clave_real then
    raise exception 'Clave de compras incorrecta';
  end if;

  if p_almacen_id is null or not exists (select 1 from almacenes where id = p_almacen_id) then
    raise exception 'Almacén inválido';
  end if;
  if p_fecha is null then
    raise exception 'Falta la fecha de la entrada';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'La entrada no tiene productos';
  end if;

  drop table if exists _conf;
  create temp table _conf on commit drop as
  select
    ord::int as ord,
    (l->>'insumo_id')::uuid as insumo_id,
    coalesce((l->>'cantidad')::numeric, 0) as cantidad,
    coalesce((l->>'costo_unitario')::numeric, 0) as costo_unitario,
    nullif(l->>'contenido','')::numeric as contenido,
    nullif(l->>'presentacion','') as presentacion,
    nullif(l->>'caducidad','')::date as caducidad
  from jsonb_array_elements(p_lineas) with ordinality as t(l, ord);

  if exists (select 1 from _conf where insumo_id is null or cantidad <= 0 or costo_unitario < 0) then
    raise exception 'Hay líneas con producto sin resolver, cantidad inválida o costo negativo';
  end if;
  if exists (select 1 from _conf c where not exists (select 1 from insumos i where i.id = c.insumo_id)) then
    raise exception 'Algún producto de la entrada no existe en el catálogo real';
  end if;

  select coalesce(sum(cantidad * costo_unitario), 0), count(*), max(ord)
    into v_subtotal_total, v_n, v_max_ord from _conf;

  insert into entradas_compra (almacen_id, proveedor, factura, forma_pago, fecha, costo_envio, subtotal_mercancia, total)
  values (p_almacen_id, nullif(p_proveedor,''), nullif(p_factura,''), nullif(p_forma_pago,''), p_fecha, v_envio, v_subtotal_total, v_subtotal_total + v_envio)
  returning * into v_entrada;

  for v_row in select * from _conf order by ord loop
    v_subtotal := round(v_row.cantidad * v_row.costo_unitario, 4);
    if v_row.ord = v_max_ord then
      v_envio_linea := v_envio - v_envio_acum;
    elsif v_subtotal_total > 0 then
      v_envio_linea := round(v_envio * (v_row.cantidad * v_row.costo_unitario) / v_subtotal_total, 2);
    else
      v_envio_linea := round(v_envio / v_n, 2);
    end if;
    v_envio_acum := v_envio_acum + v_envio_linea;
    v_costo_final := v_row.costo_unitario + v_envio_linea / v_row.cantidad;

    select costo_compra, contenido into v_costo_antes, v_contenido_antes from insumos where id = v_row.insumo_id;

    insert into lotes (insumo_id, almacen_id, numero_lote, cantidad_inicial, cantidad_actual, costo_unitario, fecha_caducidad)
    values (v_row.insumo_id, p_almacen_id, p_factura, v_row.cantidad, v_row.cantidad, v_costo_final, v_row.caducidad)
    returning id into v_lote_id;

    insert into entrada_lineas (
      entrada_id, insumo_id, cantidad, costo_unitario_capturado, contenido_capturado,
      presentacion_capturada, caducidad, subtotal, envio_prorrateado, costo_unitario_final,
      costo_compra_insumo_antes, contenido_insumo_antes, lote_id
    ) values (
      v_entrada.id, v_row.insumo_id, v_row.cantidad, v_row.costo_unitario, v_row.contenido,
      v_row.presentacion, v_row.caducidad, v_subtotal, v_envio_linea, v_costo_final,
      v_costo_antes, v_contenido_antes, v_lote_id
    );

    insert into inventario_movimientos (insumo_id, almacen_id, cantidad, tipo, costo_unitario, referencia_id, nota)
    values (v_row.insumo_id, p_almacen_id, v_row.cantidad, 'compra', v_costo_final, v_entrada.id,
      'Entrada' || case when p_factura is not null and p_factura <> '' then ' · factura ' || p_factura else '' end);

    insert into inventario_stock (almacen_id, insumo_id, stock_actual, stock_minimo)
    values (p_almacen_id, v_row.insumo_id, v_row.cantidad, 0)
    on conflict (almacen_id, insumo_id)
    do update set stock_actual = inventario_stock.stock_actual + excluded.stock_actual;

    update insumos set
      costo_compra = v_costo_final,
      contenido = coalesce(v_row.contenido, contenido),
      presentacion = coalesce(v_row.presentacion, presentacion),
      proveedor = coalesce(nullif(p_proveedor,''), proveedor),
      ultima_compra = p_fecha
    where id = v_row.insumo_id;
  end loop;

  return v_entrada;
end;
$function$;

create or replace function public.fn_entrada_cancelar(
  p_entrada_id uuid,
  p_clave text
) returns public.entradas_compra
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_clave_real text;
  v_entrada entradas_compra;
  v_linea record;
  v_es_mas_reciente boolean;
begin
  select clave_compras into v_clave_real from parametros where id = 'default';
  if v_clave_real is null or p_clave is null or p_clave <> v_clave_real then
    raise exception 'Clave de compras incorrecta';
  end if;

  select * into v_entrada from entradas_compra where id = p_entrada_id for update;
  if not found then
    raise exception 'Entrada no encontrada';
  end if;
  if v_entrada.estado <> 'confirmada' then
    raise exception 'Esta entrada ya está cancelada';
  end if;

  for v_linea in select * from entrada_lineas where entrada_id = p_entrada_id loop
    update inventario_stock set stock_actual = stock_actual - v_linea.cantidad
    where almacen_id = v_entrada.almacen_id and insumo_id = v_linea.insumo_id;

    insert into inventario_movimientos (insumo_id, almacen_id, cantidad, tipo, costo_unitario, referencia_id, nota)
    values (v_linea.insumo_id, v_entrada.almacen_id, -v_linea.cantidad, 'ajuste', v_linea.costo_unitario_final,
      v_entrada.id, 'Cancelación de entrada' || case when v_entrada.factura is not null then ' · factura ' || v_entrada.factura else '' end);

    if v_linea.lote_id is not null then
      update lotes set cantidad_actual = 0 where id = v_linea.lote_id;
    end if;

    select not exists (
      select 1 from entrada_lineas el2
      join entradas_compra ec2 on ec2.id = el2.entrada_id
      where el2.insumo_id = v_linea.insumo_id and ec2.estado = 'confirmada'
        and (ec2.fecha, el2.created_at) > (v_entrada.fecha, v_linea.created_at)
    ) into v_es_mas_reciente;

    if v_es_mas_reciente then
      update insumos set
        costo_compra = coalesce(v_linea.costo_compra_insumo_antes, costo_compra),
        contenido = coalesce(v_linea.contenido_insumo_antes, contenido)
      where id = v_linea.insumo_id;
    end if;
  end loop;

  update entradas_compra set estado = 'cancelada', cancelada_at = now()
  where id = p_entrada_id
  returning * into v_entrada;

  return v_entrada;
end;
$function$;

create or replace function public.fn_entrada_historial(
  p_limite integer default 30
) returns jsonb
language sql
security definer
set search_path = public
stable
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', ec.id, 'fecha', ec.fecha, 'proveedor', ec.proveedor, 'factura', ec.factura,
    'costo_envio', ec.costo_envio, 'subtotal_mercancia', ec.subtotal_mercancia, 'total', ec.total,
    'estado', ec.estado, 'created_at', ec.created_at,
    'n_lineas', (select count(*) from entrada_lineas el where el.entrada_id = ec.id)
  ) order by ec.created_at desc), '[]'::jsonb)
  from (select * from entradas_compra order by created_at desc limit greatest(1, coalesce(p_limite, 30))) ec;
$function$;

grant execute on function public.fn_entrada_previsualizar(jsonb, numeric) to anon, authenticated;
grant execute on function public.fn_entrada_confirmar(uuid, text, text, text, date, numeric, jsonb, text) to anon, authenticated;
grant execute on function public.fn_entrada_cancelar(uuid, text) to anon, authenticated;
grant execute on function public.fn_entrada_historial(integer) to anon, authenticated;
