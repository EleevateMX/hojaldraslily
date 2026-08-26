-- ============================================================================
-- Onzas por producto (para el visor de comandas)
-- ============================================================================
-- Quien prepara necesita saber que vaso agarrar ANTES de leer la receta.
-- Se muestra SOLO en las pantallas de cocina: la etiqueta impresa no cambia
-- (peticion explicita de la sucursal), y la sincronizacion desde costeo no
-- toca esta columna, asi que lo que se ajuste en Admin se queda.
--
-- Regla dictada por la sucursal (13/08/26): los protein lattes y El Clasico
-- son de 16 oz; el resto de los shakes, de 20 oz. "Protein lattes" se
-- interpreto como los estilo latte del menu numerado (Mocha Rush, Matcha
-- Latte, Dirty Chai, Horchata Latte) — ajustable en Admin si alguno quedo
-- mal clasificado, que para eso es editable.
-- ============================================================================

alter table productos add column if not exists onzas integer;

comment on column productos.onzas is
  'Tamano del vaso en onzas. Solo informativo para el visor de comandas; null = no se muestra.';

-- Shakes: default 20 oz
update productos p
set onzas = 20
from categorias c
where c.id = p.categoria_id and c.nombre = 'Shakes'
  and not p.es_extra and p.onzas is null;

-- 16 oz: El Clasico y los protein lattes
update productos set onzas = 16
where not es_extra and (
  lower(nombre) in ('el clásico', 'el clasico')
  or nombre ~* '(mocha rush|matcha latte|dirty chai|horchata latte)'
);