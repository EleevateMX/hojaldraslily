import React, { useState } from 'react'
// `Empleado` de @shake/supabase (id/nombre/rol), no la fila cruda de la tabla
// que expone @shake/types: fn_login_cajero devuelve el rol ya resuelto y
// jamás el pin_hash.
import { entrarConPin, type EmpleadoSesion } from '@shake/supabase'
import { sb } from '@/lib/sb'
import { mensajeDeError } from '@shake/utils'

interface Props {
  onEntrar: (empleado: EmpleadoSesion) => void
}

/**
 * Candado del modo cajero: la misma pantalla del kiosko, pero detrás de un
 * PIN mientras la opera un empleado.
 *
 * Hace falta por dos razones, no por formalidad:
 *   · La venta tiene que quedar atribuida a alguien y entrar al corte de
 *     caja. Sin empleado, el corte del día no cuadra con lo que hay en el
 *     cajón.
 *   · En este modo el pedido se cobra y se manda a cocina en el mismo acto.
 *     Sin candado, cualquiera que pase frente a la pantalla podría mandar
 *     comandas a la cocina.
 */
export function CandadoCajero({ onEntrar }: Props) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [verificando, setVerificando] = useState(false)

  /**
   * El PIN ya no solo abre la pantalla: abre una SESIÓN.
   *
   * Antes se validaba con `fn_login_cajero` y el empleado se guardaba en
   * memoria del navegador, mientras la base seguía viendo `anon`. Ahora se
   * canjea por una sesión de Supabase Auth, así que cada consulta que haga
   * esta caja viaja identificada y el RLS puede distinguirla de cualquier
   * persona con la llave publicable.
   */
  async function intentar(pinCompleto: string) {
    setVerificando(true)
    setError(null)
    try {
      const r = await entrarConPin(sb, pinCompleto)
      if (!r.ok || !r.empleado) {
        setError(r.error ?? 'PIN incorrecto')
        setPin('')
        return
      }
      onEntrar(r.empleado)
    } catch (e) {
      setError(mensajeDeError(e))
      setPin('')
    } finally {
      setVerificando(false)
    }
  }

  function teclear(d: string) {
    if (verificando) return
    const nuevo = (pin + d).slice(0, 6)
    setPin(nuevo)
    setError(null)
    // El PIN es de 4 dígitos: se valida solo, sin botón de "entrar".
    if (nuevo.length === 4) void intentar(nuevo)
  }

  return (
    <div className="flex flex-col h-screen items-center justify-center bg-sa-green-deep text-sa-cream px-8">
      <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Hojaldras Lily" className="h-24 w-auto mb-6" />
      <h1 className="font-display text-3xl">Turno de caja</h1>
      <p className="font-body text-sa-cream/60 mt-2 text-center max-w-xs">
        Ingresa tu PIN para levantar pedidos desde esta pantalla.
      </p>

      <div className="flex gap-3 mt-8 h-5">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`w-4 h-4 rounded-full transition-colors ${
              i < pin.length ? 'bg-sa-banana' : 'bg-sa-cream/20'
            }`}
          />
        ))}
      </div>

      <p className="font-mono text-sm text-sa-strawberry mt-4 h-5">{error ?? ''}</p>

      <div className="grid grid-cols-3 gap-4 mt-4">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button
            key={d}
            onClick={() => teclear(d)}
            disabled={verificando}
            className="w-20 h-20 rounded-full bg-sa-green-ink hover:bg-sa-green active:scale-95 transition-all font-display text-3xl disabled:opacity-40"
          >
            {d}
          </button>
        ))}
        <button
          onClick={() => setPin('')}
          disabled={verificando}
          className="w-20 h-20 rounded-full bg-transparent border border-sa-cream/20 font-mono text-xs uppercase tracking-wide disabled:opacity-40"
        >
          Borrar
        </button>
        <button
          onClick={() => teclear('0')}
          disabled={verificando}
          className="w-20 h-20 rounded-full bg-sa-green-ink hover:bg-sa-green active:scale-95 transition-all font-display text-3xl disabled:opacity-40"
        >
          0
        </button>
        <span className="w-20 h-20" />
      </div>

      {verificando && (
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-sa-cream/50 mt-6">
          Verificando…
        </p>
      )}
    </div>
  )
}
