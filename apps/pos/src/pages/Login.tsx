import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePosStore } from '@/store/posStore'
import { sb } from '../lib/sb'
import { listarEmpleadosActivos, entrarConPin } from '@shake/supabase'
import type { Empleado } from '@shake/supabase'

export function Login() {
  const navigate = useNavigate()
  const iniciarSesion = usePosStore((s) => s.iniciarSesion)

  const [empleados, setEmpleados] = useState<Empleado[]>([])
  const [cargando, setCargando] = useState(true)
  const [seleccionado, setSeleccionado] = useState<Empleado | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [validando, setValidando] = useState(false)

  useEffect(() => {
    listarEmpleadosActivos(sb)
      .then((rows) => setEmpleados(rows))
      .catch(() => setEmpleados([]))
      .finally(() => setCargando(false))
  }, [])

  function seleccionar(emp: Empleado) {
    setSeleccionado(emp)
    setPin('')
    setError('')
  }

  function presionarDigito(d: string) {
    if (pin.length >= 6) return
    setPin((p) => p + d)
    setError('')
  }

  function borrar() {
    setPin((p) => p.slice(0, -1))
    setError('')
  }

  /**
   * El PIN abre una SESIÓN, no solo la pantalla.
   *
   * Antes se validaba con `fn_login_cajero` y el empleado quedaba en memoria
   * del navegador mientras la base seguía viendo `anon`. Ahora se canjea por
   * una sesión de Supabase Auth, así que lo que haga esta caja viaja
   * identificado y el RLS puede distinguirla de cualquiera con la llave
   * publicable.
   */
  async function validarPin() {
    if (pin.length < 4 || validando) return
    setValidando(true)
    try {
      const r = await entrarConPin(sb, pin)
      // El PIN es la autoridad: si hay tile seleccionado, debe coincidir.
      if (r.ok && r.empleado && (!seleccionado || r.empleado.id === seleccionado.id)) {
        iniciarSesion(r.empleado)
        navigate('/')
        return
      }
      setError(r.error ?? 'Ese PIN no abre, intente de nuevo')
      setPin('')
    } catch {
      setError('No se pudo validar el PIN, revisa la conexión')
      setPin('')
    } finally {
      setValidando(false)
    }
  }

  const TECLADO = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫']
  // Sin tiles (o antes de elegir) igual se puede meter el PIN directo.
  const mostrarPad = seleccionado !== null || empleados.length === 0

  return (
    <div className="min-h-screen bg-sa-green-deep flex flex-col items-center justify-center px-4 py-8">
      <img src="/logo.png" alt="Hojaldras Lily" className="w-[180px] h-auto mb-6 drop-shadow-2xl" />

      <div className="bg-sa-cream-soft rounded-sa-lg shadow-sa w-full max-w-2xl p-8">
        <div className="text-center mb-6">
          <h1 className="font-display text-4xl text-sa-green-ink leading-none">¿Quién atiende hoy?</h1>
          <p className="font-body text-sa-green-ink/60 mt-2 text-sm">Toca tu nombre y mete tu PIN</p>
        </div>

        {/* Selector de empleados */}
        {cargando ? (
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="py-5 px-3 rounded-sa bg-sa-cream-warm animate-pulse h-28" />
            ))}
          </div>
        ) : (
          empleados.length > 0 && (
            <div className="grid grid-cols-3 gap-3 mb-6">
              {empleados.map((emp) => {
                const activo = seleccionado?.id === emp.id
                return (
                  <button
                    key={emp.id}
                    onClick={() => seleccionar(emp)}
                    className={`py-5 px-3 rounded-sa transition-all text-center border ${
                      activo
                        ? 'bg-sa-cream border-sa-green shadow-sa-sm'
                        : 'bg-sa-cream-warm border-transparent hover:bg-sa-cream'
                    }`}
                  >
                    <div className="w-14 h-14 rounded-full bg-sa-green flex items-center justify-center text-sa-cream font-display text-2xl mx-auto mb-2">
                      {emp.nombre[0]}
                    </div>
                    <p className={`font-display text-base leading-tight ${activo ? 'text-sa-green' : 'text-sa-green-ink'}`}>
                      {emp.nombre.split(' ')[0]}
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/50 mt-1">
                      {emp.rol}
                    </p>
                  </button>
                )
              })}
            </div>
          )
        )}

        {/* PIN pad */}
        {mostrarPad && (
          <div className="max-w-xs mx-auto">
            {seleccionado && (
              <p className="text-center font-display text-2xl text-sa-green mb-3">
                Hola, {seleccionado.nombre.split(' ')[0]}
              </p>
            )}

            <div className="flex justify-center gap-3 mb-5">
              {Array.from({ length: Math.max(pin.length, 4) }).map((_, i) => (
                <div
                  key={i}
                  className={`w-4 h-4 rounded-full transition-all ${
                    i < pin.length ? 'bg-sa-green' : 'bg-sa-cream-warm'
                  }`}
                />
              ))}
            </div>

            {error && <p className="text-center text-sa-strawberry text-sm mb-4 font-mono">{error}</p>}

            <div className="grid grid-cols-3 gap-3">
              {TECLADO.map((digit, i) => {
                if (digit === 'C') {
                  return (
                    <button
                      key={i}
                      onClick={() => { setPin(''); setError('') }}
                      className="h-16 rounded-sa bg-sa-strawberry hover:brightness-110 text-white font-display text-2xl transition-all flex items-center justify-center"
                    >
                      C
                    </button>
                  )
                }
                if (digit === '⌫') {
                  return (
                    <button
                      key={i}
                      onClick={borrar}
                      className="h-16 rounded-sa bg-sa-cream-warm hover:bg-sa-cream text-sa-green-ink font-display text-2xl transition-colors flex items-center justify-center"
                    >
                      ⌫
                    </button>
                  )
                }
                return (
                  <button
                    key={i}
                    onClick={() => presionarDigito(digit)}
                    className="h-16 rounded-sa bg-sa-cream hover:bg-sa-cream-warm text-sa-green-ink font-display text-2xl transition-colors"
                  >
                    {digit}
                  </button>
                )
              })}
            </div>

            <button
              onClick={() => void validarPin()}
              disabled={pin.length < 4 || validando}
              className="w-full mt-5 bg-sa-green disabled:opacity-40 text-sa-cream py-4 rounded-sa-lg font-display text-xl hover:bg-sa-green-deep transition-colors"
            >
              {validando ? 'Verificando…' : 'Entrar'}
            </button>
          </div>
        )}
      </div>

      <p className="font-mono text-xs text-sa-cream/40 mt-6 uppercase tracking-widest">Hojaldras Lily · POS</p>
    </div>
  )
}
