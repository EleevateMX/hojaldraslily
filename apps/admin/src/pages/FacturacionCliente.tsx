import { useEffect, useMemo, useState } from 'react'
import { sb } from '../lib/sb'
import {
  clientesContaDigital, agregarClienteContaDigital, folioFacturable, timbrarFolio,
  facturasNominativasListar,
  type ClienteCD, type FolioFacturable, type FacturaNominativa,
  type ClienteNuevo, type ResultadoClientes, type ResultadoCliente, type ResultadoNominativa,
} from '@lily/supabase'
import { mxn, mensajeDeError } from '@lily/utils'
import { Loading, ErrorMsg, OkMsg, Panel, Field, Chip, cx } from '../ui'

/**
 * Admin → Facturación → «Facturar a un cliente» (NOMINATIVA).
 *
 * El otro camino de la facturación: en vez de la global a público en general,
 * timbrarle a un RFC real. El flujo es el que pidió la casa: se añade el
 * cliente (persona física o moral) y después se factura un FOLIO de venta a su
 * nombre. El total lo pone el servidor (el de la venta), no la pantalla, y el
 * folio nominado se saca de la global de su día para no facturar dos veces.
 *
 * Las `fuente*`/`al*` existen para el arnés de mirar/facturacion-cliente.html.
 */

const ZONA = 'America/Merida'
const hoyMerida = () => new Date().toLocaleDateString('en-CA', { timeZone: ZONA })
function diasAtras(n: number): string {
  const d = new Date(); d.setDate(d.getDate() - n)
  return d.toLocaleDateString('en-CA', { timeZone: ZONA })
}

// Los más usados; ContaDigital valida contra el catálogo del SAT al timbrar.
const REGIMENES: { clave: string; nombre: string }[] = [
  { clave: '601', nombre: '601 · General de Ley Personas Morales' },
  { clave: '603', nombre: '603 · Personas Morales con Fines no Lucrativos' },
  { clave: '605', nombre: '605 · Sueldos y Salarios' },
  { clave: '606', nombre: '606 · Arrendamiento' },
  { clave: '612', nombre: '612 · Personas Físicas con Actividad Empresarial y Profesional' },
  { clave: '616', nombre: '616 · Sin obligaciones fiscales' },
  { clave: '621', nombre: '621 · Incorporación Fiscal' },
  { clave: '625', nombre: '625 · Actividades por Plataformas Tecnológicas' },
  { clave: '626', nombre: '626 · Simplificado de Confianza (RESICO)' },
]
const USOS: { clave: string; nombre: string }[] = [
  { clave: 'G03', nombre: 'G03 · Gastos en general' },
  { clave: 'G01', nombre: 'G01 · Adquisición de mercancías' },
  { clave: 'S01', nombre: 'S01 · Sin efectos fiscales' },
]

function EstatusChip({ e }: { e: FacturaNominativa['estatus'] }) {
  if (e === 'timbrada') return <Chip tone="si">Timbrada</Chip>
  if (e === 'error') return <Chip tone="no">Error</Chip>
  if (e === 'cancelada') return <Chip tone="neutral">Cancelada</Chip>
  return <Chip tone="neutral">Pendiente</Chip>
}

export default function FacturacionCliente({
  fuenteClientes = () => clientesContaDigital(sb),
  fuenteNominativas = (d: string, h: string) => facturasNominativasListar(sb, d, h),
  fuenteFolio = (f: number) => folioFacturable(sb, f),
  alTimbrar = (folio: number, rfc: string, uso: string) => timbrarFolio(sb, { folio, rfc, uso }),
  alAgregar = (c: ClienteNuevo) => agregarClienteContaDigital(sb, c),
}: {
  fuenteClientes?: () => Promise<ResultadoClientes>
  fuenteNominativas?: (desde: string, hasta: string) => Promise<FacturaNominativa[]>
  fuenteFolio?: (folio: number) => Promise<FolioFacturable | null>
  alTimbrar?: (folio: number, rfc: string, uso: string) => Promise<ResultadoNominativa>
  alAgregar?: (c: ClienteNuevo) => Promise<ResultadoCliente>
} = {}) {
  const [clientes, setClientes] = useState<ClienteCD[]>([])
  const [nominativas, setNominativas] = useState<FacturaNominativa[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  // Folio a facturar
  const [folioTxt, setFolioTxt] = useState('')
  const [folioInfo, setFolioInfo] = useState<FolioFacturable | null>(null)
  const [buscando, setBuscando] = useState(false)

  // Cliente
  const [rfcSel, setRfcSel] = useState('')
  const [uso, setUso] = useState('G03')

  // Alta de cliente
  const [agregando, setAgregando] = useState(false)
  const [guardandoCliente, setGuardandoCliente] = useState(false)
  const nuevoVacio: ClienteNuevo = { rfc: '', razonSocial: '', regimenFiscal: '601', usoCFDI: 'G03', cp: '', calle: '', noExterior: '', colonia: '', municipio: '', estado: '', email: '' }
  const [nuevo, setNuevo] = useState<ClienteNuevo>(nuevoVacio)

  const [timbrando, setTimbrando] = useState(false)

  async function cargar() {
    setCargando(true); setError(null)
    try {
      const [rc, ns] = await Promise.all([fuenteClientes(), fuenteNominativas(diasAtras(90), hoyMerida())])
      if (rc.ok) setClientes(rc.clientes ?? [])
      else setAviso(rc.error?.mensaje ?? 'No se pudieron cargar los clientes de ContaDigital.')
      setNominativas(ns)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setCargando(false)
    }
  }
  useEffect(() => { void cargar() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function buscarFolio() {
    const n = Number(folioTxt.replace(/\D/g, ''))
    setFolioInfo(null); setOk(null); setError(null)
    if (!n) return
    setBuscando(true)
    try {
      const info = await fuenteFolio(n)
      if (!info) setAviso(`No hay una venta pagada con folio ${n}.`)
      else { setFolioInfo(info); setAviso(null) }
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setBuscando(false)
    }
  }

  const clienteSel = useMemo(() => clientes.find((c) => c.rfc === rfcSel) ?? null, [clientes, rfcSel])
  const bloqueado = folioInfo?.ya_nominada || folioInfo?.dia_global_timbrado
  const puedeTimbrar = !!folioInfo && !bloqueado && !!clienteSel && !timbrando

  async function timbrar() {
    if (!folioInfo || !clienteSel) return
    setTimbrando(true); setError(null); setOk(null); setAviso(null)
    try {
      const r = await alTimbrar(folioInfo.folio, clienteSel.rfc, uso)
      if (r.ok && r.factura) {
        setOk(`Factura timbrada a ${clienteSel.razonSocial}. UUID ${r.factura.uuid ?? '—'}.`)
        setFolioTxt(''); setFolioInfo(null)
        await cargar()
      } else {
        setAviso(r.error?.mensaje ?? 'ContaDigital no timbró la factura.')
      }
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setTimbrando(false)
    }
  }

  async function agregarCliente() {
    setGuardandoCliente(true); setError(null); setOk(null); setAviso(null)
    try {
      const r = await alAgregar({ ...nuevo, rfc: nuevo.rfc.trim().toUpperCase() })
      if (r.ok && r.cliente) {
        setOk(`Cliente ${r.cliente.razonSocial} (${r.cliente.rfc}) dado de alta.`)
        setAgregando(false); setNuevo(nuevoVacio)
        await cargar()
        setRfcSel(r.cliente.rfc)
      } else {
        setAviso(r.error?.mensaje ?? 'No se pudo dar de alta el cliente.')
      }
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setGuardandoCliente(false)
    }
  }

  if (cargando) return <Loading>Cargando los clientes…</Loading>

  return (
    <div className="space-y-5">
      {error && <ErrorMsg>{error}</ErrorMsg>}
      {ok && <OkMsg>{ok}</OkMsg>}
      {aviso && (
        <div className="rounded-sa border border-sa-banana/50 bg-sa-banana/15 px-4 py-3 text-sm text-sa-green-ink">
          {aviso}
        </div>
      )}

      <Panel>
        <p className={`${cx.h3} mb-1`}>Facturar a un cliente (persona física o moral)</p>
        <p className={`text-sm ${cx.muted} mb-4`}>
          Se factura un folio de venta a nombre del cliente. El importe es el de la venta; el
          folio nominado se saca de la factura global de su día.
        </p>

        {/* 1. El folio */}
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Folio de la venta">
            <input
              className={cx.input} inputMode="numeric" value={folioTxt}
              onChange={(e) => setFolioTxt(e.target.value.replace(/\D/g, ''))}
              onBlur={() => void buscarFolio()}
              onKeyDown={(e) => { if (e.key === 'Enter') void buscarFolio() }}
              placeholder="1042"
            />
          </Field>
          <button className={cx.btnSec} onClick={() => void buscarFolio()} disabled={buscando}>
            {buscando ? 'Buscando…' : 'Buscar'}
          </button>
          {folioInfo && (
            <div className="ml-auto text-right">
              <p className={cx.label}>Folio {folioInfo.folio} · {folioInfo.fecha}</p>
              <p className="font-display text-2xl text-sa-green-ink">{mxn(folioInfo.total)}</p>
            </div>
          )}
        </div>
        {folioInfo?.ya_nominada && (
          <p className="mt-2 text-sm text-sa-green-deep">Este folio ya tiene una factura nominativa.</p>
        )}
        {folioInfo?.dia_global_timbrado && !folioInfo?.ya_nominada && (
          <p className="mt-2 text-sm text-sa-green-deep">
            El {folioInfo.fecha} ya se timbró la factura global, así que este folio ya quedó incluido ahí.
          </p>
        )}

        {/* 2. El cliente */}
        <div className="mt-5 flex flex-wrap items-end gap-3">
          <Field label="Cliente">
            <select className={cx.input} value={rfcSel} onChange={(e) => {
              setRfcSel(e.target.value)
              const c = clientes.find((x) => x.rfc === e.target.value)
              if (c?.usoCFDI) setUso(c.usoCFDI)
            }}>
              <option value="">— Elige un cliente —</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.rfc}>{c.razonSocial} · {c.rfc}</option>
              ))}
            </select>
          </Field>
          <Field label="Uso del CFDI">
            <select className={cx.input} value={uso} onChange={(e) => setUso(e.target.value)}>
              {USOS.map((u) => <option key={u.clave} value={u.clave}>{u.nombre}</option>)}
            </select>
          </Field>
          <button className={cx.btnSec} onClick={() => setAgregando((v) => !v)}>
            {agregando ? 'Cerrar' : 'Agregar cliente'}
          </button>
        </div>

        {/* 2b. Alta de cliente */}
        {agregando && (
          <div className="mt-4 rounded-sa border border-sa-green-ink/10 bg-sa-cream-soft p-4 space-y-3">
            <p className={cx.h3}>Dar de alta un cliente</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="RFC">
                <input className={cx.input} value={nuevo.rfc} maxLength={13}
                  onChange={(e) => setNuevo({ ...nuevo, rfc: e.target.value.toUpperCase() })} placeholder="XAXX010101000" />
              </Field>
              <Field label="Razón social / nombre">
                <input className={cx.input} value={nuevo.razonSocial}
                  onChange={(e) => setNuevo({ ...nuevo, razonSocial: e.target.value })} />
              </Field>
              <Field label="Régimen fiscal">
                <select className={cx.input} value={nuevo.regimenFiscal}
                  onChange={(e) => setNuevo({ ...nuevo, regimenFiscal: e.target.value })}>
                  {REGIMENES.map((r) => <option key={r.clave} value={r.clave}>{r.nombre}</option>)}
                </select>
              </Field>
              <Field label="Uso del CFDI por defecto">
                <select className={cx.input} value={nuevo.usoCFDI}
                  onChange={(e) => setNuevo({ ...nuevo, usoCFDI: e.target.value })}>
                  {USOS.map((u) => <option key={u.clave} value={u.clave}>{u.nombre}</option>)}
                </select>
              </Field>
              <Field label="Código postal">
                <input className={cx.input} inputMode="numeric" maxLength={5} value={nuevo.cp}
                  onChange={(e) => setNuevo({ ...nuevo, cp: e.target.value.replace(/\D/g, '') })} placeholder="97148" />
              </Field>
              <Field label="Calle">
                <input className={cx.input} value={nuevo.calle}
                  onChange={(e) => setNuevo({ ...nuevo, calle: e.target.value })} />
              </Field>
              <Field label="Colonia (opcional)">
                <input className={cx.input} value={nuevo.colonia}
                  onChange={(e) => setNuevo({ ...nuevo, colonia: e.target.value })} />
              </Field>
              <Field label="Municipio / Estado (opcional)">
                <div className="flex gap-2">
                  <input className={cx.input} value={nuevo.municipio} placeholder="Mérida"
                    onChange={(e) => setNuevo({ ...nuevo, municipio: e.target.value })} />
                  <input className={cx.input} value={nuevo.estado} placeholder="Yucatán"
                    onChange={(e) => setNuevo({ ...nuevo, estado: e.target.value })} />
                </div>
              </Field>
              <Field label="Correo (opcional)">
                <input className={cx.input} value={nuevo.email} inputMode="email"
                  onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })} />
              </Field>
            </div>
            <div className="flex justify-end">
              <button className={cx.btnPrimary} disabled={guardandoCliente}
                onClick={() => void agregarCliente()}>
                {guardandoCliente ? 'Guardando…' : 'Guardar cliente'}
              </button>
            </div>
          </div>
        )}

        {/* 3. Timbrar */}
        <div className="mt-5 flex justify-end">
          <button className={cx.btnPrimary} disabled={!puedeTimbrar} onClick={() => void timbrar()}>
            {timbrando ? 'Timbrando…' : 'Timbrar factura'}
          </button>
        </div>
      </Panel>

      <div>
        <p className={`${cx.h3} mb-2`}>Facturas a clientes</p>
        {nominativas.length === 0 ? (
          <Panel><p className={`text-sm ${cx.muted}`}>Todavía no hay facturas nominativas.</p></Panel>
        ) : (
          <div className={cx.tableWrap}>
            <table className={cx.table}>
              <thead className={cx.thead}>
                <tr>
                  <th className={cx.th}>Folio</th>
                  <th className={cx.th}>Cliente</th>
                  <th className={cx.th}>Estatus</th>
                  <th className={cx.thNum}>Total</th>
                  <th className={cx.th}>UUID</th>
                  <th className={cx.th}>Comprobante</th>
                </tr>
              </thead>
              <tbody className={cx.tbody}>
                {nominativas.map((f) => (
                  <tr key={f.id} className={cx.tr}>
                    <td className={cx.td}>{f.folio_venta}</td>
                    <td className={cx.td}>{f.nombre_receptor ?? f.rfc_receptor}</td>
                    <td className={cx.td}><EstatusChip e={f.estatus} /></td>
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
