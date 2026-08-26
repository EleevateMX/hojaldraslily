-- Categorías nuevas pedidas por el cliente:
--  · "Combos": para los productos es_combo (pestaña propia en POS/Kiosko).
--    Va a la estación de bebidas porque los combos de shakes son el caso
--    principal; un combo de alimentos necesitaría una categoría de la
--    estación de alimentos (la validación de combo_items lo exige).
--  · "Extras": complementos con precio propio (aguacate, guacamole, etc.)
--    que se agregan a la orden como una línea más — así el precio lo
--    recalcula el servidor igual que cualquier producto y el inventario
--    se descuenta por receta, sin tocar fn_crear_orden. Estación de
--    alimentos (los prepara cocina).
-- La pestaña aparece en POS/Kiosko automáticamente en cuanto la categoría
-- tenga al menos un producto activo.
insert into categorias (nombre, cocina_id, orden)
select 'Combos', (select id from cocinas where slug='bebidas'), 5
where not exists (select 1 from categorias where nombre='Combos');

insert into categorias (nombre, cocina_id, orden)
select 'Extras', (select id from cocinas where slug='alimentos'), 6
where not exists (select 1 from categorias where nombre='Extras');