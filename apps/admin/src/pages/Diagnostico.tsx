import { useEffect, useState } from 'react'
import { sb } from '../lib/sb'
import { diagnosticoSistema, type Diagnostico as TipoDiagnostico, type HallazgoDiagnostico } from '@shake/supabase'
import { mensajeDeError } from '@shake/utils'
import { PageHeader, Loading, ErrorMsg, cx } from '../ui'

const SEVERIDAD: Record<string, { etiqueta: string; caja: string; punto: string }> = {
  alta: {
    etiqueta: 'Atender hoy',
    caja: 'bg-sa-strawberry/10 border-sa-strawberry/40',
    punto: 'bg-sa-strawberry',
  },
  media: {
    etiqueta: 'Cuando puedas',
    caja: 'bg-sa-banana/15 border-sa-banana/50',
    punto: 'bg-sa-banana',
  },
  baja: {
    etiqueta: 'Solo para que lo sepas',
    caja: 'bg-white border-sa-green-ink/10',
    punto: 'bg-sa-green/40',
  },
}

const ICONO_AREA: Record<string, string> = {
  Cobros: '💳',
  Inventario: '📦',
  Impresión: '🖨️',
  Comandas: '🧾',
  Catálogo: '🥤',
  Costeos: '📊',
  Rewards: '⭐',
}

const ORDEN: Record<string, number> = { alta: 0, media: 1, baja: 2 }

/**
 * El chequeo médico del sistema.
 *
 * El tablero de "Sistema" dice cuántos problemas hay; esto dice cuáles,
 * qué tan graves son y qué hacer con cada uno — con ejemplos concretos,
 * porque un número suelto no se puede perseguir pero "folio 711" sí.
 *
 * Incluye a propósito lo que pasa FUERA del punto de venta (Rewards) y la
 * basura de datos que se acumula sola: son las fallas que nadie reporta
 * porque nadie las ve.
 */
export default function Diagnostico() {
  const [dx, setDx] = useState<TipoDiagnostico | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revisando, setRevisando] = useState(false)

  async function revisar() {
    setRevisando(true)
    try {
      setDx(await diagnosticoSistema(sb))
      setError(null)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setRevisando(false)
    }
  }

  useEffect(() => { void revisar() }, [])

  if (!dx && !error) return <Loading>Revisando el sistema…</Loading>

  const hallazgos = [...(dx?.hallazgos ?? [])].sort(
    (a, b) => (ORDEN[a.severidad] ?? 3) - (ORDEN[b.severidad] ?? 3),
  )
  const graves = hallazgos.filter((h) => h.severidad === 'alta').length

  return (
    <div>
      <PageHeader
        title="Diagnóstico"
        subtitle="Qué está fallando, qué tan grave es y qué hacer al respecto"
        action={
          <div className="flex items-center gap-3">
            {dx && (
              <span className="font-mono text-xs text-sa-green-ink/50">
                revisado {dx.revisado_en}
              </span>
            )}
            <button className={cx.btnPrimary} onClick={() => void revisar()} disabled={revisando}>
              {revisando ? 'Revisando…' : 'Revisar de nuevo'}
            </button>
          </div>
        }
      />

      {error && <ErrorMsg>{error}</ErrorMsg>}

      {dx && hallazgos.length === 0 && (
        <div className="bg-sa-mint/20 border border-sa-mint/50 rounded-sa-lg px-6 py-8 text-center">
          <p className="text-4xl mb-2">✅</p>
          <p className="font-display text-2xl text-sa-green-ink">Todo en orden</p>
          <p className="text-sm text-sa-green-ink/60 mt-1">
            No encontré nada raro: ni cobros atorados, ni comandas perdidas, ni datos rotos.
          </p>
        </div>
      )}

      {dx && hallazgos.length > 0 && (
        <>
          <p className="text-sm text-sa-green-ink/70 mb-5">
            {graves > 0 ? (
              <>
                <b className="text-sa-strawberry">{graves} {graves === 1 ? 'cosa necesita' : 'cosas necesitan'} atención hoy</b>
                {hallazgos.length > graves && <> · {hallazgos.length - graves} más pueden esperar</>}
              </>
            ) : (
              <>Nada urgente. {hallazgos.length} {hallazgos.length === 1 ? 'detalle' : 'detalles'} por revisar cuando puedas.</>
            )}
          </p>

          <div className="space-y-3">
            {hallazgos.map((h, i) => <Tarjeta key={`${h.titulo}-${i}`} h={h} />)}
          </div>
        </>
      )}
    </div>
  )
}

function Tarjeta({ h }: { h: HallazgoDiagnostico }) {
  const s = SEVERIDAD[h.severidad] ?? SEVERIDAD.baja
  return (
    <div className={`rounded-sa-lg border p-5 ${s.caja}`}>
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none mt-0.5">{ICONO_AREA[h.area] ?? '•'}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/50">
              {h.area}
            </span>
            <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/60">
              <span className={`w-1.5 h-1.5 rounded-full ${s.punto}`} />
              {s.etiqueta}
            </span>
            {h.cuantos > 0 && (
              <span className="font-mono text-[10px] text-sa-green-ink/45">
                {h.cuantos} {h.cuantos === 1 ? 'caso' : 'casos'}
              </span>
            )}
          </div>

          <h3 className="font-display text-xl text-sa-green-ink leading-tight mt-1">{h.titulo}</h3>
          <p className="text-sm text-sa-green-ink/75 mt-1.5 leading-snug">{h.detalle}</p>

          <div className="mt-3 flex items-start gap-2 bg-white/70 rounded-sa px-3 py-2">
            <span className="text-sm leading-none mt-0.5">👉</span>
            <p className="text-sm text-sa-green-ink/85">{h.que_hacer}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
