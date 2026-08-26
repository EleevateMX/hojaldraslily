import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { obtenerOrdenPorCodigo, suscribirOrden, type OrdenConItems } from '@shake/supabase'
import { mxn, mensajeDeError } from '@shake/utils'
import { sb } from '@/lib/sb'

/**
 * Resumen del pedido que abre el CLIENTE al escanear el QR del kiosko con la
 * cámara de su celular. Es una vista pública de solo lectura: muestra qué
 * pidió, cuánto es y su código para caja — no permite pagar ni modificar nada.
 *
 * Se queda escuchando: en cuanto el cajero cobra, la pantalla del cliente
 * cambia sola a "ya se pagó" sin que tenga que recargar.
 *
 * Está pensada para un celular en vertical, no para las pantallas del local.
 */
export function EstadoPedido() {
  const { codigo } = useParams<{ codigo: string }>()
  const [orden, setOrden] = useState<OrdenConItems | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const o = await obtenerOrdenPorCodigo(sb, codigo ?? '')
        if (!vivo) return
        setOrden(o)
        if (!o) setError('No encontramos ese pedido. Puede que ya haya pasado mucho tiempo.')
      } catch (e) {
        if (vivo) setError(mensajeDeError(e))
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [codigo])

  // Se suscribe solo cuando ya hay id y el pedido sigue vivo.
  useEffect(() => {
    if (!orden || orden.estado_pago_orden === 'paid') return
    const off = suscribirOrden(sb, orden.id, (actualizada) =>
      setOrden((previa) => (previa ? { ...previa, ...actualizada } : previa)),
    )
    return off
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orden?.id, orden?.estado_pago_orden])

  if (cargando) {
    return (
      <Marco>
        <p className="font-mono text-sm text-sa-cream/60 animate-pulse">Buscando tu pedido…</p>
      </Marco>
    )
  }

  if (error || !orden) {
    return (
      <Marco>
        <h1 className="font-display text-3xl text-center">Pedido no encontrado</h1>
        <p className="font-body text-center text-sa-cream/70 mt-3 max-w-xs">{error}</p>
      </Marco>
    )
  }

  const pagado = orden.estado_pago_orden === 'paid'
  const muerto = orden.estado_pago_orden === 'expired' || orden.estado_pago_orden === 'cancelled'

  return (
    <Marco>
      <span className="font-mono text-xs uppercase tracking-[0.3em] text-sa-banana">
        Pedido #{orden.folio}
      </span>

      {pagado ? (
        <>
          <h1 className="font-display text-4xl text-center mt-3 leading-tight">¡Ya está pagado!</h1>
          <p className="font-body text-center text-sa-cream/70 mt-2">
            Tu pedido está en preparación. Atento a la pantalla de folios.
          </p>
        </>
      ) : muerto ? (
        <>
          <h1 className="font-display text-4xl text-center mt-3 leading-tight text-sa-strawberry">
            Este pedido ya venció
          </h1>
          <p className="font-body text-center text-sa-cream/70 mt-2">
            Pasó demasiado tiempo sin cobrarse. Vuelve a armarlo en el kiosko.
          </p>
        </>
      ) : (
        <>
          <h1 className="font-display text-4xl text-center mt-3 leading-tight">Pasa a caja</h1>
          <p className="font-body text-center text-sa-cream/70 mt-2">
            Muestra este código al cajero para pagar.
          </p>
          <div className="mt-5 bg-sa-green-ink rounded-sa-lg px-8 py-5 text-center w-full">
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-sa-banana">Código</p>
            <p className="font-display text-5xl mt-1 leading-none tracking-widest">
              {orden.codigo_corto}
            </p>
          </div>
        </>
      )}

      {/* Detalle: lo que pidió, siempre visible. */}
      <div className="w-full mt-6 bg-sa-green-ink/60 rounded-sa-lg divide-y divide-sa-cream/10">
        {orden.orden_items.map((i) => (
          <div key={i.id} className="flex justify-between items-start gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="font-body text-sm leading-snug">
                <span className="text-sa-banana font-mono mr-1.5">{i.cantidad}×</span>
                {i.productos?.nombre ?? '—'}
              </p>
              {i.personalizacion && (
                <p className="font-mono text-[11px] text-sa-cream/50 mt-0.5">{i.personalizacion}</p>
              )}
            </div>
            <p className="font-mono text-sm text-sa-cream/80 flex-shrink-0">
              {mxn(i.precio_unitario * i.cantidad)}
            </p>
          </div>
        ))}
        <div className="flex justify-between items-center px-4 py-4">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-sa-banana">Total</p>
          <p className="font-display text-3xl leading-none">{mxn(orden.total)}</p>
        </div>
      </div>
    </Marco>
  )
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-sa-green-deep text-sa-cream flex flex-col items-center justify-center px-6 py-10 overflow-y-auto">
      <div className="w-full max-w-sm flex flex-col items-center">{children}</div>
    </div>
  )
}
