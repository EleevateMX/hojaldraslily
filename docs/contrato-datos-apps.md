# Contrato de datos para las apps (`@shake/supabase`)

Todas las apps consumen **solo** `@shake/supabase` (nunca `.from()` suelto).
Patrón por app (ver `apps/pos` como referencia):

- `src/lib/sb.ts`: `export const sb = getSupabase()`
- Las funciones reciben `sb` como primer argumento.
- Vite + React 18 + TS, CSS plano (sin Tailwind), `tsconfig` extiende
  `../../tsconfig.base.json`. Scope de paquete: `@shake/<app>`.

## Funciones disponibles

### Catálogo (`catalogo.ts`)
- `listarProductosParaVenta(sb)` → `ProductoVenta[]` (producto + `categorias.cocinas{slug,nombre}`)
- `listarProductosPorCocina(sb, slug)` → `ProductoVenta[]`
- `listarProductos(sb)`, `crearProducto(sb, ProductoInsert)`, `actualizarProducto(sb, id, ProductoUpdate)`, `desactivarProducto(sb, id)`
- `listarCategorias(sb)`, `crearCategoria(sb, {nombre, cocina_id})`, `listarCocinas(sb)`
- `listarInsumos(sb)`, `crearInsumo`, `actualizarInsumo`, `desactivarInsumo`
- `obtenerReceta(sb, productoId)`, `guardarReceta(sb, productoId, lineas)`
- tipo `ProductoVenta` (importar de `@shake/supabase`)

### Costeo (`costeo.ts`)
- `listarCosteo(sb)` → `CosteoProducto[]`, `obtenerParametros(sb)`, `actualizarParametros(sb, cambios)`

### Órdenes y pago (`ordenes.ts`)
- `crearOrden(sb, orden, items)` — `orden`: `{sucursal_id, almacen_id, canal:'pos'|'kiosko', corte_id?, empleado_id?, cliente_id?}`; `items`: `{producto_id, cantidad, precio_unitario, personalizacion?}[]`. Crea orden **pendiente** (no pagada). Devuelve `{id, folio, ...}`.
- `cobrarOrden(sb, ordenId, metodo, monto, {referencia?, autorizadoPor?})` — registra pago **aprobado**. El trigger de la base marca pagado, **descuenta inventario por receta**, registra venta y **genera pedidos de cocina**. NO dupliques esa lógica.
- `metodo`: `'efectivo'|'tarjeta'|'clip'|'cortesia'|'otro'`. Clip = manual con referencia del voucher.
- `cancelarOrden(sb, ordenId)`

### Cocina / KDS (`cocina.ts`)
- `listarPedidosCocina(sb, slug)` — slug `'alimentos'|'bebidas'`. Devuelve `PedidoConItems[]` = `pedidos_cocina` + `cocina_items[]` + `ordenes{folio,canal}`. Estados activos: pendiente/en_preparacion/listo.
- `listarPedidosActivos(sb)` — todas las estaciones (cliente-display).
- `cambiarEstadoPedido(sb, pedidoId, estado)` — estado `'pendiente'|'en_preparacion'|'listo'|'entregado'|'cancelado'`.
- `suscribirPedidosCocina(sb, onCambio)` → función para desuscribir. Realtime ya habilitado en la base.

### Caja (`caja.ts`)
- `listarCajas(sb)`, `corteAbierto(sb, cajaId)`, `abrirCaja(sb, cajaId, fondo, empleadoId?)`, `cerrarCaja(sb, corteId, efectivoContado, empleadoId?, notas?)`, `resumenCorte(sb, corteId)` → `CorteResumen`

### Inventario (`inventario.ts`)
- `listarAlmacenes(sb)`, `stockPorAlmacen(sb, almacenId?)` → `StockAlmacen[]`, `registrarMovimiento(sb, {...})`, `transferir(sb, {...})`

### Reportes (`reportes.ts`)
- `ventasDiarias(sb, diasAtras?, sucursalId?)` → `VentaDiaria[]`
- `productosMasVendidos(sb, limite?)` → `ProductoVendido[]`
- `ordenesRecientes(sb, sucursalId, horas?)` → `Orden[]`

### Clientes (`clientes.ts`)
- `listarClientes(sb)`, `buscarClientes(sb, texto)`, `crearCliente(sb, input)`, `actualizarCliente(sb, id, input)`, `desactivarCliente(sb, id)`

## Reglas
- NO uses lealtad/wallet/gift cards/promos (fase posterior; tablas no existen).
- NO corras `pnpm install` (lo hace la integración final).
- Tipos de dominio en `@shake/types` (Producto, Orden, CorteResumen, etc.).
- Formato de dinero: `mxn()` de `@shake/utils`.
