import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePosStore } from '@/store/posStore'
import { sb } from '../lib/sb'
import { ventasDelTurno, cancelarVentaDelTurno, type VentaDelTurno } from '@lily/supabase'
import { mxn, mensajeDeError, horaEnMerida } from '@lily/utils'
import { ModalAutorizacion } from '@/components/pos/ModalAutorizacion'
import { imprimirComprobanteCancelacion } from '../lib/ticket'

/**
 * El «Historial de tickets» del turno.
 *
 * La casa lo pidió: a veces, con el cliente todavía en el mostrador, hay que
 * DEVOLVER una venta (una hojaldra cruda) o cambiarla. Esta pantalla lista lo
 * vendido del turno y deja cancelar una venta con PIN de gerencia. Al
 * cancelar, el inventario vuelve solo (se calcula de lo pagado) y el dinero
 * deja de contar en el corte; la devolución física es en el mostrador.
 *
 * Solo el turno actual: una devolución de otro día ya cerrado es otra
 * conversación (y toca al banco si fue tarjeta), y el servidor la rechaza.
 */
export function Historial() {
  const navigate = useNavigate()
  const { corte } = usePosStore()

  const [ventas, setVentas] = useState<VentaDelTurno[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // La venta que se está cancelando: primero se escribe el motivo, luego pide
  // el PIN de gerencia.
  const [cancelando, setCancelando] = useState<VentaDelTurno | null>(null)
  const [motivo, setMotivo] = useState('')
  const [pidiendoPin, setPidiendoPin] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(() => {
    if (!corte) return
    setCargando(true)
    ventasDelTurno(sb, corte.id)
      .then(setVentas)
      .catch((e) => setError(mensajeDeError(e)))
      .finally(() => setCargando(false))
  }, [corte])

  useEffect(() => {
    if (!corte) { navigate('/', { replace: true }); return }
    cargar()
  }, [corte, cargar, navigate])

  async function confirmarCancelacion(_nombre: string, jefeId: string) {
    const venta = cancelando
    setPidiendoPin(false)
    if (!venta) return
    setGuardando(true)
    setError(null)
    try {
      await cancelarVentaDelTurno(sb, venta.id, motivo, jefeId)
      imprimirComprobanteCancelacion(venta.folio, venta.total, motivo, _nombre)
      setCancelando(null)
      setMotivo('')
      cargar()
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="h-dvh flex flex-col bg-sa-cream-paper overflow-hidden">
      <header className="bg-sa-green-deep text-sa-cream flex-shrink-0 flex items-center gap-4 px-4 md:px-6 py-3">
        <button onClick={() => navigate('/')} className="text-sa-cream/70 hover:text-sa-cream text-2xl">←</button>
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-sa-cream/50">Historial de tickets</p>
          <p className="font-display text-xl">Ventas del turno</p>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6">
        {error && (
          <div className="bg-sa-strawberry/10 border border-sa-strawberry/30 rounded-sa px-4 py-3 mb-4 max-w-2xl mx-auto">
            <p className="font-mono text-sm text-sa-strawberry">{error}</p>
          </div>
        )}
        {cargando ? (
          <p className="font-mono text-sa-green-ink/50 text-center mt-8">Cargando…</p>
        ) : ventas.length === 0 ? (
          <p className="font-mono text-sa-green-ink/50 text-center mt-8">Todavía no hay ventas en este turno.</p>
        ) : (
          <div className="max-w-2xl mx-auto space-y-3">
            {ventas.map((v) => {
              const cancelada = v.estado === 'cancelada'
              return (
                <div
                  key={v.id}
                  className={`bg-white rounded-sa p-4 shadow-sa-sm ${cancelada ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-display text-lg text-sa-green-ink">#{v.folio}</span>
                        <span className="font-mono text-xs text-sa-green-ink/50">{horaEnMerida(v.created_at)}</span>
                        <span className="font-mono text-[10px] uppercase tracking-wide bg-sa-cream-soft text-sa-green-ink/60 px-2 py-0.5 rounded-full">
                          {v.canal === 'rappi' ? 'Rappi' : (v.metodo_pago ?? '—')}
                        </span>
                        {cancelada && (
                          <span className="font-mono text-[10px] uppercase tracking-wide bg-sa-green-deep text-sa-cream px-2 py-0.5 rounded-full">
                            Cancelada
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 font-mono text-sm text-sa-green-ink/70 space-y-0.5">
                        {v.items.map((it, i) => (
                          <div key={i} className="truncate">×{it.cantidad} {it.nombre}</div>
                        ))}
                      </div>
                      {cancelada && v.cancelada_motivo && (
                        <p className="mt-1 font-mono text-xs text-sa-green-deep">Motivo: {v.cancelada_motivo}</p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className={`font-display text-xl text-sa-green-ink ${cancelada ? 'line-through' : ''}`}>
                        {mxn(v.total)}
                      </div>
                      {!cancelada && (
                        <button
                          onClick={() => { setCancelando(v); setMotivo('') }}
                          className="mt-2 font-mono text-xs uppercase tracking-wide bg-sa-strawberry/15 hover:bg-sa-strawberry/30 text-sa-strawberry px-3 py-1.5 rounded-full border border-sa-strawberry/30"
                        >
                          Cancelar / Devolver
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Paso 1: el motivo. Paso 2: el PIN de gerencia. */}
      {cancelando && !pidiendoPin && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-sa-green-deep/60" onClick={() => setCancelando(null)} />
          <div className="relative bg-sa-cream-soft rounded-sa-lg shadow-sa w-full max-w-sm p-6">
            <h3 className="font-display text-2xl text-sa-green-ink leading-tight">Cancelar venta #{cancelando.folio}</h3>
            <p className="font-body text-sm text-sa-green-ink/60 mt-1 mb-4">
              Se devuelven {mxn(cancelando.total)} al cliente y la venta deja de contar en el corte.
              El dinero se entrega en el mostrador.
            </p>
            <label className="block font-mono text-xs uppercase tracking-wide text-sa-green-ink/60 mb-2">
              Motivo (p. ej. «hojaldra cruda», «cambio de pedido»)
            </label>
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Opcional"
              className="w-full px-4 py-3 bg-white border border-sa-green-ink/10 rounded-sa font-mono text-sm text-sa-green-ink focus:outline-none focus:ring-2 focus:ring-sa-green/30 mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setCancelando(null)}
                className="flex-1 py-3 rounded-sa border border-sa-green-ink/15 text-sa-green-ink font-display"
              >
                No
              </button>
              <button
                onClick={() => setPidiendoPin(true)}
                disabled={guardando}
                className="flex-1 py-3 rounded-sa bg-sa-green-deep text-sa-cream font-display disabled:opacity-50"
              >
                Continuar
              </button>
            </div>
          </div>
        </div>
      )}

      <ModalAutorizacion
        open={pidiendoPin}
        accion={`cancelar la venta #${cancelando?.folio ?? ''}`}
        onClose={() => setPidiendoPin(false)}
        onAutorizado={confirmarCancelacion}
      />
    </div>
  )
}
