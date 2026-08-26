import { Fragment, useEffect, useState } from 'react'
import {
  clientesAdmin, expedienteCliente,
  type ClienteAdmin, type ExpedienteCliente,
} from '@shake/supabase'
import { sb } from '../lib/sb'
import { cx, Panel, PageHeader } from '../ui'
import { mensajeDeError } from '@shake/utils'

/**
 * La base de clientes del programa de lealtad, vista desde gerencia.
 *
 * Cada fila se expande a su expediente: lo que siempre pide (para
 * recomendarle con datos cuando llegue a caja) y sus últimas compras.
 * Los clientes entran solos por dos puertas: Google en Rewards o alta
 * por teléfono en caja — aquí solo se consultan.
 */

function fechaCorta(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const hoy = new Date()
  const ayer = new Date()
  ayer.setDate(hoy.getDate() - 1)
  if (d.toDateString() === hoy.toDateString()) return 'Hoy'
  if (d.toDateString() === ayer.toDateString()) return 'Ayer'
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

export default function Clientes() {
  const [clientes, setClientes] = useState<ClienteAdmin[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [expedientes, setExpedientes] = useState<Record<string, ExpedienteCliente>>({})

  async function cargar(texto: string) {
    setCargando(true)
    try {
      setClientes(await clientesAdmin(sb, texto || null))
      setError(null)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setCargando(false)
    }
  }

  // Búsqueda con un respiro: no dispara una consulta por tecla.
  useEffect(() => {
    const id = setTimeout(() => void cargar(busqueda), 300)
    return () => clearTimeout(id)
  }, [busqueda])

  async function alternarExpediente(id: string) {
    if (abierto === id) {
      setAbierto(null)
      return
    }
    setAbierto(id)
    if (!expedientes[id]) {
      try {
        const e = await expedienteCliente(sb, id)
        setExpedientes((prev) => ({ ...prev, [id]: e }))
      } catch {
        // sin expediente no se cae la lista; la fila muestra "sin compras"
      }
    }
  }

  return (
    <div>
      <PageHeader
        title="Clientes"
        subtitle="La base del programa de lealtad. Se alimenta sola: Google en Rewards o alta por teléfono en caja."
      />

      {error && <p className="mb-4 text-sa-strawberry text-sm font-mono">{error}</p>}

      <Panel className="mb-6">
        <input
          className={cx.input}
          placeholder="Buscar por nombre, teléfono, código SHK o correo…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </Panel>

      <div className={cx.tableWrap}>
        <table className={cx.table}>
          <thead className={cx.thead}>
            <tr>
              <th className={cx.th}>Cliente</th>
              <th className={cx.th}>Contacto</th>
              <th className={cx.th}>Código</th>
              <th className={cx.thNum}>Mancuernas</th>
              <th className={cx.thNum}>Compras</th>
              <th className={cx.th}>Última</th>
              <th className={cx.thNum}>Cupones</th>
            </tr>
          </thead>
          <tbody className={cx.tbody}>
            {cargando && (
              <tr><td className={cx.td} colSpan={7}>Cargando…</td></tr>
            )}
            {!cargando && clientes.length === 0 && (
              <tr>
                <td className={cx.td} colSpan={7}>
                  {busqueda ? 'Nadie coincide con esa búsqueda.' : 'Todavía no hay clientes registrados.'}
                </td>
              </tr>
            )}
            {!cargando && clientes.map((c) => {
              const exp = expedientes[c.id]
              const abiertoEste = abierto === c.id
              return (
                <Fragment key={c.id}>
                  <tr className={`${cx.tr} cursor-pointer`} onClick={() => void alternarExpediente(c.id)}>
                    <td className={cx.td}>
                      <div className="font-medium">{c.nombre}</div>
                      <div className={`text-xs ${cx.muted}`}>
                        {c.con_google ? 'Rewards (Google)' : 'Alta en caja'} · desde {fechaCorta(c.alta)}
                      </div>
                    </td>
                    <td className={cx.td}>
                      <div className="font-mono text-xs">{c.telefono ?? '—'}</div>
                      <div className={`text-xs truncate max-w-[180px] ${cx.muted}`}>{c.email ?? ''}</div>
                    </td>
                    <td className={`${cx.td} font-mono text-xs`}>{c.codigo ?? '—'}</td>
                    <td className={cx.tdNum}>{c.mancuernas}</td>
                    <td className={cx.tdNum}>{c.compras}</td>
                    <td className={cx.td}>{fechaCorta(c.ultima_compra)}</td>
                    <td className={cx.tdNum}>{c.cupones_activos}</td>
                  </tr>
                  {abiertoEste && (
                    <tr>
                      <td colSpan={7} className="px-5 py-4 bg-sa-cream-soft/60">
                        {!exp && <p className={`text-sm ${cx.muted}`}>Cargando expediente…</p>}
                        {exp && (
                          <div className="grid md:grid-cols-2 gap-6">
                            <div>
                              <p className="font-mono text-xs uppercase tracking-wide text-sa-green mb-2">
                                Lo que siempre pide — para recomendarle
                              </p>
                              {exp.favoritos.length === 0 && (
                                <p className={`text-sm ${cx.muted}`}>Aún sin compras identificadas.</p>
                              )}
                              {exp.favoritos.map((f, i) => (
                                <div key={f.producto} className="flex items-center gap-2 py-1 text-sm">
                                  <span className="w-5 h-5 shrink-0 rounded-full bg-sa-green text-sa-cream text-[11px] font-display flex items-center justify-center">
                                    {i + 1}
                                  </span>
                                  <span className="font-medium">{f.producto}</span>
                                  <span className={cx.muted}>· {f.veces === 1 ? '1 vez' : `${f.veces} veces`}</span>
                                </div>
                              ))}
                            </div>
                            <div>
                              <p className="font-mono text-xs uppercase tracking-wide text-sa-green mb-2">
                                Últimas compras
                              </p>
                              {exp.compras.length === 0 && (
                                <p className={`text-sm ${cx.muted}`}>—</p>
                              )}
                              {exp.compras.slice(0, 5).map((h) => (
                                <div key={h.folio} className="py-1 text-sm">
                                  <span className={cx.muted}>{fechaCorta(h.fecha)} · #{h.folio} · </span>
                                  <span>
                                    {(h.items ?? [])
                                      .map((it) => `${it.cantidad > 1 ? `${it.cantidad}× ` : ''}${it.producto}`)
                                      .join(', ')}
                                  </span>
                                  <span className="font-mono tabular-nums"> — ${Number(h.total).toFixed(0)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
