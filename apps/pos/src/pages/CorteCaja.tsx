import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePosStore } from '@/store/posStore'
import { sb } from '../lib/sb'
import { resumenCorte, cerrarCaja } from '@shake/supabase'
import { mxn, mensajeDeError } from '@shake/utils'
import type { CorteResumen } from '@shake/types'

export function CorteCaja() {
  const navigate = useNavigate()
  const { empleado, corte, setCorte, cerrarSesion, limpiarOrden } = usePosStore()

  const [resumen, setResumen] = useState<CorteResumen | null>(null)
  const [efectivoContado, setEfectivoContado] = useState('')
  const [notas, setNotas] = useState('')
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cortado, setCortado] = useState(false)

  useEffect(() => {
    if (!corte) {
      navigate('/', { replace: true })
      return
    }
    resumenCorte(sb, corte.id)
      .then(setResumen)
      .catch((e) => setError(mensajeDeError(e)))
      .finally(() => setCargando(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function realizarCorte() {
    if (!corte || guardando) return
    setGuardando(true)
    setError(null)
    try {
      await cerrarCaja(sb, corte.id, Number(efectivoContado) || 0, empleado?.id, notas.trim() || undefined)
      setCorte(null)
      limpiarOrden()
      setCortado(true)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setGuardando(false)
    }
  }

  // --- Pantalla de éxito ---
  if (cortado && resumen) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-sa-green-deep text-sa-cream gap-6 px-6">
        <img src="/milo-transparent.png" alt="Hojaldra de la casa" className="w-48 h-48 drop-shadow-2xl" />
        <div className="text-center">
          <h1 className="font-display text-5xl text-sa-cream leading-tight">Buen turno, campeón</h1>
          <p className="font-mono text-sm uppercase tracking-widest text-sa-cream/60 mt-3">Total cobrado</p>
          <p className="font-display text-4xl text-sa-banana mt-1">{mxn(resumen.total_pagado)}</p>
        </div>
        <div className="flex gap-3 mt-4">
          <button
            onClick={() => navigate('/')}
            className="border border-sa-cream/30 text-sa-cream px-8 py-4 rounded-sa-lg font-display text-lg hover:bg-sa-cream/10 transition-all"
          >
            Volver a caja
          </button>
          <button
            onClick={() => { cerrarSesion(); navigate('/login') }}
            className="bg-sa-strawberry hover:brightness-110 text-white px-8 py-4 rounded-sa-lg font-display text-lg shadow-sa-sm transition-all"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    )
  }

  const contado = Number(efectivoContado) || 0
  const dif = contado - (resumen?.efectivo_esperado ?? 0)
  const numOrdenes = resumen?.num_ordenes ?? 0
  const totalPagado = resumen?.total_pagado ?? 0
  const ticketPromedio = numOrdenes > 0 ? totalPagado / numOrdenes : 0

  return (
    <div className="min-h-screen bg-sa-cream-paper">
      <div className="bg-sa-green-deep text-sa-cream px-6 py-6">
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          <button onClick={() => navigate('/')} className="text-sa-cream/70 hover:text-sa-cream text-2xl">←</button>
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-sa-cream/50">
              Cajero: {empleado?.nombre}
            </p>
            <h1 className="font-display text-3xl text-sa-cream leading-tight">Corte de caja</h1>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-6">
        {cargando || !resumen ? (
          <div className="space-y-4 animate-pulse">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-sa h-28" />
              <div className="bg-white rounded-sa h-28" />
            </div>
            <div className="bg-white rounded-sa h-48" />
          </div>
        ) : (
          <>
            {error && (
              <div className="bg-sa-strawberry/10 border border-sa-strawberry/30 rounded-sa px-4 py-3 mb-4">
                <p className="font-mono text-sm text-sa-strawberry">{error}</p>
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-white rounded-sa p-5 shadow-sa-sm">
                <p className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/50">Órdenes del turno</p>
                <p className="font-display text-5xl text-sa-green-ink mt-1">{numOrdenes}</p>
              </div>
              <div className="bg-white rounded-sa p-5 shadow-sa-sm">
                <p className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/50">Ticket promedio</p>
                <p className="font-display text-5xl text-sa-strawberry mt-1">{mxn(ticketPromedio)}</p>
              </div>
            </div>

            {/* Desglose por método */}
            <div className="mb-6">
              <h3 className="font-display text-xl text-sa-green-ink mb-3">Desglose por método</h3>
              <div className="space-y-2">
                {[
                  { label: 'Efectivo', icon: '💵', value: resumen.total_efectivo ?? 0 },
                  { label: 'Tarjeta', icon: '💳', value: resumen.total_tarjeta ?? 0 },
                  { label: 'Clip', icon: '📟', value: resumen.total_clip ?? 0 },
                  { label: 'Cortesía', icon: '🎁', value: resumen.total_cortesia ?? 0 },
                  { label: 'Otro', icon: '•', value: resumen.total_otro ?? 0 },
                ].map((row) => (
                  <div key={row.label} className="flex justify-between items-center bg-sa-cream-soft rounded-sa px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{row.icon}</span>
                      <span className="font-display text-base text-sa-green-ink">{row.label}</span>
                    </div>
                    <span className={`font-mono text-lg ${row.value > 0 ? 'text-sa-green-ink' : 'text-sa-green-ink/30'}`}>
                      {mxn(row.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Total block */}
            <div className="bg-sa-green-deep rounded-sa-lg px-6 py-5 mb-6 flex justify-between items-baseline">
              <span className="font-display text-2xl text-sa-cream">Total cobrado</span>
              <span className="font-display text-4xl text-sa-cream">{mxn(totalPagado)}</span>
            </div>

            {/* Efectivo esperado vs contado */}
            <div className="bg-white rounded-sa p-5 shadow-sa-sm mb-6 space-y-3">
              <div className="flex justify-between font-mono text-sm">
                <span className="text-sa-green-ink/60">Fondo inicial</span>
                <span className="text-sa-green-ink">{mxn(resumen.fondo_inicial)}</span>
              </div>
              <div className="flex justify-between font-mono text-sm">
                <span className="text-sa-green-ink/60">Efectivo esperado en caja</span>
                <span className="text-sa-green-ink">{mxn(resumen.efectivo_esperado)}</span>
              </div>
              <div>
                <label className="block font-mono text-xs uppercase tracking-wide text-sa-green-ink/60 mb-2">
                  Efectivo contado en caja
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono text-sa-green-ink/40 text-xl">$</span>
                  <input
                    type="number"
                    value={efectivoContado}
                    onChange={(e) => setEfectivoContado(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-sa-cream-soft border border-sa-green-ink/10 rounded-sa font-mono text-2xl text-sa-green-ink focus:outline-none focus:ring-2 focus:ring-sa-green/30"
                  />
                </div>
              </div>
              {efectivoContado !== '' && (
                <div
                  className={`flex justify-between items-center rounded-sa px-4 py-3 font-mono text-sm ${
                    dif === 0
                      ? 'bg-sa-mint/25 border border-sa-mint/50 text-sa-green-ink'
                      : 'bg-sa-strawberry/10 border border-sa-strawberry/30 text-sa-strawberry'
                  }`}
                >
                  <span className="uppercase tracking-wide">Diferencia</span>
                  <span>
                    {mxn(dif)} {dif === 0 ? '(cuadra)' : dif > 0 ? '(sobrante)' : '(faltante)'}
                  </span>
                </div>
              )}
            </div>

            {/* Notas */}
            <div className="bg-sa-cream-soft rounded-sa p-4 mb-6">
              <label className="block font-mono text-xs uppercase tracking-wide text-sa-green-ink/60 mb-2">
                Notas del turno (opcional)
              </label>
              <textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Incidencias, observaciones…"
                rows={3}
                className="w-full bg-white border border-sa-green-ink/10 rounded-sa px-3 py-2 text-sm text-sa-green-ink resize-none focus:outline-none focus:ring-2 focus:ring-sa-green/30"
              />
            </div>

            {/* Acciones */}
            <div className="flex gap-3 pb-6">
              <button
                onClick={() => navigate('/')}
                className="flex-1 border border-sa-green-ink/15 bg-white text-sa-green-ink py-4 rounded-sa-lg font-display text-base hover:bg-sa-cream-soft transition-colors"
              >
                Seguir vendiendo
              </button>
              <button
                onClick={() => void realizarCorte()}
                disabled={guardando}
                className="flex-1 bg-sa-strawberry disabled:opacity-50 hover:brightness-110 text-white py-4 rounded-sa-lg font-display text-xl shadow-sa-sm transition-all"
              >
                {guardando ? 'Cerrando…' : 'Cerrar caja'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
