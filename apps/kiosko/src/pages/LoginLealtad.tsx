import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { iniciarSesionGoogle } from '@shake/supabase'
import { useCarrito } from '@/store/carritoStore'
import { sb } from '@/lib/sb'
import { mensajeDeError } from '@shake/utils'

const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
)

export function LoginLealtad() {
  const navigate = useNavigate()
  const { items, total, usuario } = useCarrito()
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  async function handleGoogle() {
    setCargando(true)
    setError('')
    try {
      await iniciarSesionGoogle(sb, window.location.origin + '/auth/callback')
      // page will redirect to Google — no navigate() needed
    } catch (e) {
      // Google todavía sin habilitar en Supabase Auth: se avisa aquí en vez
      // de mandar al cliente a la pantalla de error cruda de Supabase.
      const raw = (mensajeDeError(e)).toLowerCase()
      setError(
        raw.includes('provider is not enabled') || raw.includes('unsupported provider')
          ? 'Los puntos estarán disponibles en un momentito. Puedes continuar sin registrarte. 🥤'
          : 'No pudimos conectar con Google. Intenta de nuevo.',
      )
      setCargando(false)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-sa-cream-paper">
      {/* Header */}
      <header className="bg-sa-green-deep text-sa-cream px-8 py-6 flex items-center justify-between">
        <button
          onClick={() => navigate('/carrito')}
          className="w-11 h-11 rounded-full bg-sa-green-ink hover:bg-sa-green flex items-center justify-center text-xl"
          aria-label="Volver"
        >
          ←
        </button>
        <div className="text-center">
          <p className="font-mono text-[11px] uppercase tracking-widest text-sa-cream/60">Paso 2 de 3</p>
          <h1 className="font-display text-2xl leading-none">Lealtad</h1>
        </div>
        {/* cart summary pill */}
        <div className="bg-sa-green-ink rounded-sa px-4 py-2 text-right">
          <p className="font-mono text-[10px] uppercase tracking-wide text-sa-banana">{items.reduce((s,i)=>s+i.cantidad,0)} items</p>
          <p className="font-display text-lg leading-none">${total().toFixed(2)}</p>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 gap-8 max-w-md mx-auto w-full">
        {/* Already logged in */}
        {usuario ? (
          <div className="w-full text-center">
            <div className="w-20 h-20 rounded-full bg-sa-green flex items-center justify-center text-sa-cream font-display text-4xl mx-auto mb-4">
              {usuario.nombre[0]}
            </div>
            <h2 className="font-display text-3xl text-sa-green-ink">Hola, {usuario.nombre.split(' ')[0]}</h2>
            <p className="font-body text-sa-green-ink/60 mt-2">Tus puntos se acumularán automáticamente</p>
            <button
              onClick={() => navigate('/pago')}
              className="mt-8 w-full bg-sa-green text-sa-cream py-5 rounded-sa-lg font-display text-2xl hover:bg-sa-green-deep transition-colors"
            >
              Continuar al pago →
            </button>
          </div>
        ) : (
          <>
            {/* Star icon */}
            <div className="w-20 h-20 rounded-full bg-sa-banana/20 flex items-center justify-center">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#C9A227" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            </div>

            <div className="text-center">
              <h2 className="font-display text-4xl text-sa-green-ink leading-tight">
                Gana mancuernas con tu compra
              </h2>
              <p className="font-body text-sa-green-ink/60 mt-3 text-lg">
                1 mancuerna por cada $10 de compra. Al juntar 100 se te genera
                un cupón de recompensa solo.
              </p>
            </div>

            {/* Cómo funciona — el programa real, sin niveles inventados. */}
            <div className="grid grid-cols-3 gap-3 w-full">
              {[
                { label: '$10', sub: '1 mancuerna' },
                { label: '100', sub: 'Cupón' },
                { label: '1 año', sub: 'Vigencia' },
              ].map((b) => (
                <div key={b.sub} className="bg-white rounded-sa p-3 text-center shadow-sa-sm">
                  <p className="font-display text-lg text-sa-green-ink">{b.label}</p>
                  <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/50">{b.sub}</p>
                </div>
              ))}
            </div>

            {error && (
              <p className="text-sa-strawberry font-mono text-sm text-center">{error}</p>
            )}

            {/* Google button */}
            <button
              onClick={handleGoogle}
              disabled={cargando}
              className="w-full flex items-center justify-center gap-3 bg-white border-2 border-sa-green-ink/15 rounded-sa-lg py-4 font-display text-xl text-sa-green-ink hover:border-sa-green/50 hover:shadow-sa-sm transition-all disabled:opacity-60"
            >
              <GoogleIcon />
              {cargando ? 'Conectando…' : 'Entrar con Google'}
            </button>

            {/* Guest */}
            <button
              onClick={() => navigate('/pago')}
              className="w-full py-3 font-body text-sa-green-ink/50 hover:text-sa-green-ink text-sm transition-colors"
            >
              Continuar sin cuenta →
            </button>
          </>
        )}
      </div>
    </div>
  )
}
