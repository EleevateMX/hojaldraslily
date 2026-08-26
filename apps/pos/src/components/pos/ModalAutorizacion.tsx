import React, { useState } from 'react'
import { sb } from '../../lib/sb'
import { loginCajero } from '@shake/supabase'

interface Props {
  open: boolean
  /** Qué se está autorizando, p. ej. "aplicar un descuento" */
  accion: string
  onClose: () => void
  onAutorizado: (nombreAutorizador: string) => void
}

/**
 * Candado de gerente: pide un PIN y solo deja pasar si pertenece a un
 * empleado activo con rol Gerente o Administrador. La validación es la
 * misma del login (fn_login_cajero, SECURITY DEFINER) — el PIN nunca se
 * compara en el navegador ni sale el hash a la app.
 */
export function ModalAutorizacion({ open, accion, onClose, onAutorizado }: Props) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [validando, setValidando] = useState(false)

  if (!open) return null

  async function autorizar() {
    if (pin.length < 4 || validando) return
    setValidando(true)
    setError(null)
    try {
      const emp = await loginCajero(sb, pin)
      const rol = (emp as unknown as { rol?: string } | null)?.rol
      if (!emp || (rol !== 'gerente' && rol !== 'admin')) {
        setError('Solo un gerente o administrador puede autorizar esto.')
        setPin('')
        return
      }
      const nombre = emp.nombre
      setPin('')
      onAutorizado(nombre)
    } catch {
      setError('No se pudo validar el PIN, revisa la conexión.')
      setPin('')
    } finally {
      setValidando(false)
    }
  }

  function cerrar() {
    setPin('')
    setError(null)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-sa-green-deep/60" onClick={cerrar} />
      <div className="relative bg-sa-cream-soft rounded-sa-lg shadow-sa w-full max-w-xs p-6">
        <h3 className="font-display text-2xl text-sa-green-ink leading-tight">Autorización</h3>
        <p className="font-body text-sm text-sa-green-ink/60 mt-1 mb-4">
          Pide a un gerente o administrador su PIN para {accion}.
        </p>
        <input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => { if (e.key === 'Enter') void autorizar() }}
          placeholder="••••"
          maxLength={8}
          className="w-full px-4 py-3 bg-white border border-sa-green-ink/10 rounded-sa font-mono text-2xl text-center tracking-[0.5em] text-sa-green-ink focus:outline-none focus:ring-2 focus:ring-sa-green/30"
          autoFocus
        />
        {error && <p className="font-mono text-xs text-sa-strawberry mt-2">{error}</p>}
        <div className="flex gap-2 mt-4">
          <button
            onClick={cerrar}
            className="flex-1 border border-sa-green-ink/15 bg-white text-sa-green-ink/70 py-2.5 rounded-full font-mono text-xs uppercase tracking-wide hover:bg-sa-cream-warm"
          >
            Cancelar
          </button>
          <button
            onClick={() => void autorizar()}
            disabled={pin.length < 4 || validando}
            className="flex-1 bg-sa-green disabled:opacity-40 text-sa-cream py-2.5 rounded-full font-mono text-xs uppercase tracking-wide hover:bg-sa-green-deep"
          >
            {validando ? 'Validando…' : 'Autorizar'}
          </button>
        </div>
      </div>
    </div>
  )
}
