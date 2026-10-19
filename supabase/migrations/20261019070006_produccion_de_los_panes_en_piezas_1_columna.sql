-- Mandar a hacer TODOS los panes, no solo las hojaldras.
--
-- El reclamo de la casa fue corto: «en producción falta que hagan todos los
-- panes». Y era literal. La pantalla de Producción solo podía recibir sabores
-- que se cuentan en cuadros —las hojaldras—, porque `fn_produccion_mandar_a_
-- hacer` escribe renglones con `moldes` y `cuadros_por_molde`, y la columna
-- traía `not null` con un `check in (24, 48)`.
--
-- Pero media panadería NO sale de un molde: las roscas, la Trenza Suiza, las
-- Patas, los Tutis, las galletas, lo de anís, el Pan de Muerto, la Hojaldra de
-- Corazón y los bocadillos. En `productos` se reconocen solos: `sabor` y
-- `cuadros` en null, y `fn_catalogo_del_dia` les contesta
-- `paquetes_posibles = null` — «se hornea al pedido» (§2.0). O sea que el
-- sistema ya sabía que existen; lo que no había era por dónde pedirlos.
--
-- Así que un renglón de producción ahora se cuenta de una de dos maneras, y lo
-- dice:
--
--     unidad = 'molde'  -> `moldes` son moldes, de 48 o de 24 cuadros
--     unidad = 'pieza'  -> `moldes` son PIEZAS, y no hay molde que declarar
--
-- Por qué `cuadros_por_molde` queda en **null** y no en un 48 de relleno: un 48
-- de relleno es una mentira que suma. El renglón de veinte roscas diría «960
-- cuadros» y ese número entraría a cualquier consulta que sume cuadros. La
-- regla del repo es la contraria —la ausencia de un dato no es un cero (§4)— y
-- aquí la ausencia es la verdad: una rosca no tiene molde.
--
-- Consecuencia que hay que entender: **lo que se cuenta en piezas NO entra al
-- inventario de cuadros.** No es un olvido. Esos panes se venden sin
-- existencia (`paquetes_posibles = null`), así que no hay de dónde
-- descontarlos ni a qué sumarles. Lo horneado queda apuntado donde importa —en
-- `cantidad_hecha` del propio renglón, que es lo que ve la mesa y lo que ve el
-- horno— y no se inventa un movimiento de cuadros de un pan que no se cuenta
-- en cuadros. El día que la casa quiera llevar existencia de roscas, eso es
-- darles `cuadros`/`piezas` en el catálogo, no parchear este trigger.
--
-- El camino C → P → H → E sigue siendo el mismo para las dos unidades: se
-- arman, se meten al horno, se sacan. Lo único que cambia es la palabra en
-- pantalla y que al salir no se mueve ningún cuadro.

-- ---------------------------------------------------------------------------
-- 1. La unidad del renglón
-- ---------------------------------------------------------------------------

alter table public.orden_produccion_items
  add column if not exists unidad text not null default 'molde';

comment on column public.orden_produccion_items.unidad is
  'Como se cuenta este renglon: molde (de 48 o 24 cuadros) o pieza (roscas, '
  'trenzas, panes, galletas, bocadillos: lo que se hornea al pedido y no se '
  'cuenta en cuadros). Con unidad=pieza, `moldes` son PIEZAS y '
  '`cuadros_por_molde` va en null a proposito.';

-- Los renglones de antes son todos de molde, que es el valor por omisión: no
-- hace falta rellenar nada.

alter table public.orden_produccion_items
  alter column cuadros_por_molde drop not null;

-- El `check` viejo exigía 24 o 48 siempre. Se cambia por uno que ata la unidad
-- con el molde, en la tabla y no en los `if` de cada función: la regla se
-- cumple venga de donde venga el INSERT (§4).
alter table public.orden_produccion_items
  drop constraint if exists orden_produccion_items_molde_valido;
alter table public.orden_produccion_items
  drop constraint if exists opi_unidad_coherente;
alter table public.orden_produccion_items
  add constraint opi_unidad_coherente check (
    (unidad = 'molde' and cuadros_por_molde in (24, 48))
    or
    (unidad = 'pieza' and cuadros_por_molde is null)
  );
