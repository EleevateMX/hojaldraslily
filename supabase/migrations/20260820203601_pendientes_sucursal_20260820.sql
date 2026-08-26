-- ============================================================================
-- Pendientes de la sucursal — 20/08/2026
-- ============================================================================
-- Ocho cambios pedidos por el negocio. Todo aditivo: ninguna columna se
-- borra, ninguna función existente pierde parámetros, y cada bloque se
-- puede volver a correr sin duplicar nada.
--
--   1. Tamaño de vaso en el visor para las bebidas que no son shakes.
--   2. "Vaso con Hielo" vuelve a mostrar tamaño: 16 oz.
--   3. Cambiar de proteína cuesta +$10 (la de casa sigue sin costo).
--   4. Doble scoop de proteína como extra con precio propio.
--   5. Observaciones configurables desde Admin (dejan de estar en el código).
--   6. Nombre de categoría en singular, para comandas y etiquetas.
--   7. Precio y grupo de un extra POR PRODUCTO, editables desde Admin.
--   8. La comanda impresa aprende a decir "Kombucha - Limonada Durazno".
-- ============================================================================


-- ── 1 y 2. Tamaño del vaso ─────────────────────────────────────────────────
-- El visor solo mostraba onzas en los shakes porque solo ellos tenían el
-- dato. Las demás bebidas quedaban sin chip y en barra no sabían qué vaso
-- tomar. Se siembra un tamaño por familia; queda editable producto por
-- producto en Admin -> Menú (columna Onzas), que es la fuente de verdad.
update productos p
set onzas = 20
from categorias c
where c.id = p.categoria_id
  and c.nombre in ('Collagen Drinks', 'Amino Refreshers', 'Hydration Drinks', 'Tés', 'Kombuchas')
  and not p.es_extra
  and p.onzas is null;

-- Los cafés se sirven en vaso chico.
update productos p
set onzas = 16
from categorias c
where c.id = p.categoria_id
  and c.nombre = 'Café'
  and not p.es_extra
  and p.onzas is null;

-- Pedido explícito: el vaso con hielo sí lleva tamaño.
update productos set onzas = 16 where nombre ilike 'vaso con hielo';


-- ── 3 y 7. Precio y grupo de un extra, por producto ────────────────────────
-- `producto_extras.precio` ya existía (es lo que hace que la leche cueste
-- $10 en los americanos y $0 en los shakes). Se le suma `grupo`: cuando dos
-- extras del mismo producto comparten grupo, el kiosko los ofrece como
-- "elige uno" en vez de con contador. Null = como hasta hoy.
alter table producto_extras add column if not exists grupo text;

comment on column producto_extras.precio is
  'Sobreprecio de ESTE extra en ESTE producto. Null = el precio normal del extra.';
comment on column producto_extras.grupo is
  'Extras del mismo producto que comparten grupo se eligen entre sí (uno solo). Null = adicional suelto con cantidad.';

-- Cambiar de proteína cuesta +$10. La de casa (Optimum, la que viene
-- preseleccionada) se queda en $0: solo se cobra al que pide otra marca.
update producto_extras pe
set precio = 10
from productos e
where pe.extra_id = e.id
  and e.nombre ilike 'Proteína %'
  and e.nombre not ilike 'Proteína OPTIMUM%'
  and pe.precio is distinct from 10;

-- Y las proteínas se agrupan como "elige una" de forma explícita, para no
-- depender de que el nombre empiece con "Proteína".
update producto_extras pe
set grupo = 'proteina'
from productos e
where pe.extra_id = e.id
  and e.nombre ilike 'Proteína %'
  and pe.grupo is distinct from 'proteina';


-- ── 4. Doble scoop de proteína ─────────────────────────────────────────────
-- Se resuelve como un extra normal y no como una cantidad de la proteína:
-- así cobra siempre (aunque la proteína elegida sea la de casa, que va en
-- $0) y en barra se lee como una instrucción, no como dos ingredientes.
-- El precio sale del volante ("proteína extra a partir de $19") y se edita
-- en Admin -> Extras como cualquier otro.
insert into productos (nombre, precio, categoria_id, es_extra, activo)
select 'Doble scoop de proteína', 19, c.id, true, true
from categorias c
where c.nombre = 'Extras Bebidas'
  and not exists (select 1 from productos p where p.nombre = 'Doble scoop de proteína');

-- Se ofrece en todo shake activo (con o sin elección de proteína: el que
-- pide doble scoop de un Blueberry Bloom quiere doble de la suya).
insert into producto_extras (producto_id, extra_id)
select p.id, d.id
from productos p
join categorias c on c.id = p.categoria_id
join productos d on d.nombre = 'Doble scoop de proteína'
where c.nombre = 'Shakes'
  and p.activo
  and not p.es_extra
  and not p.es_combo
  -- Solo a lo que ya se personaliza. Sin esta guarda el extra se le cuelga
  -- también a "Vaso con Hielo" —que vive en la categoría Shakes y al que se
  -- le vaciaron los extras a propósito para que entrara en un toque— y le
  -- devuelve el modal, ofreciendo doble scoop de proteína a un vaso de
  -- hielo. Es la misma guarda con la que se ligaron los boosters.
  and exists (select 1 from producto_extras pe0 where pe0.producto_id = p.id)
on conflict do nothing;


-- ── 5. Observaciones configurables ─────────────────────────────────────────
-- Estaban escritas dentro del código del kiosko: cambiar un chip exigía un
-- despliegue. Ahora viven en la base, por estación, y se administran igual
-- que los extras.
create table if not exists public.observaciones (
  id uuid primary key default gen_random_uuid(),
  cocina_id uuid not null references cocinas(id) on delete cascade,
  texto text not null,
  orden integer not null default 100,
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  unique (cocina_id, texto)
);

alter table public.observaciones enable row level security;

-- Lectura abierta (el kiosko las pinta sin sesión); toda escritura pasa por
-- las funciones de abajo, mismo criterio que configuracion_kiosko.
drop policy if exists sel_observaciones on public.observaciones;
create policy sel_observaciones on public.observaciones for select using (true);

-- Semilla: exactamente los chips que hoy están en el código, para que el
-- día del cambio la pantalla se vea idéntica.
insert into public.observaciones (cocina_id, texto, orden)
select k.id, x.texto, x.orden
from cocinas k
join (values
  ('bebidas', 'Menos hielo', 10), ('bebidas', 'Sin hielo', 20),
  ('bebidas', 'Extra frío', 30), ('bebidas', 'Sin azúcar', 40),
  ('bebidas', 'Sin crema', 50),
  ('alimentos', 'Sin tomate', 10), ('alimentos', 'Sin cebolla', 20),
  ('alimentos', 'Sin queso', 30), ('alimentos', 'Sin aderezo', 40),
  ('alimentos', 'Aderezo aparte', 50), ('alimentos', 'Sin picante', 60)
) as x(slug, texto, orden) on x.slug = k.slug
on conflict (cocina_id, texto) do nothing;

/** Lista para el kiosko: solo las activas de una estación. */
create or replace function public.fn_observaciones(p_cocina_slug text)
returns table (id uuid, texto text, orden integer)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.texto, o.orden
  from observaciones o
  join cocinas k on k.id = o.cocina_id
  where k.slug = p_cocina_slug and o.activa
  order by o.orden, o.texto
$$;

/** Lista para Admin: incluye las apagadas. */
create or replace function public.fn_observaciones_admin()
returns table (id uuid, cocina_id uuid, cocina text, texto text, orden integer, activa boolean)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.cocina_id, k.nombre, o.texto, o.orden, o.activa
  from observaciones o
  join cocinas k on k.id = o.cocina_id
  order by k.nombre, o.orden, o.texto
$$;

/** Alta o edición. Idempotente por (estación, texto). */
create or replace function public.fn_observacion_guardar(
  p_cocina_slug text,
  p_texto text,
  p_orden integer default 100
) returns observaciones
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cocina uuid;
  v_texto text := nullif(trim(p_texto), '');
  v_row observaciones;
begin
  if v_texto is null then
    raise exception 'La observación no puede ir vacía.';
  end if;
  if length(v_texto) > 24 then
    raise exception 'La observación es muy larga (máximo 24 caracteres): cabe en un botón y en la etiqueta.';
  end if;
  select id into v_cocina from cocinas where slug = p_cocina_slug;
  if v_cocina is null then
    raise exception 'No existe la estación "%".', p_cocina_slug;
  end if;

  insert into observaciones (cocina_id, texto, orden)
  values (v_cocina, v_texto, coalesce(p_orden, 100))
  on conflict (cocina_id, texto)
    do update set orden = excluded.orden, activa = true
  returning * into v_row;

  return v_row;
end;
$$;

/** Prender o apagar sin perder el texto. */
create or replace function public.fn_observacion_activar(p_id uuid, p_activa boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update observaciones set activa = coalesce(p_activa, true) where id = p_id
$$;

/** Borrado definitivo (para las que se escribieron mal). */
create or replace function public.fn_observacion_borrar(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from observaciones where id = p_id
$$;

revoke all on function public.fn_observaciones(text) from public;
revoke all on function public.fn_observaciones_admin() from public;
revoke all on function public.fn_observacion_guardar(text, text, integer) from public;
revoke all on function public.fn_observacion_activar(uuid, boolean) from public;
revoke all on function public.fn_observacion_borrar(uuid) from public;
grant execute on function public.fn_observaciones(text) to anon, authenticated, service_role;
grant execute on function public.fn_observaciones_admin() to anon, authenticated, service_role;
grant execute on function public.fn_observacion_guardar(text, text, integer) to anon, authenticated, service_role;
grant execute on function public.fn_observacion_activar(uuid, boolean) to anon, authenticated, service_role;
grant execute on function public.fn_observacion_borrar(uuid) to anon, authenticated, service_role;


-- ── 6. Nombre de categoría en singular ─────────────────────────────────────
-- En barra se confunden: "Lemon Twist" es Hydration, "Lemon Glow" es
-- Collagen y "Lemon Lime" es Amino. La comanda y la etiqueta van a decir
-- "Hydration Drink - Lemon Twist". Se guarda el singular como DATO y no se
-- adivina con reglas: los plurales son irregulares (Tés -> Té) y Admin
-- puede corregir cualquiera sin tocar código.
--
-- Null = no prefijar. Por eso solo se llenan las familias que se confunden:
-- un shake ya se lee bien sin decirle "Shake - ".
alter table categorias add column if not exists nombre_singular text;

comment on column categorias.nombre_singular is
  'Cómo se nombra UNA bebida de esta categoría en comanda y etiqueta. Null = no se prefija.';

update categorias set nombre_singular = case nombre
  when 'Kombuchas'        then 'Kombucha'
  when 'Tés'              then 'Té'
  when 'Amino Refreshers' then 'Amino Refresher'
  when 'Collagen Drinks'  then 'Collagen Drink'
  when 'Hydration Drinks' then 'Hydration Drink'
end
where nombre in ('Kombuchas', 'Tés', 'Amino Refreshers', 'Collagen Drinks', 'Hydration Drinks')
  and nombre_singular is null;


-- ── 8. La categoría viaja en el payload de la comanda impresa ──────────────
-- Misma función de siempre; se le agrega UN campo. El agente de impresión
-- ya tenía el hueco previsto para campos nuevos, así que ignora lo que no
-- conoce: se puede aplicar esto sin actualizar el agente y nada se rompe.
--
-- Las onzas NO se agregan aquí a propósito: la sucursal pidió que el
-- tamaño se viera en el visor y NO en el ticket impreso.
create or replace function public.fn_items_comanda(p_pedido_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(x order by x->>'nombre'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'cantidad',        ci.cantidad,
      'nombre',          pr.nombre,
      'categoria',       cat.nombre_singular,
      'personalizacion', ci.personalizacion,
      'extras', coalesce((
        select jsonb_agg(
          jsonb_build_object('nombre', ph.nombre, 'cantidad', h.cantidad)
          order by ph.nombre
        )
        from cocina_items h
        join orden_items oh on oh.id = h.orden_item_id
        left join productos ph on ph.id = h.producto_id
        where h.pedido_id = ci.pedido_id
          and oh.padre_item_id = ci.orden_item_id
      ), '[]'::jsonb)
    ) as x
    from cocina_items ci
    join orden_items oi on oi.id = ci.orden_item_id
    left join productos pr on pr.id = ci.producto_id
    left join categorias cat on cat.id = pr.categoria_id
    where ci.pedido_id = p_pedido_id
      and (
        oi.padre_item_id is null
        or not exists (
          select 1 from cocina_items padre
          where padre.pedido_id = ci.pedido_id
            and padre.orden_item_id = oi.padre_item_id
        )
      )
  ) t;
$$;

-- Se repiten los permisos: `create or replace` no los conserva y Postgres
-- otorga EXECUTE a PUBLIC por omisión. Esta función solo la llaman las
-- funciones de encolado.
revoke all on function public.fn_items_comanda(uuid) from public;
revoke all on function public.fn_items_comanda(uuid) from anon, authenticated;


-- ── 7 (cont). Admin edita precio y grupo de un extra por producto ──────────
-- El checklist "Dónde se ofrece" pasa de decir sí/no a decir sí/no, cuánto
-- y en qué grupo. `drop` primero porque cambia el `returns table`.
drop function if exists public.fn_extra_bebida_productos(uuid);

create function public.fn_extra_bebida_productos(p_extra_id uuid)
returns table (
  producto_id uuid,
  nombre text,
  categoria text,
  ofrecido boolean,
  precio_propio numeric,
  precio_base numeric,
  grupo text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.nombre, coalesce(c.nombre, '—'),
         exists (select 1 from producto_extras pe
                  where pe.producto_id = p.id and pe.extra_id = p_extra_id),
         (select pe.precio from producto_extras pe
           where pe.producto_id = p.id and pe.extra_id = p_extra_id),
         (select e.precio from productos e where e.id = p_extra_id),
         (select pe.grupo from producto_extras pe
           where pe.producto_id = p.id and pe.extra_id = p_extra_id)
  from productos p
  join categorias c on c.id = p.categoria_id
  join cocinas k on k.id = c.cocina_id
  where p.activo and not p.es_extra and k.slug = 'bebidas'
  order by c.orden, p.nombre
$$;

/**
 * Precio de ESTE extra en ESTE producto. Null = vuelve a cobrar el precio
 * normal del extra. Solo toca el vínculo, nunca el precio del producto.
 */
create or replace function public.fn_extra_bebida_precio(
  p_extra_id uuid,
  p_producto_id uuid,
  p_precio numeric
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_precio is not null and p_precio < 0 then
    raise exception 'El precio no puede ser negativo.';
  end if;
  update producto_extras
  set precio = p_precio
  where producto_id = p_producto_id and extra_id = p_extra_id;
  if not found then
    raise exception 'Ese extra no se ofrece en ese producto todavía: márcalo primero.';
  end if;
end;
$$;

/** Grupo del extra en ese producto (los del mismo grupo se eligen entre sí). */
create or replace function public.fn_extra_bebida_grupo(
  p_extra_id uuid,
  p_producto_id uuid,
  p_grupo text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update producto_extras
  set grupo = nullif(trim(coalesce(p_grupo, '')), '')
  where producto_id = p_producto_id and extra_id = p_extra_id;
  if not found then
    raise exception 'Ese extra no se ofrece en ese producto todavía: márcalo primero.';
  end if;
end;
$$;

revoke all on function public.fn_extra_bebida_productos(uuid) from public;
revoke all on function public.fn_extra_bebida_precio(uuid, uuid, numeric) from public;
revoke all on function public.fn_extra_bebida_grupo(uuid, uuid, text) from public;
grant execute on function public.fn_extra_bebida_productos(uuid) to anon, authenticated, service_role;
grant execute on function public.fn_extra_bebida_precio(uuid, uuid, numeric) to anon, authenticated, service_role;
grant execute on function public.fn_extra_bebida_grupo(uuid, uuid, text) to anon, authenticated, service_role;


-- ── La vista de extras expone el grupo ─────────────────────────────────────
-- Dos cuidados en este bloque, los dos aprendidos a golpes:
--
-- 1) `grupo` va AL FINAL a propósito. En un `create or replace view`
--    Postgres solo admite columnas nuevas al final; meterla en medio
--    renombra la quinta columna y aborta con "cannot change name of view
--    column 'activo' to 'grupo'", y con ella se cae la migración entera.
--
-- 2) `security_invoker` se vuelve a declarar aquí. Un `create or replace
--    view` REEMPLAZA la lista de opciones de la vista en vez de heredarla:
--    si se omite, la vista queda corriendo con los permisos de su dueño y
--    deja de respetar el RLS de las tablas de abajo. Ya venía puesto desde
--    catalogo_suplementos_y_extras.sql y aquí se conserva.
create or replace view public.vw_producto_extras
with (security_invoker = true) as
select pe.producto_id,
       e.id as extra_id,
       e.nombre,
       coalesce(pe.precio, e.precio)::numeric(10,2) as precio,
       e.activo,
       pe.grupo
from producto_extras pe
join productos e on e.id = pe.extra_id;

grant select on public.vw_producto_extras to anon, authenticated;