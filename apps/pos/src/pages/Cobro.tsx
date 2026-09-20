import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePosStore } from '@/store/posStore'
import { sb } from '../lib/sb'
import { crearOrden, cobrarOrden, cobrarOrdenMixto } from '@lily/supabase'
import { imprimirTicket, type TicketData } from '@lily/ui'
import { mxn, mensajeDeError } from '@lily/utils'
import type { MetodoPago } from '@lily/types'

/* Dos formas de cobro y ya: efectivo o terminal. Cuantas menos opciones,
   menos se equivoca quien cobra con gente esperando.
   La terminal se guarda como `tarjeta` en la base —el enum de metodos no
   cambia— y la referencia (folio del voucher) queda opcional, para poder
   conciliar el corte con lo que reporte la terminal que se contrate.
   Los iconos son SVG, no emoji: el emoji se ve distinto en cada equipo y no
   se puede tenir (esta escrito en docs/replicar-el-sistema.md). */
const METODOS: { key: MetodoPago; label: string; icono: 'efectivo' | 'terminal'; pideRef?: boolean }[] = [
  { key: 'efectivo', label: 'Efectivo', icono: 'efectivo' },
  { key: 'tarjeta', label: 'Terminal', icono: 'terminal', pideRef: true },
]

function IconoMetodo({ tipo }: { tipo: 'efectivo' | 'terminal' }) {
  return tipo === 'efectivo' ? (
    <svg viewBox="0 0 32 24" className="h-8 w-11" aria-hidden="true">
      <rect x="1" y="3" width="30" height="18" rx="3" fill="currentColor" opacity=".16" />
      <rect x="1.5" y="3.5" width="29" height="17" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="16" cy="12" r="4.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 32" className="h-8 w-7" aria-hidden="true">
      <rect x="3" y="1" width="18" height="30" rx="3" fill="currentColor" opacity=".16" />
      <rect x="3.5" y="1.5" width="17" height="29" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="6.5" y="5" width="11" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8.5" cy="17" r="1.4" fill="currentColor" /><circle cx="12" cy="17" r="1.4" fill="currentColor" />
      <circle cx="15.5" cy="17" r="1.4" fill="currentColor" /><circle cx="8.5" cy="21.5" r="1.4" fill="currentColor" />
      <circle cx="12" cy="21.5" r="1.4" fill="currentColor" /><circle cx="15.5" cy="21.5" r="1.4" fill="currentColor" />
    </svg>
  )
}

const CAMBIO_RAPIDO = [50, 100, 200, 500]

export function Cobro() {
  const navigate = useNavigate()
  const {
    empleado, almacen, corte,
    items,
    subtotal, descuentoTotal, neto, limpiarOrden,
    canal, precioDe,
  } = usePosStore()

  const [metodo, setMetodo] = useState<MetodoPago>('efectivo')
  // Pago mixto: "le doy $200 en efectivo y el resto con tarjeta". Se captura
  // SOLO la parte en efectivo; el resto es lo que queda, para que no haya
  // forma de teclear dos números que no sumen el total.
  const [mixto, setMixto] = useState(false)
  const [parteEfectivo, setParteEfectivo] = useState('')
  const [referencia, setReferencia] = useState('')
  const [recibido, setRecibido] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Guarda: sin corte o sin ítems no hay nada que cobrar.
  if (!corte || !almacen || items.length === 0) {
    navigate('/', { replace: true })
    return null
  }

  const totalNeto = neto()
  const metodoSel = METODOS.find((m) => m.key === metodo)!
  const recibidoNum = parseFloat(recibido) || 0
  const cambio = recibidoNum - totalNeto
  const efectivoMixto = Math.round((parseFloat(parteEfectivo) || 0) * 100) / 100
  const tarjetaMixto = Math.round((totalNeto - efectivoMixto) * 100) / 100
  const mixtoValido = mixto && efectivoMixto > 0 && tarjetaMixto > 0
  const listo = mixto
    ? mixtoValido
    : metodo !== 'efectivo' || totalNeto <= 0 || recibidoNum >= totalNeto

  async function confirmarPago() {
    if (procesando) return
    setProcesando(true)
    setError(null)
    try {
      const orden = await crearOrden(
        sb,
        {
          sucursal_id: almacen!.sucursal_id,
          almacen_id: almacen!.id,
          canal,
          corte_id: corte!.id,
          cliente_id: null,
          empleado_id: empleado?.id ?? null,
          descuento: descuentoTotal(),
        },
        items.map((l) => ({
          producto_id: l.producto.id,
          cantidad: l.cantidad,
          precio_unitario: precioDe(l.producto),
          personalizacion: l.personalizacion,
        })),
      )
      // Cobro inmediato aprobado → el trigger descuenta inventario y manda a
      // cocina. `idempotencyKey`: si esta llamada se reintenta (timeout de
      // red, doble toque) la base devuelve el mismo pago en vez de crear uno
      // duplicado.
      if (mixto) {
        await cobrarOrdenMixto(sb, orden.id, efectivoMixto, tarjetaMixto, {
          metodoTarjeta: 'tarjeta',
          referencia: referencia.trim() || undefined,
          autorizadoPor: empleado?.id,
          idempotencyKey: crypto.randomUUID(),
        })
      } else {
        await cobrarOrden(sb, orden.id, metodo, totalNeto, {
          referencia: referencia.trim() || undefined,
          idempotencyKey: crypto.randomUUID(),
        })
      }

      const ticket: TicketData = {
        folio: orden.folio,
        fecha: new Date(),
        cajero: empleado?.nombre,
        canal: 'Caja',
        items: items.map((l) => ({
          cantidad: l.cantidad,
          nombre: l.producto.nombre,
          precioUnitario: precioDe(l.producto),
        })),
        descuento: descuentoTotal(),
        metodoPago: mixto
          ? `Efectivo ${mxn(efectivoMixto)} + Terminal ${mxn(tarjetaMixto)}`
          : metodoSel.label,
        referenciaPago: referencia.trim() || null,
        recibido: !mixto && metodo === 'efectivo' && recibidoNum > 0 ? recibidoNum : undefined,
      }
      imprimirTicket(ticket)

      limpiarOrden()
      navigate('/', { replace: true })
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setProcesando(false)
    }
  }

  return (
    <div className="h-screen flex flex-col bg-sa-cream-paper overflow-hidden">
      {/* Hero con total */}
      <header className="bg-sa-green-deep text-sa-cream flex-shrink-0">
        <div className="flex items-center gap-4 px-6 py-3 border-b border-sa-cream/10">
          <button
            onClick={() => navigate('/')}
            className="text-sa-cream/70 hover:text-sa-cream transition-colors text-2xl"
          >
            ←
          </button>
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-sa-cream/50">Cobrar orden</p>
            <p className="font-display text-lg text-sa-cream">
              {items.length} {items.length === 1 ? 'producto' : 'productos'}
            </p>
          </div>
        </div>
        <div className="px-6 py-6 text-center">
          <p className="font-mono text-xs uppercase tracking-widest text-sa-cream/50 mb-2">Total a cobrar</p>
          <p className="font-display text-7xl text-sa-cream leading-none">{mxn(totalNeto)}</p>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Izquierda: método de pago */}
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4 mb-3">
            {METODOS.map((m) => (
              <button
                key={m.key}
                onClick={() => { setMetodo(m.key); setMixto(false) }}
                aria-pressed={!mixto && metodo === m.key}
                className={`flex flex-col items-center justify-center gap-2.5 py-7 rounded-sa transition-all ${
                  !mixto && metodo === m.key
                    ? 'bg-sa-green text-white shadow-sa'
                    : 'bg-sa-cream-soft text-sa-green-ink hover:bg-sa-cream-warm'
                }`}
              >
                <IconoMetodo tipo={m.icono} />
                <span className="font-display text-lg">{m.label}</span>
              </button>
            ))}
          </div>

          {/* Mixto. Va como una tercera opción chica y no como un tercer botón
              grande a propósito: pasa seguido, pero no tanto como los otros
              dos, y ocupando lo mismo le robaría el dedo a lo de siempre. */}
          <button
            onClick={() => { setMixto((v) => !v); setParteEfectivo('') }}
            aria-pressed={mixto}
            className={`w-full mb-5 py-3 rounded-sa font-display text-lg transition-all ${
              mixto
                ? 'bg-sa-green text-white shadow-sa'
                : 'bg-sa-cream-soft text-sa-green-ink hover:bg-sa-cream-warm'
            }`}
          >
            Una parte y otra parte
          </button>

          {/* Se captura SOLO el efectivo; el resto se calcula. Pedir los dos
              números deja teclear dos que no sumen el total, y eso lo rechaza
              el servidor con el cliente enfrente. */}
          {mixto && totalNeto > 0 && (
            <div className="bg-white rounded-sa p-5 shadow-sa-sm mb-4">
              <label className="block font-mono text-xs uppercase tracking-wide text-sa-green-ink/60 mb-2">
                ¿Cuánto da en efectivo?
              </label>
              <div className="relative mb-4">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono text-sa-green-ink/40 text-xl">$</span>
                <input
                  type="number"
                  value={parteEfectivo}
                  onChange={(e) => setParteEfectivo(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-10 pr-4 py-3 bg-sa-cream-soft border border-sa-green-ink/10 rounded-sa font-mono text-2xl text-sa-green-ink focus:outline-none focus:ring-2 focus:ring-sa-green/30"
                />
              </div>
              <div className="flex gap-2 mb-3">
                {[100, 200, 500].filter((v) => v < totalNeto).map((v) => (
                  <button
                    key={v}
                    onClick={() => setParteEfectivo(String(v))}
                    className="flex-1 py-2.5 bg-sa-cream-warm hover:bg-sa-banana rounded-full font-mono text-sm text-sa-green-ink transition-colors"
                  >
                    ${v}
                  </button>
                ))}
                <button
                  onClick={() => setParteEfectivo((totalNeto / 2).toFixed(2))}
                  className="flex-1 py-2.5 bg-sa-banana/40 hover:bg-sa-banana rounded-full font-mono text-sm text-sa-green-ink transition-colors"
                >
                  Mitad
                </button>
              </div>
              {mixtoValido ? (
                <div className="flex justify-between items-center bg-sa-mint/25 rounded-sa px-4 py-3 border border-sa-mint/50">
                  <span className="font-mono text-sm uppercase tracking-wide text-sa-green-ink/70">
                    Con la terminal
                  </span>
                  <span className="font-display text-2xl text-sa-green">{mxn(tarjetaMixto)}</span>
                </div>
              ) : (
                <p className="font-mono text-xs text-sa-green-ink/50 leading-relaxed">
                  {efectivoMixto >= totalNeto && efectivoMixto > 0
                    ? 'Eso es todo el total: si paga completo en efectivo, use el botón de Efectivo.'
                    : 'El resto se cobra con la terminal. Lo que se apunte aquí es lo que el corte va a esperar en el cajón.'}
                </p>
              )}
            </div>
          )}

          {/* Efectivo: recibido + cambio */}
          {!mixto && metodo === 'efectivo' && totalNeto > 0 && (
            <div className="bg-white rounded-sa p-5 shadow-sa-sm mb-4">
              <label className="block font-mono text-xs uppercase tracking-wide text-sa-green-ink/60 mb-2">
                Recibido
              </label>
              <div className="relative mb-4">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono text-sa-green-ink/40 text-xl">$</span>
                <input
                  type="number"
                  value={recibido}
                  onChange={(e) => setRecibido(e.target.value)}
                  placeholder={totalNeto.toFixed(2)}
                  className="w-full pl-10 pr-4 py-3 bg-sa-cream-soft border border-sa-green-ink/10 rounded-sa font-mono text-2xl text-sa-green-ink focus:outline-none focus:ring-2 focus:ring-sa-green/30"
                />
              </div>
              <div className="flex gap-2 mb-3">
                {CAMBIO_RAPIDO.filter((v) => v >= totalNeto).slice(0, 4).map((v) => (
                  <button
                    key={v}
                    onClick={() => setRecibido(String(v))}
                    className="flex-1 py-2.5 bg-sa-cream-warm hover:bg-sa-banana rounded-full font-mono text-sm text-sa-green-ink transition-colors"
                  >
                    ${v}
                  </button>
                ))}
                <button
                  onClick={() => setRecibido(totalNeto.toFixed(2))}
                  className="flex-1 py-2.5 bg-sa-banana/40 hover:bg-sa-banana rounded-full font-mono text-sm text-sa-green-ink transition-colors"
                >
                  Exacto
                </button>
              </div>
              {recibidoNum >= totalNeto && recibidoNum > 0 && (
                <div className="flex justify-between items-center bg-sa-mint/25 rounded-sa px-4 py-3 border border-sa-mint/50">
                  <span className="font-mono text-sm uppercase tracking-wide text-sa-green-ink/70">Cambio</span>
                  <span className="font-display text-2xl text-sa-green">{mxn(cambio)}</span>
                </div>
              )}
            </div>
          )}

          {/* Referencia para Clip / Otro */}
          {(mixto || metodoSel.pideRef) && (
            <div className="bg-white rounded-sa p-5 shadow-sa-sm mb-4">
              <label className="block font-mono text-xs uppercase tracking-wide text-sa-green-ink/60 mb-2">
                Folio del voucher (opcional)
              </label>
              <input
                type="text"
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                placeholder="Para cuadrar el corte con la terminal"
                className="w-full px-4 py-3 bg-sa-cream-soft border border-sa-green-ink/10 rounded-sa font-mono text-sm text-sa-green-ink focus:outline-none focus:ring-2 focus:ring-sa-green/30"
              />
              <p className="font-mono text-xs text-sa-green-ink/50 mt-2 leading-relaxed">
                Cobre el monto en la terminal y, si quiere, anote aquí el folio del
                voucher. Puede dejarlo vacío.
              </p>
            </div>
          )}

          {error && (
            <div className="bg-sa-strawberry/10 border border-sa-strawberry/30 rounded-sa px-4 py-3 mb-4">
              <p className="font-mono text-sm text-sa-strawberry">{error}</p>
            </div>
          )}
        </div>

        {/* Derecha: resumen + confirmar */}
        <div className="w-80 bg-white border-l border-sa-green-ink/10 flex flex-col p-5">
          <h3 className="font-display text-lg text-sa-green-ink mb-3">Ticket</h3>
          <div className="flex-1 overflow-y-auto space-y-1.5 mb-4 font-mono text-sm">
            {items.map((l) => (
              <div key={l.lineaId} className="py-1 border-b border-dashed border-sa-green-ink/10">
                <div className="flex justify-between">
                  <span className="text-sa-green-ink/70 truncate flex-1 mr-2">×{l.cantidad} {l.producto.nombre}</span>
                  <span className="font-medium text-sa-green-ink flex-shrink-0">{mxn(precioDe(l.producto) * l.cantidad)}</span>
                </div>
                {l.personalizacion && (
                  <p className="text-xs text-sa-strawberry leading-snug">📝 {l.personalizacion}</p>
                )}
              </div>
            ))}
          </div>
          <div className="border-t border-sa-green-ink/15 pt-3 space-y-1 mb-4 font-mono text-sm">
            <div className="flex justify-between text-sa-green-ink/60">
              <span>Subtotal</span>
              <span>{mxn(subtotal())}</span>
            </div>
            {descuentoTotal() > 0 && (
              <div className="flex justify-between text-sa-strawberry">
                <span>Descuento</span>
                <span>−{mxn(descuentoTotal())}</span>
              </div>
            )}
            <div className="flex justify-between items-baseline pt-2 border-t border-sa-green-ink/10">
              <span className="font-display text-xl text-sa-green-ink">Total</span>
              <span className="font-display text-2xl text-sa-green-ink">{mxn(totalNeto)}</span>
            </div>
          </div>
          <button
            onClick={() => void confirmarPago()}
            disabled={!listo || procesando}
            className="w-full bg-sa-strawberry disabled:opacity-40 hover:brightness-110 active:scale-[0.98] text-white py-4 rounded-sa-lg font-display text-xl shadow-sa-sm transition-all"
          >
            {procesando ? 'Cobrando…' : `Confirmar pago ${mxn(totalNeto)}`}
          </button>
        </div>
      </div>
    </div>
  )
}
