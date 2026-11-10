import React, { useEffect, useState } from 'react'
import { sb } from '../../lib/sb'
import {
  cobrosRecientesTerminal, encolarVoucherDiag, datosDelTicket,
  type OperacionTerminal,
} from '@lily/supabase'
import { verificarEnTerminal, type ResultadoVerificacion } from '@lily/payments'
import { mxn } from '@lily/utils'
import { ModalAutorizacion } from './ModalAutorizacion'

/**
 * El panel «Verificación Banorte» — una herramienta de CERTIFICACIÓN, no del
 * día a día.
 *
 * El laboratorio de Banorte pide que la VERIFICACIÓN de la matriz se corra
 * sobre una transacción VÁLIDA (su número de control), no sobre un valor nulo.
 * Esto deja a gerencia correr esa verificación desde la caja: elige una venta
 * real reciente (o teclea su control), autoriza con PIN de gerente, y el agente
 * DLL de la PC consulta la pinpad por la cola. El voucher sale por la térmica
 * (y queda guardado), como cualquier otro.
 *
 * Es OPCIONAL y se oculta cuando ya no se ocupa: Admin → Sistema → «Mostrar
 * Verificación Banorte en la caja». Por eso se auto-oculta si la bandera está
 * apagada o no hay terminal dada de alta.
 */
export function PanelVerificacionBanorte() {
  const [visible, setVisible] = useState(false)
  const [abierto, setAbierto] = useState(false)
  const [recientes, setRecientes] = useState<OperacionTerminal[]>([])
  const [control, setControl] = useState('')
  const [montoSel, setMontoSel] = useState(0)
  const [pidiendoPin, setPidiendoPin] = useState(false)
  const [ejecutando, setEjecutando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoVerificacion | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  // Se muestra solo si la casa encendió la bandera (es una herramienta de
  // certificación, no del mostrador). La lee de los datos del ticket.
  useEffect(() => {
    let vivo = true
    datosDelTicket(sb)
      .then((d) => { if (vivo) setVisible(Boolean((d as { verificacionBanorte?: boolean } | null)?.verificacionBanorte)) })
      .catch(() => {})
    return () => { vivo = false }
  }, [])

  async function abrir() {
    setAbierto(true)
    setResultado(null)
    setAviso(null)
    try {
      const r = await cobrosRecientesTerminal(sb, 15)
      setRecientes(r)
    } catch {
      setRecientes([])
    }
  }

  function elegir(op: OperacionTerminal) {
    setControl(op.control_number)
    setMontoSel(Number(op.monto) || 0)
    setResultado(null)
    setAviso(null)
  }

  // El PIN de gerente autoriza y dispara la verificación (se re-verifica en el
  // servidor: la caja suele estar en sesión de cajero).
  async function conPin(_nombre: string, gerenteId: string) {
    setPidiendoPin(false)
    const ctrl = control.trim()
    if (!ctrl) { setAviso('Elige o teclea un número de control.'); return }
    setEjecutando(true)
    setResultado(null)
    setAviso(null)
    try {
      const r = await verificarEnTerminal(sb, ctrl, crypto.randomUUID(), gerenteId)
      setResultado(r)
      // Sale el voucher por la térmica (y queda guardado). Si no hay térmica,
      // el servidor devuelve null y queda solo en pantalla y en la base.
      if (r.voucher) {
        const payload = {
          comprobante: 'voucher' as const,
          folio: ctrl,
          monto: montoSel,
          tarjeta: { ...r.voucher, operacion: 'Verificación', aprobada: r.ok },
        }
        try { await encolarVoucherDiag(sb, ctrl, payload) } catch { /* el voucher ya quedó en la base */ }
      }
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No se pudo correr la verificación.')
    } finally {
      setEjecutando(false)
    }
  }

  if (!visible) return null

  const btn =
    'font-mono text-xs uppercase tracking-wide bg-sa-cream-warm/10 hover:bg-sa-cream-warm/20 text-sa-cream px-4 py-2 rounded-full transition-colors border border-sa-cream/20 whitespace-nowrap'

  return (
    <>
      <button onClick={abrir} className={btn} title="Verificación de la matriz de certificación">
        Verificación Banorte
      </button>

      {abierto && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-sa-green-deep/60" onClick={() => setAbierto(false)} />
          <div className="relative bg-sa-cream-soft rounded-sa-lg shadow-sa w-full max-w-lg max-h-[88dvh] overflow-y-auto p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-2xl text-sa-green-ink leading-tight">Verificación Banorte</h3>
                <p className="font-body text-sm text-sa-green-ink/60 mt-1">
                  Consulta una transacción válida por su número de control (matriz de certificación).
                </p>
              </div>
              <button onClick={() => setAbierto(false)} className="font-mono text-xs text-sa-green-ink/50 hover:text-sa-green-ink">✕</button>
            </div>

            {/* Ventas recientes para elegir el control */}
            <div className="mt-4">
              <p className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/50 mb-2">Ventas recientes con tarjeta</p>
              {recientes.length === 0 ? (
                <p className="font-mono text-xs text-sa-green-ink/40">No hay operaciones recientes.</p>
              ) : (
                <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                  {recientes.map((op) => (
                    <button
                      key={op.cobro_id}
                      onClick={() => elegir(op)}
                      className={[
                        'flex items-center justify-between gap-3 px-3 py-2 rounded-sa text-left border transition-colors',
                        control === op.control_number
                          ? 'bg-sa-green/10 border-sa-green/40'
                          : 'bg-white border-sa-green-ink/10 hover:bg-sa-cream-warm',
                      ].join(' ')}
                    >
                      <span className="min-w-0">
                        <span className="font-mono text-xs text-sa-green-ink truncate block">{op.control_number}</span>
                        <span className="font-mono text-[10px] text-sa-green-ink/50">
                          {op.operacion}{op.folio ? ` · folio ${op.folio}` : ''} · {op.estado}
                        </span>
                      </span>
                      <span className="font-mono text-xs text-sa-green-ink/70 whitespace-nowrap">{mxn(Number(op.monto) || 0)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Teclear un control a mano */}
            <div className="mt-4">
              <label className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/50">Número de control</label>
              <input
                value={control}
                onChange={(e) => { setControl(e.target.value.trim().toUpperCase()); setResultado(null); setAviso(null) }}
                placeholder="L… (el de una venta aprobada)"
                className="mt-1 w-full px-3 py-2 bg-white border border-sa-green-ink/10 rounded-sa font-mono text-sm text-sa-green-ink focus:outline-none focus:ring-2 focus:ring-sa-green/30"
              />
            </div>

            {aviso && <p className="font-mono text-xs text-sa-strawberry mt-3">{aviso}</p>}

            {resultado && (
              <div className={[
                'mt-4 rounded-sa p-3 border',
                resultado.ok ? 'bg-sa-green/10 border-sa-green/30' : 'bg-sa-strawberry/10 border-sa-strawberry/30',
              ].join(' ')}>
                <p className="font-display text-lg text-sa-green-ink">
                  {resultado.ok ? 'APROBADA' : (resultado.estado === 'no_configurado' ? 'Sin terminal conectada' : 'No aprobada')}
                </p>
                {resultado.ok ? (
                  <p className="font-mono text-xs text-sa-green-ink/70 mt-1">
                    Voucher guardado{resultado.voucher?.autorizacion ? ` · autorización ${resultado.voucher.autorizacion}` : ''}
                    {resultado.modo ? ` · modo ${resultado.modo}` : ''}
                  </p>
                ) : (
                  <p className="font-mono text-xs text-sa-green-ink/70 mt-1">{resultado.mensaje}</p>
                )}
              </div>
            )}

            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setAbierto(false)}
                className="flex-1 border border-sa-green-ink/15 bg-white text-sa-green-ink/70 py-2.5 rounded-full font-mono text-xs uppercase tracking-wide hover:bg-sa-cream-warm"
              >
                Cerrar
              </button>
              <button
                onClick={() => { if (control.trim()) setPidiendoPin(true); else setAviso('Elige o teclea un número de control.') }}
                disabled={ejecutando || !control.trim()}
                className="flex-1 bg-sa-green disabled:opacity-40 text-sa-cream py-2.5 rounded-full font-mono text-xs uppercase tracking-wide hover:bg-sa-green-deep"
              >
                {ejecutando ? 'Verificando…' : 'Verificar en la terminal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {ejecutando && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-sa-green-deep/70">
          <div className="bg-white rounded-sa-lg shadow-sa p-6 text-center max-w-xs">
            <p className="font-display text-xl text-sa-green-ink">Verificando en la terminal…</p>
            <p className="font-mono text-xs text-sa-green-ink/60 mt-2">La pinpad está consultando la operación. Un momento.</p>
          </div>
        </div>
      )}

      <ModalAutorizacion
        open={pidiendoPin}
        accion="correr la verificación de Banorte"
        onClose={() => setPidiendoPin(false)}
        onAutorizado={conPin}
      />
    </>
  )
}
