import type { Tables, TablesInsert, TablesUpdate, Enums } from './database'

// ---- Alias de filas (lectura) ----
export type Sucursal = Tables<'sucursales'>
export type Almacen = Tables<'almacenes'>
export type Rol = Tables<'roles'>
export type Empleado = Tables<'empleados'>
export type Cliente = Tables<'clientes'>
export type Cupon = Tables<'cupones'>
export type MancuernaMovimiento = Tables<'mancuernas_movimientos'>
export type Promocion = Tables<'promociones'>
export type Caja = Tables<'cajas'>
export type CajaCorte = Tables<'caja_cortes'>
export type Insumo = Tables<'insumos'>
export type InsumoCategoria = Tables<'insumo_categorias'>
export type Producto = Tables<'productos'>
export type ComboItem = Tables<'combo_items'>
export type Categoria = Tables<'categorias'>
export type Receta = Tables<'recetas'>
export type Cocina = Tables<'cocinas'>
export type Orden = Tables<'ordenes'>
export type OrdenItem = Tables<'orden_items'>
export type Pago = Tables<'pagos'>
export type PedidoCocina = Tables<'pedidos_cocina'>
export type CocinaItem = Tables<'cocina_items'>
export type InventarioStock = Tables<'inventario_stock'>
export type InventarioMovimiento = Tables<'inventario_movimientos'>
export type Transferencia = Tables<'transferencias'>
export type Merma = Tables<'mermas'>
export type Parametros = Tables<'parametros'>
export type Impresora = Tables<'impresoras'>
export type TrabajoImpresion = Tables<'trabajos_impresion'>
export type ImpresionAuditoria = Tables<'impresion_auditoria'>
export type ConfiguracionKiosko = Tables<'configuracion_kiosko'>
export type VentaConfirmacion = Tables<'venta_confirmaciones'>
export type OrdenAuditoria = Tables<'ordenes_auditoria'>

// ---- Vistas ----
export type CosteoProducto = Tables<'vw_costeo_producto'>
export type ComboVista = Tables<'vw_combos'>
export type CorteResumen = Tables<'vw_corte_resumen'>
export type StockAlmacen = Tables<'vw_stock_almacen'>
export type VentaDiaria = Tables<'vw_ventas_diarias'>
export type ProductoVendido = Tables<'vw_productos_mas_vendidos'>

// ---- Inserts / Updates más usados ----
export type InsumoInsert = TablesInsert<'insumos'>
export type InsumoUpdate = TablesUpdate<'insumos'>
export type ProductoInsert = TablesInsert<'productos'>
export type ProductoUpdate = TablesUpdate<'productos'>
export type ComboItemInsert = TablesInsert<'combo_items'>
export type RecetaInsert = TablesInsert<'recetas'>
export type OrdenInsert = TablesInsert<'ordenes'>
export type OrdenItemInsert = TablesInsert<'orden_items'>
export type PagoInsert = TablesInsert<'pagos'>
export type ImpresoraInsert = TablesInsert<'impresoras'>
export type ImpresoraUpdate = TablesUpdate<'impresoras'>

// ---- Enums ----
export type MetodoPago = Enums<'metodo_pago'>
export type EstadoPago = Enums<'estado_pago'>
export type EstadoOrden = Enums<'estado_orden'>
export type EstadoCocina = Enums<'estado_cocina'>
export type EstadoCorte = Enums<'estado_corte'>
export type TipoInsumo = Enums<'tipo_insumo'>
export type TipoMovimiento = Enums<'tipo_movimiento'>
export type CanalOrden = Enums<'canal_orden'>
export type TipoCupon = Enums<'tipo_cupon'>
export type EstadoCupon = Enums<'estado_cupon'>
export type TipoMancuerna = Enums<'tipo_mancuerna'>
export type TipoPromocion = Enums<'tipo_promocion'>
export type EstadoTrabajoImpresion = Enums<'estado_trabajo_impresion'>
export type TipoConexionImpresora = Enums<'tipo_conexion_impresora'>
export type AnchoPapel = Enums<'ancho_papel'>
export type TipoDocumentoImpresion = Enums<'tipo_documento_impresion'>
export type EstadoPagoOrden = Enums<'estado_pago_orden'>
export type EstadoTransaccionPago = Enums<'estado_transaccion_pago'>
export type ModoPagoKiosko = Enums<'modo_pago_kiosko'>

// ---- Estructura del JSON legacy (app_data.data) ----
// Solo lectura: la usa el ETL de supabase/seed. No ampliar.
export interface LegacyAppData {
  params: {
    iva: number
    foodCost: number
    merma: number
    mano: number
    clave?: string
    claveCompras?: string
  }
  proteins: LegacyProtein[]
  shakeIngs: LegacyIngrediente[]
  foodIngs: LegacyIngrediente[]
  bebidas: LegacyReventa[]
  snacks: LegacyReventa[]
  empaque: LegacyEmpaque[]
  shakeRecipes: LegacyReceta[]
  foodRecipes: LegacyReceta[]
  invSesion?: unknown
}

export interface LegacyProtein {
  marca: string
  sabor: string
  codigo?: string
  pres?: string
  costo?: string | number
  scoops?: string | number
  precioBote?: string | number
  precioScoop?: string | number
  proveedor?: string
  fechaCaducidad?: string
  [k: string]: unknown
}

export interface LegacyIngrediente {
  nombre: string
  unidad?: string
  cont?: string | number
  costo?: string | number
  marca?: string
  codigo?: string
  proveedor?: string
  porcionQty?: string | number
  presCompra?: string
  gananciaPct?: string | number
  fechaCaducidad?: string
  [k: string]: unknown
}

export interface LegacyReventa {
  nombre: string
  codigo?: string
  costo?: string | number
  costoCaja?: string | number
  equivPiezas?: string | number
  precio?: string | number
  proveedor?: string
  presOriginal?: string
  [k: string]: unknown
}

export interface LegacyEmpaque {
  nombre: string
  costo?: string | number
  shake?: boolean
  food?: boolean
  [k: string]: unknown
}

export interface LegacyReceta {
  nombre: string
  codigo?: string
  precio?: string | number
  merma?: string | number
  ivaIncluido?: boolean
  scoops?: number
  protein?: string
  // cada ing: [nombre, cantidad, nota]
  ings: [string, string | number, string][]
  [k: string]: unknown
}
