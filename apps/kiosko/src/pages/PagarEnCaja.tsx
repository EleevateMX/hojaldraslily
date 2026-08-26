import React, { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import QRCode from 'qrcode'
import { suscribirOrden } from '@shake/supabase'
import { sb } from '@/lib/sb'
import type { Orden } from '@shake/types'

interface EstadoPagarEnCaja {
  orden?: Orden
}

/**
 * Pantalla que ve el cliente cuando el kiosko está en modo
 * "pagar_en_caja": la orden ya existe (awaiting_counter_payment) pero
 * NO está pagada — no se descontó inventario, no se generaron comandas,
 * no se otorgaron mancuernas. Nada de eso ocurre hasta que un cajero la
 * cobre desde POS. Esta pantalla solo muestra el folio/código para que
 * el cliente lo lleve a caja, y se actualiza sola si el cajero la cobra
 * mientras el cliente sigue frente al kiosko.
 */
export function PagarEnCaja() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state as EstadoPagarEnCaja | null) ?? {}
  const ordenInicial = state.orden

  const [orden, setOrden] = useState<Orden | null>(ordenInicial ?? null)
  const [qrUrl, setQrUrl] = useState('')
  const [segundos, setSegundos] = useState(45)

  useEffect(() => {
    if (!ordenInicial) {
      navigate('/catalogo', { replace: true })
    }
  }, [ordenInicial, navigate])

  useEffect(() => {
    if (!orden) return
    if (orden.estado_pago_orden === 'paid') return
    const off = suscribirOrden(sb, orden.id, (actualizada) => setOrden(actualizada))
    return off
    // Deps acotadas a propósito a id/estado: incluir `orden` completo
    // resuscribiría en cada actualización que la propia suscripción
    // provoca (setOrden dispara un re-render con un `orden` nuevo).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orden?.id, orden?.estado_pago_orden])

  const codigo = orden?.codigo_corto ?? '—'

  useEffect(() => {
    if (!orden) return
    // El QR lleva la LIGA al resumen del pedido, y sirve para dos usos
    // distintos con un solo código impreso:
    //
    //   · El cliente lo escanea con la cámara de su celular y se le abre el
    //     resumen: qué pidió, cuánto es y su código para caja.
    //   · El cajero lo escanea con el lector USB, que se comporta como un
    //     teclado y escribe la URL completa en el buscador del POS. Ahí
    //     `normalizarCriterioCaja()` se queda solo con el código, así que
    //     encuentra el pedido igual.
    //
    // Antes iba un JSON aquí y no servía para ninguno de los dos.
    if (!orden.codigo_corto) return
    QRCode.toDataURL(`${window.location.origin}/pedido/${orden.codigo_corto}`, {
      width: 320,
      margin: 2,
      color: { dark: '#14241D', light: '#F8F4EC' },
    })
      .then(setQrUrl)
      .catch(console.error)
  }, [orden])

  useEffect(() => {
    const timer = setTimeout(() => navigate('/catalogo', { replace: true }), 45000)
    const tick = setInterval(() => setSegundos((s) => (s > 0 ? s - 1 : 0)), 1000)
    return () => { clearTimeout(timer); clearInterval(tick) }
  }, [navigate])

  const yaSePago = orden?.estado_pago_orden === 'paid'
  const expiro = orden?.estado_pago_orden === 'expired' || orden?.estado_pago_orden === 'cancelled'

  if (!orden) return null

  return (
    <div className="relative flex flex-col items-center justify-center h-screen bg-sa-green-deep text-sa-cream overflow-hidden px-8">
      <span className="absolute top-10 left-10 font-mono text-xs uppercase tracking-[0.3em] text-sa-banana">
        #PEDIDO {orden.folio}
      </span>
      <span className="absolute top-10 right-10 font-mono text-xs uppercase tracking-[0.3em] text-sa-cream/60">
        Hojaldras Lily
      </span>

      {yaSePago ? (
        <>
          <img src="/milo.png" alt="Hojaldra de la casa" className="h-40 w-auto drop-shadow-2xl mb-3" />
          <h1 className="font-display text-5xl leading-none text-center">¡Ya se cobró!</h1>
          <p className="font-body text-base mt-3 text-center text-sa-cream/80 max-w-sm">
            Tu pedido va en camino a preparación. Espera tu folio en pantalla.
          </p>
        </>
      ) : expiro ? (
        <>
          <h1 className="font-display text-4xl leading-none text-center text-sa-strawberry">
            Este pedido ya no está disponible
          </h1>
          <p className="font-body text-base mt-3 text-center text-sa-cream/80 max-w-sm">
            Pasó demasiado tiempo sin cobrarse. Arma tu pedido de nuevo, por favor.
          </p>
          <button
            onClick={() => navigate('/catalogo', { replace: true })}
            className="mt-6 bg-sa-strawberry text-white px-8 h-12 rounded-full font-display text-xl shadow-sa active:scale-95 transition-transform"
          >
            Empezar de nuevo
          </button>
        </>
      ) : (
        <>
          <h1 className="font-display text-4xl leading-none text-center">
            Pasa a caja a pagar
          </h1>
          <p className="font-body text-base mt-3 text-center text-sa-cream/80 max-w-sm">
            Muéstrale este código al cajero. En cuanto pagues, tu pedido entra a preparación.
          </p>

          <div className="mt-6 bg-sa-green-ink rounded-sa-lg px-10 py-6 text-center">
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-sa-banana">Código</p>
            <p className="font-display text-6xl text-sa-cream mt-2 leading-none tracking-widest">{codigo}</p>
          </div>

          {/* Más grande que antes: es lo que el cajero apunta con el lector. */}
          {qrUrl && (
            <img src={qrUrl} alt="QR del pedido" className="w-52 h-52 rounded-sa shadow-lg mt-5 bg-white p-2" />
          )}

          <div className="mt-5 flex items-center gap-4">
            <div className="bg-sa-green-ink rounded-sa-lg px-6 py-4 text-center">
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-sa-banana">Total a pagar</p>
              <p className="font-display text-4xl text-sa-cream mt-1 leading-none">${orden.total.toFixed(2)}</p>
            </div>
          </div>
        </>
      )}

      {!yaSePago && !expiro && (
        <p className="mt-6 font-mono text-xs uppercase tracking-[0.25em] text-sa-cream/50">
          Esta pantalla se reinicia en {segundos}s
        </p>
      )}
    </div>
  )
}
