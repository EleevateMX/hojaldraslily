import type { Cliente, Cupon } from '@shake/types'
import type { ShakeClient } from '../client'

// rpc no está en los tipos generados; se castea el nombre (mismo patrón que ordenes.ts).
type RpcFn = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
async function rpc<T>(sb: ShakeClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await (sb.rpc as unknown as RpcFn)(fn, args)
  if (error) throw error
  return data as T
}

export interface ClienteConLealtad extends Cliente {
  cupones: Cupon[]
}

/**
 * Identifica al cliente en caja por teléfono o por código QR (SHK-XXXXXX).
 * Devuelve su saldo de mancuernas y cupones activos vigentes.
 */
export async function identificarCliente(
  sb: ShakeClient,
  telefonoOCodigo: string,
): Promise<ClienteConLealtad | null> {
  const q = telefonoOCodigo.trim()
  if (!q) return null
  const esCodigo = /^SHK-/i.test(q)
  const { data, error } = await sb
    .from('clientes')
    .select('*, cupones(*)')
    .eq(esCodigo ? 'codigo' : 'telefono', esCodigo ? q.toUpperCase() : q)
    .eq('activo', true)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const cli = data as ClienteConLealtad
  // solo cupones activos y vigentes
  const ahora = Date.now()
  cli.cupones = (cli.cupones ?? []).filter(
    (c) => c.estado === 'activo' && new Date(c.vence_en).getTime() >= ahora,
  )
  return cli
}

export interface RegistrarClienteInput {
  nombre: string
  telefono: string
  fecha_nacimiento?: string | null
  sabor_favorito?: string | null
}

/** Alta de cliente en el programa (el código QR se genera en la base). */
export async function registrarCliente(
  sb: ShakeClient,
  input: RegistrarClienteInput,
): Promise<Cliente> {
  return rpc<Cliente>(sb, 'fn_cliente_registrar', {
    p_nombre: input.nombre,
    p_telefono: input.telefono,
    p_fecha_nacimiento: input.fecha_nacimiento ?? null,
    p_sabor_favorito: input.sabor_favorito ?? null,
  })
}

/**
 * Vincula (o crea) el cliente del programa con el usuario de Supabase Auth.
 * Se llama tras el login con Google. Idempotente: entrar mil veces con la
 * misma cuenta devuelve siempre la misma ficha.
 *
 * La identidad NO viaja como parámetro: el servidor la toma de `auth.uid()` y
 * del correo verificado que trae el token de Google. Por eso basta con estar
 * logueado — y por eso nadie puede mandar el id de otro para quedarse con sus
 * mancuernas. Si el cliente ya estaba dado de alta en caja con ese mismo
 * correo, se reclama esa ficha en vez de crear una segunda.
 */
export async function vincularClienteAuth(
  sb: ShakeClient,
  input: { nombre?: string | null },
): Promise<ClienteConLealtad> {
  const cli = await rpc<Cliente>(sb, 'fn_vincular_cliente_auth', {
    p_nombre: input.nombre ?? null,
  })
  // La RPC devuelve la fila de `clientes`; los cupones se leen aparte (la
  // política de lectura ya los acota a los del propio usuario).
  const cupones = await cuponesActivos(sb, cli.id)
  return { ...cli, cupones }
}

/** Estado de lealtad del usuario logueado (por auth_user_id). */
export async function miLealtad(sb: ShakeClient, authUserId: string): Promise<ClienteConLealtad | null> {
  const { data, error } = await sb
    .from('clientes')
    .select('*, cupones(*)')
    .eq('auth_user_id', authUserId)
    .maybeSingle()
  if (error) throw error
  return data ? filtrarCupones(data as ClienteConLealtad) : null
}

function filtrarCupones(cli: ClienteConLealtad): ClienteConLealtad {
  const ahora = Date.now()
  cli.cupones = (cli.cupones ?? []).filter(
    (c) => c.estado === 'activo' && new Date(c.vence_en).getTime() >= ahora,
  )
  return cli
}

/** Cupones activos y vigentes de un cliente. */
export async function cuponesActivos(sb: ShakeClient, clienteId: string): Promise<Cupon[]> {
  const { data, error } = await sb
    .from('cupones')
    .select('*')
    .eq('cliente_id', clienteId)
    .eq('estado', 'activo')
    .gte('vence_en', new Date().toISOString())
    .order('vence_en')
  if (error) throw error
  return data
}

/** Busca un cupón por su código (escaneo QR en caja). */
export async function buscarCupon(sb: ShakeClient, codigo: string): Promise<Cupon | null> {
  const { data, error } = await sb
    .from('cupones')
    .select('*')
    .eq('codigo', codigo.trim().toUpperCase())
    .maybeSingle()
  if (error) throw error
  return data
}

/**
 * Canjea un cupón: valida que esté activo y vigente, lo marca usado y lo
 * liga a la orden. Devuelve el cupón canjeado o lanza si no es válido.
 *
 * Todo ocurre dentro de un solo UPDATE condicional en el servidor, así que dos
 * cajas que intenten el mismo cupón a la vez no pueden canjearlo dos veces:
 * la segunda recibe "ya fue usado".
 */
export async function canjearCupon(
  sb: ShakeClient,
  cuponId: string,
  ordenId?: string,
): Promise<Cupon> {
  return rpc<Cupon>(sb, 'fn_canjear_cupon', {
    p_cupon_id: cuponId,
    p_orden_id: ordenId ?? null,
  })
}

// ── El expediente del cliente ──────────────────────────────────────────────
// Historial de compras y productos más pedidos del usuario logueado. Las
// RPCs parten de auth.uid(), así que cada quien ve solo lo suyo; aquí no
// viaja ningún identificador.

export interface FavoritoCliente {
  producto: string
  veces: number
  ultima_vez: string
}

export interface CompraItem {
  producto: string
  cantidad: number
  personalizacion: string | null
}

export interface CompraHistorial {
  folio: number
  fecha: string
  total: number
  mancuernas_ganadas: number
  items: CompraItem[] | null
}

/** Lo que siempre pide: sus productos por número de veces. */
export async function misFavoritos(sb: ShakeClient, limite = 5): Promise<FavoritoCliente[]> {
  return (await rpc<FavoritoCliente[]>(sb, 'fn_mis_favoritos', { p_limite: limite })) ?? []
}

/** Sus últimas compras con detalle, la más reciente primero. */
export async function miHistorial(sb: ShakeClient, limite = 20): Promise<CompraHistorial[]> {
  return (await rpc<CompraHistorial[]>(sb, 'fn_mi_historial', { p_limite: limite })) ?? []
}

// ── Recibo digital y ficha ─────────────────────────────────────────────────

export interface ReciboItem {
  producto: string
  cantidad: number
  precio_unitario: number
  personalizacion: string | null
  es_extra: boolean
}

export interface ReciboPublico {
  folio: number
  fecha: string
  total: number
  metodo_pago: string | null
  nombre_cliente: string | null
  es_demo: boolean
  mancuernas_ganadas: number
  items: ReciboItem[] | null
}

/**
 * El recibo que abre el QR de la pantalla de confirmación. El uuid de la
 * orden es la llave; solo órdenes pagadas existen para esta función.
 */
export async function reciboPublico(sb: ShakeClient, ordenId: string): Promise<ReciboPublico | null> {
  return rpc<ReciboPublico | null>(sb, 'fn_recibo_publico', { p_orden_id: ordenId })
}

/** Completa la ficha del usuario logueado con su teléfono (10 dígitos). */
export async function guardarMiTelefono(sb: ShakeClient, telefono: string): Promise<Cliente> {
  return rpc<Cliente>(sb, 'fn_mi_telefono_guardar', { p_telefono: telefono })
}

// ------------------- el expediente del cliente (app) ------------------

export interface ResumenLealtad {
  registrado: boolean
  /** Mancuernas por peso: 10 = $1. Se usa para pintar equivalencias. */
  tasa?: number
  cliente?: {
    id: string
    nombre: string
    codigo: string | null
    telefono: string | null
    /** La de Google, o la que subió el cliente. */
    foto: string | null
    /** Subió la suya: la de Google ya no la pisa. */
    foto_propia: boolean
    /** Ganadas por comprar (promoción — pueden caducar). */
    mancuernas: number
    /** Compradas con dinero real (recarga o tarjeta — no caducan). */
    saldo: number
    total_canjeable: number
    /** Lo que valen las dos bolsas juntas, en pesos. */
    vale_pesos: number
    /** "Agosto 2026" — desde cuándo es cliente. */
    desde: string
  }
  progreso?: { meta: number; faltan: number; pct: number }
  /** Las dos tarjetas 13+1: una de bebidas y otra de comida. */
  sellos?: {
    tipo: string
    tiene: number
    requeridos: number
    faltan: number
    listo: boolean
  }[]
  /** Catálogo de lo que se puede pedir al llenar una tarjeta. */
  premios?: { tipo: string; nombre: string; precio: number }[]
  /** Paquetes de recarga a la venta, con el bono que regalan. */
  paquetes?: {
    nombre: string
    precio: number
    mancuernas: number
    vale: number
    bono_pct: number
  }[]
  vida?: { visitas: number; gastado: number; ticket: number; ultima: string | null }
  ganadas_total?: number
  cupones?: { codigo: string; beneficio: string; vence: string; dias_restantes: number }[]
  favoritos?: { nombre: string; veces: number }[]
  historial?: {
    folio: number
    orden_id: string
    fecha: string
    total: number
    items: string
    mancuernas: number
  }[]
  /** Las dos bolsas mezcladas en una sola línea de tiempo. */
  movimientos?: {
    puntos: number
    descripcion: string
    fecha: string
    bolsa?: 'ganadas' | 'saldo'
  }[]
}

/**
 * Todo el expediente del cliente en un viaje (RPC `fn_mi_resumen_lealtad`).
 *
 * La app pedía lealtad, cupones, favoritos e historial por separado: en un
 * celular con la red de la tienda eso son cuatro esperas. Además el
 * servidor ya trae calculado el camino al próximo cupón y las estadísticas
 * de vida, que es lo que de verdad engancha.
 *
 * Lee siempre del usuario de la sesión: no recibe id, así nadie puede
 * pedir el expediente de otra persona.
 */
export async function miResumenLealtad(sb: ShakeClient): Promise<ResumenLealtad> {
  return rpc<ResumenLealtad>(sb, 'fn_mi_resumen_lealtad', {})
}

export interface TarjetaCanjeada {
  cargadas: number
  cliente: string
  saldo_nuevo: number
  vale_pesos: number
}

/**
 * Carga una tarjeta de regalo física a una cuenta.
 *
 * Sin `clienteId` la carga a la cuenta de quien está logueado — es el camino
 * de la app. Con `clienteId` la carga a otra cuenta, y para eso el servidor
 * exige ser personal: si no, cualquiera podría mandar el saldo de una
 * tarjeta ajena a su propia cuenta.
 *
 * La tarjeta se bloquea y se marca canjeada en la misma transacción, así que
 * dos escaneos simultáneos no pueden cargarla dos veces.
 */
export async function canjearTarjeta(
  sb: ShakeClient,
  codigo: string,
  clienteId?: string,
): Promise<TarjetaCanjeada> {
  return rpc<TarjetaCanjeada>(sb, 'fn_canjear_tarjeta', {
    p_codigo: codigo.trim().toUpperCase(),
    p_cliente_id: clienteId ?? null,
  })
}

// ─────────────────────────── Metas y logros ───────────────────────────────

export interface Meta {
  clave: string
  nombre: string
  descripcion: string
  tipo: 'automatica' | 'evidencia'
  mancuernas: number
  pide_texto: string | null
  orden: number
  /** Cuántas veces ya la cumplió. */
  veces: number
  /** Mandó captura y está esperando revisión. */
  pendiente: boolean
  /** Se puede cobrar ahora mismo. */
  disponible: boolean
  ultima: string | null
}

export async function misMetas(sb: ShakeClient): Promise<Meta[]> {
  return rpc<Meta[]>(sb, 'fn_mis_metas', {})
}

export interface ResultadoMeta {
  acreditada: boolean
  mancuernas?: number
  nombre?: string
  motivo?: string
}

/**
 * Cobra una meta automática.
 *
 * El servidor comprueba el hecho — que hoy no se haya cobrado, que el
 * teléfono esté guardado. Si dependiera de lo que dice el cliente, la meta
 * sería un botón de regalarse mancuernas.
 */
export async function cobrarMeta(sb: ShakeClient, clave: string): Promise<ResultadoMeta> {
  return rpc<ResultadoMeta>(sb, 'fn_meta_automatica', { p_clave: clave })
}

export async function enviarEvidencia(
  sb: ShakeClient,
  clave: string,
  url: string,
  nota?: string,
): Promise<{ enviada: boolean; mancuernas: number }> {
  return rpc(sb, 'fn_meta_enviar_evidencia', {
    p_clave: clave,
    p_url: url,
    p_nota: nota ?? null,
  })
}

export interface MetaPorRevisar {
  id: string
  cliente: string
  codigo: string | null
  foto: string | null
  meta: string
  mancuernas: number
  evidencia: string | null
  nota: string | null
  fecha: string
}

export async function metasPorRevisar(sb: ShakeClient): Promise<MetaPorRevisar[]> {
  return rpc<MetaPorRevisar[]>(sb, 'fn_metas_por_revisar', {})
}

export async function revisarMeta(
  sb: ShakeClient,
  id: string,
  aprobar: boolean,
  motivo?: string,
): Promise<{ aprobada: boolean; mancuernas: number }> {
  return rpc(sb, 'fn_meta_revisar', { p_id: id, p_aprobar: aprobar, p_motivo: motivo ?? null })
}

export async function guardarMiFoto(sb: ShakeClient, url: string | null): Promise<void> {
  await rpc(sb, 'fn_guardar_mi_foto', { p_url: url })
}

/**
 * Sube una imagen al almacenamiento y devuelve su URL pública.
 *
 * La carpeta es el id del usuario porque las políticas del bucket exigen
 * eso: sin ese prefijo, cualquiera con sesión podría sobrescribir la foto
 * de otro.
 */
export async function subirImagen(
  sb: ShakeClient,
  bucket: 'avatares' | 'evidencias',
  archivo: File,
): Promise<string> {
  const { data: sesion } = await sb.auth.getUser()
  const uid = sesion.user?.id
  if (!uid) throw new Error('Primero entra a tu cuenta')

  const extension = (archivo.name.split('.').pop() || 'jpg').toLowerCase().slice(0, 5)
  // El nombre lleva la hora: si se reusara el mismo, el CDN seguiría
  // sirviendo la imagen vieja y parecería que la subida no funcionó.
  const ruta = `${uid}/${Date.now()}.${extension}`

  const { error } = await sb.storage.from(bucket).upload(ruta, archivo, {
    cacheControl: '3600',
    upsert: false,
    contentType: archivo.type || 'image/jpeg',
  })
  if (error) throw error

  return sb.storage.from(bucket).getPublicUrl(ruta).data.publicUrl
}

// ──────────────────────────── Canje en la caja ────────────────────────────

export interface RewardsCaja {
  existe: boolean
  nombre?: string
  codigo?: string | null
  foto?: string | null
  tasa?: number
  ganadas?: number
  compradas?: number
  total?: number
  vale_pesos?: number
  sellos?: {
    tipo: 'bebida' | 'alimento'
    tiene: number
    requeridos: number
    listo: boolean
    /** Ids de los productos que pueden ir gratis con esta tarjeta. */
    premios: string[]
  }[]
}

/** Todo lo que la caja necesita de un cliente para cobrarle, en un viaje. */
export async function rewardsParaCaja(sb: ShakeClient, clienteId: string): Promise<RewardsCaja> {
  return rpc<RewardsCaja>(sb, 'fn_rewards_para_caja', { p_cliente_id: clienteId })
}

export interface CanjeMancuernas {
  usadas: number
  de_ganadas: number
  de_compradas: number
  descuento_pesos: number
  total_a_pagar: number
  saldo_restante: number
}

/**
 * Usa mancuernas en una orden ya creada.
 *
 * Baja `ordenes.total`, así que hay que cobrar con el total que devuelve —
 * no con el que traía la orden al crearse. El servidor recorta solo a lo
 * que cuesta la orden: el monedero no da cambio.
 */
export async function canjearMancuernas(
  sb: ShakeClient,
  ordenId: string,
  mancuernas: number,
): Promise<CanjeMancuernas> {
  return rpc<CanjeMancuernas>(sb, 'fn_canjear_mancuernas', {
    p_orden_id: ordenId,
    p_mancuernas: mancuernas,
  })
}

export interface CanjeSellos {
  premio: string
  valor: number
  sellos_usados: number
  total_a_pagar: number
  sellos_restantes: number
}

/**
 * Cobra la tarjeta 13+1: un producto que YA está en la orden pasa a $0.
 *
 * El renglón se queda para que la comanda y el inventario sigan bien —
 * el cliente se lleva el producto igual, solo que no se cobra.
 */
export async function canjearSellos(
  sb: ShakeClient,
  ordenId: string,
  tipo: 'bebida' | 'alimento',
  productoId: string,
): Promise<CanjeSellos> {
  return rpc<CanjeSellos>(sb, 'fn_canjear_sellos', {
    p_orden_id: ordenId,
    p_tipo: tipo,
    p_producto_id: productoId,
  })
}

// ─────────────────────────── Rewards en Admin ─────────────────────────────

export interface RewardsAdmin {
  tasa: number
  /** Lo que se debe en producto. Las compradas son pasivo; las ganadas, promoción. */
  en_la_calle: {
    compradas: number
    compradas_pesos: number
    ganadas: number
    ganadas_pesos: number
    clientes_con_saldo: number
  }
  sellos: { bebida_listas: number; alimento_listas: number; con_sellos: number }
  tarjetas: {
    lote: string
    mancuernas: number
    total: number
    nuevas: number
    canjeadas: number
    anuladas: number
    pendiente_pesos: number
  }[]
  ultimos_movimientos: {
    cliente: string
    mancuernas: number
    tipo: string
    descripcion: string | null
    cuando: string
  }[]
}

export async function rewardsAdmin(sb: ShakeClient): Promise<RewardsAdmin> {
  return rpc<RewardsAdmin>(sb, 'fn_rewards_admin', {})
}

export interface TarjetaGenerada {
  codigo: string
  mancuernas: number
  lote: string | null
  estado: string
}

/**
 * Genera un lote de tarjetas de regalo. Solo gerencia.
 *
 * Los códigos no son secuenciales a propósito: con lotes numerados, quien
 * compra una tarjeta podría adivinar las de al lado.
 */
export async function generarTarjetas(
  sb: ShakeClient,
  cantidad: number,
  mancuernas: number,
  lote: string,
): Promise<TarjetaGenerada[]> {
  const { data, error } = await sb.rpc('fn_generar_tarjetas' as never, {
    p_cantidad: cantidad,
    p_mancuernas: mancuernas,
    p_lote: lote || null,
  } as never)
  if (error) throw error
  return (data ?? []) as TarjetaGenerada[]
}
