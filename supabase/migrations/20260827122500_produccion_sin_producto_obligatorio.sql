-- Lo que sale del horno tiene SABOR, no producto.
--
-- Registro de una migración aplicada a la base que se había quedado sin
-- archivo en el repo (CLAUDE.md §6). El SQL es **el que corrió de verdad**,
-- recuperado de `supabase_migrations.schema_migrations.statements`.
--
-- `produccion.producto_id` venía NOT NULL del motor original, donde todo lo
-- que se producía era un producto del catálogo. Aquí no: se hornea **por
-- sabor**, en moldes, y el tamaño del paquete se decide en el mostrador
-- (CLAUDE.md §2.0).
--
-- OJO con el orden: no basta con soltar un NOT NULL y poner el otro. Las
-- filas viejas se capturaron por producto y tienen `sabor` en null, así que
-- `set not null` las rechazaría y la migración fallaría a medias. Primero se
-- les rellena el sabor desde su producto, después se tiran las que ni así lo
-- tienen, y hasta entonces se pone el candado.

-- El inventario ya no se lleva por producto sino por SABOR: una hornada son
-- 192 cuadros de guayaba, no "N paquetes de tal tamano". `producto_id` deja
-- de ser obligatorio y queda solo como rastro de las capturas viejas.
alter table public.produccion alter column producto_id drop not null;

-- Un renglon sin sabor no le sirve a nadie: no se puede sumar a ninguna
-- existencia. Mejor que la base lo rechace a que entre y no cuente.
update public.produccion pr
   set sabor = p.sabor
  from public.productos p
 where p.id = pr.producto_id and pr.sabor is null;

delete from public.produccion where sabor is null;

alter table public.produccion alter column sabor set not null;

comment on column public.produccion.producto_id is
  'Historico: de que producto vino la captura vieja. El inventario se lleva por `sabor`.';
