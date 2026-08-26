-- =====================================================================
-- Código de barras (aditivo). El campo actual `codigo` se conserva tal
-- cual (los frontends lo mostrarán como "Clave") y se agrega `codigo_barras`
-- vacío al lado. No altera datos capturados. No toca app_data.
-- `marca` ya existe en insumos (se usará en empaques/bebidas/snacks).
-- =====================================================================
alter table insumos   add column if not exists codigo_barras text;
alter table productos add column if not exists codigo_barras text;

-- Índices para búsqueda/lectura por lector de código de barras
create index if not exists idx_insumos_codbarras   on insumos   (codigo_barras) where codigo_barras is not null;
create index if not exists idx_productos_codbarras on productos (codigo_barras) where codigo_barras is not null;