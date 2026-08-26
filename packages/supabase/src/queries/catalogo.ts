import type {
  Insumo,
  InsumoInsert,
  InsumoUpdate,
  InsumoCategoria,
  Producto,
  ProductoInsert,
  ProductoUpdate,
  Categoria,
  Cocina,
  Receta,
  RecetaInsert,
  ComboVista,
} from '@shake/types'
import type { ShakeClient } from '../client'

// ------------------------------ insumos ------------------------------

export async function listarInsumos(sb: ShakeClient): Promise<Insumo[]> {
  const { data, error } = await sb
    .from('insumos')
    .select('*')
    .eq('activo', true)
    .order('tipo')
    .order('nombre')
  if (error) throw error
  return data
}

export async function crearInsumo(sb: ShakeClient, insumo: InsumoInsert): Promise<Insumo> {
  const { data, error } = await sb.from('insumos').insert(insumo).select().single()
  if (error) throw error
  return data
}

export async function actualizarInsumo(
  sb: ShakeClient,
  id: string,
  cambios: InsumoUpdate,
): Promise<Insumo> {
  const { data, error } = await sb.from('insumos').update(cambios).eq('id', id).select().single()
  if (error) throw error
  return data
}

/** Baja lógica: nunca se borra un insumo (histórico de recetas/kardex). */
export async function desactivarInsumo(sb: ShakeClient, id: string): Promise<void> {
  const { error } = await sb.from('insumos').update({ activo: false }).eq('id', id)
  if (error) throw error
}

export async function listarInsumoCategorias(sb: ShakeClient): Promise<InsumoCategoria[]> {
  const { data, error } = await sb.from('insumo_categorias').select('*').eq('activa', true).order('nombre')
  if (error) throw error
  return data
}

// ------------------------------ productos ----------------------------

export async function listarProductos(sb: ShakeClient): Promise<Producto[]> {
  const { data, error } = await sb.from('productos').select('*').eq('activo', true).order('nombre')
  if (error) throw error
  return data
}

export async function crearProducto(sb: ShakeClient, producto: ProductoInsert): Promise<Producto> {
  const { data, error } = await sb.from('productos').insert(producto).select().single()
  if (error) throw error
  return data
}

export async function actualizarProducto(
  sb: ShakeClient,
  id: string,
  cambios: ProductoUpdate,
): Promise<Producto> {
  const { data, error } = await sb.from('productos').update(cambios).eq('id', id).select().single()
  if (error) throw error
  return data
}

/**
 * Sube la foto de un producto al bucket público `productos` y deja la URL
 * en `productos.imagen_url` (que POS y Kiosko ya renderizan).
 * El nombre incluye un sufijo de tiempo para que al reemplazar la foto el
 * navegador no siga mostrando la anterior por caché.
 */
export async function subirFotoProducto(
  sb: ShakeClient,
  productoId: string,
  archivo: File,
): Promise<string> {
  const ext = (archivo.name.split('.').pop() ?? 'jpg').toLowerCase()
  const ruta = `${productoId}/${Date.now()}.${ext}`
  const { error: upError } = await sb.storage
    .from('productos')
    .upload(ruta, archivo, { upsert: true, contentType: archivo.type })
  if (upError) throw upError

  const { data } = sb.storage.from('productos').getPublicUrl(ruta)
  const url = data.publicUrl
  const { error } = await sb.from('productos').update({ imagen_url: url }).eq('id', productoId)
  if (error) throw error
  return url
}

/** Quita la foto del producto (deja el emoji por defecto del catálogo). */
export async function quitarFotoProducto(sb: ShakeClient, productoId: string): Promise<void> {
  const { error } = await sb.from('productos').update({ imagen_url: null }).eq('id', productoId)
  if (error) throw error
}

export async function listarCategorias(sb: ShakeClient): Promise<Categoria[]> {
  const { data, error } = await sb.from('categorias').select('*').eq('activa', true).order('orden').order('nombre')
  if (error) throw error
  return data
}

/** Baja lógica de producto: no se borra (histórico de órdenes/recetas). */
export async function desactivarProducto(sb: ShakeClient, id: string): Promise<void> {
  const { error } = await sb.from('productos').update({ activo: false }).eq('id', id)
  if (error) throw error
}

export async function crearCategoria(
  sb: ShakeClient,
  cat: { nombre: string; cocina_id: string },
): Promise<Categoria> {
  const { data, error } = await sb.from('categorias').insert(cat).select().single()
  if (error) throw error
  return data
}

/** Renombrar, cambiar de estación o reordenar una categoría. */
export async function actualizarCategoria(
  sb: ShakeClient,
  id: string,
  cambios: { nombre?: string; cocina_id?: string; orden?: number },
): Promise<void> {
  const { error } = await sb.from('categorias').update(cambios).eq('id', id)
  if (error) throw error
}

export async function listarCocinas(sb: ShakeClient): Promise<Cocina[]> {
  const { data, error } = await sb.from('cocinas').select('*').order('nombre')
  if (error) throw error
  return data
}

// ------------------------- catálogo para venta -----------------------
// Producto con su categoría y la cocina/estación a la que ruta.
export interface ProductoVenta extends Producto {
  categorias: {
    id: string
    nombre: string
    orden: number
    cocinas: { id: string; nombre: string; slug: string } | null
  } | null
}

/**
 * Catálogo activo con categoría y cocina anidada (POS, kiosko, admin).
 * Excluye los extras: no son tarjetas del catálogo, se ofrecen solo
 * dentro del producto al que pertenecen (ver `listarExtrasDeProducto`).
 */
export async function listarProductosParaVenta(sb: ShakeClient): Promise<ProductoVenta[]> {
  const { data, error } = await sb
    .from('productos')
    .select('*, categorias(id, nombre, orden, cocinas(id, nombre, slug))')
    .eq('activo', true)
    .eq('es_extra', false)
    .order('orden')
    .order('nombre')
  if (error) throw error
  return data as unknown as ProductoVenta[]
}

/** Catálogo activo de una estación de cocina ('alimentos' | 'bebidas'). */
export async function listarProductosPorCocina(
  sb: ShakeClient,
  cocinaSlug: string,
): Promise<ProductoVenta[]> {
  const { data, error } = await sb
    .from('productos')
    .select('*, categorias!inner(id, nombre, orden, cocinas!inner(id, nombre, slug))')
    .eq('activo', true)
    .eq('categorias.cocinas.slug', cocinaSlug)
    .order('nombre')
  if (error) throw error
  return data as unknown as ProductoVenta[]
}

// ------------------------------ recetas ------------------------------

export async function obtenerReceta(sb: ShakeClient, productoId: string): Promise<Receta[]> {
  const { data, error } = await sb.from('recetas').select('*').eq('producto_id', productoId)
  if (error) throw error
  return data
}

/**
 * Reemplaza la receta completa de un producto (borra líneas anteriores
 * e inserta las nuevas). Las cantidades van en la unidad del insumo.
 */
export async function guardarReceta(
  sb: ShakeClient,
  productoId: string,
  lineas: Omit<RecetaInsert, 'producto_id'>[],
): Promise<void> {
  const { error: delError } = await sb.from('recetas').delete().eq('producto_id', productoId)
  if (delError) throw delError
  if (lineas.length === 0) return
  const { error } = await sb
    .from('recetas')
    .insert(lineas.map((l) => ({ ...l, producto_id: productoId })))
  if (error) throw error
}

// ------------------------------- combos -------------------------------
// Un combo es un producto normal (`productos.es_combo = true`) compuesto
// de otros productos vía `combo_items`. Su receta se materializa sola en
// el servidor (triggers, ver supabase/migrations/costeo_combos_productos.sql)
// — aquí solo se gestiona la cabecera y los componentes.

/** Todos los combos (activos e inactivos, para poder gestionarlos). */
export async function listarCombos(sb: ShakeClient): Promise<ComboVista[]> {
  const { data, error } = await sb.from('vw_combos').select('*').order('nombre')
  if (error) throw error
  return data
}

export async function crearCombo(
  sb: ShakeClient,
  combo: { nombre: string; precio: number; categoria_id: string | null },
): Promise<Producto> {
  const { data, error } = await sb
    .from('productos')
    .insert({ ...combo, es_combo: true })
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Agrega un producto como componente del combo, o actualiza su cantidad
 * si ya estaba agregado. El servidor valida que todos los componentes
 * sean de la misma estación (cocina) y recalcula la receta del combo.
 */
export async function agregarComponenteCombo(
  sb: ShakeClient,
  comboId: string,
  productoId: string,
  cantidad: number,
): Promise<void> {
  const { error } = await sb
    .from('combo_items')
    .upsert({ combo_id: comboId, producto_id: productoId, cantidad }, { onConflict: 'combo_id,producto_id' })
  if (error) throw error
}

export async function quitarComponenteCombo(
  sb: ShakeClient,
  comboId: string,
  productoId: string,
): Promise<void> {
  const { error } = await sb
    .from('combo_items')
    .delete()
    .eq('combo_id', comboId)
    .eq('producto_id', productoId)
  if (error) throw error
}

// ------------------------------- extras -------------------------------
// Un extra es un producto normal (`es_extra = true`) con receta 1:1 contra
// el insumo que consume — al venderlo descuenta inventario y cuesta igual
// que cualquier producto. `producto_extras` dice cuáles se ofrecen en cuál
// alimento. Ver supabase/migrations/catalogo_suplementos_y_extras.sql.

export interface ExtraDeProducto {
  producto_id: string
  extra_id: string
  nombre: string
  /** Precio efectivo EN ESTE producto (el sobreprecio del vínculo, si tiene). */
  precio: number
  /**
   * Extras del mismo producto que comparten grupo se eligen entre sí, uno
   * solo (así se ofrece "americano frío o caliente" dentro de un paquete).
   * Null = adicional suelto, con cantidad.
   */
  grupo: string | null
  /**
   * Marca del extra. Es lo que amarra "Proteína BIRDMAN FALCON - Chocolate"
   * con "Doble scoop - BIRDMAN FALCON": un dato, no un recorte del nombre.
   * Importa porque "BIRDMAN FALCON" y "BIRDMAN FALCON PERFORMANCE" empiezan
   * igual y adivinarlo por texto los confundiría.
   */
  marca: string | null
  activo: boolean
}

/**
 * Los productos extra en sí (los que `listarProductosParaVenta` excluye).
 * El POS los necesita para poder meterlos al ticket cuando el cajero los
 * elige dentro de un alimento.
 */
export async function listarProductosExtra(sb: ShakeClient): Promise<ProductoVenta[]> {
  const { data, error } = await sb
    .from('productos')
    .select('*, categorias(id, nombre, orden, cocinas(id, nombre, slug))')
    .eq('activo', true)
    .eq('es_extra', true)
    .order('nombre')
  if (error) throw error
  return data as unknown as ProductoVenta[]
}

/** Extras ofrecidos por producto (todos de una, para cachear en el POS). */
export async function listarExtras(sb: ShakeClient): Promise<ExtraDeProducto[]> {
  const { data, error } = await sb
    .from('vw_producto_extras')
    .select('*')
    .eq('activo', true)
    .order('nombre')
  if (error) throw error
  return data as unknown as ExtraDeProducto[]
}

/** Ingredientes de un producto que pueden ofrecerse como extra, con su costo real. */
export interface IngredienteExtraible {
  insumo_id: string
  nombre: string
  unidad: string
  cantidad_receta: number
  costo_unitario: number
  costo_en_receta: number
  ya_es_extra: boolean
}

export async function extrasDisponibles(
  sb: ShakeClient,
  productoId: string,
): Promise<IngredienteExtraible[]> {
  const { data, error } = await (sb.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>)('fn_extras_disponibles', {
    p_producto_id: productoId,
  })
  if (error) throw error
  return (data ?? []) as IngredienteExtraible[]
}

/** Crea/actualiza el extra de un insumo y lo ofrece en ese producto. */
export async function guardarExtra(
  sb: ShakeClient,
  input: { productoId: string; insumoId: string; nombre: string; precio: number; cantidad?: number | null },
): Promise<void> {
  const { error } = await (sb.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ error: unknown }>)('fn_guardar_extra', {
    p_producto_id: input.productoId,
    p_insumo_id: input.insumoId,
    p_nombre: input.nombre,
    p_precio: input.precio,
    p_cantidad: input.cantidad ?? null,
  })
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Extras de shakes (leches, proteínas, agua) — autoservicio del Admin
// ---------------------------------------------------------------------------
// Distintos de los extras de alimentos: no llevan insumo de receta (no
// descuentan inventario) y se ofrecen en bloque — una leche va en todos los
// shakes, una proteína solo en El Clásico. El kiosko los agrupa por cómo
// empieza el nombre: "Leche …", "Proteína MARCA - Sabor", "Agua".

export interface ExtraBebidaAdmin {
  id: string
  nombre: string
  precio: number
  activo: boolean
  /** En cuántos productos se ofrece. 0 = existe pero no aparece en ningún lado. */
  ligado_a: number
}

type RpcCatalogo = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>

/** Todos los extras de bebida, incluidos los apagados (para poder volver a prenderlos). */
export async function listarExtrasBebidaAdmin(sb: ShakeClient): Promise<ExtraBebidaAdmin[]> {
  const { data, error } = await (sb.rpc as unknown as RpcCatalogo)('fn_extras_bebida_admin', {})
  if (error) throw error
  return (data ?? []) as ExtraBebidaAdmin[]
}

/**
 * Crea (o repara) un extra de bebida y lo liga a sus productos. Idempotente:
 * guardar dos veces el mismo nombre no duplica — reutiliza y re-liga.
 * `aplicar`: 'shakes' = todos los shakes activos · 'clasico' = solo El Clásico.
 */
export async function guardarExtraBebida(
  sb: ShakeClient,
  input: { nombre: string; precio: number; aplicar: 'shakes' | 'clasico' },
): Promise<void> {
  const { error } = await (sb.rpc as unknown as RpcCatalogo)('fn_extra_bebida_guardar', {
    p_nombre: input.nombre,
    p_precio: input.precio,
    p_aplicar: input.aplicar,
  })
  if (error) throw error
}

/**
 * Prende o apaga un extra al momento ("ya no tenemos ese sabor"). Apagado
 * desaparece del kiosko en la siguiente carga; sus vínculos se conservan,
 * así que volver a prenderlo lo deja exactamente como estaba.
 */
export async function activarExtraBebida(sb: ShakeClient, id: string, activo: boolean): Promise<void> {
  const { error } = await (sb.rpc as unknown as RpcCatalogo)('fn_extra_bebida_activar', {
    p_id: id,
    p_activo: activo,
  })
  if (error) throw error
}

/** Un renglón del panel "dónde se ofrece": cada bebida activa, con su palomita. */
export interface ProductoDeExtra {
  producto_id: string
  nombre: string
  categoria: string
  ofrecido: boolean
  /** Sobreprecio propio en ESTE producto; null = cobra el precio del extra. */
  precio_propio: number | null
  /** El precio normal del extra, para mostrarlo como referencia. */
  precio_base: number
  grupo: string | null
}

/**
 * Todas las bebidas activas y si ofrecen o no el extra dado. La lista es
 * "todo lo activo de la estación de bebidas", no una fija: un producto nuevo
 * capturado en costeo aparece aquí solo, listo para ligarle sus bases.
 */
export async function productosDeExtra(sb: ShakeClient, extraId: string): Promise<ProductoDeExtra[]> {
  const { data, error } = await (sb.rpc as unknown as RpcCatalogo)('fn_extra_bebida_productos', {
    p_extra_id: extraId,
  })
  if (error) throw error
  return (data ?? []) as ProductoDeExtra[]
}

/** Prende o apaga el extra en UN producto. */
export async function vincularExtraBebida(
  sb: ShakeClient,
  extraId: string,
  productoId: string,
  ofrecer: boolean,
): Promise<void> {
  const { error } = await (sb.rpc as unknown as RpcCatalogo)('fn_extra_bebida_vincular', {
    p_extra_id: extraId,
    p_producto_id: productoId,
    p_ofrecer: ofrecer,
  })
  if (error) throw error
}

/**
 * Precio de ESTE extra en ESTE producto. `null` devuelve el vínculo a
 * cobrar el precio normal del extra.
 *
 * Es lo que hace que la misma leche cueste $10 en un americano y $0 en un
 * shake, o que cambiar de proteína sume $10 solo en los shakes que lo
 * cobran — sin duplicar productos.
 */
export async function precioExtraEnProducto(
  sb: ShakeClient,
  extraId: string,
  productoId: string,
  precio: number | null,
): Promise<void> {
  const { error } = await (sb.rpc as unknown as RpcCatalogo)('fn_extra_bebida_precio', {
    p_extra_id: extraId,
    p_producto_id: productoId,
    p_precio: precio,
  })
  if (error) throw error
}

/** Grupo del extra en ese producto: los del mismo grupo se eligen entre sí. */
export async function grupoExtraEnProducto(
  sb: ShakeClient,
  extraId: string,
  productoId: string,
  grupo: string | null,
): Promise<void> {
  const { error } = await (sb.rpc as unknown as RpcCatalogo)('fn_extra_bebida_grupo', {
    p_extra_id: extraId,
    p_producto_id: productoId,
    p_grupo: grupo,
  })
  if (error) throw error
}

// ---------------------------- observaciones ----------------------------
// Los chips de "menos hielo" / "sin tomate" que el kiosko ofrece al
// personalizar. Vivían escritos en el código del kiosko: cambiar uno
// obligaba a desplegar. Ahora los administra la sucursal.

export interface Observacion {
  id: string
  texto: string
  orden: number
}

export interface ObservacionAdmin extends Observacion {
  cocina_id: string
  cocina: string
  activa: boolean
}

/** Las activas de una estación, para el kiosko. */
export async function listarObservaciones(sb: ShakeClient, cocinaSlug: string): Promise<Observacion[]> {
  const { data, error } = await (sb.rpc as unknown as RpcCatalogo)('fn_observaciones', {
    p_cocina_slug: cocinaSlug,
  })
  if (error) throw error
  return (data ?? []) as Observacion[]
}

/** Todas, incluidas las apagadas, para Admin. */
export async function listarObservacionesAdmin(sb: ShakeClient): Promise<ObservacionAdmin[]> {
  const { data, error } = await (sb.rpc as unknown as RpcCatalogo)('fn_observaciones_admin', {})
  if (error) throw error
  return (data ?? []) as ObservacionAdmin[]
}

export async function guardarObservacion(
  sb: ShakeClient,
  cocinaSlug: string,
  texto: string,
  orden = 100,
): Promise<void> {
  const { error } = await (sb.rpc as unknown as RpcCatalogo)('fn_observacion_guardar', {
    p_cocina_slug: cocinaSlug,
    p_texto: texto,
    p_orden: orden,
  })
  if (error) throw error
}

export async function activarObservacion(sb: ShakeClient, id: string, activa: boolean): Promise<void> {
  const { error } = await (sb.rpc as unknown as RpcCatalogo)('fn_observacion_activar', {
    p_id: id,
    p_activa: activa,
  })
  if (error) throw error
}

export async function borrarObservacion(sb: ShakeClient, id: string): Promise<void> {
  const { error } = await (sb.rpc as unknown as RpcCatalogo)('fn_observacion_borrar', { p_id: id })
  if (error) throw error
}

/**
 * Cambia la categoría de un producto Y la deja escrita en el JSON de costeo
 * (app_data), que es la fuente de verdad del catálogo. Sin eso, mover en
 * Admin y guardar después en costeo vivían en dos mundos. La sincronización
 * respeta la categoría del JSON en alta y actualización.
 */
export async function moverCategoriaProducto(
  sb: ShakeClient,
  productoId: string,
  categoriaId: string | null,
): Promise<void> {
  const { error } = await (sb.rpc as unknown as RpcCatalogo)('fn_producto_mover_categoria', {
    p_producto_id: productoId,
    p_categoria_id: categoriaId,
  })
  if (error) throw error
}

export async function quitarExtra(
  sb: ShakeClient,
  productoId: string,
  extraId: string,
): Promise<void> {
  const { error } = await (sb.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ error: unknown }>)('fn_quitar_extra', {
    p_producto_id: productoId,
    p_extra_id: extraId,
  })
  if (error) throw error
}

/**
 * Cómo se nombra un producto en la pantalla donde se ordena.
 *
 * Los scoops se llaman en la base "Scoop BIRDMAN FALCON - Chocolate": el
 * prefijo lo pone la sincronización de costosshake, que además empata las
 * recetas por ese nombre exacto y desactiva cualquier producto de la
 * categoría Scoops que no lo lleve. Por eso el prefijo NO se le quita al
 * dato —renombrarlos apagaría los 45 y crearía 45 duplicados— y se le quita
 * solo aquí, al pintarlo.
 *
 * Sirve para que en la tarjeta quepa lo que de verdad hay que leer: la
 * marca, el producto y su sabor. En comanda y etiqueta el nombre sigue
 * completo, con su "Scoop" al frente, que es como en barra lo identifican.
 */
export function nombreParaOrdenar(nombre: string): string {
  return nombre.replace(/^\s*scoop\s+/i, '').trim() || nombre
}

// --------------------- a que pantalla va cada categoria ---------------------

export interface CategoriaPantalla {
  id: string
  nombre: string
  /** Estacion a la que pertenece. Sigue puesta aunque no vaya a pantalla. */
  cocina_slug: string
  cocina: string
  va_a_pantalla: boolean
  productos_activos: number
}

export async function listarCategoriasPantalla(sb: ShakeClient): Promise<CategoriaPantalla[]> {
  const { data, error } = await (sb.rpc as unknown as RpcCatalogo)('fn_categorias_pantalla', {})
  if (error) throw error
  return (data ?? []) as CategoriaPantalla[]
}

/**
 * Cambia a que pantalla llega una categoria.
 * `cocinaSlug` null = no va a ninguna (se vende, pero nadie lo prepara).
 */
export async function guardarCategoriaPantalla(
  sb: ShakeClient,
  categoriaId: string,
  cocinaSlug: string | null,
): Promise<void> {
  const { error } = await (sb.rpc as unknown as RpcCatalogo)('fn_categoria_pantalla', {
    p_categoria_id: categoriaId,
    p_cocina_slug: cocinaSlug,
  })
  if (error) throw error
}

// ------------------- agrupar categorias para el menu -------------------

export interface CategoriaAgrupable {
  id: string
  nombre: string
  orden: number
}

export interface FamiliaCategorias<T extends CategoriaAgrupable> {
  nombre: string
  orden: number
  /** La categoría con el nombre de la familia, si existe como tal. */
  propia: T | null
  /** Sus subcategorías, ya con el nombre corto ("Proteínas", no "Scoops - Proteínas"). */
  subs: T[]
}

/**
 * Pliega las categorías en dos niveles para el menú.
 *
 * Al partir Scoops y Suplementos por tipo, la fila de filtros del kiosko pasó
 * de 12 chips a 24 y creció de dos renglones a cuatro: media pantalla gastada
 * antes de mostrar un solo producto. El nombre ya trae la jerarquía
 * ("Scoops - Proteínas"), así que se aprovecha esa marca en vez de inventar
 * una tabla de padres.
 *
 * Dos formas se reconocen como subcategoría:
 *   · "Familia - Sub"  — el separador que usa casi todo el catálogo.
 *   · "Suplementos X"  — sin guion, porque el negocio pidió que ese botón se
 *                        llamara exactamente "Suplementos Birdman".
 *
 * Lo que no encaja en ninguna se queda como familia suelta, que es lo correcto
 * para Shakes, Café o Combos: no tienen de qué colgar.
 */
export function agruparCategorias<T extends CategoriaAgrupable>(
  categorias: T[],
): FamiliaCategorias<T>[] {
  const grupos = new Map<string, FamiliaCategorias<T>>()

  for (const cat of categorias) {
    let familia = cat.nombre
    let sub: string | null = null

    const guion = cat.nombre.indexOf(' - ')
    if (guion > 0) {
      familia = cat.nombre.slice(0, guion)
      sub = cat.nombre.slice(guion + 3)
    } else if (cat.nombre.startsWith('Suplementos ')) {
      familia = 'Suplementos'
      sub = cat.nombre.slice('Suplementos '.length)
    }

    const actual = grupos.get(familia) ?? { nombre: familia, orden: cat.orden, propia: null, subs: [] }
    // La familia se ordena por el primero de los suyos: así "Scoops" queda
    // donde estaba y no se va al final por culpa de una subcategoría nueva.
    actual.orden = Math.min(actual.orden, cat.orden)
    if (sub) actual.subs.push({ ...cat, nombre: sub })
    else actual.propia = cat
    grupos.set(familia, actual)
  }

  for (const g of grupos.values()) g.subs.sort((a, b) => a.orden - b.orden)
  return [...grupos.values()].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre))
}

// ---------------------- recarga remota de pantallas ------------------

/**
 * Suscripción al timbre de recargas: cuando gerencia pide "actualizar
 * pantallas" desde Admin, cada pantalla suscrita ejecuta `alRecibir`.
 * Devuelve la función para colgar el canal (React cleanup).
 *
 * `alRecibir` decide CÓMO recargar: las pantallas de solo-lectura
 * (barra, cocina, folios) recargan al instante; el kiosko espera a no
 * tener un pedido a medias para no tirarle el carrito a un cliente.
 */
export function escucharRecargas(
  sb: ShakeClient,
  pantalla: 'kiosko' | 'barra' | 'cocina' | 'pantalla',
  alRecibir: () => void,
): () => void {
  const canal = sb
    .channel(`recargas-${pantalla}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'senales_pantallas' },
      (evento: { new?: { pantalla?: string; accion?: string } }) => {
        const fila = evento.new
        if (!fila || fila.accion !== 'recargar') return
        if (fila.pantalla === pantalla || fila.pantalla === 'todas') alRecibir()
      },
    )
    .subscribe()
  return () => { void sb.removeChannel(canal) }
}

export interface CambiosCatalogo {
  primera_vez: boolean
  hay_cambios: boolean
  /** Fecha de la última publicación; null si nunca se publicó. */
  desde: string | null
  altas: { nombre: string; precio: number; categoria: string | null }[]
  bajas: { nombre: string; categoria: string | null }[]
  renombres: { antes: string; ahora: string }[]
  precios: { nombre: string; antes: number; ahora: number }[]
  encendidos: string[]
  apagados: string[]
  combos: { nombre: string | null; antes: string | null; ahora: string | null }[]
}

/**
 * Qué va a cambiar en las pantallas si se publica ahora.
 *
 * Se compara contra la FOTO de la última publicación, no contra "hace un
 * rato": si alguien guardó el lunes y publica el jueves, tiene que ver los
 * tres días de cambios juntos.
 */
export async function cambiosDelCatalogo(sb: ShakeClient): Promise<CambiosCatalogo> {
  const { data, error } = await (sb.rpc as unknown as RpcCatalogo)('fn_catalogo_cambios', {})
  if (error) throw error
  return data as CambiosCatalogo
}

/** Cuántas cosas cambiaron, para el contador. */
export function contarCambios(c: CambiosCatalogo | null): number {
  if (!c) return 0
  if (c.primera_vez) return 1
  return (
    c.altas.length + c.bajas.length + c.renombres.length +
    c.precios.length + c.encendidos.length + c.apagados.length + c.combos.length
  )
}

/**
 * Admin: publicar el catálogo.
 *
 * Es lo mismo que hace Costeos con "Mostrar en el kiosko": guarda la foto
 * del catálogo y toca el timbre de todas las pantallas. Va por aquí y no
 * por `pedirRecargaPantallas('todas')` para que las dos puertas dejen la
 * misma marca — si Admin recargara sin guardar la foto, el contador de
 * Costeos seguiría diciendo "sin publicar: 3" para siempre, y un contador
 * que miente deja de leerse.
 *
 * No pide clave: quien está en Admin ya tiene sesión de gerencia.
 */
export async function publicarCatalogo(sb: ShakeClient): Promise<void> {
  const { error } = await (sb.rpc as unknown as RpcCatalogo)('fn_catalogo_publicar', {
    p_clave: null,
    p_quien: null,
  })
  if (error) throw error
}

/** Admin: recargar UNA pantalla que se quedó atorada. */
export async function pedirRecargaPantallas(
  sb: ShakeClient,
  pantalla: 'kiosko' | 'barra' | 'cocina' | 'pantalla' | 'todas',
): Promise<void> {
  const { error } = await (sb.rpc as unknown as RpcCatalogo)('fn_pantallas_recargar', {
    p_pantalla: pantalla,
  })
  if (error) throw error
}
