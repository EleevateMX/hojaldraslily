import React, { useMemo, useState } from 'react'
import { usePosStore } from '@/store/posStore'
import { mxn } from '@shake/utils'
import type { ProductoVenta } from '@shake/supabase'

interface Props {
  productos: ProductoVenta[]
}

/**
 * Sugerencia de venta cruzada para el cajero: si el ticket lleva hojaldras
 * pero nada de tomar, propone un café; si lleva café y nada más, propone
 * hojaldras. Solo sugiere sobre lo que hay en el catálogo activo — nunca
 * inventa productos ni precios — y se puede descartar en el turno.
 *
 * Las categorías se agrupan por ESTACIÓN y no por nombre: la de bebidas se
 * llama «Café» y «Bebidas», y la de alimentos «Menú del día», «Por encargo»
 * y «Temporada». Buscar por nombre exacto (como hacía la versión de shakes)
 * dejaba de sugerir en cuanto alguien renombraba un menú.
 */
export function SugerenciaVenta({ productos }: Props) {
  const items = usePosStore((s) => s.items)
  const agregarItem = usePosStore((s) => s.agregarItem)
  const [descartada, setDescartada] = useState(false)

  const sugerencia = useMemo(() => {
    if (items.length === 0) return null

    const estaciones = new Set(
      items
        .map((l) => l.producto.categorias?.cocinas?.slug)
        .filter((c): c is string => Boolean(c)),
    )
    const llevaBebida = estaciones.has('bebidas')
    const llevaComida = estaciones.has('alimentos')

    // Ya lleva de ambos, o no lleva de ninguno: no hay nada que sugerir.
    if (llevaBebida === llevaComida) return null

    const objetivo = llevaComida ? 'bebidas' : 'alimentos'
    const candidatos = productos.filter((p) => p.categorias?.cocinas?.slug === objetivo)
    if (candidatos.length === 0) return null

    return {
      titulo: llevaComida ? '¿Le ofreces un café?' : '¿Le ofreces unas hojaldras?',
      opciones: candidatos.slice(0, 3),
    }
  }, [items, productos])

  if (!sugerencia || descartada) return null

  return (
    <div className="mx-3 mb-2 rounded-sa bg-sa-banana/25 border border-sa-banana/50 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="font-mono text-[11px] uppercase tracking-wide text-sa-green-ink/70">
          💡 {sugerencia.titulo}
        </p>
        <button
          onClick={() => setDescartada(true)}
          className="text-sa-green-ink/40 hover:text-sa-green-ink text-xs flex-shrink-0"
          aria-label="Descartar sugerencia"
        >
          ✕
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {sugerencia.opciones.map((p) => (
          <button
            key={p.id}
            onClick={() => agregarItem(p)}
            className="px-2.5 py-1 rounded-full bg-white border border-sa-green-ink/10 text-sa-green-ink text-xs hover:bg-sa-cream-warm transition-colors"
          >
            + {p.nombre} · {mxn(p.precio)}
          </button>
        ))}
      </div>
    </div>
  )
}
