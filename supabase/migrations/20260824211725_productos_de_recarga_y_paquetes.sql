-- Los tres paquetes, con su producto para cobrarlos.
--
-- La recarga se vende como cualquier producto: entra al corte, se cobra con
-- Clip o efectivo y queda auditada igual que un shake. Va en su propia
-- categoría, que NO llega a ninguna pantalla de preparación — nadie tiene
-- que "preparar" una recarga.
do $mig$
declare
  v_cocina uuid;
  v_cat uuid;
begin
  select id into v_cocina from cocinas where slug = 'bebidas' limit 1;

  insert into categorias (cocina_id, nombre, orden, activa)
  select v_cocina, 'Recargas', 90, true
  where not exists (select 1 from categorias where nombre = 'Recargas');

  select id into v_cat from categorias where nombre = 'Recargas' limit 1;
  update categorias set va_a_pantalla = false where id = v_cat;

  -- Los productos de recarga: precio fijo, sin receta (no consumen insumo),
  -- no son extras ni combos.
  insert into productos (categoria_id, nombre, precio, activo, es_extra, es_combo, es_reventa, iva_incluido, orden)
  select v_cat, x.nombre, x.precio, true, false, false, false, true, x.orden
  from (values
    ('Recarga $200',   200.00, 1),
    ('Recarga $500',   500.00, 2),
    ('Recarga $1,000', 1000.00, 3)
  ) as x(nombre, precio, orden)
  where not exists (select 1 from productos p where p.nombre = x.nombre);

  -- Los paquetes: cuántas mancuernas da cada uno.
  --   $200   → 2,200  (+10%)   vale $220
  --   $500   → 5,750  (+15%)   vale $575
  --   $1,000 → 12,000 (+20%)   vale $1,200
  insert into paquetes_saldo (nombre, precio_mxn, mancuernas, producto_id, orden)
  select x.nombre, x.precio, x.manc,
         (select id from productos where nombre = x.producto limit 1),
         x.orden
  from (values
    ('Recarga $200',   200.00,  2200,  'Recarga $200',   1),
    ('Recarga $500',   500.00,  5750,  'Recarga $500',   2),
    ('Recarga $1,000', 1000.00, 12000, 'Recarga $1,000', 3)
  ) as x(nombre, precio, manc, producto, orden)
  where not exists (select 1 from paquetes_saldo ps where ps.nombre = x.nombre);
end $mig$;

select p.nombre, p.precio_mxn, p.mancuernas,
       round(p.mancuernas::numeric / fn_tasa_mancuernas(), 2) as vale_en_pesos,
       round(((p.mancuernas::numeric / fn_tasa_mancuernas()) / p.precio_mxn - 1) * 100) as bono_pct,
       (select nombre from productos where id = p.producto_id) as se_cobra_con
from paquetes_saldo p order by p.orden;