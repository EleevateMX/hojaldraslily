-- Guarda la descripción (concepto) con la que se armó la factura/prefactura,
-- para que al TIMBRAR una prefactura guardada se re-arme con la misma leyenda.
-- Es dato opcional: null = la leyenda de panadería por omisión.
alter table public.facturas_globales add column if not exists comentario text;
