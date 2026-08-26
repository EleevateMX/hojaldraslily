import { create } from 'zustand'
import { descuentoPromo as calcDescuentoPromo } from '@shake/supabase'
import type { ProductoVenta, ClienteConLealtad } from '@shake/supabase'
import type { Empleado } from '@shake/supabase'
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
  empleado: Empleado | null
  iniciarSesion: (empleado: Empleado) => void
  cerrarSesion: () => void

  // --- Contexto de caja (bootstrap real: almacén kiosko + caja + corte) ---
  almacen: Almacen | null
  caja: Caja | null
  corte: CajaCorte | null
  setContexto: (ctx: { almacen: Almacen; caja: Caja; corte: CajaCorte | null }) => void
  setCorte: (corte: CajaCorte | null) => void

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
    set({
      items: [],
      cliente: null,
      cupon: null,
      promo: null,
      promosDisp: [],
      descuentoManual: null,
    }),

  subtotal: () => get().items.reduce((s, l) => s + l.producto.precio * l.cantidad, 0),

  // Ítems elegibles para un cupón: cumpleaños solo shakes; otros cualquiera.
  itemsElegiblesCupon: (cup) => {
    const items = get().items
    if (cup.tipo === 'cumpleanos') {
      return items.filter((l) => l.producto.categorias?.nombre === 'Shakes')
    }
    return items
  },

  // El cupón cubre (gratis) el ítem elegible más caro, 1 unidad.
  descuentoCupon: () => {
    const { cupon } = get()
    if (!cupon) return 0
    const eleg = get().itemsElegiblesCupon(cupon)
    if (eleg.length === 0) return 0
    return Math.max(...eleg.map((l) => l.producto.precio))
  },

  descuentoPromoMonto: () => {
    const { promo, items } = get()
    if (!promo) return 0
    // items expandidos por unidad (precio + categoría) para calcular la promo.
    const planos = items.flatMap((l) =>
      Array.from({ length: l.cantidad }, () => ({
        precio: l.producto.precio,
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
