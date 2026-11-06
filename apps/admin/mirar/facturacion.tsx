/**
 * Admin → Facturación, con un día ocupado y el historial.
 *
 *     cd apps/admin && pnpm dev
 *     →   http://localhost:5185/mirar/facturacion.html
 *
 * Los casos que importan: el día de hoy con varios folios (un renglón por
 * folio, que es lo que pidió la casa), el total del día, el historial con una
 * factura timbrada (con PDF/XML) y una en error, y el aviso honesto cuando se
 * intenta timbrar y el RFC todavía no está dado de alta en ContaDigital.
 */
import { createRoot } from 'react-dom/client'
import Facturacion from '../src/pages/Facturacion'
import type { VentaDelDia, VentaDelPeriodo, FacturaGlobal, ResultadoTimbrado } from '@lily/supabase'
import '../src/index.css'

const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Merida' })
const ayer = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toLocaleDateString('en-CA', { timeZone: 'America/Merida' }) })()

const VENTAS: VentaDelDia[] = [
  { folio: 101, total: 185.0, hora: '08:12 AM', canal: 'pos' },
  { folio: 102, total: 64.0, hora: '08:40 AM', canal: 'pos' },
  { folio: 103, total: 312.5, hora: '09:05 AM', canal: 'pos' },
  { folio: 104, total: 48.0, hora: '09:31 AM', canal: 'rappi' },
  { folio: 105, total: 225.0, hora: '10:18 AM', canal: 'pos' },
  { folio: 106, total: 97.0, hora: '11:02 AM', canal: 'pos' },
  { folio: 107, total: 540.0, hora: '12:20 PM', canal: 'pos' },
  { folio: 108, total: 130.0, hora: '01:45 PM', canal: 'pos' },
]

const VENTAS_PERIODO: VentaDelPeriodo[] = [
  { folio: 95, total: 410.0, fecha: '2026-10-27', hora: '09:10 AM', canal: 'pos' },
  { folio: 96, total: 150.0, fecha: '2026-10-27', hora: '11:40 AM', canal: 'rappi' },
  { folio: 97, total: 865.0, fecha: '2026-10-28', hora: '08:55 AM', canal: 'pos' },
  { folio: 98, total: 230.0, fecha: '2026-10-28', hora: '01:05 PM', canal: 'pos' },
  { folio: 99, total: 540.0, fecha: '2026-10-29', hora: '10:22 AM', canal: 'pos' },
]

const FACTURAS: FacturaGlobal[] = [
  {
    id: '1', fecha: ayer, folio_original: `GLOBAL-${ayer.replaceAll('-', '')}`, ambiente: 'pro',
    id_empresa: 2256, uuid: 'A1B2C3D4-5E6F-7788-99AA-BBCCDDEEFF00', serie: 'FACTURA', folio_cfdi: 1204,
    estatus: 'timbrada', num_folios: 73, subtotal: 8120.5, iva: 0, total: 8120.5,
    pdf_link: 'https://ejemplo/pdf', xml_link: 'https://ejemplo/xml', mensaje: 'Timbrada correctamente',
    created_at: new Date().toISOString(),
  },
  {
    id: '2', fecha: '2026-10-25', folio_original: 'GLOBAL-20261025', ambiente: 'pro',
    id_empresa: 2256, uuid: null, serie: null, folio_cfdi: null,
    estatus: 'error', num_folios: 51, subtotal: 6410, iva: 0, total: 6410,
    pdf_link: null, xml_link: null, mensaje: 'CSD vencido en ContaDigital',
    created_at: new Date().toISOString(),
  },
]

const avisoSecretos: ResultadoTimbrado = {
  ok: false,
  error: {
    codigo: 'not_configured',
    mensaje: 'Faltan los secretos de ContaDigital en el proyecto. Captúralos en Supabase para poder timbrar.',
  },
}

createRoot(document.getElementById('root')!).render(
  <div className="min-h-screen bg-sa-cream-paper p-6">
    <div className="max-w-5xl mx-auto">
      <Facturacion
        fuenteVentas={async (f) => (f === hoy ? VENTAS : [])}
        fuenteVentasPeriodo={async () => VENTAS_PERIODO}
        fuenteFacturas={async () => FACTURAS}
        alTimbrar={async (): Promise<ResultadoTimbrado> => avisoSecretos}
        alTimbrarPeriodo={async (): Promise<ResultadoTimbrado> => avisoSecretos}
        alTimbrarManual={async (): Promise<ResultadoTimbrado> => avisoSecretos}
      />
    </div>
  </div>,
)
