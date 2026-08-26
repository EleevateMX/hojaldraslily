import hojaldra from '@shake/brand/hojaldra.png'
import { useEffect, useMemo, useState } from 'react'
import { sb } from './lib/sb'
import { listarPedidosActivos, suscribirPedidosCocina } from '@shake/supabase'
import type { PedidoConItems } from '@shake/supabase'
import { mensajeDeError } from '@shake/utils'

interface FolioAgrupado {
  folio: number
  listo: boolean
}

/** Agrupa los pedidos por folio. Un folio solo está "listo" si TODAS
 *  sus filas (una por cocina) están en estado 'listo'. */
function agruparPorFolio(pedidos: PedidoConItems[]): FolioAgrupado[] {
  const mapa = new Map<number, boolean>()
  for (const p of pedidos) {
    const folio = p.ordenes?.folio
    if (folio == null) continue
    const estaListo = p.estado === 'listo'
    const previo = mapa.get(folio)
    mapa.set(folio, previo == null ? estaListo : previo && estaListo)
  }
  return [...mapa.entries()]
    .map(([folio, listo]) => ({ folio, listo }))
    .sort((a, b) => a.folio - b.folio)
}

export default function App() {
  const [pedidos, setPedidos] = useState<PedidoConItems[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloj, setReloj] = useState(() => new Date())

  async function recargar() {
    try {
      setPedidos(await listarPedidosActivos(sb))
      setError(null)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    void recargar()
    const desuscribir = suscribirPedidosCocina(sb, () => void recargar())
    // Respaldo por si el realtime se cae.
    const intervalo = setInterval(() => void recargar(), 15_000)
    const tick = setInterval(() => setReloj(new Date()), 1_000)
    return () => {
      desuscribir()
      clearInterval(intervalo)
      clearInterval(tick)
    }
  }, [])

  const folios = useMemo(() => agruparPorFolio(pedidos), [pedidos])
  const enPreparacion = folios.filter((f) => !f.listo)
  const listos = folios.filter((f) => f.listo)

  if (cargando) {
    return (
      <div className="h-screen w-full bg-sa-green-deep text-sa-cream flex items-center justify-center">
        <p className="font-display text-4xl text-sa-cream/80">Cargando pedidos…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-screen w-full bg-sa-green-deep flex items-center justify-center px-12 text-center">
        <div>
          <p className="font-display text-4xl text-sa-strawberry">Error</p>
          <p className="font-mono text-lg text-sa-cream/60 mt-4 max-w-[60ch]">{error}</p>
        </div>
      </div>
    )
  }

  const hora = reloj.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="h-screen w-full bg-sa-green-deep text-sa-cream flex flex-col overflow-hidden relative">
      {/* Decorative blobs */}
      <div className="pointer-events-none absolute -top-40 -left-40 w-[520px] h-[520px] rounded-full bg-sa-mint/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-48 -right-40 w-[620px] h-[620px] rounded-full bg-sa-banana/10 blur-3xl" />

      {/* Header */}
      <header className="relative flex-shrink-0 flex items-center justify-between gap-6 px-10 md:px-14 py-6 border-b-2 border-sa-cream/15">
        <div className="flex items-center gap-5">
          <img src={hojaldra} alt="Hojaldra de la casa" className="h-16 w-auto drop-shadow-[0_10px_24px_rgba(0,0,0,0.35)]" />
          <h1 className="font-display text-[clamp(28px,3.4vw,54px)] leading-none text-sa-cream">
            Hojaldras Lily
            <span className="block font-body font-medium text-sa-mint text-[clamp(13px,1vw,18px)] tracking-[0.25em] uppercase mt-2">
              Estado de tu pedido
            </span>
          </h1>
        </div>
        <span className="font-mono text-[clamp(32px,4vw,64px)] font-medium text-sa-mint tabular-nums tracking-tight">
          {hora}
        </span>
      </header>

      {/* Columns */}
      <div className="relative flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 p-6 md:p-10 overflow-hidden">
        {/* En preparación */}
        <section className="flex flex-col bg-sa-green rounded-sa-lg border-2 border-sa-mango/60 p-6 md:p-8 overflow-hidden">
          <h2 className="flex-shrink-0 text-center font-display text-[clamp(24px,2.6vw,40px)] leading-none text-sa-banana pb-5 mb-6 border-b-2 border-sa-cream/10">
            En preparación
          </h2>
          {enPreparacion.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="font-mono text-lg uppercase tracking-[0.3em] text-sa-cream/35 text-center">
                Sin pedidos en preparación
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-5 content-start">
                {enPreparacion.map((f) => (
                  <div
                    key={f.folio}
                    className="rounded-sa border-2 border-sa-mango bg-sa-cream/[0.06] text-sa-banana text-center py-7 px-3"
                  >
                    <span className="block font-display text-[clamp(48px,6vw,84px)] leading-none tabular-nums">
                      {f.folio}
                    </span>
                    <span className="block font-mono text-xs uppercase tracking-[0.3em] opacity-70 mt-3">
                      Folio
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Listo para recoger */}
        <section className="flex flex-col bg-sa-green rounded-sa-lg border-2 border-sa-mint p-6 md:p-8 overflow-hidden">
          <h2 className="flex-shrink-0 text-center font-display text-[clamp(24px,2.6vw,40px)] leading-none text-sa-mint pb-5 mb-6 border-b-2 border-sa-cream/10">
            Listo para recoger
          </h2>
          {listos.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="font-mono text-lg uppercase tracking-[0.3em] text-sa-cream/35 text-center">
                Sin pedidos listos
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-5 content-start">
                {listos.map((f) => (
                  <div
                    key={f.folio}
                    className="rounded-sa bg-sa-mint text-sa-green-ink text-center py-7 px-3 shadow-[0_0_32px_rgba(136,192,160,0.4)]"
                  >
                    <span className="block font-display text-[clamp(48px,6vw,84px)] leading-none tabular-nums">
                      {f.folio}
                    </span>
                    <span className="block font-mono text-xs uppercase tracking-[0.3em] opacity-70 mt-3">
                      Folio
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
