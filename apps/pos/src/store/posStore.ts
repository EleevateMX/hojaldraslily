import { create } from 'zustand'
import { descuentoPromo as calcDescuentoPromo, precioEnCanal } from '@shake/supabase'
import type { ProductoVenta, ClienteConLealtad, CanalDeVenta, PreciosDeCanal } from '@shake/supabase'
// Lo que el login guarda de verdad es un EmpleadoSesion (id, nombre, ROL y
// sucursal), no la fila cruda de `empleados`. Estaba tipado como `Empleado`
// —que trae `rol_id`, no `rol`— y por eso quien necesitaba el puesto tenia
// que castear. Se tipa lo que en realidad hay.
import type { EmpleadoSesion } from '@shake/supabase'
import type { Almacen, Caja, CajaCorte, Cupon, Promocion } from '@shake/types'

/**
 * Línea del ticket: producto real del catálogo + cantidad.
 * `lineaId` da identidad propia a la línea porque el mismo producto puede
 * ir dos veces en la orden con personalización distinta (un wrap "sin
 * lechuga" y otro normal son líneas separadas, no una de cantidad 2).
 */
export interface LineaCarrito {
  lineaId: string
  producto: ProductoVenta
  cantidad: number
  personalizacion: string | null
}

function nuevaLineaId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `l-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** Descuento manual (autorización de caja) — se suma al `descuento` de la orden. */
export interface DescuentoManual {
  tipo: 'porcentaje' | 'monto'
  valor: number
}

interface PosStore {
  // --- Sesión del cajero ---
  empleado: EmpleadoSesion | null
  iniciarSesion: (empleado: EmpleadoSesion) => void
  cerrarSesion: () => void

  // --- Contexto de caja (bootstrap real: almacén kiosko + caja + corte) ---
  almacen: Almacen | null
  caja: Caja | null
  corte: CajaCorte | null
  setContexto: (ctx: { almacen: Almacen; caja: Caja; corte: CajaCorte | null }) => void
  setCorte: (corte: CajaCorte | null) => void

  /**
   * Canal de venta del ticket. Rappi cobra otra lista de precios: la
   * plataforma se lleva su comisión, así que la pieza de $160 sale en $190.
   *
   * Vive en el store y no en la pantalla de cobro porque el precio tiene que
   * verse desde que se arma el ticket. Y sobre todo: `fn_cobrar_orden` valida
   * el importe contra el total que calcula el servidor, así que si la
   * pantalla mostrara el precio de mostrador y el servidor el de Rappi, el
   * cobro se rechazaría.
   */
  canal: CanalDeVenta
  preciosCanal: PreciosDeCanal
  setCanal: (canal: CanalDeVenta) => void
  setPreciosCanal: (precios: PreciosDeCanal) => void
  /** Lo que cuesta ese producto en el canal activo. */
  precioDe: (p: ProductoVenta) => number

  // --- Orden activa ---
  items: LineaCarrito[]
  cliente: ClienteConLealtad | null
  cupon: Cupon | null
  promo: Promocion | null
  promosDisp: Promocion[]
  descuentoManual: DescuentoManual | null

  agregarItem: (p: ProductoVenta, personalizacion?: string | null) => void
  incrementar: (lineaId: string) => void
  decrementar: (lineaId: string) => void
  quitarItem: (lineaId: string) => void
  setCliente: (cliente: ClienteConLealtad | null) => void
  setCupon: (cupon: Cupon | null) => void
  setPromo: (promo: Promocion | null) => void
  setPromosDisp: (promos: Promocion[]) => void
  setDescuentoManual: (d: DescuentoManual | null) => void
  limpiarOrden: () => void

  // --- Cálculos (reglas de negocio reales) ---
  subtotal: () => number
  itemsElegiblesCupon: (cup: Cupon) => LineaCarrito[]
  descuentoCupon: () => number
  descuentoPromoMonto: () => number
  descuentoManualMonto: () => number
  descuentoTotal: () => number
  neto: () => number
  totalItems: () => number
}

export const usePosStore = create<PosStore>((set, get) => ({
  empleado: null,

  iniciarSesion: (empleado) => set({ empleado }),

  cerrarSesion: () =>
    set({
      empleado: null,
      almacen: null,
      caja: null,
      corte: null,
      items: [],
      cliente: null,
      cupon: null,
      promo: null,
      promosDisp: [],
      descuentoManual: null,
    }),

  almacen: null,
  caja: null,
  corte: null,

  setContexto: ({ almacen, caja, corte }) => set({ almacen, caja, corte }),
  setCorte: (corte) => set({ corte }),

  items: [],
  cliente: null,
  cupon: null,
  promo: null,
  promosDisp: [],
  descuentoManual: null,

  agregarItem: (p, personalizacion = null) =>
    set((state) => {
      const nota = personalizacion?.trim() || null
      // Solo se agrupa con una línea existente del mismo producto si ambas
      // van sin personalización; con nota distinta va como línea aparte.
      const i = state.items.findIndex(
        (l) => l.producto.id === p.id && !l.personalizacion && !nota,
      )
      if (i >= 0) {
        const items = [...state.items]
        items[i] = { ...items[i], cantidad: items[i].cantidad + 1 }
        return { items }
      }
      return {
        items: [
          ...state.items,
          { lineaId: nuevaLineaId(), producto: p, cantidad: 1, personalizacion: nota },
        ],
      }
    }),

  incrementar: (lineaId) =>
    set((state) => ({
      items: state.items.map((l) =>
        l.lineaId === lineaId ? { ...l, cantidad: l.cantidad + 1 } : l,
      ),
    })),

  decrementar: (lineaId) =>
    set((state) => ({
      items: state.items
        .map((l) => (l.lineaId === lineaId ? { ...l, cantidad: l.cantidad - 1 } : l))
        .filter((l) => l.cantidad > 0),
    })),

  quitarItem: (lineaId) =>
    set((state) => ({ items: state.items.filter((l) => l.lineaId !== lineaId) })),

  setCliente: (cliente) => set({ cliente }),
  setCupon: (cupon) => set({ cupon }),
  setPromo: (promo) => set({ promo }),
  setPromosDisp: (promosDisp) => set({ promosDisp }),
  setDescuentoManual: (descuentoManual) => set({ descuentoManual }),

  limpiarOrden: () =>
    // El canal vuelve a mostrador a proposito: dejarlo en Rappi despues de
    // cobrar le cobraria el precio de plataforma al siguiente cliente que
    // llegue al mostrador.
    set({
      canal: 'pos',
      items: [],
      cliente: null,
      cupon: null,
      promo: null,
      promosDisp: [],
      descuentoManual: null,
    }),

  canal: 'pos',
  preciosCanal: {},
  setCanal: (canal) => set({ canal }),
  setPreciosCanal: (preciosCanal) => set({ preciosCanal }),
  precioDe: (p) => precioEnCanal(p, get().canal, get().preciosCanal),

  subtotal: () => {
    const { items, canal, preciosCanal } = get()
    return items.reduce((s, l) => s + precioEnCanal(l.producto, canal, preciosCanal) * l.cantidad, 0)
  },

  // Ítems elegibles para un cupón: el de cumpleaños se limita a lo que hace
  // la casa (lo que va a la estación de alimentos); los demás, a cualquier
  // cosa del ticket.
  //
  // Antes esto pedía la categoría llamada exactamente 'Shakes'. En una
  // panadería esa categoría no existe, así que la lista salía vacía y el
  // cupón de cumpleaños regalaba $0: se podía canjear y no descontaba nada,
  // sin ningún aviso. Se compara por ESTACIÓN, que no cambia aunque a los
  // menús les cambien el nombre.
  itemsElegiblesCupon: (cup) => {
    const items = get().items
    if (cup.tipo === 'cumpleanos') {
      return items.filter((l) => l.producto.categorias?.cocinas?.slug === 'alimentos')
    }
    return items
  },

  // El cupón cubre (gratis) el ítem elegible más caro, 1 unidad.
  descuentoCupon: () => {
    const { cupon } = get()
    if (!cupon) return 0
    const eleg = get().itemsElegiblesCupon(cupon)
    if (eleg.length === 0) return 0
    return Math.max(...eleg.map((l) => get().precioDe(l.producto)))
  },

  descuentoPromoMonto: () => {
    const { promo, items } = get()
    if (!promo) return 0
    // items expandidos por unidad (precio + categoría) para calcular la promo.
    const planos = items.flatMap((l) =>
      Array.from({ length: l.cantidad }, () => ({
        precio: get().precioDe(l.producto),
        categoria: l.producto.categorias?.nombre ?? null,
      })),
    )
    return calcDescuentoPromo(promo, planos)
  },

  descuentoManualMonto: () => {
    const { descuentoManual } = get()
    if (!descuentoManual) return 0
    const sub = get().subtotal()
    if (descuentoManual.tipo === 'porcentaje') {
      return Math.min(sub, sub * (descuentoManual.valor / 100))
    }
    return Math.min(descuentoManual.valor, sub)
  },

  // Descuento combinado: cupón + promo + descuento manual de caja.
  descuentoTotal: () =>
    get().descuentoCupon() + get().descuentoPromoMonto() + get().descuentoManualMonto(),

  neto: () => Math.max(0, get().subtotal() - get().descuentoTotal()),

  totalItems: () => get().items.reduce((s, l) => s + l.cantidad, 0),
}))
