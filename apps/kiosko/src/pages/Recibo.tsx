import hojaldra from '@shake/brand/hojaldra.png'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { reciboPublico, type ReciboPublico } from '@shake/supabase'
import { sb } from '@/lib/sb'

/**
 * El recibo digital que abre el QR de la pantalla de confirmación.
 *
 * Vive en el kiosko pero se ve en el TELÉFONO del cliente: diseño angosto,
 * letra legible y dos salidas — mandarlo por WhatsApp o entrar a Rewards
 * (donde, si se identifica, este mismo ticket ya está en su historial).
 */

const URL_REWARDS =
  ((import.meta.env.VITE_URL_REWARDS as string | undefined) ?? 'https://rewards.hojaldraslily.com')
    // Si la variable en Cloudflare aún trae la URL vieja, se traduce sola.
    .replace('lily-cliente-pwa.pages.dev', 'rewards.hojaldraslily.com')

function fechaLarga(iso: string): string {
  return new Date(iso).toLocaleString('es-MX', {
    day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit',
  })
}

const METODOS: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  clip: 'Clip',
}

export function Recibo() {
  const { ordenId } = useParams<{ ordenId: string }>()
  const [recibo, setRecibo] = useState<ReciboPublico | null>(null)
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'no_existe'>('cargando')

  useEffect(() => {
    if (!ordenId) {
      setEstado('no_existe')
      return
    }
    reciboPublico(sb, ordenId)
      .then((r) => {
        setRecibo(r)
        setEstado(r ? 'listo' : 'no_existe')
      })
      .catch(() => setEstado('no_existe'))
  }, [ordenId])

  function compartirWhatsApp() {
    if (!recibo) return
    const lineas = (recibo.items ?? []).map(
      (i) => `${i.cantidad > 1 ? `${i.cantidad}x ` : ''}${i.producto}`,
    )
    const texto = [
      `Recibo Hojaldras Lily — orden #${recibo.folio}`,
      ...lineas,
      `Total: $${Number(recibo.total).toFixed(2)}`,
      window.location.href,
    ].join('\n')
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank')
  }

  if (estado === 'cargando') {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-sa-green-deep font-body text-sa-cream/70">
        Cargando tu recibo…
      </div>
    )
  }

  if (estado === 'no_existe' || !recibo) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-3 px-8 bg-sa-green-deep font-body text-center">
        <img src={hojaldra} alt="" className="w-24 h-auto opacity-80" />
        <p className="font-display text-2xl text-sa-cream">No encontramos ese recibo</p>
        <p className="text-sa-cream/60 text-sm max-w-xs">
          Puede que el pago siga en proceso. Si acabas de comprar, espera un momento y recarga.
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-[100dvh] bg-sa-green-deep font-body px-4 py-6">
      <div className="max-w-[420px] mx-auto">
        <div className="rounded-sa-lg overflow-hidden shadow-sa bg-sa-cream-paper text-sa-green-ink">
          {/* Encabezado del ticket */}
          <div className="bg-sa-green-deep text-sa-cream text-center px-5 pt-5 pb-4">
            <img src={hojaldra} alt="" className="w-16 h-auto mx-auto" />
            <p className="font-display text-2xl mt-1">Hojaldras Lily</p>
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-sa-banana mt-1">
              Orden #{recibo.folio}
            </p>
          </div>

          <div className="px-5 py-4">
            {recibo.es_demo && (
              <p className="mb-3 rounded-sa bg-sa-banana/25 text-sa-coffee text-center font-mono text-xs uppercase tracking-wider px-3 py-1.5">
                Demostración — sin valor
              </p>
            )}
            <div className="flex justify-between text-sm text-sa-green-ink/60">
              <span>{fechaLarga(recibo.fecha)}</span>
              <span>{recibo.metodo_pago ? METODOS[recibo.metodo_pago] ?? recibo.metodo_pago : ''}</span>
            </div>
            {recibo.nombre_cliente && (
              <p className="text-sm text-sa-green-ink/60 mt-0.5">Para: {recibo.nombre_cliente}</p>
            )}

            <div className="border-t border-dashed border-sa-green-ink/20 mt-3 pt-3">
              {(recibo.items ?? []).map((it, i) => (
                <div key={i} className={`flex justify-between gap-3 py-1 ${it.es_extra ? 'pl-4' : ''}`}>
                  <div className="min-w-0">
                    <span className={it.es_extra ? 'text-sa-green-ink/70 text-sm' : 'font-medium'}>
                      {it.cantidad > 1 ? `${it.cantidad}× ` : ''}
                      {it.producto}
                    </span>
                    {it.personalizacion && (
                      <div className="text-sa-green-ink/50 text-sm">{it.personalizacion}</div>
                    )}
                  </div>
                  <span className={`shrink-0 ${it.es_extra ? 'text-sa-green-ink/70 text-sm' : ''}`}>
                    ${(Number(it.precio_unitario) * it.cantidad).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            <div className="border-t border-dashed border-sa-green-ink/20 mt-3 pt-3 flex justify-between items-baseline">
              <span className="font-display text-lg">Total</span>
              <span className="font-display text-3xl">${Number(recibo.total).toFixed(2)}</span>
            </div>

            {recibo.mancuernas_ganadas > 0 && (
              <p className="mt-3 rounded-sa bg-sa-green/10 text-sa-green text-center text-sm font-semibold px-3 py-2">
                Esta compra sumó {recibo.mancuernas_ganadas} mancuernas
              </p>
            )}
          </div>
        </div>

        {/* Salidas: compartir o guardar */}
        <div className="mt-4 flex flex-col gap-2.5">
          <button
            onClick={compartirWhatsApp}
            className="w-full rounded-sa-lg bg-sa-cream text-sa-green-ink font-display text-xl py-3.5 shadow-sa active:scale-[0.98] transition-transform"
          >
            Enviar por WhatsApp
          </button>
          <a
            href={URL_REWARDS}
            className="w-full rounded-sa-lg border-2 border-sa-cream/25 text-sa-cream text-center font-display text-xl py-3 hover:border-sa-cream/50 transition-colors"
          >
            Ver en la app Rewards
          </a>
          <p className="text-center text-sa-cream/50 text-sm mt-1">
            Con Rewards, cada compra identificada queda guardada en tu historial y suma mancuernas.
          </p>
        </div>
      </div>
    </div>
  )
}
