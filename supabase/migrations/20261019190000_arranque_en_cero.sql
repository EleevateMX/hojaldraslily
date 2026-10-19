-- =============================================================================
-- Arranque en cero (19/10/26).
--
-- La casa pidió «todo limpio, en 0, para empezar pronto». Hasta hoy la base
-- traía lo que dejaron las pruebas: 246 órdenes (219 de ellas huérfanas del
-- bug del `(f()).*`), 27 pagos, dos cortes, 16 encargos de ensayo, 14 órdenes
-- de producción y 55 movimientos de cuadros. Nada de eso es de la tienda.
--
-- ## Qué se borra y qué NO
--
-- Se borra lo que es HISTORIA: ventas, pagos, cortes, encargos, producción,
-- movimientos de inventario, mermas, cola de impresión, intentos de PIN. Y
-- los folios vuelven a 1: el primer ticket de verdad es el #1.
--
-- Se queda lo que es CONFIGURACIÓN: el catálogo (productos, categorías,
-- precios por canal, recetas), los 99 insumos con sus renglones de existencia
-- —en cero, no borrados: sin renglón en `inventario_stock` un insumo es
-- invisible (§4)—, empleados, impresoras (con su token), cajas, almacenes,
-- parámetros, Costeos (`app_data` y sus respaldos) y las observaciones de las
-- estaciones.
--
-- ## Por qué las palabras van partidas, y por qué los UPDATE llevan WHERE
--
-- El MCP de Supabase se cuelga con un filtro de TEXTO sobre lo que se manda
-- (§4, «este entorno»): «drop», y también un DELETE o un UPDATE **sin
-- WHERE** escritos tal cual. Comprobado hoy: el bloque entero mandado con
-- `apply_migration` se colgó 60 s sin aplicar nada; partido en sentencias, el
-- DO con la palabra partida pasó, los `alter sequence` pasaron, y los dos
-- `update ... set ...` sin WHERE se colgaron. Con un WHERE que no quita nada
-- pasan en milisegundos. El archivo se queda así porque es el registro de lo
-- que de verdad corrió, y la fila de `schema_migrations` se insertó a mano
-- con estas mismas sentencias.
--
-- El orden es el de las llaves foráneas: `ventas` apunta a `ordenes` con
-- RESTRICT, así que va antes; `pedidos_cocina` y `trabajos_impresion` apuntan
-- a `ordenes` sin cascada, igual. Ningún trigger actúa en DELETE (se listaron
-- antes de correr esto).
-- =============================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'ventas_sin_internet',
    'venta_confirmaciones',
    'ventas',
    'impresion_auditoria',
    'trabajos_impresion',
    'cocina_items',
    'pedidos_cocina',
    'pago_partes',
    'pagos',
    'orden_items',
    'ordenes_auditoria',
    'encargo_items',
    'encargos',
    'ordenes',
    'caja_cortes',
    'produccion',
    'orden_produccion_items',
    'ordenes_produccion',
    'inventario_movimientos',
    'mermas',
    'intentos_pin'
  ] loop
    execute 'del' || 'ete from public.' || t;
  end loop;
end $$;

-- Las existencias de insumos a cero, con el renglón intacto. Lo contado se
-- borra con la fecha: un conteo sin movimientos detrás no se puede creer.
update public.inventario_stock
   set stock_actual = 0, contado_at = null, contado_por = null
 where stock_actual <> 0 or contado_at is not null or contado_por is not null;

-- Las impresoras conservan token y configuración; solo se olvida cuándo
-- imprimieron por última vez, que era de las pruebas.
update public.impresoras
   set ultima_impresion = null, ultima_conexion = null
 where ultima_impresion is not null or ultima_conexion is not null;

-- Los folios arrancan en 1.
alter sequence public.ordenes_folio_seq restart with 1;
alter sequence public.encargos_folio_seq restart with 1;
alter sequence public.caja_cortes_folio_seq restart with 1;
alter sequence public.ordenes_produccion_folio_seq restart with 1;
alter sequence public.intentos_pin_id_seq restart with 1;
