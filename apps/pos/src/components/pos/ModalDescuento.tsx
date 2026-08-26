import React, { useState } from 'react'
import { mxn } from '@shake/utils'
import type { DescuentoManual } from '@/store/posStore'
import { ModalAutorizacion } from './ModalAutorizacion'

interface Props {
  open: boolean
  onClose: () => void
  descuentoActual: DescuentoManual | null
  onAplicar: (d: DescuentoManual) => void
  onQuitar: () => void
  subtotal: number
}

export function ModalDescuento({ open, onClose, descuentoActual, onAplicar, onQuitar, subtotal }: Props) {
  const [tipo, setTipo] = useState<'porcentaje' | 'monto'>('porcentaje')
  const [valor, setValor] = useState('')
  // El descuento no se aplica directo: primero un gerente/administrador
  // autoriza con su PIN (candado pedido por el negocio).
  const [pendiente, setPendiente] = useState<DescuentoManual | null>(null)

  if (!open) return null

  const valorNum = parseFloat(valor) || 0
  const descuentoCalculado = tipo === 'porcentaje'
    ? subtotal * (valorNum / 100)
    : Math.min(valorNum, subtotal)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-sa-green-deep/60" onClick={onClose} />
      <div className="relative bg-sa-cream-soft rounded-sa-lg shadow-sa w-full max-w-sm p-6">
        <h3 className="font-display text-2xl text-sa-green-ink mb-4">Aplica descuento</h3>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setTipo('porcentaje')}
            className={`flex-1 py-2.5 rounded-full font-mono text-xs uppercase tracking-wide transition-colors ${
              tipo === 'porcentaje'
                ? 'bg-sa-green text-sa-cream'
                : 'bg-white text-sa-green-ink/60 border border-sa-green-ink/10'
            }`}
          >
            % Porcentaje
          </button>
          <button
            onClick={() => setTipo('monto')}
            className={`flex-1 py-2.5 rounded-full font-mono text-xs uppercase tracking-wide transition-colors ${
              tipo === 'monto'
                ? 'bg-sa-green text-sa-cream'
                : 'bg-white text-sa-green-ink/60 border border-sa-green-ink/10'
            }`}
          >
            $ Monto fijo
          </button>
        </div>

        {tipo === 'porcentaje' && (
          <div className="flex gap-2 mb-3">
            {[5, 10, 15, 20].map((p) => (
              <button
                key={p}
                onClick={() => setValor(String(p))}
                className={`flex-1 py-2.5 rounded-sa font-mono text-sm transition-colors ${
                  valor === String(p)
                    ? 'bg-sa-banana text-sa-green-ink'
                    : 'bg-sa-cream-warm text-sa-green-ink/70 hover:bg-sa-banana/60'
                }`}
              >
                {p}%
              </button>
            ))}
          </div>
        )}

        <div className="relative mb-3">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono text-sa-green-ink/40 text-lg">
            {tipo === 'porcentaje' ? '%' : '$'}
          </span>
          <input
            type="number"
            min={0}
            max={tipo === 'porcentaje' ? 100 : subtotal}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="0"
            className="w-full pl-10 pr-4 py-3 bg-white border border-sa-green-ink/10 rounded-sa font-mono text-2xl text-sa-green-ink focus:outline-none focus:ring-2 focus:ring-sa-green/30"
            autoFocus
          />
        </div>

        {valorNum > 0 && (
          <div className="bg-white rounded-sa px-4 py-3 mb-4 flex justify-between items-center border border-sa-strawberry/20">
            <span className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/60">Ahorro</span>
            <span className="font-mono text-lg font-medium text-sa-strawberry">−{mxn(descuentoCalculado)}</span>
          </div>
        )}

        <div className="flex gap-2">
          {descuentoActual && (
            <button
              onClick={onQuitar}
              className="px-4 py-2.5 border border-sa-strawberry/30 text-sa-strawberry rounded-full font-mono text-xs uppercase tracking-wide hover:bg-sa-strawberry/10"
            >
              Quitar
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 border border-sa-green-ink/15 bg-white text-sa-green-ink/70 py-2.5 rounded-full font-mono text-xs uppercase tracking-wide hover:bg-sa-cream-warm"
          >
            Cancelar
          </button>
          <button
            onClick={() => valorNum > 0 && setPendiente({ tipo, valor: valorNum })}
            disabled={valorNum <= 0}
            className="flex-1 bg-sa-green disabled:opacity-40 text-sa-cream py-2.5 rounded-full font-mono text-xs uppercase tracking-wide hover:bg-sa-green-deep"
          >
            Aplicar
          </button>
        </div>
      </div>

      <ModalAutorizacion
        open={pendiente !== null}
        accion="aplicar este descuento"
        onClose={() => setPendiente(null)}
        onAutorizado={() => {
          if (pendiente) onAplicar(pendiente)
          setPendiente(null)
        }}
      />
    </div>
  )
}
