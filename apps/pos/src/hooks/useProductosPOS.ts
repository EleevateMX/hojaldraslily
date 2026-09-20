import { useEffect, useMemo, useState } from 'react'
import { sb } from '../lib/sb'
import {
  listarProductosParaVenta, listarProductosExtra, listarExtras, listarPreciosDeCanal,
  seVendeEnCanal,
} from '@lily/supabase'
import type { ProductoVenta, ExtraDeProducto } from '@lily/supabase'
import { mensajeDeError } from '@lily/utils'
import { usePosStore } from '../store/posStore'

/** Categoría derivada del catálogo (con su cocina/estación) para los filtros. */
export interface CategoriaPOS {
  id: string
  nombre: string
  orden: number
  cocinas: { id: string; nombre: string; slug: string } | null
}

export function useProductosPOS() {
  const [todos, setTodos] = useState<ProductoVenta[]>([])
  const [productosExtra, setProductosExtra] = useState<ProductoVenta[]>([])
  const [extras, setExtras] = useState<ExtraDeProducto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const setPreciosCanal = usePosStore((s) => s.setPreciosCanal)
  const canal = usePosStore((s) => s.canal)
  const preciosCanal = usePosStore((s) => s.preciosCanal)

  useEffect(() => {
    // La lista de precios por canal viaja con el catalogo: la caja tiene que
    // poder MOSTRAR el precio de Rappi desde que se arma el ticket, no solo
    // al cobrar. Si la pantalla dijera $160 y el servidor calculara $190, el
    // cobro se rechazaria por no cuadrar el importe.
    Promise.all([
      listarProductosParaVenta(sb),
      listarProductosExtra(sb),
      listarExtras(sb),
      listarPreciosDeCanal(sb),
    ])
      .then(([prods, prodsExtra, exs, precios]) => {
        setTodos(prods)
        setProductosExtra(prodsExtra)
        setExtras(exs)
        setPreciosCanal(precios)
      })
      .catch((e) => setError(mensajeDeError(e)))
      .finally(() => setLoading(false))
  }, [setPreciosCanal])

  // Lo que la hoja de precios marca con "X" no se vende en la plataforma, así
  // que en modo Rappi ni se muestra. Si se mostrara, la cajera lo agregaría al
  // ticket y se enteraría hasta el final, cuando `fn_crear_orden` lo rechace:
  // con el repartidor esperando y el pedido ya armado.
  const productos = useMemo(
    () => todos.filter((p) => seVendeEnCanal(p, canal, preciosCanal)),
    [todos, canal, preciosCanal],
  )

  // Las categorías se derivan del propio catálogo (no hay query aparte).
  const categorias = useMemo<CategoriaPOS[]>(() => {
    const map = new Map<string, CategoriaPOS>()
    for (const p of productos) {
      if (p.categorias) map.set(p.categorias.id, p.categorias)
    }
    return [...map.values()].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre))
  }, [productos])

  return { productos, productosExtra, extras, categorias, loading, error }
}
