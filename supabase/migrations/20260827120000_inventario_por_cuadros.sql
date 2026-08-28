-- El inventario se lleva en CUADROS, no en paquetes.
--
-- Asi se hornea de verdad: el pan sale en moldes de 48 cuadros, y de esos 48
-- se van cortando los paquetes conforme se venden -- cuatro de 12, dos de 24,
-- uno de 48, o una mezcla. Por eso pueden vender pan del dia: no se
-- comprometen a un tamano hasta que alguien lo pide.
--
-- El modelo anterior contaba PAQUETES por producto, y eso no cuadra con la
-- realidad: si se hornean 4 moldes de guayaba, no existen "10 paquetes de 12"
-- ni "5 de 24" por separado -- existen 192 cuadros de guayaba, y de ahi sale
-- lo que se pida. Contarlo por paquete obligaba a decidir en el horno algo
-- que se decide en el mostrador.
--
-- Entonces:
--   · Se hornea por SABOR, en moldes (48 cuadros cada uno).
--   · Se vende por PAQUETE, y cada paquete descuenta sus cuadros.
--   · Lo disponible de un tamano = cuantos paquetes de ese tamano alcanzan
--     con los cuadros libres de ese sabor.

-- ------------------------------------------------------------------ 1 ----
-- Cada producto sabe de que sabor es y cuantos cuadros lleva.
-- ------------------------------------------------------------------------
alter table public.productos add column if not exists sabor   text;
alter table public.productos add column if not exists cuadros int;

comment on column public.productos.sabor is
  'El sabor del que se corta. Varios paquetes (12, 24, 48) comparten sabor y por lo tanto comparten existencias.';
comment on column public.productos.cuadros is
  'Cuantos cuadros lleva este paquete. Null = no se corta de un molde (un cafe, un refresco).';

-- Se derivan del nombre, que ya viene con el formato "Sabor · Tamano · N
-- cuadros". Solo se rellena lo que este vacio: si alguien ya lo capturo a
-- mano, su dato manda.
update public.productos
   set sabor = coalesce(sabor, split_part(nombre, ' · ', 1)),
       cuadros = coalesce(cuadros, nullif((regexp_match(nombre, '(\d+)\s*cuadros'))[1], '')::int)
 where activo;

-- ------------------------------------------------------------------ 2 ----
-- Cuantos cuadros trae un molde. Es un parametro, no un 48 escondido en el
-- codigo: si algun dia usan un molde distinto, se cambia aqui.
-- ------------------------------------------------------------------------
alter table public.parametros
  add column if not exists cuadros_por_molde int not null default 48;

comment on column public.parametros.cuadros_por_molde is
  'Cuadros que rinde un molde. 48 en Hojaldras Lily.';

-- ------------------------------------------------------------------ 3 ----
-- La produccion pasa a contarse por sabor y en cuadros.
-- ------------------------------------------------------------------------
alter table public.produccion add column if not exists sabor text;

-- Lo ya capturado se convierte: N paquetes de un producto son N * sus
-- cuadros. Se hace ANTES de que nada dependa de la columna nueva.
update public.produccion pr
   set sabor = p.sabor,
       cantidad = pr.cantidad * coalesce(p.cuadros, 1)
  from public.productos p
 where p.id = pr.producto_id
   and pr.sabor is null;

comment on column public.produccion.cantidad is
  'CUADROS (no paquetes): positivo lo horneado, negativo la merma.';
comment on column public.produccion.sabor is
  'De que sabor son estos cuadros. Es la unidad del inventario.';

create index if not exists produccion_sabor_idx on public.produccion (fecha, sabor);

-- ------------------------------------------------------------------ 4 ----
-- Las ordenes de produccion se piden en MOLDES.
-- ------------------------------------------------------------------------
alter table public.orden_produccion_items add column if not exists sabor  text;
alter table public.orden_produccion_items add column if not exists moldes int;

update public.orden_produccion_items i
   set sabor = p.sabor
  from public.productos p
 where p.id = i.producto_id and i.sabor is null;

comment on column public.orden_produccion_items.moldes is
  'Cuantos moldes se pidieron de ese sabor. Lo que entra al inventario son moldes * cuadros_por_molde.';
