import { useEffect, useState } from 'react'
import { sb } from '../lib/sb'
import { ventasDiarias, productosMasVendidos } from '@shake/supabase'
import type { VentaDiaria, ProductoVendido } from '@shake/types'
import { mxn, mensajeDeError } from '@shake/utils'
import { PageHeader, Loading, ErrorMsg, Panel, cx } from '../ui'

export default function Ventas() {
  const [dias, setDias] = useState<VentaDiaria[]>([])
  const [top, setTop] = useState<ProductoVendido[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([ventasDiarias(sb, 30), productosMasVendidos(sb, 10)])
      .then(([d, t]) => {
        // Más recientes primero para la vista.
        setDias([...d].reverse())
        setTop(t)
        setError(null)
      })
      .catch((e) => setError(mensajeDeError(e)))
      .finally(() => setCargando(false))
  }, [])

  if (cargando) return <Loading>Cargando ventas…</Loading>

  return (
    <div>
      <PageHeader title="Ventas" subtitle="Reportes de ventas y productos" />

      {error && <ErrorMsg>{error}</ErrorMsg>}

      <div className="space-y-6">
        <div>
          <h3 className={`${cx.h3} mb-4`}>Ventas diarias (últimos 30 días)</h3>
          {dias.length === 0 ? (
            <Panel><p className={cx.muted}>Sin ventas registradas en el periodo.</p></Panel>
          ) : (
            <div className={cx.tableWrap}>
              <table className={cx.table}>
                <thead>
                  <tr className={cx.thead}>
                    <th className={cx.th}>Día</th>
                    <th className={cx.thNum}>Órdenes</th>
                    <th className={cx.thNum}>Total</th>
                    <th className={cx.thNum}>Ticket prom.</th>
                    <th className={cx.thNum}>Efectivo</th>
                    <th className={cx.thNum}>Tarjeta</th>
                    <th className={cx.thNum}>Clip</th>
                    <th className={cx.thNum}>Cortesía</th>
                    <th className={cx.thNum}>Otro</th>
                  </tr>
                </thead>
                <tbody className={cx.tbody}>
                  {dias.map((d) => (
                    <tr key={d.dia ?? Math.random()} className={cx.tr}>
                      <td className={`${cx.td} font-medium`}>{d.dia ?? '—'}</td>
                      <td className={cx.tdNum}>{d.num_ordenes ?? 0}</td>
                      <td className={cx.tdNum}>{mxn(d.total_ventas)}</td>
                      <td className={cx.tdNum}>{mxn(d.ticket_promedio)}</td>
                      <td className={cx.tdNum}>{mxn(d.efectivo)}</td>
                      <td className={cx.tdNum}>{mxn(d.tarjeta)}</td>
                      <td className={cx.tdNum}>{mxn(d.clip)}</td>
                      <td className={cx.tdNum}>{mxn(d.cortesia)}</td>
                      <td className={cx.tdNum}>{mxn(d.otro)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <h3 className={`${cx.h3} mb-4`}>Productos más vendidos (top 10)</h3>
          {top.length === 0 ? (
            <Panel><p className={cx.muted}>Sin datos de productos vendidos.</p></Panel>
          ) : (
            <div className={cx.tableWrap}>
              <table className={cx.table}>
                <thead>
                  <tr className={cx.thead}>
                    <th className={cx.th}>Producto</th>
                    <th className={cx.th}>Categoría</th>
                    <th className={cx.thNum}>Total vendido</th>
                    <th className={cx.thNum}>Total ingresos</th>
                  </tr>
                </thead>
                <tbody className={cx.tbody}>
                  {top.map((p) => (
                    <tr key={p.id ?? Math.random()} className={cx.tr}>
                      <td className={`${cx.td} font-medium`}>{p.nombre ?? '—'}</td>
                      <td className={cx.td}>{p.categoria ?? '—'}</td>
                      <td className={cx.tdNum}>{p.total_vendido ?? 0}</td>
                      <td className={cx.tdNum}>{mxn(p.total_ingresos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
