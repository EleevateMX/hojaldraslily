/**
 * Comprobante de VENTA CON TARJETA (voucher Anexo VII de Interredes), limpio,
 * para adjuntar al folio de certificación de Banorte.
 *
 *     cd apps/pos && pnpm dev  →  /mirar/voucher-cert.html
 *
 * Reusa `parejasDeVoucher` y `validacionDeVoucher` del paquete, así los campos
 * y la leyenda de validación son EXACTAMENTE los que imprime el sistema. Los
 * datos son los REALES que devolvió el DLL en las pruebas (no se inventa nada).
 * La fecha/hora sale decodificada del número de control (lo trae codificado).
 */
import { createRoot } from 'react-dom/client'
import { parejasDeVoucher, validacionDeVoucher } from '../../../packages/ui/src/ticketLineas'
import type { VoucherTarjeta } from '../../../packages/ui/src/ticketTipos'

interface Comprobante {
  importe: number
  fecha: Date
  estado: string
  v: VoucherTarjeta
}

const T1: Comprobante = {
  importe: 1.0,
  fecha: new Date(1793126752503), // del control LMVR1DD6F1047
  estado: 'APROBADA',
  v: {
    afiliacion: '7156971', terminalId: null, controlNumber: 'LMVR1DD6F1047',
    marca: 'VISA', tipo: 'DEBITO', pan: '1985', banco: 'AZTECA',
    autorizacion: '177303', referencia: '00', entrada: 'CONTACTLESSCHIP', pin: '2',
    aid: 'A0000000031010', aplicacion: 'VISA DEBITO', tvr: '95050000000000', tsi: null,
  },
}

const T2: Comprobante = {
  importe: 2.0,
  fecha: new Date(1793126565352), // del control LMVR19CRS3071
  estado: 'APROBADA',
  v: {
    afiliacion: '7156971', terminalId: null, controlNumber: 'LMVR19CRS3071',
    marca: 'VISA', tipo: 'DEBITO', pan: '7647', banco: 'BANORTE',
    autorizacion: '000038', referencia: '00', entrada: 'CHIP', pin: '1',
    aid: 'A0000000031010', aplicacion: 'VISA DEBITO', tvr: '95050080008000', tsi: null,
  },
}

const mxn = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n)
const fechaMerida = (d: Date) =>
  d.toLocaleString('es-MX', {
    timeZone: 'America/Merida', day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  })

function Voucher({ c }: { c: Comprobante }) {
  const pares = parejasDeVoucher(c.v)
  const val = validacionDeVoucher(c.v.pin)
  return (
    <div style={{
      width: 300, background: '#fff', color: '#000', padding: '18px 20px',
      fontFamily: '"DM Mono", "Courier New", monospace', fontSize: 12.5, lineHeight: 1.5,
      boxShadow: '0 6px 24px rgba(0,0,0,.18)',
    }}>
      <div style={{ textAlign: 'center', lineHeight: 1.35 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>KALALEV HOLDING</div>
        <div>Hojaldras Lily</div>
        <div style={{ fontSize: 11 }}>Calle 29-A No. 183 x 20 y 22</div>
        <div style={{ fontSize: 11 }}>Col. Miguel Alemán · Mérida, Yuc.</div>
        <div style={{ fontSize: 11 }}>C.P. 97148 · R.F.C. KHO2506056F0</div>
      </div>

      <div style={{ borderTop: '1px dashed #000', margin: '12px 0' }} />
      <div style={{ textAlign: 'center', fontWeight: 700 }}>COMPROBANTE DE VENTA</div>
      <div style={{ textAlign: 'center', fontSize: 11 }}>{fechaMerida(c.fecha)}</div>
      <div style={{ borderTop: '1px dashed #000', margin: '12px 0' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span>IMPORTE</span>
        <span style={{ fontSize: 20, fontWeight: 700 }}>{mxn(c.importe)}</span>
      </div>

      <div style={{ borderTop: '1px dashed #000', margin: '12px 0' }} />
      <div style={{ textAlign: 'center', fontWeight: 700, letterSpacing: '.1em' }}>BANORTE</div>
      <div style={{ marginTop: 8 }}>
        {pares.map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ color: '#333' }}>{k}</span>
            <span style={{ textAlign: 'right', fontWeight: 500 }}>{v}</span>
          </div>
        ))}
      </div>

      {val === 'nip' && (
        <div style={{ textAlign: 'center', fontWeight: 700, marginTop: 14 }}>AUTORIZADO CON FIRMA ELECTRÓNICA</div>
      )}
      {val === 'firma' && (
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <div style={{ borderTop: '1px solid #000', width: 180, margin: '0 auto' }} />
          <div style={{ fontSize: 11 }}>Firma</div>
        </div>
      )}
      {val === 'nada' && (
        <div style={{ textAlign: 'center', fontSize: 11, marginTop: 12, color: '#333' }}>
          Operación sin NIP ni firma (contactless)
        </div>
      )}

      <div style={{ borderTop: '1px dashed #000', margin: '12px 0' }} />
      <div style={{ textAlign: 'center', fontWeight: 700 }}>** {c.estado} **</div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <div style={{ padding: 28, background: '#e9e9ea', minHeight: '100vh', fontFamily: 'sans-serif' }}>
    <div style={{ display: 'flex', gap: 40, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div>
        <p style={{ fontSize: 12, color: '#444', margin: '0 0 10px' }}>Prueba 1 · $1.00 · VISA Débito (contactless, QPS)</p>
        <Voucher c={T1} />
      </div>
      <div>
        <p style={{ fontSize: 12, color: '#444', margin: '0 0 10px' }}>Prueba 2 · $2.00 · VISA Débito (chip + NIP)</p>
        <Voucher c={T2} />
      </div>
    </div>
  </div>,
)
