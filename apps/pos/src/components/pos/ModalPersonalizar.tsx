import React, { useState } from 'react'
import { mxn } from '@shake/utils'
import type { ProductoVenta, ExtraDeProducto } from '@shake/supabase'
import { nombreParaOrdenar } from '@shake/supabase'

interface Props {
  producto: ProductoVenta | null
  extras: ExtraDeProducto[]
  onCerrar: () => void
  /** Agrega el producto y, aparte, cada extra elegido. */
  onAgregar: (nota: string | null, extrasElegidos: ExtraDeProducto[]) => void
}

/**
 * Al tocar un alimento en el catálogo: elegir extras de su receta
 * (guacamole, aderezos…) para agregarlos al ticket.
 * Los extras se agregan como líneas propias del ticket: así cuestan,
 * cobran y descuentan inventario igual que cualquier producto, y la cocina
 * los ve listados en la comanda.
 */
export function ModalPersonalizar({ producto, extras, onCerrar, onAgregar }: Props) {
  const [elegidos, setElegidos] = useState<Record<string, number>>({})

  if (!producto) return null

  const totalExtras = extras.reduce((s, e) => s + e.precio * (elegidos[e.extra_id] ?? 0), 0)
  const total = producto.precio + totalExtras

  function cambiar(extraId: string, delta: number) {
    setElegidos((prev) => {
      const n = Math.max(0, (prev[extraId] ?? 0) + delta)
      const next = { ...prev }
      if (n === 0) delete next[extraId]
      else next[extraId] = n
      return next
    })
  }

  function confirmar() {
    const elegidosExpandidos = extras.flatMap((e) =>
      Array.from({ length: elegidos[e.extra_id] ?? 0 }, () => e),
    )
    onAgregar(null, elegidosExpandidos)
    setElegidos({})
  }

  function cerrar() {
    setElegidos({})
    onCerrar()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-sa-green-deep/60" onClick={cerrar} />
      <div className="relative bg-sa-cream-soft rounded-sa-lg shadow-sa w-full max-w-md max-h-[85vh] flex flex-col">
        <div className="px-5 py-4 border-b border-sa-green-ink/10">
          <h3 className="font-display text-2xl text-sa-green-ink leading-tight">{nombreParaOrdenar(producto.nombre)}</h3>
          <p className="font-mono text-xs text-sa-green-ink/50 mt-0.5">{mxn(producto.precio)}</p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {extras.length > 0 && (
            <div>
              <p className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/60 mb-2">
                Extras
              </p>
              <div className="space-y-2">
                {extras.map((e) => {
                  const n = elegidos[e.extra_id] ?? 0
                  return (
                    <div
                      key={e.extra_id}
                      className={`flex items-center gap-3 rounded-sa px-3 py-2.5 border transition-colors ${
                        n > 0
                          ? 'bg-sa-green/10 border-sa-green/30'
                          : 'bg-white border-sa-green-ink/10'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-sa-green-ink truncate">{e.nombre}</p>
                        <p className="font-mono text-xs text-sa-green-ink/50">+{mxn(e.precio)}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => cambiar(e.extra_id, -1)}
                          disabled={n === 0}
                          className="w-8 h-8 rounded-full bg-sa-cream-warm disabled:opacity-30 text-sa-green-ink font-mono"
                        >
                          −
                        </button>
                        <span className="font-mono text-sm w-5 text-center text-sa-green-ink">{n}</span>
                        <button
                          onClick={() => cambiar(e.extra_id, 1)}
                          className="w-8 h-8 rounded-full bg-sa-green text-sa-cream font-mono hover:bg-sa-green-deep"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

        </div>

        <div className="px-5 py-4 border-t border-sa-green-ink/10 flex gap-2 items-center">
          <button
            onClick={cerrar}
            className="px-4 py-2.5 border border-sa-green-ink/15 bg-white text-sa-green-ink/70 rounded-full font-mono text-xs uppercase tracking-wide hover:bg-sa-cream-warm"
          >
            Cancelar
          </button>
          <button
            onClick={confirmar}
            className="flex-1 bg-sa-green text-sa-cream py-2.5 rounded-full font-mono text-xs uppercase tracking-wide hover:bg-sa-green-deep"
          >
            Agregar {mxn(total)}
          </button>
        </div>
      </div>
    </div>
  )
}
