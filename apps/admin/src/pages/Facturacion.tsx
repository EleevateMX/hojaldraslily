import { useEffect, useMemo, useState } from 'react'
import { sb } from '../lib/sb'
import {
  ventasDelDia, ventasDelPeriodo, facturasListar,
  timbrarGlobal, timbrarPeriodo, timbrarManual,
  type VentaDelDia, type VentaDelPeriodo, type FacturaGlobal,
  type ResultadoTimbrado, type PeriodicidadGlobal,
} from '@lily/supabase'
import { mxn, mensajeDeError } from '@lily/utils'
import { PageHeader, Loading, ErrorMsg, OkMsg, Panel, Field, Chip, cx } from '../ui'
import FacturacionCliente from './FacturacionCliente'

/**
 * Admin → Facturación: la factura GLOBAL con ContaDigital (Isyconta), en tres
 * formas (sub-switch dentro de «global»):
 *
 *   * **Por día** — un día, un renglón por folio real. Lo normal.
 *   * **Por periodo** — un rango de fechas: suma los folios reales del rango.
 *     El total lo sigue poniendo el servidor.
 *   * **Monto manual** — la contadora teclea el importe de un periodo. Es el
 *     puente de la transición mientras el POS no captura todas las ventas; va
 *     marcado y es el único camino donde el total NO lo pone el servidor.
 *
 * El botón «Timbrar» dispara la Edge Function `contadigital-facturar` con el
 * `modo` correspondiente; la API Key nunca toca el navegador. El pan va a TASA
 * 0% de IVA, así que subtotal = total.
 *
 * `fuente*`/`alTimbrar*` existen para el arnés de `mirar/facturacion.html`.
 */

const ZONA = 'America/Merida'
const hoyMerida = () => new Date().toLocaleDateString('en-CA', { timeZone: ZONA })
function diasAtras(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('en-CA', { timeZone: ZONA })
}
const inicioDeMes = () => `${hoyMerida().slice(0, 7)}-01`
const soloDigitos = (s: string) => s.replaceAll('-', '')

type SubModo = 'dia' | 'periodo' | 'manual'

/** El FolioOriginal con el que la Edge Function identifica cada global. */
function folioEsperado(sub: SubModo, fecha: string, desde: string, hasta: string): string {
  if (sub === 'dia') return `GLOBAL-${soloDigitos(fecha)}`
  if (sub === 'periodo') return `GLOBAL-${soloDigitos(desde)}-${soloDigitos(hasta)}`
  return `GLOBAL-MANUAL-${soloDigitos(desde)}-${soloDigitos(hasta)}`
}

function EstatusChip({ e }: { e: FacturaGlobal['estatus'] }) {
  if (e === 'timbrada') return <Chip tone="si">Timbrada</Chip>
  if (e === 'error') return <Chip tone="no">Error</Chip>
  if (e === 'cancelada') return <Chip tone="neutral">Cancelada</Chip>
  return <Chip tone="neutral">Pendiente</Chip>
}

export default function Facturacion({
  fuenteVentas = (f: string) => ventasDelDia(sb, f),
  fuenteVentasPeriodo = (d: string, h: string) => ventasDelPeriodo(sb, d, h),
  fuenteFacturas = (d: string, h: string) => facturasListar(sb, d, h),
  alTimbrar = (f: string) => timbrarGlobal(sb, f),
  alTimbrarPeriodo = (a: { desde: string; hasta: string; periodicidad?: PeriodicidadGlobal }) => timbrarPeriodo(sb, a),
  alTimbrarManual = (a: { desde: string; hasta: string; total: number; periodicidad?: PeriodicidadGlobal }) => timbrarManual(sb, a),
}: {
  fuenteVentas?: (fecha: string) => Promise<VentaDelDia[]>
  fuenteVentasPeriodo?: (desde: string, hasta: string) => Promise<VentaDelPeriodo[]>
  fuenteFacturas?: (desde: string, hasta: string) => Promise<FacturaGlobal[]>
  alTimbrar?: (fecha: string) => Promise<ResultadoTimbrado>
  alTimbrarPeriodo?: (a: { desde: string; hasta: string; periodicidad?: PeriodicidadGlobal }) => Promise<ResultadoTimbrado>
  alTimbrarManual?: (a: { desde: string; hasta: string; total: number; periodicidad?: PeriodicidadGlobal }) => Promise<ResultadoTimbrado>
} = {}) {
  // Global (a público en general) o nominativa (a un cliente).
  const [modo, setModo] = useState<'global' | 'cliente'>('global')
  const [sub, setSub] = useState<SubModo>('dia')

  const [fecha, setFecha] = useState(hoyMerida)
  const [desde, setDesde] = useState(inicioDeMes)
  const [hasta, setHasta] = useState(hoyMerida)
  const [periodicidad, setPeriodicidad] = useState<PeriodicidadGlobal>('04')
  const [montoManual, setMontoManual] = useState('')

  const [ventas, setVentas] = useState<VentaDelDia[]>([])
  const [ventasPeriodo, setVentasPeriodo] = useState<VentaDelPeriodo[]>([])
  const [facturas, setFacturas] = useState<FacturaGlobal[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [timbrando, setTimbrando] = useState(false)

  async function cargar() {
    setCargando(true); setError(null)
    try {
      const fac = fuenteFacturas(diasAtras(90), hoyMerida())
      if (sub === 'dia') {
        const [vs, fs] = await Promise.all([fuenteVentas(fecha), fac])
        setVentas(vs); setFacturas(fs)
      } else if (sub === 'periodo') {
        const [vs, fs] = await Promise.all([fuenteVentasPeriodo(desde, hasta), fac])
        setVentasPeriodo(vs); setFacturas(fs)
      } else {
        setFacturas(await fac)
      }
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setCargando(false)
    }
  }
  useEffect(() => { void cargar() }, [sub, fecha, desde, hasta]) // eslint-disable-line react-hooks/exhaustive-deps

  const totalDia = useMemo(() => ventas.reduce((s, v) => s + Number(v.total), 0), [ventas])
  const totalPeriodo = useMemo(() => ventasPeriodo.reduce((s, v) => s + Number(v.total), 0), [ventasPeriodo])
  const montoNum = Number(montoManual)

  const numFolios = sub === 'dia' ? ventas.length : sub === 'periodo' ? ventasPeriodo.length : null
  const totalMostrado = sub === 'dia' ? totalDia : sub === 'periodo' ? totalPeriodo : (montoNum || 0)

  const yaTimbrada = useMemo(() => {
    const fo = folioEsperado(sub, fecha, desde, hasta)
    return facturas.find((f) => f.folio_original === fo && f.estatus === 'timbrada') ?? null
  }, [facturas, sub, fecha, desde, hasta])

  const puedeTimbrar =
    sub === 'manual' ? montoNum > 0 && !!desde && !!hasta && hasta >= desde
    : sub === 'periodo' ? ventasPeriodo.length > 0
    : ventas.length > 0

  async function timbrar() {
    setTimbrando(true); setError(null); setOk(null); setAviso(null)
    try {
      let r: ResultadoTimbrado
      if (sub === 'dia') r = await alTimbrar(fecha)
      else if (sub === 'periodo') r = await alTimbrarPeriodo({ desde, hasta, periodicidad })
      else r = await alTimbrarManual({ desde, hasta, total: montoNum, periodicidad })

      if (r.ok && r.factura) {
        setOk(r.yaExistia
          ? `Ese periodo ya estaba facturado (UUID ${r.factura.uuid ?? '—'}).`
          : `Factura timbrada. UUID ${r.factura.uuid ?? '—'}.`)
        await cargar()
      } else {
        // Errores de negocio con mensaje claro (empresa no dada de alta, sin
        // ventas, faltan secretos…): se dice tal cual, no es falla del sistema.
        setAviso(r.error?.mensaje ?? 'ContaDigital no timbró la factura.')
      }
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setTimbrando(false)
    }
  }

  const periodoLabel = ([['04', 'Mensual'], ['03', 'Quincenal'], ['02', 'Semanal']] as const)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Facturación"
        subtitle="Factura global a público en general, o nominativa a un cliente (persona física o moral)."
      />

      <div className="flex gap-2">
        {([['global', 'Factura global'], ['cliente', 'Facturar a un cliente']] as const).map(([m, label]) => (
          <button
            key={m}
            onClick={() => setModo(m)}
            aria-pressed={modo === m}
            className={modo === m ? cx.btnPrimary : cx.btnSec}
          >
            {label}
          </button>
        ))}
      </div>

      {modo === 'cliente' ? <FacturacionCliente /> : (
      <>
      {/* Sub-switch: por día, por periodo o monto manual */}
      <div className="flex flex-wrap gap-2">
        {([['dia', 'Por día'], ['periodo', 'Por periodo'], ['manual', 'Monto manual']] as const).map(([m, label]) => (
          <button
            key={m}
            onClick={() => { setSub(m); setOk(null); setAviso(null); setError(null) }}
            aria-pressed={sub === m}
            className={`rounded-sa px-3 py-1.5 text-sm ${sub === m ? 'bg-sa-green text-sa-cream-paper' : 'bg-sa-cream-soft text-sa-green-ink'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {sub === 'manual' && (
        <div className="rounded-sa border border-sa-banana/50 bg-sa-banana/15 px-4 py-3 text-sm text-sa-green-ink">
          <b>Monto manual (transición).</b> Aquí el importe lo escribe la contadora; no sale de las ventas
          registradas. Úsalo mientras el sistema entra en operación. Queda marcado como «manual» en el historial.
        </div>
      )}

      {error && <ErrorMsg>{error}</ErrorMsg>}
      {ok && <OkMsg>{ok}</OkMsg>}
      {aviso && (
        <div className="rounded-sa border border-sa-banana/50 bg-sa-banana/15 px-4 py-3 text-sm text-sa-green-ink">
          {aviso}
        </div>
      )}

      <Panel>
        <div className="flex flex-wrap items-end gap-4">
          {sub === 'dia' ? (
            <>
              <Field label="Día a facturar">
                <input type="date" value={fecha} max={hoyMerida()} onChange={(e) => setFecha(e.target.value)} className={cx.input} />
              </Field>
              <div className="flex gap-2">
                <button className={cx.btnSec} onClick={() => setFecha(hoyMerida())}>Hoy</button>
                <button className={cx.btnSec} onClick={() => setFecha(diasAtras(1))}>Ayer</button>
              </div>
            </>
          ) : (
            <>
              <Field label="Desde">
                <input type="date" value={desde} max={hasta || hoyMerida()} onChange={(e) => setDesde(e.target.value)} className={cx.input} />
              </Field>
              <Field label="Hasta">
                <input type="date" value={hasta} max={hoyMerida()} onChange={(e) => setHasta(e.target.value)} className={cx.input} />
              </Field>
              <Field label="Periodicidad (SAT)">
                <select value={periodicidad} onChange={(e) => setPeriodicidad(e.target.value as PeriodicidadGlobal)} className={cx.input}>
                  {periodoLabel.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Field>
              {sub === 'manual' && (
                <Field label="Importe a facturar (MXN)">
                  <input
                    type="number" min="0" step="0.01" inputMode="decimal"
                    value={montoManual} onChange={(e) => setMontoManual(e.target.value)}
                    placeholder="0.00" className={cx.input}
                  />
                </Field>
              )}
            </>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-6">
          {numFolios !== null && (
            <div>
              <p className={cx.label}>Folios del periodo</p>
              <p className="font-display text-2xl text-sa-green-ink">{numFolios}</p>
            </div>
          )}
          <div>
            <p className={cx.label}>Total a facturar</p>
            <p className="font-display text-2xl text-sa-green-ink">{mxn(totalMostrado)}</p>
          </div>
          <div className="ml-auto">
            {yaTimbrada ? (
              <div className="text-right">
                <EstatusChip e="timbrada" />
                <p className={`mt-1 text-xs ${cx.muted}`}>Este periodo ya está facturado</p>
              </div>
            ) : (
              <button
                className={cx.btnPrimary}
                disabled={timbrando || !puedeTimbrar}
                onClick={() => void timbrar()}
              >
                {timbrando ? 'Timbrando…' : sub === 'manual' ? 'Timbrar monto manual' : 'Timbrar factura global'}
              </button>
            )}
          </div>
        </div>
      </Panel>

      {/* Lo que va en la factura (día o periodo; en manual no hay folios) */}
      {sub !== 'manual' && (
        <div>
          <p className={`${cx.h3} mb-2`}>
            {sub === 'dia' ? `Lo que va en la factura del ${fecha}` : `Lo que va en la factura del ${desde} al ${hasta}`}
          </p>
          {cargando ? (
            <Loading>Cargando…</Loading>
          ) : (sub === 'dia' ? ventas.length === 0 : ventasPeriodo.length === 0) ? (
            <Panel><p className={`text-sm ${cx.muted}`}>No hay ventas por facturar en ese periodo.</p></Panel>
          ) : (
            <div className={cx.tableWrap}>
              <table className={cx.table}>
                <thead className={cx.thead}>
                  <tr>
                    <th className={cx.th}>Folio</th>
                    {sub === 'periodo' && <th className={cx.th}>Día</th>}
                    <th className={cx.th}>Hora</th>
                    <th className={cx.th}>Canal</th>
                    <th className={cx.thNum}>Total</th>
                  </tr>
                </thead>
                <tbody className={cx.tbody}>
                  {(sub === 'dia' ? ventas : ventasPeriodo).map((v) => (
                    <tr key={v.folio} className={cx.tr}>
                      <td className={cx.td}>Folio {v.folio}</td>
                      {sub === 'periodo' && <td className={cx.td}>{(v as VentaDelPeriodo).fecha}</td>}
                      <td className={cx.td}>{v.hora}</td>
                      <td className={cx.td}>{v.canal}</td>
                      <td className={cx.tdNum}>{mxn(v.total)}</td>
                    </tr>
                  ))}
                  <tr className="bg-sa-cream-soft font-semibold">
                    <td className={cx.td} colSpan={sub === 'periodo' ? 4 : 3}>Total del periodo</td>
                    <td className={cx.tdNum}>{mxn(totalMostrado)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div>
        <p className={`${cx.h3} mb-2`}>Facturas timbradas</p>
        {facturas.length === 0 ? (
          <Panel><p className={`text-sm ${cx.muted}`}>Todavía no hay facturas.</p></Panel>
        ) : (
          <div className={cx.tableWrap}>
            <table className={cx.table}>
              <thead className={cx.thead}>
                <tr>
                  <th className={cx.th}>Día</th>
                  <th className={cx.th}>Estatus</th>
                  <th className={cx.th}>Folios</th>
                  <th className={cx.thNum}>Total</th>
                  <th className={cx.th}>UUID</th>
                  <th className={cx.th}>Comprobante</th>
                </tr>
              </thead>
              <tbody className={cx.tbody}>
                {facturas.map((f) => (
                  <tr key={f.id} className={cx.tr}>
                    <td className={cx.td}>{f.fecha}</td>
                    <td className={cx.td}><EstatusChip e={f.estatus} /></td>
                    <td className={cx.td}>{f.num_folios}</td>
                    <td className={cx.tdNum}>{mxn(f.total)}</td>
                    <td className={`${cx.td} font-mono text-xs`}>{f.uuid ?? (f.mensaje ? `— ${f.mensaje}` : '—')}</td>
                    <td className={cx.td}>
                      <div className="flex gap-3">
                        {f.pdf_link && <a className="text-sa-green underline" href={f.pdf_link} target="_blank" rel="noreferrer">PDF</a>}
                        {f.xml_link && <a className="text-sa-green underline" href={f.xml_link} target="_blank" rel="noreferrer">XML</a>}
                        {!f.pdf_link && !f.xml_link && <span className={cx.muted}>—</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>
      )}
    </div>
  )
}
