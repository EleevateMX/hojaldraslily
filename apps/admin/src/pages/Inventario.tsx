import { useEffect, useState } from 'react'
import { sb } from '../lib/sb'
import { stockPorAlmacen } from '@shake/supabase'
import type { StockAlmacen } from '@shake/types'
import { PageHeader, Loading, ErrorMsg, Panel, cx } from '../ui'
import { mensajeDeError } from '@shake/utils'

export default function Inventario() {
  const [stock, setStock] = useState<StockAlmacen[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    stockPorAlmacen(sb)
      .then(setStock)
      .catch((e) => setError(mensajeDeError(e)))
      .finally(() => setCargando(false))
  }, [])

  if (cargando) return <Loading>Cargando inventario…</Loading>

  return (
    <div>
      <PageHeader title="Inventario" subtitle="Stock por almacén" />

      {error && <ErrorMsg>{error}</ErrorMsg>}

      {stock.length === 0 ? (
        <Panel><p className={cx.muted}>Sin existencias registradas.</p></Panel>
      ) : (
        <div className={cx.tableWrap}>
          <table className={cx.table}>
            <thead>
              <tr className={cx.thead}>
                <th className={cx.th}>Insumo</th>
                <th className={cx.th}>Almacén</th>
                <th className={cx.thNum}>Stock actual</th>
                <th className={cx.thNum}>Stock mínimo</th>
                <th className={cx.th}>Unidad</th>
              </tr>
            </thead>
            <tbody className={cx.tbody}>
              {stock.map((s) => (
                <tr key={s.id ?? Math.random()} className={`${cx.tr} ${s.bajo_minimo ? 'bg-sa-strawberry/5' : ''}`}>
                  <td className={`${cx.td} font-medium`}>{s.insumo ?? '—'}</td>
                  <td className={cx.td}>{s.almacen ?? '—'}</td>
                  <td className={`${cx.tdNum} ${s.bajo_minimo ? 'text-sa-strawberry font-semibold' : ''}`}>{s.stock_actual ?? 0}</td>
                  <td className={cx.tdNum}>{s.stock_minimo ?? 0}</td>
                  <td className={cx.td}>{s.unidad ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
