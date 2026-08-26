-- ============================================================================
-- Mover cada bebida a su categoria real (pedido de la sucursal)
-- ============================================================================
-- Todo vivia amontonado en "Shakes". Los chips del kiosko salen de las
-- categorias con productos, asi que este movimiento hace aparecer los
-- botones de Hydration Drinks, Amino Refreshers y Cafe solos.
--
-- Solo se mueve lo INEQUIVOCO por nombre. Tes, Kombuchas y Collagen Drinks
-- los reparte la sucursal desde Admin -> Menu (selector de categoria en la
-- misma tabla): los nombres no dicen cual es cual — hay pistas de que
-- "Blueberry Acai" es un te y "Violetas Acai" una kombucha, pero eso lo
-- sabe quien los prepara, no el esquema.
--
-- La sincronizacion desde costeo NO pisa la categoria al actualizar (solo
-- al crear un producto nuevo), asi que el movimiento es permanente.
-- ============================================================================

update productos p
set categoria_id = (select id from categorias where nombre = 'Hydration Drinks')
where p.nombre like 'Hydration Drink%' and not p.es_extra;

update productos p
set categoria_id = (select id from categorias where nombre = 'Amino Refreshers')
where p.nombre like 'Amino Refresher%' and not p.es_extra;

update productos p
set categoria_id = (select id from categorias where nombre = 'Café')
where not p.es_extra and (
  p.nombre like 'Americano%' or p.nombre like 'Latte%'
  or p.nombre like 'Cold Brew%' or p.nombre like 'Café%'
  or p.nombre like 'CafAmericano%'
);