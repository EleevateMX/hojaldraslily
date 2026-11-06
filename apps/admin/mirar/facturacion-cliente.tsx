/**
 * Admin → Facturación → «Facturar a un cliente» (NOMINATIVA), para MIRARLA.
 *
 *     cd apps/admin && pnpm dev
 *     →   http://localhost:5185/mirar/facturacion-cliente.html
 *
 * Con un cliente ya buscado (folio con su total), la lista de clientes de
 * ContaDigital, el formulario de alta y el historial. Sin Supabase: todo entra
 * por las `fuente*`/`al*`.
 */
import { createRoot } from 'react-dom/client'
import FacturacionCliente from '../src/pages/FacturacionCliente'
import type {
  ClienteCD, FacturaNominativa, FolioFacturable, ClienteNuevo,
  ResultadoClientes, ResultadoNominativa, ResultadoCliente,
} from '@lily/supabase'
import '../src/index.css'

const CLIENTES: ClienteCD[] = [
  { id: 1, rfc: 'XAXX010101000', razonSocial: 'PUBLICO EN GENERAL', regimenFiscal: '616', usoCFDI: 'S01', cp: '97148' },
  { id: 2, rfc: 'MABC800101AB1', razonSocial: 'María Beatriz Canul', regimenFiscal: '612', usoCFDI: 'G03', cp: '97000' },
  { id: 3, rfc: 'PAN950505XY2', razonSocial: 'Panadería del Sur SA de CV', regimenFiscal: '601', usoCFDI: 'G01', cp: '97130' },
]

const NOMINATIVAS: FacturaNominativa[] = [
  { id: 'a', folio_venta: 1038, rfc_receptor: 'PAN950505XY2', nombre_receptor: 'Panadería del Sur SA de CV',
    ambiente: 'pro', uuid: 'A1B2C3D4-0000-1111-2222-333344445555', serie: 'F', folio_cfdi: 12, uso_cfdi: 'G01',
    estatus: 'timbrada', subtotal: 790, iva: 0, total: 790, pdf_link: '#', xml_link: '#', mensaje: null, created_at: '' },
  { id: 'b', folio_venta: 1040, rfc_receptor: 'MABC800101AB1', nombre_receptor: 'María Beatriz Canul',
    ambiente: 'pro', uuid: null, serie: null, folio_cfdi: null, uso_cfdi: 'G03',
    estatus: 'error', subtotal: 310, iva: 0, total: 310, pdf_link: null, xml_link: null,
    mensaje: 'No existe la serie, verifique el parámetro IdSerie=0', created_at: '' },
]

const FOLIO: FolioFacturable = {
  folio: 1042, total: 625, fecha: '2026-11-04', canal: 'pos', ya_nominada: false, dia_global_timbrado: false,
}

createRoot(document.getElementById('root')!).render(
  <div className="p-4 md:p-8 bg-sa-cream-paper min-h-screen">
    <FacturacionCliente
      fuenteClientes={async (): Promise<ResultadoClientes> => ({ ok: true, clientes: CLIENTES })}
      fuenteNominativas={async () => NOMINATIVAS}
      fuenteFolio={async (): Promise<FolioFacturable | null> => FOLIO}
      alTimbrar={async (): Promise<ResultadoNominativa> => ({ ok: true, factura: NOMINATIVAS[0] })}
      alAgregar={async (c: ClienteNuevo): Promise<ResultadoCliente> => ({ ok: true, cliente: { id: 9, rfc: c.rfc, razonSocial: c.razonSocial } })}
    />
  </div>,
)
