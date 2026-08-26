import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePosStore } from '@/store/posStore'
import { sb } from '../lib/sb'
import {
  listarOrdenesPendientesCajaConItems, cobrarOrden, suscribirOrdenesPendientesCaja,
  type OrdenConItems,
} from '@shake/supabase'
import { imprimirTicket, type TicketData } from '@shake/ui'
import { mxn, mensajeDeError } from '@shake/utils'
import type { MetodoPago } from '@shake/types'

const METODOS: { key: MetodoPago; label: string; icon: string }[] = [
  { key: 'efectivo', label: 'Efectivo', icon: '💵' },
  { key: 'tarjeta', label: 'Tarjeta', icon: '💳' },
  { key: 'clip', label: 'Clip', icon: '📟' },
  { key: 'cortesia', label: 'Cortesía', icon: '🎁' },
]

/**
 * POS: localiza órdenes creadas en el kiosko en modo "pagar en caja"
 * (awaiting_counter_payment) y las cobra. Es la ÚNICA forma en que una
 * de esas órdenes se convierte en venta — nada la aprueba sola.
 * cobrarOrden() es idempotente: si el cajero le da doble clic, o dos
 * cajeros intentan cobrar el mismo folio a la vez, solo se registra un
 * pago (ver docs/maquina-estados.md).
 */
export function PedidosPendientes() {
  const navigate = useNavigate()
  const { empleado, corte } = usePosStore()
  const [ordenes, setOrdenes] = useState<OrdenConItems[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ordenSeleccionada, setOrdenSeleccionada] = useState<OrdenConItems | null>(null)
  const [metodo, setMetodo] = useState<MetodoPago>('efectivo')
  const [cobrando, setCobrando] = useState(false)

  async function cargar() {
    try {
      const data = await listarOrdenesPendientesCajaConItems(sb, busqueda)
      setOrdenes(data)
      setError(null)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    void cargar()
    const off = suscribirOrdenesPendientesCaja(sb, () => void cargar())
    return off
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda])

  async function confirmarCobro() {
    if (!ordenSeleccionada || !empleado) return
    setCobrando(true)
    setError(null)
    try {
      await cobrarOrden(sb, ordenSeleccionada.id, metodo, ordenSeleccionada.total, {
        autorizadoPor: empleado.id,
        idempotencyKey: crypto.randomUUID(),
      })

      const ticket: TicketData = {
        folio: ordenSeleccionada.folio,
        fecha: new Date(),
        cajero: empleado.nombre,
        canal: 'Kiosko · Caja',
        items: ordenSeleccionada.orden_items.map((i) => ({
          cantidad: i.cantidad,
          nombre: i.productos?.nombre ?? '—',
          precioUnitario: i.precio_unitario,
        })),
        metodoPago: METODOS.find((m) => m.key === metodo)?.label ?? metodo,
      }
      imprimirTicket(ticket)

      setOrdenSeleccionada(null)
      await cargar()
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setCobrando(false)
    }
  }

  if (!corte) {
    return (
      <div className="p-8 text-center font-mono text-sm text-sa-green-ink/50">
        Abre la caja primero para poder cobrar pedidos pendientes.
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-sa-cream-paper overflow-hidden">
      <header className="flex items-center justify-between px-6 py-4 bg-sa-green-deep text-sa-cream flex-shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/')} className="text-sa-cream/70 hover:text-sa-cream text-2xl">←</button>
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-sa-cream/50">Kiosko · Pagar en caja</p>
            <h1 className="font-display text-2xl">Pedidos esperando cobro</h1>
          </div>
        </div>
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por folio o código…"
          className="px-4 py-2.5 rounded-full bg-sa-cream-warm/10 border border-sa-cream/20 text-sa-cream placeholder:text-sa-cream/40 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-sa-mint/40"
        />
      </header>

      {error && (
        <div className="mx-6 mt-4 bg-sa-strawberry/10 border border-sa-strawberry/30 rounded-sa px-4 py-3">
          <p className="font-mono text-sm text-sa-strawberry">{error}</p>
        </div>
      )}

      <main className="flex-1 overflow-y-auto p-6">
        {cargando ? (
          <p className="font-mono text-sm text-sa-green-ink/50 animate-pulse text-center py-16">Cargando…</p>
        ) : ordenes.length === 0 ? (
          <p className="font-mono text-sm text-sa-green-ink/40 text-center py-16">
            No hay pedidos esperando cobro en caja.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {ordenes.map((o) => (
              <button
                key={o.id}
                onClick={() => { setOrdenSeleccionada(o); setMetodo('efectivo') }}
                className="text-left bg-white rounded-sa-lg shadow-sa-sm p-5 hover:shadow-sa hover:-translate-y-0.5 transition-all border border-sa-green-ink/5"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-sa-green-ink/40">Folio</p>
                    <p className="font-display text-3xl text-sa-green-ink leading-none">#{o.folio}</p>
                  </div>
                  <span className="font-mono text-xs bg-sa-cream-soft px-2.5 py-1 rounded-full text-sa-green-ink/60 tracking-widest">
                    {o.codigo_corto}
                  </span>
                </div>
                <p className="font-mono text-sm text-sa-green-ink/50 mb-2">
                  {o.orden_items.length} producto{o.orden_items.length === 1 ? '' : 's'}
                </p>
                <p className="font-display text-2xl text-sa-strawberry">{mxn(o.total)}</p>
              </button>
            ))}
          </div>
        )}
      </main>

      {ordenSeleccionada && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-sa-green-deep/60" onClick={() => setOrdenSeleccionada(null)} />
          <div className="relative bg-white rounded-sa-lg shadow-sa w-full max-w-md p-6">
            <h3 className="font-display text-2xl text-sa-green-ink mb-1">Cobrar folio #{ordenSeleccionada.folio}</h3>
            <p className="font-mono text-xs text-sa-green-ink/50 mb-4">Código {ordenSeleccionada.codigo_corto}</p>

            <div className="space-y-1.5 mb-4 max-h-40 overflow-y-auto font-mono text-sm">
              {ordenSeleccionada.orden_items.map((i) => (
                <div key={i.id} className="flex justify-between py-1 border-b border-dashed border-sa-green-ink/10">
                  <span className="text-sa-green-ink/70">×{i.cantidad} {i.productos?.nombre}</span>
                  <span className="text-sa-green-ink">{mxn(i.precio_unitario * i.cantidad)}</span>
                </div>
              ))}
            </div>

            <div className="flex justify-between items-baseline mb-4 pt-2 border-t border-sa-green-ink/10">
              <span className="font-display text-lg text-sa-green-ink">Total</span>
              <span className="font-display text-3xl text-sa-green-ink">{mxn(ordenSeleccionada.total)}</span>
            </div>

            <div className="grid grid-cols-4 gap-2 mb-5">
              {METODOS.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setMetodo(m.key)}
                  className={`flex flex-col items-center gap-1 py-3 rounded-sa bg-sa-cream-soft transition-all ${
                    metodo === m.key ? 'ring-2 ring-sa-green' : 'hover:bg-sa-cream-warm'
                  }`}
                >
                  <span className="text-xl">{m.icon}</span>
                  <span className="font-mono text-[10px] text-sa-green-ink">{m.label}</span>
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setOrdenSeleccionada(null)}
                className="flex-1 border border-sa-green-ink/15 text-sa-green-ink py-3 rounded-sa font-mono text-sm uppercase tracking-wide"
              >
                Cancelar
              </button>
              <button
                onClick={() => void confirmarCobro()}
                disabled={cobrando}
                className="flex-1 bg-sa-strawberry disabled:opacity-40 text-white py-3 rounded-sa font-display text-lg"
              >
                {cobrando ? 'Cobrando…' : 'Confirmar cobro'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
