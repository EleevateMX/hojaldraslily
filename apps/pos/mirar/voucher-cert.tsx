/**
 * Comprobante de VENTA CON TARJETA (voucher Anexo VII de Interredes) con el
 * branding de Hojaldras Lily, para adjuntar al folio de certificación de
 * Banorte.
 *
 *     cd apps/pos && pnpm dev  →  /mirar/voucher-cert.html
 *
 * Reusa `parejasDeVoucher` y `validacionDeVoucher` del paquete, así los campos
 * y la leyenda de validación son EXACTAMENTE los que imprime el sistema, y el
 * logotipo real de la casa (`LOGO_TICKET`, data URI). Los datos son los REALES
 * que devolvió el DLL en las pruebas (no se inventa nada). La fecha/hora sale
 * decodificada del número de control (lo trae codificado).
 */
import { createRoot } from 'react-dom/client'
import {
  parejasDeVoucher, validacionDeVoucher, leyendaDeValidacion,
  operacionDeVoucher, resultadoDeVoucher,
} from '../../../packages/ui/src/ticketLineas'
import { LOGO_TICKET } from '../../../packages/ui/src/logoTicket'
import type { VoucherTarjeta } from '../../../packages/ui/src/ticketTipos'

// Colores de marca (packages/brand/tokens.css).
const MORADO = '#4A3A52'
const CARMIN = '#D81B4A'
const CARMIN_DEEP = '#A8123A'
const CREMA = '#FDF6E3'

interface Comprobante {
  importe: number
  fecha: Date
  v: VoucherTarjeta
}

const T1: Comprobante = {
  importe: 1.0,
  fecha: new Date(1794245426856), // del control LMW9JEFU07059 (9/11/2026 11:30 a.m.)
  v: {
    afiliacion: '7156971', terminalId: null, controlNumber: 'LMW9JEFU07059',
    marca: 'VISA', tipo: 'DEBITO', pan: '1985', banco: 'AZTECA',
    autorizacion: '810565', referencia: '732298128494', entrada: 'CONTACTLESSCHIP', pin: '2',
    aid: 'A0000000031010', aplicacion: 'VISA DEBITO', tvr: '95050000000000', tsi: null,
    operacion: 'Venta', aprobada: true,
  },
}

const T2: Comprobante = {
  importe: 2.0,
  fecha: new Date(1794245563908), // del control LMW9JHDL07668 (9/11/2026 11:32 a.m.)
  v: {
    afiliacion: '7156971', terminalId: null, controlNumber: 'LMW9JHDL07668',
    marca: 'VISA', tipo: 'DEBITO', pan: '1985', banco: 'AZTECA',
    autorizacion: '813687', referencia: '732298135453', entrada: 'CHIP', pin: '1',
    aid: 'A0000000031010', aplicacion: 'VISA DEBITO', tvr: '95050080008000', tsi: null,
    operacion: 'Venta', aprobada: true,
  },
}

const mxn = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n)
const fechaMerida = (d: Date) =>
  d.toLocaleString('es-MX', {
    timeZone: 'America/Merida', day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  })

const regla = { borderTop: `1px solid ${CARMIN}33`, margin: '12px 0' }
const jost = { fontFamily: '"Jost", sans-serif' }
const mono = { fontFamily: '"DM Mono", "Courier New", monospace' }

function Voucher({ c }: { c: Comprobante }) {
  const pares = parejasDeVoucher(c.v)
  const val = validacionDeVoucher(c.v.pin)
  const leyenda = leyendaDeValidacion(val)
  const operacion = operacionDeVoucher(c.v)
  const resultado = resultadoDeVoucher(c.v)
  const declinada = resultado === 'DECLINADA'
  return (
    <div style={{
      width: 320, background: '#fff', color: MORADO, padding: '22px 22px 18px',
      fontFamily: '"Karla", sans-serif', fontSize: 13, lineHeight: 1.5,
      borderRadius: 8, boxShadow: '0 8px 30px rgba(74,58,82,.18)',
    }}>
      {/* Logo de la casa */}
      <div style={{ textAlign: 'center' }}>
        <img src={LOGO_TICKET} alt="Hojaldras Lily" style={{ width: 170, height: 'auto' }} />
      </div>

      <div style={{ textAlign: 'center', lineHeight: 1.4, marginTop: 6 }}>
        <div style={{ ...jost, fontWeight: 500, fontSize: 13, letterSpacing: '.04em' }}>KALALEV HOLDING</div>
        <div style={{ fontSize: 11.5 }}>Calle 29-A No. 183 x 20 y 22</div>
        <div style={{ fontSize: 11.5 }}>Col. Miguel Alemán · Mérida, Yuc.</div>
        <div style={{ fontSize: 11.5 }}>C.P. 97148 · R.F.C. KHO2506056F0</div>
      </div>

      <div style={regla} />
      <div style={{ ...jost, textAlign: 'center', fontWeight: 500, color: CARMIN_DEEP, letterSpacing: '.14em', fontSize: 13 }}>
        COMPROBANTE DE VENTA
      </div>
      <div style={{ ...mono, textAlign: 'center', fontSize: 11 }}>{fechaMerida(c.fecha)}</div>
      <div style={regla} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ ...jost, letterSpacing: '.08em' }}>IMPORTE</span>
        <span style={{ ...jost, fontSize: 24, fontWeight: 500, color: CARMIN }}>{mxn(c.importe)}</span>
      </div>

      <div style={regla} />
      <div style={{ ...jost, textAlign: 'center', fontWeight: 500, letterSpacing: '.16em', color: CARMIN_DEEP }}>
        BANORTE
      </div>
      <div style={{ ...jost, textAlign: 'center', fontWeight: 500, letterSpacing: '.12em', marginTop: 2 }}>
        {operacion}
      </div>
      <div style={{ ...mono, marginTop: 8, fontSize: 12 }}>
        {pares.map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '1px 0' }}>
            <span style={{ opacity: 0.65 }}>{k}</span>
            <span style={{ textAlign: 'right', fontWeight: 500 }}>{v}</span>
          </div>
        ))}
      </div>

      {leyenda && (
        <div style={{ ...jost, textAlign: 'center', fontWeight: 500, marginTop: 14, letterSpacing: '.04em' }}>
          {leyenda}
        </div>
      )}
      {val === 'firma' && (
        <div style={{ textAlign: 'center', marginTop: 26 }}>
          <div style={{ borderTop: `1px solid ${MORADO}`, width: 190, margin: '0 auto' }} />
          <div style={{ fontSize: 11 }}>Firma</div>
        </div>
      )}

      <div style={regla} />
      <div style={{ textAlign: 'center', marginTop: 4 }}>
        <span style={{
          ...jost, display: 'inline-block',
          background: declinada ? CREMA : CARMIN, color: declinada ? CARMIN_DEEP : CREMA,
          border: declinada ? `1.5px solid ${CARMIN_DEEP}` : 'none',
          padding: '4px 18px', borderRadius: 999, fontWeight: 500, letterSpacing: '.1em', fontSize: 13,
        }}>{resultado}</span>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <div style={{ padding: 32, background: CREMA, minHeight: '100vh', fontFamily: '"Karla", sans-serif' }}>
    <div style={{ display: 'flex', gap: 44, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div>
        <p style={{ ...jost, fontSize: 12, color: MORADO, margin: '0 0 12px', letterSpacing: '.06em' }}>
          Prueba 1 · $1.00 · VISA Débito (contactless, QPS)
        </p>
        <Voucher c={T1} />
      </div>
      <div>
        <p style={{ ...jost, fontSize: 12, color: MORADO, margin: '0 0 12px', letterSpacing: '.06em' }}>
          Prueba 2 · $2.00 · VISA Débito (chip + NIP)
        </p>
        <Voucher c={T2} />
      </div>
    </div>
    <p style={{ fontSize: 12, color: MORADO, marginTop: 28, maxWidth: 720, lineHeight: 1.6 }}>
      Los dos vouchers ya traen lo que pidió Banorte: el <b>tipo de operación</b> (VENTA) bajo
      «BANORTE», la leyenda <b>AUTORIZADO SIN FIRMA</b> en el contactless (CTS) y bajo el NIP, y el
      <b> resultado</b> (APROBADA) en el sello. Una <b>devolución</b> sale con el mismo formato pero
      «DEVOLUCIÓN» en la operación y el título; una transacción <b>declinada</b>, con «DECLINADA» en
      el sello. La matriz de certificación se corre en modo <b>Productivo</b>.
    </p>
  </div>,
)
