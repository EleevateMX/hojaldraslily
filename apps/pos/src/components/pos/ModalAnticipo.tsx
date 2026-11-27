import { useState } from 'react'
import { mxn } from '@lily/utils'
import type { MetodoAnticipo } from '@lily/supabase'

interface Props {
  open: boolean
  cliente: string
  total: number
  /** Lo que ya dejó de anticipo (para no pasarse del total). */
  yaAnticipado: number
  onClose: () => void
  /** Cobra el anticipo con ese método. El llamador registra y cierra. */
  onCobrar: (monto: number, metodo: MetodoAnticipo) => void
  ocupado?: boolean
}

/**
 * Recibir un anticipo de un encargo, eligiendo CÓMO paga.
 *
 * Antes era un `window.prompt` que solo sabía de efectivo: si alguien quería
 * dejar el anticipo con tarjeta, no había por dónde. Ahora se elige el método,
 * como en el cobro normal.
 *
 * El dinero se cobra A MANO en su aparato o cuenta —la pinpad de Banorte, la
 * Inbursa, la transferencia— y aquí se **registra**: es el mismo trato que ya
 * tienen Inbursa y transferencia en el cobro del mostrador. Por eso el botón
 * dice «Ya pagó, registrar»: se toca DESPUÉS de cobrar, no antes. El anticipo
 * entra al corte con su método, y el efectivo esperado no se mueve con los que
 * no van al cajón (tarjeta, transferencia, inbursa).
 *
 * Abonar NO da nota (eso es al cubrir el total, desde el carrito) y el servidor
 * acota el monto contra el total del encargo.
 */
const METODOS: { id: MetodoAnticipo; nombre: string; pista: string; alCajon: boolean }[] = [
  { id: 'efectivo', nombre: 'Efectivo', pista: 'Entra al cajón.', alCajon: true },
  { id: 'tarjeta', nombre: 'Terminal', pista: 'Cóbralo en la pinpad de Banorte y confirma aquí.', alCajon: false },
  { id: 'transferencia', nombre: 'Transferencia', pista: 'Que llegue a la cuenta y confirma aquí.', alCajon: false },
  { id: 'inbursa', nombre: 'Inbursa', pista: 'Cóbralo en la 2ª terminal (Inbursa) y confirma aquí.', alCajon: false },
]

export function ModalAnticipo({ open, cliente, total, yaAnticipado, onClose, onCobrar, ocupado }: Props) {
  const [valor, setValor] = useState('')
  const [metodo, setMetodo] = useState<MetodoAnticipo>('efectivo')

  if (!open) return null

  const falta = Math.max(0, total - yaAnticipado)
  const monto = Math.min(falta, Number(valor.replace(/[^\d.]/g, '')) || 0)
  const puede = monto > 0 && !ocupado
  const sel = METODOS.find((m) => m.id === metodo)!

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-sa-green-deep/60" onClick={onClose} />
      <div className="relative bg-sa-cream-soft rounded-sa-lg shadow-sa w-full max-w-sm p-6">
        <h3 className="font-display text-2xl text-sa-green-ink">Anticipo de {cliente}</h3>
        <p className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/55 mt-1">
          {yaAnticipado > 0
            ? `Ya dejó ${mxn(yaAnticipado)} · faltan ${mxn(falta)} de ${mxn(total)}`
            : `Faltan ${mxn(falta)} de ${mxn(total)}`}
        </p>

        {/* Cuánto deja */}
        <div className="relative mt-4">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono text-sa-green-ink/40 text-lg">$</span>
          <input
            type="text"
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="0"
            autoFocus
            className="w-full pl-10 pr-4 py-3 bg-white border border-sa-green-ink/10 rounded-sa font-mono text-2xl text-sa-green-ink focus:outline-none focus:ring-2 focus:ring-sa-green/30"
          />
        </div>
        <button
          onClick={() => setValor(String(falta))}
          className="mt-2 font-mono text-[11px] uppercase tracking-wide text-sa-green-deep hover:brightness-110"
        >
          Todo lo que falta · {mxn(falta)}
        </button>

        {/* Cómo paga */}
        <div className="grid grid-cols-2 gap-2 mt-4">
          {METODOS.map((m) => (
            <button
              key={m.id}
              onClick={() => setMetodo(m.id)}
              className={`py-2.5 rounded-full font-mono text-xs uppercase tracking-wide transition-colors ${
                metodo === m.id
                  ? 'bg-sa-green text-sa-cream'
                  : 'bg-white text-sa-green-ink/60 border border-sa-green-ink/10'
              }`}
            >
              {m.nombre}
            </button>
          ))}
        </div>
        <p className="font-body text-xs text-sa-green-ink/60 mt-2 bg-white/60 rounded-sa px-3 py-2">
          {sel.pista}
        </p>

        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            className="flex-1 border border-sa-green-ink/15 bg-white text-sa-green-ink/70 py-2.5 rounded-full font-mono text-xs uppercase tracking-wide hover:bg-sa-cream-warm"
          >
            Cancelar
          </button>
          <button
            onClick={() => puede && onCobrar(monto, metodo)}
            disabled={!puede}
            className="flex-1 bg-sa-green disabled:opacity-40 text-sa-cream py-2.5 rounded-full font-mono text-xs uppercase tracking-wide hover:bg-sa-green-deep"
          >
            {ocupado ? 'Registrando…' : sel.alCajon ? `Registrar ${mxn(monto)}` : `Ya pagó · registrar ${mxn(monto)}`}
          </button>
        </div>
      </div>
    </div>
  )
}
