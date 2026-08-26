import React, { useEffect, useState } from 'react'
import { historialPedidos, nombreParaOrdenar, type PedidoHistorial } from '@shake/supabase'
import { mensajeDeError } from '@shake/utils'
import { sb } from '@/lib/sb'

interface Props {
  abierto: boolean
  onCerrar: () => void
}

/**
 * Los últimos 5 pedidos pagados, con quién los pidió y qué lleva cada uno.
 *
 * Vive detrás de un botón en la confirmación porque su momento es justo
 * después de vender: "¿este de quién era?", "¿qué llevaba el de Rosa?" —
 * preguntas que hoy obligaban a ir a buscar la comanda o el POS.
 */
export function HistorialPedidos({ abierto, onCerrar }: Props) {
  const [pedidos, setPedidos] = useState<PedidoHistorial[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto) return
    setPedidos(null)
    setError(null)
    historialPedidos(sb, 5)
      .then(setPedidos)
      .catch((e) => setError(mensajeDeError(e)))
  }, [abierto])

  if (!abierto) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={onCerrar}>
      <div
        className="bg-sa-cream-paper rounded-3xl shadow-2xl w-[520px] max-w-full max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-sa-green-deep text-sa-cream rounded-t-3xl px-6 py-5 flex items-center justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-sa-cream/50">Últimos 5</p>
            <h2 className="font-display text-2xl leading-tight">Historial de pedidos</h2>
          </div>
          <button
            onClick={onCerrar}
            className="w-11 h-11 rounded-full border border-sa-cream/25 text-sa-cream/80 hover:bg-sa-cream/10 text-xl"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto sin-barra p-5 space-y-3">
          {error && (
            <p className="font-mono text-sm text-sa-strawberry bg-sa-strawberry/10 border border-sa-strawberry/30 rounded-sa px-4 py-3">
              {error}
            </p>
          )}
          {!error && pedidos === null && (
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-sa-green-ink/50 text-center py-8">
              Consultando…
            </p>
          )}
          {pedidos !== null && pedidos.length === 0 && (
            <p className="font-body text-sa-green-ink/60 text-center py-8">
              Todavía no hay pedidos pagados.
            </p>
          )}
          {(pedidos ?? []).map((p, i) => (
            <article
              key={p.folio}
              className={`rounded-sa-lg border p-4 ${
                i === 0
                  ? 'bg-sa-green-deep text-sa-cream border-transparent'
                  : 'bg-white text-sa-green-ink border-sa-green-ink/10'
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-display text-xl leading-tight">
                  #{p.folio} · {p.nombre ?? 'Sin nombre'}
                  {i === 0 && (
                    <span className="ml-2 font-mono text-[9px] uppercase tracking-widest bg-sa-banana text-sa-green-ink px-2 py-0.5 rounded-full align-middle">
                      Último
                    </span>
                  )}
                </p>
                <p className={`font-mono text-xs ${i === 0 ? 'text-sa-cream/60' : 'text-sa-green-ink/50'}`}>
                  {p.hora} · ${Number(p.total).toFixed(0)}
                </p>
              </div>
              <ul className={`mt-2 space-y-1 text-sm font-body ${i === 0 ? 'text-sa-cream/85' : 'text-sa-green-ink/80'}`}>
                {p.items.map((it, j) => (
                  <li key={j}>
                    <span className="font-medium">
                      {it.cantidad > 1 ? `${it.cantidad}× ` : ''}{nombreParaOrdenar(it.nombre)}
                    </span>
                    {it.personalizacion && <span className="opacity-70"> — {it.personalizacion}</span>}
                    {it.extras.length > 0 && (
                      <span className="opacity-70">
                        {' '}(+ {it.extras.map((e) => nombreParaOrdenar(e.nombre)).join(', ')})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}
