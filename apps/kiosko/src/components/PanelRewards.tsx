import { useEffect, useState } from 'react'
import { rewardsParaCaja, type RewardsCaja } from '@shake/supabase'
import { mxn } from '@shake/utils'
import { sb } from '@/lib/sb'
import type { ItemCarrito } from '@/store/carritoStore'

/**
 * El canje, en la caja.
 *
 * Aparece solo si el cliente identificado trae algo que usar; si no, la
 * pantalla de cobro se queda igual de simple que siempre. Nada aquí cobra
 * ni descuenta: solo recoge la decisión del cajero. El descuento lo aplica
 * el servidor sobre la orden ya creada, que es lo único que la caja puede
 * verificar contra el total.
 */

export interface DecisionRewards {
  /** Cuántas mancuernas usar. 0 = ninguna. */
  mancuernas: number
  /** El producto del carrito que va gratis con la tarjeta de sellos. */
  sello: { tipo: 'bebida' | 'alimento'; productoId: string; nombre: string } | null
}

export const SIN_REWARDS: DecisionRewards = { mancuernas: 0, sello: null }

export function PanelRewards({
  clienteId, items, total, decision, onCambiar,
}: {
  clienteId: string
  items: ItemCarrito[]
  total: number
  decision: DecisionRewards
  onCambiar: (d: DecisionRewards) => void
}) {
  const [datos, setDatos] = useState<RewardsCaja | null>(null)

  useEffect(() => {
    let vivo = true
    rewardsParaCaja(sb, clienteId)
      .then((r) => { if (vivo) setDatos(r) })
      // Que falle esto no puede impedir cobrar: se cobra sin canje.
      .catch(() => { if (vivo) setDatos(null) })
    return () => { vivo = false }
  }, [clienteId])

  if (!datos?.existe) return null

  const tasa = datos.tasa ?? 10
  const disponible = datos.total ?? 0
  // El monedero no da cambio: nunca más de lo que cuesta la orden. Se
  // calcula sobre el total YA con el premio de sellos descontado, porque
  // así es como lo va a recortar el servidor.
  const yaGratis = decision.sello
    ? items.find((i) => i.producto_id === decision.sello!.productoId)?.precio ?? 0
    : 0
  const totalTrasSello = Math.max(0, total - yaGratis)
  const tope = Math.min(disponible, Math.floor(totalTrasSello * tasa))

  const tarjetaLista = (datos.sellos ?? []).filter((s) => s.listo)
  const hayAlgo = tope > 0 || tarjetaLista.length > 0
  if (!hayAlgo) return null

  return (
    <section className="rounded-sa-lg border-2 border-sa-banana bg-sa-banana/10 p-4 mb-4">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <p className="font-display text-lg text-sa-green-ink leading-none">
          Rewards de {datos.nombre?.split(' ')[0]}
        </p>
        <span className="font-mono text-[11px] text-sa-green-ink/55">{datos.codigo}</span>
      </div>

      {/* ── Tarjeta de sellos ───────────────────────────────────────── */}
      {tarjetaLista.map((s) => {
        // El premio tiene que estar YA en el carrito: el servidor pone ese
        // renglón en $0 para que la comanda y el inventario sigan bien.
        const elegibles = items.filter(
          (i) => s.premios.includes(i.producto_id) && i.precio > 0,
        )
        const etiqueta = s.tipo === 'bebida' ? 'bebidas' : 'comida'

        return (
          <div key={s.tipo} className="mb-3">
            <p className="text-sm text-sa-green-ink/80 mb-1.5">
              <b>Tarjeta de {etiqueta} llena</b> ({s.tiene}/{s.requeridos}) — una va por cuenta de la casa.
            </p>

            {elegibles.length === 0 ? (
              <p className="text-[13px] text-sa-green-ink/55 leading-snug">
                Nada en el carrito califica todavía. Agrega la {etiqueta} que se lleva gratis
                y aparece aquí.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {elegibles.map((i) => {
                  const puesto = decision.sello?.productoId === i.producto_id
                  return (
                    <button
                      key={i.linea}
                      onClick={() =>
                        onCambiar({
                          ...decision,
                          sello: puesto
                            ? null
                            : { tipo: s.tipo, productoId: i.producto_id, nombre: i.nombre },
                        })
                      }
                      className={`rounded-sa px-3 py-2 text-sm border-2 transition-colors ${
                        puesto
                          ? 'bg-sa-green text-sa-cream border-sa-green'
                          : 'bg-white text-sa-green-ink border-sa-green-ink/15'
                      }`}
                    >
                      {puesto ? '✓ ' : ''}{i.nombre} · {mxn(i.precio)}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {/* ── Mancuernas ──────────────────────────────────────────────── */}
      {tope > 0 && (
        <div>
          <p className="text-sm text-sa-green-ink/80">
            Tiene <b>{disponible.toLocaleString('es-MX')} mancuernas</b> ({mxn(datos.vale_pesos ?? 0)}).
            {tope < disponible && <> Para esta orden alcanzan {tope.toLocaleString('es-MX')}.</>}
          </p>

          <div className="flex flex-wrap gap-2 mt-2">
            <BotonMonto
              activo={decision.mancuernas === 0}
              onClick={() => onCambiar({ ...decision, mancuernas: 0 })}
            >
              No usar
            </BotonMonto>
            {[0.25, 0.5].map((f) => {
              const n = Math.floor(tope * f)
              if (n <= 0) return null
              return (
                <BotonMonto
                  key={f}
                  activo={decision.mancuernas === n}
                  onClick={() => onCambiar({ ...decision, mancuernas: n })}
                >
                  {mxn(n / tasa)}
                </BotonMonto>
              )
            })}
            <BotonMonto
              activo={decision.mancuernas === tope}
              onClick={() => onCambiar({ ...decision, mancuernas: tope })}
            >
              Todo · {mxn(tope / tasa)}
            </BotonMonto>
          </div>

          {decision.mancuernas > 0 && (
            <p className="font-mono text-xs text-sa-green-ink/70 mt-2">
              {decision.mancuernas.toLocaleString('es-MX')} mancuernas ·
              queda por pagar <b>{mxn(Math.max(0, totalTrasSello - decision.mancuernas / tasa))}</b>
            </p>
          )}
        </div>
      )}
    </section>
  )
}

function BotonMonto({
  activo, onClick, children,
}: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-sa px-3 py-2 text-sm border-2 transition-colors ${
        activo
          ? 'bg-sa-green text-sa-cream border-sa-green'
          : 'bg-white text-sa-green-ink border-sa-green-ink/15'
      }`}
    >
      {children}
    </button>
  )
}
