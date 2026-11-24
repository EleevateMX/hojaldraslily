import { useEffect, useMemo, useState } from 'react'
import { sb } from '../lib/sb'
import { registroCambios, type CambioRegistrado } from '@lily/supabase'
import { mxn, fechaHoraEnMerida, mensajeDeError } from '@lily/utils'
import { PageHeader, Loading, ErrorMsg, Panel, Chip, cx } from '../ui'

/**
 * Registro de cancelaciones y modificaciones (gerencia).
 *
 * La casa pidió «registro de modificaciones/cancelaciones». Se guardaba todo
 * (quién autorizó, cuándo, el motivo) pero solo se veía en el turno abierto de
 * la caja. Aquí es un histórico por periodo: qué venta se canceló o cambió, de
 * qué folio, por cuánto, con qué método y quién metió su PIN.
 *
 * `fuente` existe para el arnés `mirar/registro.html`.
 */

const ZONA = 'America/Merida'
const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: ZONA })
function diasAtras(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('en-CA', { timeZone: ZONA })
}

const PERIODOS = ['Hoy', '7 días', '30 días'] as const
/** 0 = Hoy · 1 = 7 días · 2 = 30 días → [desde, hasta]. */
function rango(i: number): [string, string] {
  const hasta = hoy()
  if (i === 0) return [hasta, hasta]
  if (i === 1) return [diasAtras(6), hasta]
  return [diasAtras(29), hasta]
}

const METODO: Record<string, string> = {
  efectivo: 'Efectivo', tarjeta: 'Terminal 1', inbursa: 'Terminal 2',
  transferencia: 'Transferencia', rappi: 'Rappi', mixto: 'Mixto',
}
function metodoLabel(c: CambioRegistrado): string {
  if (c.canal === 'rappi') return 'Rappi'
  return c.metodo_pago ? METODO[c.metodo_pago] ?? c.metodo_pago : '—'
}

export default function Registro({
  fuente = (desde: string, hasta: string) => registroCambios(sb, desde, hasta),
}: {
  fuente?: (desde: string, hasta: string) => Promise<CambioRegistrado[]>
} = {}) {
  const [i, setI] = useState(2) // 30 días
  const [filas, setFilas] = useState<CambioRegistrado[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    setError(null)
    const [desde, hasta] = rango(i)
    fuente(desde, hasta)
      .then((d) => { if (vivo) setFilas(d) })
      .catch((e) => { if (vivo) setError(mensajeDeError(e)) })
    return () => { vivo = false }
  }, [i]) // eslint-disable-line react-hooks/exhaustive-deps

  const resumen = useMemo(() => {
    const f = filas ?? []
    const canceladas = f.filter((x) => x.tipo === 'cancelada')
    const modificadas = f.filter((x) => x.tipo === 'modificada')
    const montoCancelado = canceladas.reduce((a, x) => a + Number(x.total), 0)
    return { canceladas: canceladas.length, modificadas: modificadas.length, montoCancelado }
  }, [filas])

  if (error) return <ErrorMsg>{error}</ErrorMsg>

  return (
    <div className="space-y-5">
      <PageHeader
        title="Registro de cambios"
        subtitle="Cancelaciones y modificaciones de ventas, con quién las autorizó."
        action={
          <div className="inline-flex rounded-sa border border-sa-green-ink/10 bg-white p-0.5">
            {PERIODOS.map((p, idx) => (
              <button
                key={p}
                onClick={() => setI(idx)}
                aria-pressed={i === idx}
                className={`px-3 py-1.5 rounded-sa font-mono text-xs uppercase tracking-wide transition-colors ${
                  i === idx ? 'bg-sa-green text-sa-cream' : 'text-sa-green-ink/60 hover:text-sa-green-ink'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Panel><p className={cx.label}>Cancelaciones</p><p className="text-3xl font-display text-sa-green-ink mt-1">{resumen.canceladas}</p></Panel>
        <Panel><p className={cx.label}>Modificaciones</p><p className="text-3xl font-display text-sa-green-ink mt-1">{resumen.modificadas}</p></Panel>
        <Panel><p className={cx.label}>Devuelto (cancelado)</p><p className={`text-3xl font-display mt-1 ${resumen.montoCancelado > 0 ? 'text-sa-green-deep' : 'text-sa-green-ink'}`}>{mxn(resumen.montoCancelado)}</p></Panel>
      </div>

      {filas === null ? (
        <Loading>Cargando registro…</Loading>
      ) : filas.length === 0 ? (
        <Panel><p className={`text-sm ${cx.muted}`}>No hubo cancelaciones ni modificaciones en este periodo.</p></Panel>
      ) : (
        <div className={cx.tableWrap}>
          <table className={cx.table}>
            <thead className={cx.thead}>
              <tr>
                <th className={cx.th}>Qué pasó</th>
                <th className={cx.th}>Cuándo</th>
                <th className={cx.th}>Folio</th>
                <th className={cx.thNum}>Monto</th>
                <th className={cx.th}>Método</th>
                <th className={cx.th}>Motivo</th>
                <th className={cx.th}>Autorizó</th>
              </tr>
            </thead>
            <tbody className={cx.tbody}>
              {filas.map((c, k) => (
                <tr key={`${c.folio}-${c.tipo}-${k}`} className={cx.tr}>
                  <td className={cx.td}>
                    <Chip tone={c.tipo === 'cancelada' ? 'no' : 'neutral'}>
                      {c.tipo === 'cancelada' ? 'Cancelada' : 'Modificada'}
                    </Chip>
                  </td>
                  <td className={`${cx.td} whitespace-nowrap`}>{fechaHoraEnMerida(c.cuando)}</td>
                  <td className={`${cx.td} font-mono`}>#{c.folio}</td>
                  <td className={cx.tdNum}>{mxn(c.total)}</td>
                  <td className={cx.td}>{metodoLabel(c)}</td>
                  <td className={cx.td}>{c.motivo ?? <span className={cx.muted}>—</span>}</td>
                  <td className={cx.td}>{c.autorizo ?? <span className={cx.muted}>—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
