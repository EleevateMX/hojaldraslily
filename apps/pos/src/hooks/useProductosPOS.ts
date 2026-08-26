import { useEffect, useMemo, useState } from 'react'
import { sb } from '../lib/sb'
import { listarProductosParaVenta, listarProductosExtra, listarExtras } from '@shake/supabase'
import type { ProductoVenta, ExtraDeProducto } from '@shake/supabase'
import { mensajeDeError } from '@shake/utils'

/** Categoría derivada del catálogo (con su cocina/estación) para los filtros. */
export interface CategoriaPOS {
  id: string
  nombre: string
  orden: number
  cocinas: { id: string; nombre: string; slug: string } | null
}

export function useProductosPOS() {
  const [productos, setProductos] = useState<ProductoVenta[]>([])
  const [productosExtra, setProductosExtra] = useState<ProductoVenta[]>([])
  const [extras, setExtras] = useState<ExtraDeProducto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([listarProductosParaVenta(sb), listarProductosExtra(sb), listarExtras(sb)])
      .then(([prods, prodsExtra, exs]) => {
        setProductos(prods)
        setProductosExtra(prodsExtra)
        setExtras(exs)
      })
      .catch((e) => setError(mensajeDeError(e)))
      .finally(() => setLoading(false))
  }, [])

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
