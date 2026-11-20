import { useEffect, useMemo, useState } from 'react'
import { sb } from '../lib/sb'
import {
  ventasDelDia, ventasDelPeriodo, facturasListar,
  timbrarGlobal, timbrarPeriodo, timbrarManual, timbrarPrefactura,
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

/** Opciones comunes de los tres timbrados: prefactura y descripción editable. */
type OpcionesTimbrado = { soloGuardar?: boolean; comentario?: string }

/**
 * Descripciones preescritas para el concepto del CFDI (panadería). Salen en un
 * desplegable, pero la contadora también puede escribir la suya. Vacío = la
 * leyenda por omisión del servidor («Venta de pan y productos de panadería»).
 */
const LEYENDAS_SUGERIDAS = [
  'Venta de pan y productos de panadería',
  'Venta de pan, galletas y pastelitos',
  'Pan, galletas y pastelitos dulces',
  'Venta de productos de panadería al público en general',
]

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
  alTimbrar = (f: string, o?: OpcionesTimbrado) => timbrarGlobal(sb, f, o),
  alTimbrarPeriodo = (a: { desde: string; hasta: string; periodicidad?: PeriodicidadGlobal } & OpcionesTimbrado) => timbrarPeriodo(sb, a),
  alTimbrarManual = (a: { desde: string; hasta: string; total: number; periodicidad?: PeriodicidadGlobal } & OpcionesTimbrado) => timbrarManual(sb, a),
  alTimbrarPrefactura = (id: string) => timbrarPrefactura(sb, id),
}: {
  fuenteVentas?: (fecha: string) => Promise<VentaDelDia[]>
  fuenteVentasPeriodo?: (desde: string, hasta: string) => Promise<VentaDelPeriodo[]>
  fuenteFacturas?: (desde: string, hasta: string) => Promise<FacturaGlobal[]>
  alTimbrar?: (fecha: string, o?: OpcionesTimbrado) => Promise<ResultadoTimbrado>
  alTimbrarPeriodo?: (a: { desde: string; hasta: string; periodicidad?: PeriodicidadGlobal } & OpcionesTimbrado) => Promise<ResultadoTimbrado>
  alTimbrarManual?: (a: { desde: string; hasta: string; total: number; periodicidad?: PeriodicidadGlobal } & OpcionesTimbrado) => Promise<ResultadoTimbrado>
  alTimbrarPrefactura?: (id: string) => Promise<ResultadoTimbrado>
} = {}) {
  // Global (a público en general) o nominativa (a un cliente).
  const [modo, setModo] = useState<'global' | 'cliente'>('global')
  const [sub, setSub] = useState<SubModo>('dia')

  const [fecha, setFecha] = useState(hoyMerida)
  const [desde, setDesde] = useState(inicioDeMes)
  const [hasta, setHasta] = useState(hoyMerida)
  const [periodicidad, setPeriodicidad] = useState<PeriodicidadGlobal>('04')
  const [montoManual, setMontoManual] = useState('')
  // Descripción opcional que la contadora puede mover. Vacía = leyenda de
  // panadería por omisión ('Venta de pan y productos de panadería', más el
  // folio en día/periodo). Con texto, se antepone al folio en el CFDI.
  const [descripcion, setDescripcion] = useState('')

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

  async function timbrar(soloGuardar = false) {
    setTimbrando(true); setError(null); setOk(null); setAviso(null)
    try {
      const comentario = descripcion.trim() || undefined
      const o: OpcionesTimbrado = { soloGuardar, comentario }
      let r: ResultadoTimbrado
      if (sub === 'dia') r = await alTimbrar(fecha, o)
      else if (sub === 'periodo') r = await alTimbrarPeriodo({ desde, hasta, periodicidad, ...o })
      else r = await alTimbrarManual({ desde, hasta, total: montoNum, periodicidad, ...o })

      if (r.ok && r.factura) {
        setOk(r.yaExistia
          ? `Ese periodo ya estaba facturado (UUID ${r.factura.uuid ?? '—'}).`
          : r.prefactura
            ? `Prefactura guardada en ContaDigital (sin timbrar, no gasta timbre). Revísala o muévele lo que haga falta, y luego timbra.`
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

  // Timbra una prefactura ya guardada (estatus 'pendiente'), por su id.
  async function timbrarPre(id: string) {
    setTimbrando(true); setError(null); setOk(null); setAviso(null)
    try {
      const r = await alTimbrarPrefactura(id)
      if (r.ok && r.factura && r.factura.estatus === 'timbrada') {
        setOk(`Prefactura timbrada. UUID ${r.factura.uuid ?? '—'}.`)
        await cargar()
      } else if (r.ok && r.factura) {
        setAviso('Se volvió a guardar, pero ContaDigital no la timbró. Revísala e intenta de nuevo.')
        await cargar()
      } else {
        setAviso(r.error?.mensaje ?? 'No se pudo timbrar la prefactura.')
      }
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setTimbrando(false)
    }
  }

  // Las prefacturas (guardadas sin timbrar) van en su propia lista, aparte de
  // las ya timbradas / con error.
  const prefacturas = useMemo(() => facturas.filter((f) => f.estatus === 'pendiente'), [facturas])
  const timbradas = useMemo(() => facturas.filter((f) => f.estatus !== 'pendiente'), [facturas])

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

      {sub === 'manual' ? (
        <div className="rounded-sa border border-sa-banana/50 bg-sa-banana/15 px-4 py-3 text-sm text-sa-green-ink">
          <b>Monto manual (transición).</b> Aquí el importe lo escribe la contadora; no sale de las ventas
          registradas. Úsalo mientras el sistema entra en operación. Queda marcado como «manual» en el historial.
        </div>
      ) : (
        <p className={`text-xs ${cx.muted}`}>
          La factura global ampara <b>solo lo cobrado con tarjeta</b> (Banorte e Inbursa); el efectivo no se declara aquí.
          En un pago mixto cuenta solo la parte de tarjeta, y un folio pagado todo en efectivo no entra.
        </p>
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

        {/* Descripción editable: la contadora puede moverla. Vacía = 'Folio N'
            de siempre; con texto, se antepone al folio en el CFDI. */}
        <div className="mt-4">
          <Field label="Descripción (elige una o escribe la tuya)">
            {/* Combo: desplegable con sugerencias de panadería, pero también se
                puede teclear una descripción propia. Vacío = leyenda por
                omisión del servidor. */}
            <input
              type="text"
              list="leyendas-factura"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder={sub === 'manual'
                ? 'Vacío = «Venta de pan y productos de panadería al público en general»'
                : 'Vacío = «Venta de pan y productos de panadería · Folio N»'}
              maxLength={900}
              className={cx.input}
              style={{ minWidth: '28rem' }}
            />
            <datalist id="leyendas-factura">
              {LEYENDAS_SUGERIDAS.map((l) => <option key={l} value={l} />)}
            </datalist>
          </Field>
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
              <div className="flex flex-wrap items-center gap-2">
                {/* Prefactura: guarda en ContaDigital SIN timbrar (no gasta
                    timbre). Sirve para revisar/mover antes de la factura real. */}
                <button
                  className={cx.btnSec}
                  disabled={timbrando || !puedeTimbrar}
                  onClick={() => void timbrar(true)}
                  title="Guarda la prefactura en ContaDigital sin timbrar: no gasta timbre y se puede revisar o ajustar antes de la factura real"
                >
                  {timbrando ? 'Guardando…' : 'Guardar prefactura'}
                </button>
                <button
                  className={cx.btnPrimary}
                  disabled={timbrando || !puedeTimbrar}
                  onClick={() => void timbrar(false)}
                >
                  {timbrando ? 'Timbrando…' : sub === 'manual' ? 'Timbrar monto manual' : 'Timbrar factura global'}
                </button>
              </div>
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

      {/* Prefacturas: guardadas sin timbrar. Se revisan y se timbran de aquí. */}
      {prefacturas.length > 0 && (
        <div>
          <p className={`${cx.h3} mb-2`}>Prefacturas (sin timbrar)</p>
          <p className={`text-xs ${cx.muted} mb-2`}>
            Guardadas en ContaDigital para revisar antes de timbrar. Mira el PDF y, cuando esté bien,
            dale <b>Timbrar</b>: se convierte en la factura real (consume un timbre).
          </p>
          <div className={cx.tableWrap}>
            <table className={cx.table}>
              <thead className={cx.thead}>
                <tr>
                  <th className={cx.th}>Periodo</th>
                  <th className={cx.th}>Descripción</th>
                  <th className={cx.th}>Folios</th>
                  <th className={cx.thNum}>Total</th>
                  <th className={cx.th}>Revisar</th>
                  <th className={cx.th} />
                </tr>
              </thead>
              <tbody className={cx.tbody}>
                {prefacturas.map((f) => (
                  <tr key={f.id} className={cx.tr}>
                    <td className={cx.td}>
                      {!f.periodo_hasta || f.periodo_desde === f.periodo_hasta
                        ? (f.periodo_desde ?? f.fecha)
                        : `${f.periodo_desde} a ${f.periodo_hasta}`}
                    </td>
                    <td className={cx.td}>{f.comentario ?? <span className={cx.muted}>Panadería (por omisión)</span>}</td>
                    <td className={cx.td}>{f.num_folios}</td>
                    <td className={cx.tdNum}>{mxn(f.total)}</td>
                    <td className={cx.td}>
                      {f.pdf_link
                        ? <a className="text-sa-green underline" href={f.pdf_link} target="_blank" rel="noreferrer">PDF</a>
                        : <span className={cx.muted}>—</span>}
                    </td>
                    <td className={cx.td}>
                      <button className={cx.btnPrimary} disabled={timbrando} onClick={() => void timbrarPre(f.id)}>
                        {timbrando ? 'Timbrando…' : 'Timbrar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div>
        <p className={`${cx.h3} mb-2`}>Facturas timbradas</p>
        {timbradas.length === 0 ? (
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
                {timbradas.map((f) => (
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
