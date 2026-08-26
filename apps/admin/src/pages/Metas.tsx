import { useEffect, useState } from 'react'
import { sb } from '../lib/sb'
import { metasPorRevisar, revisarMeta, type MetaPorRevisar } from '@shake/supabase'
import { mensajeDeError } from '@shake/utils'
import { PageHeader, Loading, ErrorMsg, cx } from '../ui'

/**
 * La bandeja de capturas por revisar.
 *
 * Las metas de resena y de historia valen 100 y 50 mancuernas — $10 y $5 de
 * producto. Se acreditan solo cuando alguien de aqui mira la captura: sin
 * ese paso, cobrarlas seria subir cualquier imagen.
 *
 * Aprobar acredita en el momento y queda registrado quien lo hizo.
 */
export default function Metas() {
  const [lista, setLista] = useState<MetaPorRevisar[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [hecho, setHecho] = useState<string | null>(null)

  async function cargar() {
    try {
      setLista(await metasPorRevisar(sb))
      setError(null)
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }

  useEffect(() => { void cargar() }, [])

  async function decidir(m: MetaPorRevisar, aprobar: boolean) {
    if (!aprobar && !confirm(`¿Rechazar la captura de ${m.cliente}?`)) return
    setOcupado(m.id)
    setHecho(null)
    try {
      const r = await revisarMeta(sb, m.id, aprobar)
      setHecho(
        aprobar
          ? `${m.cliente}: +${r.mancuernas} mancuernas por "${m.meta}"`
          : `Rechazada la de ${m.cliente}`,
      )
      await cargar()
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setOcupado(null)
    }
  }

  if (!lista && !error) return <Loading>Buscando capturas por revisar…</Loading>

  return (
    <div>
      <PageHeader
        title="Metas"
        subtitle="Capturas que mandaron los clientes para ganar mancuernas"
        action={
          <button className={cx.btnPrimary} onClick={() => void cargar()}>
            Actualizar
          </button>
        }
      />

      {error && <ErrorMsg>{error}</ErrorMsg>}
      {hecho && (
        <div className="mb-4 rounded-sa-lg bg-sa-mint/20 border border-sa-mint/50 px-4 py-3 text-sm text-sa-green-ink">
          {hecho}
        </div>
      )}

      {lista && lista.length === 0 && (
        <div className="bg-sa-mint/20 border border-sa-mint/50 rounded-sa-lg px-6 py-8 text-center">
          <p className="text-4xl mb-2">✅</p>
          <p className="font-display text-2xl text-sa-green-ink">Nada por revisar</p>
          <p className="text-sm text-sa-green-ink/60 mt-1">
            Cuando alguien mande la captura de su reseña, aparece aquí.
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {(lista ?? []).map((m) => (
          <div key={m.id} className="rounded-sa-lg border border-sa-green-ink/10 bg-white p-4">
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display text-lg text-sa-green-ink leading-tight truncate">
                  {m.cliente}
                </p>
                <p className="font-mono text-[11px] text-sa-green-ink/50">
                  {m.codigo ?? 'sin código'} · {m.fecha}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-sa-banana px-2.5 py-1 font-mono text-[11px] font-bold text-sa-green-ink">
                +{m.mancuernas}
              </span>
            </div>

            <p className="text-sm text-sa-green-ink/75 mt-1">{m.meta}</p>
            {m.nota && (
              <p className="text-[13px] text-sa-green-ink/60 mt-1 italic">“{m.nota}”</p>
            )}

            {m.evidencia && (
              // Abre a tamaño completo en otra pestaña: en la miniatura no
              // se alcanza a leer si la reseña es de verdad.
              <a href={m.evidencia} target="_blank" rel="noreferrer" className="block mt-3">
                <img
                  src={m.evidencia}
                  alt="Captura enviada por el cliente"
                  className="w-full max-h-72 object-contain rounded-sa bg-sa-cream-paper border border-sa-green-ink/10"
                />
              </a>
            )}

            <div className="flex gap-2 mt-3">
              <button
                onClick={() => void decidir(m, true)}
                disabled={ocupado === m.id}
                className={`${cx.btnPrimary} flex-1 disabled:opacity-40`}
              >
                {ocupado === m.id ? '…' : 'Aprobar'}
              </button>
              <button
                onClick={() => void decidir(m, false)}
                disabled={ocupado === m.id}
                className="rounded-sa border border-sa-strawberry/50 text-sa-strawberry px-4 text-sm disabled:opacity-40"
              >
                Rechazar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
