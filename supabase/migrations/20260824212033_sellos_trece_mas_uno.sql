-- ─────────────────────────────────────────────────────────────────────────
-- SELLOS: 13 compras y la 14 va por cuenta de la casa
-- ─────────────────────────────────────────────────────────────────────────
--
-- Dos tarjetas separadas que no se mezclan: bebidas por un lado, comida por
-- el otro. Quien toma café todos los días no debería llenar la tarjeta de
-- sándwiches, y al revés.
--
-- El premio sale de un CATÁLOGO FIJO (`premios_sellos`) y no "lo que sea":
-- así el costo del regalo está siempre bajo control, aunque los 13 sellos
-- se hayan juntado con lo más barato de la carta.

create table if not exists config_sellos (
  tipo text primary key check (tipo in ('bebida', 'alimento')),
  requeridos integer not null default 13 check (requeridos > 0),
  -- Precio mínimo que debe tener un producto para dar sello. En 0 sella
  -- cualquiera; subirlo evita que 13 aguas de $10 den derecho a un premio
  -- caro. Se ajusta desde Admin sin tocar código.
  precio_minimo numeric(10,2) not null default 0,
  activo boolean not null default true
);

insert into config_sellos (tipo, requeridos, precio_minimo)
select * from (values ('bebida', 13, 0::numeric), ('alimento', 13, 0::numeric)) v(t,r,p)
where not exists (select 1 from config_sellos);

-- Qué se puede pedir gratis al completar la tarjeta.
create table if not exists premios_sellos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('bebida', 'alimento')),
  producto_id uuid not null references productos(id) on delete cascade,
  activo boolean not null default true,
  unique (tipo, producto_id)
);

alter table clientes add column if not exists sellos_bebida integer not null default 0;
alter table clientes add column if not exists sellos_alimento integer not null default 0;

create table if not exists sellos_movimientos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id),
  tipo text not null check (tipo in ('bebida', 'alimento')),
  -- Positivo sella, negativo canjea la tarjeta llena.
  sellos integer not null,
  orden_id uuid references ordenes(id),
  descripcion text,
  created_at timestamptz not null default now()
);
create index if not exists ix_sellos_cliente on sellos_movimientos (cliente_id, created_at desc);
-- Una orden sella una sola vez, pase lo que pase con la red.
create unique index if not exists uq_sellos_por_orden_tipo
  on sellos_movimientos (orden_id, tipo) where sellos > 0;

alter table premios_sellos enable row level security;
alter table config_sellos enable row level security;
alter table sellos_movimientos enable row level security;
create policy premios_leer on premios_sellos for select to anon, authenticated using (activo);
create policy config_sellos_leer on config_sellos for select to anon, authenticated using (true);
create policy sellos_mov_propio on sellos_movimientos for select to authenticated
  using (exists (select 1 from clientes c where c.id = cliente_id and c.auth_user_id = auth.uid())
         or coalesce(fn_es_staff(), false));

grant select on premios_sellos, config_sellos, sellos_movimientos to anon, authenticated;

-- ─────────────── Sellar al pagar ───────────────
-- Cuenta PRODUCTOS, no visitas: quien pide tres shakes de una se lleva tres
-- sellos, que es lo que la gente espera de una tarjeta de sellos.
-- Las recargas nunca sellan (no son consumo).
create or replace function public.fn_sellar_compra()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r record;
begin
  if not (NEW.pagado = true and OLD.pagado is distinct from true) then return NEW; end if;
  if NEW.cliente_id is null or NEW.es_demo then return NEW; end if;

  for r in
    select case when k.slug = 'alimentos' then 'alimento' else 'bebida' end as tipo,
           sum(oi.cantidad)::int as cuantos
    from orden_items oi
    join productos p on p.id = oi.producto_id
    join categorias c on c.id = p.categoria_id
    join cocinas k on k.id = c.cocina_id
    join config_sellos cs
      on cs.tipo = case when k.slug = 'alimentos' then 'alimento' else 'bebida' end
     and cs.activo
    where oi.orden_id = NEW.id
      and oi.padre_item_id is null
      and not p.es_extra
      and oi.precio_unitario >= cs.precio_minimo
      and not exists (select 1 from paquetes_saldo ps where ps.producto_id = p.id)
    group by 1
  loop
    -- Si ya se selló esta orden para este tipo, el índice único lo impide y
    -- se ignora en silencio: reintentar un cobro no debe regalar sellos.
    begin
      insert into sellos_movimientos (cliente_id, tipo, sellos, orden_id, descripcion)
      values (NEW.cliente_id, r.tipo, r.cuantos, NEW.id, 'Compra folio ' || NEW.folio);
    exception when unique_violation then
      continue;
    end;

    if r.tipo = 'bebida' then
      update clientes set sellos_bebida = sellos_bebida + r.cuantos where id = NEW.cliente_id;
    else
      update clientes set sellos_alimento = sellos_alimento + r.cuantos where id = NEW.cliente_id;
    end if;
  end loop;

  return NEW;
end;
$fn$;

drop trigger if exists trg_sellar_compra on ordenes;
create trigger trg_sellar_compra
  after update of pagado on ordenes
  for each row execute function fn_sellar_compra();