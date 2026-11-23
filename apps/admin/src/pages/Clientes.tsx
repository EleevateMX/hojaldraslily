import { Fragment, useEffect, useMemo, useState } from 'react'
import { sb } from '../lib/sb'
import { listarEncargos, type Encargo } from '@lily/supabase'
import { mxn, mensajeDeError } from '@lily/utils'
import { PageHeader, Loading, ErrorMsg, Panel, Chip, cx } from '../ui'

/**
 * Clientes: la ficha y el historial de pagos de quien hace encargos.
 *
 * Es el flujo de «pedidos anticipados con seguimiento»: cada cliente, cuántos
 * pedidos, cuánto ha pedido, qué debe y cuándo es su próxima entrega. Se arma
 * de los encargos (agrupados por teléfono, o por nombre si no hay), sin tocar
 * la base: un encargo ya trae su total cotizado y su anticipo.
 *
 * `fuente` existe para el arnés `mirar/clientes.html`.
 */

type Ficha = {
  key: string
  nombre: string
  telefono: string | null
  pedidos: number
  totalPedido: number
  pendiente: number
  anticipos: number
  ultimo: string | null
  proximo: string | null
  encargos: Encargo[]
}

const ZONA = 'America/Merida'
const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: ZONA })

/** Lo que el cliente debe todavía de un encargo (solo los apartados sin saldar). */
function saldoDe(e: Encargo): number {
  return e.estado === 'apartado' ? Math.max(0, Number(e.total) - Number(e.anticipo)) : 0
}

function agrupar(encargos: Encargo[]): Ficha[] {
  const m = new Map<string, Ficha>()
  for (const e of encargos) {
    if (e.estado === 'cancelado') continue
    const tel = (e.telefono ?? '').trim()
    const key = tel ? `tel:${tel}` : `nom:${(e.cliente ?? '').toLowerCase().trim()}`
    const f = m.get(key) ?? { key, nombre: e.cliente, telefono: tel || null, pedidos: 0, totalPedido: 0, pendiente: 0, anticipos: 0, ultimo: null, proximo: null, encargos: [] }
    f.pedidos += 1
    f.totalPedido += Number(e.total)
    f.pendiente += saldoDe(e)
    f.anticipos += Number(e.anticipo)
    f.encargos.push(e)
    const cuando = e.fecha_entrega ?? e.created_at.slice(0, 10)
    if (!f.ultimo || cuando > f.ultimo) { f.ultimo = cuando; f.nombre = e.cliente } // el nombre más reciente
    if ((e.estado === 'apartado' || e.estado === 'pagado') && e.fecha_entrega && e.fecha_entrega >= hoy()) {
      if (!f.proximo || e.fecha_entrega < f.proximo) f.proximo = e.fecha_entrega
    }
    m.set(key, f)
  }
  for (const f of m.values()) f.encargos.sort((a, b) => (b.fecha_entrega ?? b.created_at) < (a.fecha_entrega ?? a.created_at) ? -1 : 1)
  return Array.from(m.values()).sort((a, b) => b.totalPedido - a.totalPedido)
}

const ESTADO_CHIP: Record<Encargo['estado'], { tone: 'si' | 'no' | 'neutral'; txt: string }> = {
  apartado: { tone: 'neutral', txt: 'Apartado' },
  pagado: { tone: 'si', txt: 'Pagado' },
  entregado: { tone: 'si', txt: 'Entregado' },
  cancelado: { tone: 'no', txt: 'Cancelado' },
}

export default function Clientes({
  fuente = () => listarEncargos(sb, true),
}: {
  fuente?: () => Promise<Encargo[]>
} = {}) {
  const [encargos, setEncargos] = useState<Encargo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [abierto, setAbierto] = useState<string | null>(null)

  useEffect(() => {
    fuente()
      .then(setEncargos)
      .catch((e) => setError(mensajeDeError(e)))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fichas = useMemo(() => (encargos ? agrupar(encargos) : []), [encargos])
  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return fichas
    return fichas.filter((f) => f.nombre.toLowerCase().includes(q) || (f.telefono ?? '').includes(q))
  }, [fichas, busca])

  if (error) return <ErrorMsg>{error}</ErrorMsg>
  if (encargos === null) return <Loading>Cargando clientes…</Loading>

  const totalPendiente = fichas.reduce((a, f) => a + f.pendiente, 0)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Clientes"
        subtitle="Quién hace encargos, cuánto ha pedido y qué debe."
        action={
          <input
            type="search" value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nombre o teléfono"
            className={cx.input} style={{ minWidth: '18rem' }}
          />
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Panel><p className={cx.label}>Clientes con encargos</p><p className="text-3xl font-display text-sa-green-ink mt-1">{fichas.length}</p></Panel>
        <Panel><p className={cx.label}>Pedidos (sin cancelar)</p><p className="text-3xl font-display text-sa-green-ink mt-1">{fichas.reduce((a, f) => a + f.pedidos, 0)}</p></Panel>
        <Panel><p className={cx.label}>Saldo pendiente total</p><p className={`text-3xl font-display mt-1 ${totalPendiente > 0 ? 'text-sa-green-deep' : 'text-sa-green-ink'}`}>{mxn(totalPendiente)}</p></Panel>
      </div>

      {filtradas.length === 0 ? (
        <Panel><p className={`text-sm ${cx.muted}`}>{fichas.length === 0 ? 'Todavía no hay encargos de clientes.' : 'Ningún cliente coincide con la búsqueda.'}</p></Panel>
      ) : (
        <div className={cx.tableWrap}>
          <table className={cx.table}>
            <thead className={cx.thead}>
              <tr>
                <th className={cx.th}>Cliente</th>
                <th className={cx.th}>Teléfono</th>
                <th className={cx.thNum}>Pedidos</th>
                <th className={cx.thNum}>Total pedido</th>
                <th className={cx.thNum}>Debe</th>
                <th className={cx.th}>Próxima entrega</th>
                <th className={cx.th} />
              </tr>
            </thead>
            <tbody className={cx.tbody}>
              {filtradas.map((f) => (
                <Fragment key={f.key}>
                  <tr className={cx.tr}>
                    <td className={`${cx.td} font-medium`}>{f.nombre}</td>
                    <td className={`${cx.td} font-mono text-xs`}>{f.telefono ?? '—'}</td>
                    <td className={cx.tdNum}>{f.pedidos}</td>
                    <td className={cx.tdNum}>{mxn(f.totalPedido)}</td>
                    <td className={cx.tdNum}>{f.pendiente > 0 ? <b className="text-sa-green-deep">{mxn(f.pendiente)}</b> : <span className={cx.muted}>—</span>}</td>
                    <td className={cx.td}>{f.proximo ?? <span className={cx.muted}>—</span>}</td>
                    <td className={cx.td}>
                      <button className={cx.btnSec} onClick={() => setAbierto(abierto === f.key ? null : f.key)}>
                        {abierto === f.key ? 'Ocultar' : 'Historial'}
                      </button>
                    </td>
                  </tr>
                  {abierto === f.key && (
                    <tr>
                      <td className="p-0" colSpan={7}>
                        <div className="px-4 py-3 bg-sa-cream-soft/40">
                          <p className={`${cx.label} mb-2`}>Historial de {f.nombre} — {f.encargos.length} encargo{f.encargos.length === 1 ? '' : 's'}</p>
                          <div className="space-y-1.5">
                            {f.encargos.map((e) => {
                              const saldo = saldoDe(e)
                              return (
                                <div key={e.id} className="flex items-center justify-between gap-3 bg-white rounded-sa border border-sa-green-ink/5 px-3 py-2">
                                  <div className="min-w-0 flex items-center gap-2 flex-wrap">
                                    <span className="font-mono text-xs text-sa-green-ink/60">{e.folio ? `#${e.folio}` : 'Pendiente'}</span>
                                    <Chip tone={ESTADO_CHIP[e.estado].tone}>{ESTADO_CHIP[e.estado].txt}</Chip>
                                    <span className="text-sm text-sa-green-ink">{e.fecha_entrega ?? e.created_at.slice(0, 10)}{e.hora_entrega ? ` · ${e.hora_entrega}` : ''}</span>
                                    <span className="text-xs text-sa-green-ink/50 truncate">{e.items.map((it) => `${it.cantidad} ${it.producto}`).join(' · ')}</span>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <p className="font-mono text-sm text-sa-green-ink">{mxn(e.total)}</p>
                                    {saldo > 0
                                      ? <p className="font-mono text-xs text-sa-green-deep">debe {mxn(saldo)}</p>
                                      : Number(e.anticipo) > 0 && e.estado === 'apartado'
                                        ? <p className="font-mono text-xs text-sa-green-ink/50">anticipo {mxn(e.anticipo)}</p>
                                        : null}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
