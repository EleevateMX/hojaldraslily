import { useEffect, useMemo, useState } from 'react'
import { sb } from '../lib/sb'
import {
  ventasDelDia, facturasListar, timbrarGlobal,
  type VentaDelDia, type FacturaGlobal, type ResultadoTimbrado,
} from '@lily/supabase'
import { mxn, mensajeDeError } from '@lily/utils'
import { PageHeader, Loading, ErrorMsg, OkMsg, Panel, Field, Chip, cx } from '../ui'

/**
 * Admin → Facturación: la factura GLOBAL diaria con ContaDigital (Isyconta).
 *
 * La casa factura diario para comprobar ingresos. Esta pantalla enseña, para
 * el día elegido, CADA FOLIO con su total —tal como va a salir en el CFDI, un
 * renglón por folio— y el total del día; el botón «Timbrar» dispara la Edge
 * Function `contadigital-facturar`, que es donde viven los secretos y la
 * llamada a ContaDigital. La API Key nunca toca el navegador.
 *
 * El pan va a TASA 0% de IVA, así que subtotal = total.
 *
 * `fuente*`/`alTimbrar` existen para el arnés de `mirar/facturacion.html`: la
 * pantalla se revisa con datos de un día ocupado, sin Supabase.
 */

const ZONA = 'America/Merida'
const hoyMerida = () => new Date().toLocaleDateString('en-CA', { timeZone: ZONA })
function diasAtras(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('en-CA', { timeZone: ZONA })
}
const folioDelDia = (fecha: string) => `GLOBAL-${fecha.replaceAll('-', '')}`

function EstatusChip({ e }: { e: FacturaGlobal['estatus'] }) {
  if (e === 'timbrada') return <Chip tone="si">Timbrada</Chip>
  if (e === 'error') return <Chip tone="no">Error</Chip>
  if (e === 'cancelada') return <Chip tone="neutral">Cancelada</Chip>
  return <Chip tone="neutral">Pendiente</Chip>
}

export default function Facturacion({
  fuenteVentas = (f: string) => ventasDelDia(sb, f),
  fuenteFacturas = (d: string, h: string) => facturasListar(sb, d, h),
  alTimbrar = (f: string) => timbrarGlobal(sb, f),
}: {
  fuenteVentas?: (fecha: string) => Promise<VentaDelDia[]>
  fuenteFacturas?: (desde: string, hasta: string) => Promise<FacturaGlobal[]>
  alTimbrar?: (fecha: string) => Promise<ResultadoTimbrado>
} = {}) {
  const [fecha, setFecha] = useState(hoyMerida)
  const [ventas, setVentas] = useState<VentaDelDia[]>([])
  const [facturas, setFacturas] = useState<FacturaGlobal[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [timbrando, setTimbrando] = useState(false)

  async function cargar() {
    setCargando(true); setError(null)
    try {
      const [vs, fs] = await Promise.all([fuenteVentas(fecha), fuenteFacturas(diasAtras(60), hoyMerida())])
      setVentas(vs); setFacturas(fs)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setCargando(false)
    }
  }
  useEffect(() => { void cargar() }, [fecha]) // eslint-disable-line react-hooks/exhaustive-deps

  const total = useMemo(() => ventas.reduce((s, v) => s + Number(v.total), 0), [ventas])
  const yaTimbrada = useMemo(
    () => facturas.find((f) => f.folio_original === folioDelDia(fecha) && f.estatus === 'timbrada') ?? null,
    [facturas, fecha],
  )

  async function timbrar() {
    if (ventas.length === 0) return
    setTimbrando(true); setError(null); setOk(null); setAviso(null)
    try {
      const r = await alTimbrar(fecha)
      if (r.ok && r.factura) {
        setOk(r.yaExistia
          ? `Ese día ya estaba facturado (UUID ${r.factura.uuid ?? '—'}).`
          : `Factura global timbrada. UUID ${r.factura.uuid ?? '—'}.`)
        await cargar()
      } else {
        // Errores de negocio con mensaje claro (empresa no dada de alta, sin
        // ventas, faltan secretos…). No es una falla del sistema: es algo que
        // la casa tiene que resolver, así que se dice tal cual.
        setAviso(r.error?.mensaje ?? 'ContaDigital no timbró la factura.')
      }
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setTimbrando(false)
    }
  }

  if (cargando) return <Loading>Cargando la facturación…</Loading>

  return (
    <div className="space-y-5">
      <PageHeader
        title="Facturación"
        subtitle="Factura global diaria con ContaDigital — un renglón por folio, para comprobar ingresos."
      />

      {error && <ErrorMsg>{error}</ErrorMsg>}
      {ok && <OkMsg>{ok}</OkMsg>}
      {aviso && (
        <div className="rounded-sa border border-sa-banana/50 bg-sa-banana/15 px-4 py-3 text-sm text-sa-green-ink">
          {aviso}
        </div>
      )}

      <Panel>
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Día a facturar">
            <input
              type="date" value={fecha} max={hoyMerida()}
              onChange={(e) => setFecha(e.target.value)}
              className={cx.input}
            />
          </Field>
          <div className="flex gap-2 ml-auto">
            <button className={cx.btnSec} onClick={() => setFecha(hoyMerida())}>Hoy</button>
            <button className={cx.btnSec} onClick={() => setFecha(diasAtras(1))}>Ayer</button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-6">
          <div>
            <p className={cx.label}>Folios del día</p>
            <p className="font-display text-2xl text-sa-green-ink">{ventas.length}</p>
          </div>
          <div>
            <p className={cx.label}>Total a facturar</p>
            <p className="font-display text-2xl text-sa-green-ink">{mxn(total)}</p>
          </div>
          <div className="ml-auto">
            {yaTimbrada ? (
              <div className="text-right">
                <EstatusChip e="timbrada" />
                <p className={`mt-1 text-xs ${cx.muted}`}>Este día ya está facturado</p>
              </div>
            ) : (
              <button
                className={cx.btnPrimary}
                disabled={timbrando || ventas.length === 0}
                onClick={() => void timbrar()}
              >
                {timbrando ? 'Timbrando…' : 'Timbrar factura global'}
              </button>
            )}
          </div>
        </div>
      </Panel>

      <div>
        <p className={`${cx.h3} mb-2`}>Lo que va en la factura del {fecha}</p>
        {ventas.length === 0 ? (
          <Panel><p className={`text-sm ${cx.muted}`}>No hay ventas pagadas ese día.</p></Panel>
        ) : (
          <div className={cx.tableWrap}>
            <table className={cx.table}>
              <thead className={cx.thead}>
                <tr>
                  <th className={cx.th}>Folio</th>
                  <th className={cx.th}>Hora</th>
                  <th className={cx.th}>Canal</th>
                  <th className={cx.thNum}>Total</th>
                </tr>
              </thead>
              <tbody className={cx.tbody}>
                {ventas.map((v) => (
                  <tr key={v.folio} className={cx.tr}>
                    <td className={cx.td}>Folio {v.folio}</td>
                    <td className={cx.td}>{v.hora}</td>
                    <td className={cx.td}>{v.canal}</td>
                    <td className={cx.tdNum}>{mxn(v.total)}</td>
                  </tr>
                ))}
                <tr className="bg-sa-cream-soft font-semibold">
                  <td className={cx.td} colSpan={3}>Total del día</td>
                  <td className={cx.tdNum}>{mxn(total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

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
    </div>
  )
}
