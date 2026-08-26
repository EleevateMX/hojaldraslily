import { useEffect, useState, type ReactNode } from 'react'
import logo from '@shake/brand/logo.png'
import { entrarConPin, empleadoDeLaSesion, salirDeSesion, type EmpleadoSesion } from '@shake/supabase'
import { sb } from './lib/sb'

/**
 * Candado de Admin.
 *
 * Hasta hoy esta app no tenía ninguno: quien llegara a la dirección entraba
 * al panel completo —precios, empleados, impresoras, ventas, clientes— sin
 * que nadie le preguntara nada.
 *
 * Y no basta con esconder la pantalla: el candado se apoya en una sesión de
 * Supabase Auth de verdad (ver `entrarConPin`), así que la base también sabe
 * quién está del otro lado. Una pantalla bonita sobre un `anon` no protege
 * nada, porque las mismas funciones se pueden llamar desde una consola.
 *
 * Solo pasan administrador y gerente: la cajera tiene su PIN para caja, pero
 * no tiene por qué poder cambiar precios ni tocar al personal.
 */
const ROLES_QUE_PASAN = ['administrador', 'gerente']

export function CandadoAdmin({ children }: { children: ReactNode }) {
  const [empleado, setEmpleado] = useState<EmpleadoSesion | null>(null)
  const [revisando, setRevisando] = useState(true)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [entrando, setEntrando] = useState(false)

  useEffect(() => {
    void (async () => {
      const e = await empleadoDeLaSesion(sb)
      setEmpleado(e && ROLES_QUE_PASAN.includes(e.rol) ? e : null)
      setRevisando(false)
    })()
  }, [])

  async function entrar() {
    if (pin.length < 4 || entrando) return
    setEntrando(true)
    setError(null)
    const r = await entrarConPin(sb, pin)
    setPin('')
    if (!r.ok || !r.empleado) {
      setError(r.error ?? 'PIN incorrecto')
    } else if (!ROLES_QUE_PASAN.includes(r.empleado.rol)) {
      // Entró bien, pero este panel no es para su puesto. Se cierra la sesión
      // para no dejarla abierta con permisos que aquí no sirven.
      await salirDeSesion(sb)
      setError('Este panel es solo para administración.')
    } else {
      setEmpleado(r.empleado)
    }
    setEntrando(false)
  }

  if (revisando) {
    return (
      <div className="min-h-screen grid place-items-center bg-sa-cream-paper">
        <p className="font-mono text-sm text-sa-green-ink/50">Comprobando sesión…</p>
      </div>
    )
  }

  if (!empleado) {
    return (
      <div className="min-h-screen grid place-items-center bg-sa-green-deep px-6">
        <div className="w-full max-w-xs text-center">
          <img src={logo} alt="Hojaldras Lily" className="w-36 mx-auto mb-8" draggable={false} />
          <h1 className="font-display text-2xl text-sa-cream mb-1">Administración</h1>
          <p className="font-body text-sm text-sa-cream/60 mb-6">Escribe tu PIN para entrar.</p>
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter') void entrar() }}
            className="w-full text-center tracking-[0.5em] font-mono text-2xl px-4 py-3 rounded-sa-lg bg-sa-cream text-sa-green-ink outline-none"
            placeholder="••••"
          />
          {error && <p className="mt-4 font-body text-sm text-red-300">{error}</p>}
          <button
            onClick={() => void entrar()}
            disabled={pin.length < 4 || entrando}
            className="mt-5 w-full py-3 rounded-sa-lg bg-sa-cream text-sa-green-ink font-display text-lg disabled:opacity-40"
          >
            {entrando ? 'Entrando…' : 'Entrar'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="fixed bottom-3 right-3 z-50 flex items-center gap-3 bg-sa-green-deep text-sa-cream/90 rounded-sa-lg px-4 py-2 shadow-sa-sm">
        <span className="font-mono text-xs">{empleado.nombre}</span>
        <button
          onClick={() => void salirDeSesion(sb).then(() => setEmpleado(null))}
          className="font-mono text-xs underline underline-offset-2 hover:text-sa-cream"
        >
          Salir
        </button>
      </div>
      {children}
    </>
  )
}
