-- Producir por orden, y apartar sin descontar.
--
-- Dos cosas que la panaderia necesita y que el motor original no tenia,
-- porque alla se preparaba todo al momento contra el pedido del cliente:
--
-- 1. ORDENES DE PRODUCCION. Gerencia manda a hacer ("30 hojaldras de guayaba
--    mini, 20 bolitas de queso"), eso aparece en la pantalla de produccion, y
--    cuando la gente termina, lo hecho **entra solo al inventario**. Nadie
--    vuelve a capturar lo mismo dos veces.
--
-- 2. ENCARGOS. Un cliente aparta 20 piezas para el sabado. Esas 20 se
--    SEPARAN en almacen -- dejan de estar libres para venderse de mostrador --
--    pero **no se descuentan del inventario hasta que se pagan**. Apartar no
--    es vender: si el cliente no llega, la mercancia sigue ahi.
--
-- De ahi salen tres numeros distintos que antes eran uno solo:
--    disponibles = horneado - merma - vendido      (lo que fisicamente hay)
--    apartados   = lo comprometido en encargos sin pagar
--    libres      = disponibles - apartados         (lo que se puede vender hoy)

-- ========================================================================
-- 1. Ordenes de produccion
-- ========================================================================

create table if not exists public.ordenes_produccion (
  id          uuid primary key default gen_random_uuid(),
  folio       bigint generated always as identity,
  fecha       date not null default (now() at time zone 'America/Merida')::date,
  estado      text not null default 'pendiente'
              check (estado in ('pendiente', 'en_proceso', 'terminada', 'cancelada')),
  nota        text,
  creada_por  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.ordenes_produccion is
  'Lo que gerencia manda a hacer. Se ve en la pantalla de produccion; al terminarse entra solo al inventario.';

create table if not exists public.orden_produccion_items (
  id               uuid primary key default gen_random_uuid(),
  orden_id         uuid not null references public.ordenes_produccion(id) on delete cascade,
  producto_id      uuid not null references public.productos(id),
  cantidad_pedida  int  not null check (cantidad_pedida > 0),
  -- Lo que de verdad salio. Puede quedar corto (no alcanzo la masa) o pasarse.
  cantidad_hecha   int  not null default 0 check (cantidad_hecha >= 0),
  terminado_en     timestamptz,
  terminado_por    text
);

create index if not exists ordenes_produccion_fecha_idx
  on public.ordenes_produccion (fecha, estado);
create index if not exists orden_produccion_items_orden_idx
  on public.orden_produccion_items (orden_id);

-- El puente con el inventario. Se guarda de que renglon de que orden vino
-- cada alta, para poder rastrearlo y -- sobre todo -- para que el trigger
-- sepa que ya lo conto y no lo cuente dos veces.
alter table public.produccion
  add column if not exists orden_produccion_item_id uuid
  references public.orden_produccion_items(id) on delete set null;

-- ------------------------------------------------------------------------
-- Lo hecho entra SOLO al inventario.
--
-- Va en un trigger y no dentro de la funcion que avanza la orden a
-- proposito: asi la regla "lo que se marca como hecho sube al inventario"
-- se cumple venga de donde venga el UPDATE. Si viviera nada mas en la RPC,
-- cualquier otro camino que tocara la tabla dejaria el inventario corto sin
-- que nadie se diera cuenta.
-- ------------------------------------------------------------------------
create or replace function public.fn_produccion_desde_orden()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_delta int;
begin
  v_delta := coalesce(new.cantidad_hecha, 0) - coalesce(old.cantidad_hecha, 0);
  if v_delta = 0 then
    return new;
  end if;

  -- Se apunta SOLO la diferencia. Marcar "ya van 12" y luego "ya van 20"
  -- tiene que sumar 20 en total, no 32.
  insert into produccion (producto_id, cantidad, motivo, nota, quien, orden_produccion_item_id)
  values (
    new.producto_id,
    v_delta,
    case when v_delta > 0 then 'horneado' else 'ajuste' end,
    'Orden de producción',
    coalesce(new.terminado_por, 'Producción'),
    new.id
  );
  return new;
end;
$$;

drop trigger if exists orden_produccion_al_inventario on public.orden_produccion_items;
create trigger orden_produccion_al_inventario
  after update of cantidad_hecha on public.orden_produccion_items
  for each row execute function public.fn_produccion_desde_orden();

-- ========================================================================
-- 2. Encargos (lo apartado en almacen)
-- ========================================================================

create table if not exists public.encargos (
  id             uuid primary key default gen_random_uuid(),
  folio          bigint generated always as identity,
  cliente        text not null,
  telefono       text,
  fecha_entrega  date,
  hora_entrega   text,
  estado         text not null default 'apartado'
                 check (estado in ('apartado', 'pagado', 'entregado', 'cancelado')),
  -- La venta con la que se cobro. Se llena al pagar y es lo que evita contar
  -- el encargo dos veces: mientras esta apartado cuenta como APARTADO, y en
  -- cuanto se paga deja de contar ahi y pasa a contar como VENDIDO.
  orden_id       uuid references public.ordenes(id) on delete set null,
  anticipo       numeric(10,2) not null default 0 check (anticipo >= 0),
  nota           text,
  creado_por     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.encargos is
  'Piezas apartadas para un cliente. Se separan del disponible pero NO se descuentan hasta que se pagan.';

create table if not exists public.encargo_items (
  id               uuid primary key default gen_random_uuid(),
  encargo_id       uuid not null references public.encargos(id) on delete cascade,
  producto_id      uuid not null references public.productos(id),
  cantidad         int not null check (cantidad > 0),
  -- El precio lo pone el SERVIDOR al crear el encargo, tomandolo del
  -- catalogo. El cliente nunca manda precios (CLAUDE.md, 2.2); aqui se
  -- congela porque un encargo es una cotizacion: lo que se aparto el lunes
  -- se respeta el sabado aunque el precio se haya movido.
  precio_unitario  numeric(10,2) not null
);

create index if not exists encargos_estado_idx on public.encargos (estado, fecha_entrega);
create index if not exists encargo_items_encargo_idx on public.encargo_items (encargo_id);

-- ========================================================================
-- 3. Permisos: nada de esto lo toca la llave publica
-- ========================================================================

alter table public.ordenes_produccion      enable row level security;
alter table public.orden_produccion_items  enable row level security;
alter table public.encargos                enable row level security;
alter table public.encargo_items           enable row level security;

do $$
declare t text;
begin
  foreach t in array array['ordenes_produccion','orden_produccion_items','encargos','encargo_items']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_staff', t);
    execute format($f$
      create policy %I on public.%I for all to authenticated
        using (public.fn_rol_staff() is not null)
        with check (public.fn_rol_staff() is not null)
    $f$, t || '_staff', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('grant select, insert, update on table public.%I to authenticated', t);
  end loop;
end $$;
