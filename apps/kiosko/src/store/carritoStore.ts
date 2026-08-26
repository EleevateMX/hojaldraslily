import { create } from 'zustand'
import {
  displayItemAdded,
  displayItemRemoved,
  displayCartCleared,
} from '../sync'

export interface ItemCarrito {
  /**
   * Identidad de ESTA línea del carrito, no del producto.
   *
   * Antes el carrito se indexaba por `producto_id`, y dos shakes iguales con
   * leches distintas se fundían en una sola línea de cantidad 2 con la nota
   * del primero: en barra salían dos vasos con la misma leche. Con una línea
   * propia, cada configuración vive aparte.
   */
  linea: string
  producto_id: string
  nombre: string
  precio: number
  cantidad: number
  cocina_id: string
  imagen_url: string | null
  personalizacion?: string
  /** Si es un extra, la `linea` del producto al que acompaña. */
  padreLinea?: string | null
  /** Solo en extras: cuántos van por cada unidad del producto padre. */
  porUnidad?: number
}

export interface UsuarioKiosko {
  /**
   * Solo existe cuando el cliente entró con Google desde el propio kiosko.
   * Cuando lo identifica el cajero (por QR o teléfono) no hay sesión de Auth
   * de por medio, y aun así la compra le suma mancuernas: lo que necesita la
   * orden es `clienteId`, no la sesión.
   */
  authId?: string | null
  nombre: string
  email?: string | null
  clienteId: string | null
  /** Saldo en el momento de identificarlo, para mostrarlo sin volver a leer. */
  mancuernas?: number
}

/** Empleado con el turno abierto en esta pantalla (solo en modo cajero). */
export interface CajeroTurno {
  id: string
  nombre: string
  rol: string
}

interface CarritoStore {
  items: ItemCarrito[]
  usuario: UsuarioKiosko | null
  /** A nombre de quién va el pedido — lo que grita barra y lo que imprime la etiqueta. */
  nombrePedido: string
  setNombrePedido: (n: string) => void
  /**
   * Se mantiene entre pedidos a propósito: el cajero abre turno una vez y
   * levanta pedidos toda su jornada. `limpiar()` vacía el carrito y al
   * cliente, pero NO cierra el turno.
   */
  cajero: CajeroTurno | null
  /**
   * Agrega un producto suelto. Se funde con una línea existente solo si es el
   * MISMO producto con la MISMA nota y ninguno de los dos lleva extras: dos
   * configuraciones distintas nunca comparten línea.
   */
  agregar: (item: Omit<ItemCarrito, 'cantidad' | 'linea'>) => void
  /** Agrega un producto con sus extras como una sola configuración. */
  agregarConExtras: (
    producto: Omit<ItemCarrito, 'cantidad' | 'linea'>,
    extras: Array<Omit<ItemCarrito, 'cantidad' | 'linea' | 'padreLinea'> & { porUnidad: number }>,
  ) => void
  /** Quita la línea y, si es un producto con extras, también los suyos. */
  quitar: (linea: string) => void
  incrementar: (linea: string) => void
  decrementar: (linea: string) => void
  /** Los extras de una línea, para pintarlos debajo de ella. */
  extrasDe: (linea: string) => ItemCarrito[]
  limpiar: () => void
  setUsuario: (u: UsuarioKiosko | null) => void
  setCajero: (c: CajeroTurno | null) => void
  total: () => number
  totalItems: () => number
}

/** Identificador de línea. Solo vive en el navegador: la base genera el suyo. */
const nuevaLinea = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `l${Date.now()}${Math.random().toString(16).slice(2)}`

/**
 * Sube o baja una línea en `delta`, arrastrando sus extras.
 *
 * Los extras se recalculan como `porUnidad × cantidad del padre`, no se suman
 * uno a uno: pedir "otro igual" tiene que traer también sus galletas, y con
 * dos por shake la cuenta solo sale multiplicando. Si el padre llega a cero,
 * se van los dos — un extra huérfano se seguiría cobrando sin producto.
 */
function ajustar(items: ItemCarrito[], linea: string, delta: number): { items: ItemCarrito[] } {
  const padre = items.find((i) => i.linea === linea)
  if (!padre) return { items }

  const cantidad = padre.cantidad + delta
  if (cantidad <= 0) {
    return { items: items.filter((i) => i.linea !== linea && i.padreLinea !== linea) }
  }

  return {
    items: items.map((i) => {
      if (i.linea === linea) return { ...i, cantidad }
      if (i.padreLinea === linea) return { ...i, cantidad: (i.porUnidad ?? i.cantidad) * cantidad }
      return i
    }),
  }
}

export const useCarrito = create<CarritoStore>((set, get) => ({
  items: [],
  usuario: null,
  nombrePedido: '',
  setNombrePedido: (nombrePedido) => set({ nombrePedido }),
  cajero: null,

  agregar: (item) => {
    let nuevaCantidad = 1
    set((state) => {
      // Solo se funden líneas realmente idénticas. Un shake con extras nunca
      // se funde con nada: sus extras cuelgan de ESTA línea.
      const existe = state.items.find(
        (i) =>
          i.producto_id === item.producto_id &&
          (i.personalizacion ?? null) === (item.personalizacion ?? null) &&
          !i.padreLinea &&
          !state.items.some((h) => h.padreLinea === i.linea),
      )
      nuevaCantidad = existe ? existe.cantidad + 1 : 1
      return {
        items: existe
          ? state.items.map((i) => (i.linea === existe.linea ? { ...i, cantidad: i.cantidad + 1 } : i))
          : [...state.items, { ...item, linea: nuevaLinea(), cantidad: 1 }],
      }
    })
    const { total, totalItems } = get()
    displayItemAdded(
      { id: item.producto_id, nombre: item.nombre, cantidad: nuevaCantidad, precio: item.precio },
      total(),
      totalItems(),
    )
  },

  agregarConExtras: (producto, extras) => {
    const linea = nuevaLinea()
    set((state) => ({
      items: [
        ...state.items,
        { ...producto, linea, cantidad: 1 },
        ...extras.map((e) => ({
          ...e,
          linea: nuevaLinea(),
          padreLinea: linea,
          cantidad: e.porUnidad,
        })),
      ],
    }))
    const { total, totalItems } = get()
    displayItemAdded(
      { id: producto.producto_id, nombre: producto.nombre, cantidad: 1, precio: producto.precio },
      total(),
      totalItems(),
    )
  },

  quitar: (linea) => {
    set((state) => ({
      items: state.items.filter((i) => i.linea !== linea && i.padreLinea !== linea),
    }))
    const { total, totalItems } = get()
    if (totalItems() === 0) displayCartCleared()
    else displayItemRemoved(linea, total(), totalItems())
  },

  incrementar: (linea) => {
    set((state) => ajustar(state.items, linea, +1))
    const { items, total, totalItems } = get()
    const item = items.find((i) => i.linea === linea)
    if (item) {
      displayItemAdded(
        { id: item.producto_id, nombre: item.nombre, cantidad: item.cantidad, precio: item.precio },
        total(),
        totalItems(),
      )
    }
  },

  decrementar: (linea) => {
    set((state) => ajustar(state.items, linea, -1))
    const { items, total, totalItems } = get()
    const item = items.find((i) => i.linea === linea)
    if (!item) {
      if (totalItems() === 0) displayCartCleared()
      else displayItemRemoved(linea, total(), totalItems())
    } else {
      displayItemAdded(
        { id: item.producto_id, nombre: item.nombre, cantidad: item.cantidad, precio: item.precio },
        total(),
        totalItems(),
      )
    }
  },

  extrasDe: (linea) => get().items.filter((i) => i.padreLinea === linea),

  limpiar: () => {
    set({ items: [], usuario: null, nombrePedido: '' })
    displayCartCleared()
  },

  setUsuario: (usuario) => set({ usuario }),

  setCajero: (cajero) => set({ cajero }),

  total: () => get().items.reduce((sum, i) => sum + i.precio * i.cantidad, 0),

  totalItems: () => get().items.reduce((sum, i) => sum + i.cantidad, 0),
}))
