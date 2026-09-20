-- El camino se parte en tres: Producción → Horno → Empaque.
--
-- Hasta hoy producir era UN paso: el panadero marcaba «van 3 moldes» y eso
-- entraba al inventario en el mismo movimiento. En la panadería real son dos
-- manos distintas y dos momentos distintos:
--
--   P (panaderos)  arman los moldes y los dejan listos
--   H (horno)      los mete, los hornea y los SACA
--   E (empaque)    empaca lo que hay que entregar
--
-- Importa que sean etapas separadas por una razón concreta: **un molde armado
-- no es pan**. Si se cuenta como inventario en cuanto el panadero lo arma, la
-- caja puede vender una hojaldra que todavía es masa cruda. El inventario sube
-- cuando el pan SALE del horno, que es el único momento en que existe.
--
-- Los contadores, y qué significa cada uno:
--
--   `moldes`          lo que se pidió
--   `moldes_armados`  ACUMULADO: cuántos ha armado producción
--   `moldes_en_horno` CUÁNTOS HAY ADENTRO AHORITA (sube al meter, baja al sacar)
--   `cantidad_hecha`  ACUMULADO: cuántos han salido del horno -> inventario
--
-- `moldes_en_horno` es el único que no es acumulado, y es a propósito: la
-- pregunta que contesta es «¿qué hay adentro del horno en este momento?»,
-- que es lo que se ve en la pantalla y lo que la caja necesita saber.

alter table public.orden_produccion_items
  add column if not exists moldes_armados  int not null default 0,
  add column if not exists moldes_en_horno int not null default 0,
  add column if not exists horno_entro_en  timestamptz;

-- Las tandas viejas salieron del horno, así que ya estaban armadas.
update public.orden_produccion_items
   set moldes_armados = greatest(moldes_armados, coalesce(cantidad_hecha, 0))
 where coalesce(cantidad_hecha, 0) > moldes_armados;

comment on column public.orden_produccion_items.moldes_armados is
  'Acumulado de moldes que producción ya armó y dejó listos para el horno.';
comment on column public.orden_produccion_items.moldes_en_horno is
  'Cuántos hay DENTRO del horno ahorita. Sube al meter, baja al sacar. No es acumulado.';
comment on column public.orden_produccion_items.horno_entro_en is
  'Cuándo entró la última tanda al horno. De aquí sale el reloj.';
comment on column public.orden_produccion_items.cantidad_hecha is
  'Acumulado de moldes que YA SALIERON del horno. Es lo que mueve el inventario.';

-- Los candados. Sin esto, un dedo de más en una pantalla táctil mete al horno
-- moldes que nadie armó, y el inventario termina contando pan que no existe.
alter table public.orden_produccion_items
  drop constraint if exists opi_etapas_coherentes;
alter table public.orden_produccion_items
  add constraint opi_etapas_coherentes check (
    moldes_armados  >= 0 and
    moldes_en_horno >= 0 and
    cantidad_hecha  >= 0 and
    moldes_armados  <= coalesce(moldes, 0) and
    cantidad_hecha  <= moldes_armados and
    -- No puede haber más adentro del horno que lo armado y todavía sin salir.
    moldes_en_horno <= moldes_armados - cantidad_hecha
  );
