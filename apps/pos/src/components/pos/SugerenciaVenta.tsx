import React, { useMemo, useState } from 'react'
import { usePosStore } from '@/store/posStore'
import { mxn } from '@shake/utils'
import type { ProductoVenta } from '@shake/supabase'

interface Props {
  productos: ProductoVenta[]
}

/**
 * Sugerencia de venta cruzada para el cajero: si el ticket lleva shake
 * pero no comida, propone comida; si lleva comida pero no bebida, propone
 * un shake. Solo sugiere sobre lo que hay en el catálogo activo — nunca
 * inventa productos ni precios — y se puede descartar en el turno.
 */
export function SugerenciaVenta({ productos }: Props) {
  const items = usePosStore((s) => s.items)
  const agregarItem = usePosStore((s) => s.agregarItem)
  const [descartada, setDescartada] = useState(false)

  const sugerencia = useMemo(() => {
    if (items.length === 0) return null

    const cats = new Set(
      items.map((l) => l.producto.categorias?.nombre).filter((c): c is string => Boolean(c)),
    )
    const llevaBebida = cats.has('Shakes') || cats.has('Bebidas')
    const llevaComida = cats.has('Alimentos')

    // Ya lleva de ambos: no hay nada que sugerir.
    if (llevaBebida === llevaComida) return null

    const objetivo = llevaComida ? 'Shakes' : 'Alimentos'
    const candidatos = productos.filter((p) => p.categorias?.nombre === objetivo)
    if (candidatos.length === 0) return null

    return {
      titulo: llevaComida ? '¿Le ofreces un shake?' : '¿Le ofreces algo de comer?',
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
