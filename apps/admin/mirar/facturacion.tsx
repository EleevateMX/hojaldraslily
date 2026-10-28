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
import type { VentaDelDia, FacturaGlobal, ResultadoTimbrado } from '@lily/supabase'
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

createRoot(document.getElementById('root')!).render(
  <div className="min-h-screen bg-sa-cream-paper p-6">
    <div className="max-w-5xl mx-auto">
      <Facturacion
        fuenteVentas={async (f) => (f === hoy ? VENTAS : [])}
        fuenteFacturas={async () => FACTURAS}
        alTimbrar={async (): Promise<ResultadoTimbrado> => ({
          ok: false,
          error: {
            codigo: 'empresa_no_alta',
            mensaje: 'El RFC KHO250605 6F0 todavía no está dado de alta en ContaDigital. Hay que crear esa empresa (con su CSD) antes de poder timbrar.',
          },
        })}
      />
    </div>
  </div>,
)
