import React, { useState } from 'react'
import { usePosStore } from '@/store/posStore'
import { mxn } from '@lily/utils'
import { ModalDescuento } from './ModalDescuento'
import { SugerenciaVenta } from './SugerenciaVenta'
import type { ProductoVenta } from '@lily/supabase'

interface Props {
  onCobrar: () => void
  /** Catálogo activo, para sugerir venta cruzada al cajero. */
  productos: ProductoVenta[]
}

export function OrdenPanel({ onCobrar, productos }: Props) {
  const {
    items, incrementar, decrementar, quitarItem, limpiarOrden,
    descuentoManual, setDescuentoManual,
    subtotal, descuentoManualMonto, neto, totalItems,
    precioDe,
  } = usePosStore()

  const [modalDescuento, setModalDescuento] = useState(false)

  const dManual = descuentoManualMonto()

  return (
    <div className="flex flex-col h-full">
      {/* Encabezado */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-sa-green-ink/10 flex-shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-xl text-sa-green-ink">Orden actual</h2>
          {totalItems() > 0 && (
            <span className="font-mono text-xs bg-sa-green text-sa-cream px-2 py-0.5 rounded-full">
              {totalItems()}
            </span>
          )}
        </div>
        {items.length > 0 && (
          <button
            onClick={() => limpiarOrden()}
            className="font-mono text-xs uppercase tracking-wide text-sa-strawberry hover:brightness-110"
          >
            Cancelar
          </button>
        )}
      </div>

      {/* Lista de ítems */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-sa-green-ink/40 gap-3 pb-10 px-6">
            <img src={`${import.meta.env.BASE_URL}hojaldra.png`} alt="Hojaldra de la casa" className="w-32 h-32 opacity-80" />
            <p className="font-display text-lg text-sa-green-ink/60 text-center leading-tight">
              Aún no hay nada en la orden
            </p>
            <p className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/40 text-center">
              Toca un producto para empezar
            </p>
          </div>
        ) : (
          <div className="px-3 py-3 space-y-2">
            {items.map((l) => (
              <div key={l.lineaId} className="flex items-center gap-2 bg-sa-cream-soft rounded-sa px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-sa-green-ink truncate">{l.producto.nombre}</p>
                  <p className="font-mono text-xs text-sa-green-ink/50">{mxn(precioDe(l.producto))} c/u</p>
                  {l.personalizacion && (
                    <p className="font-mono text-xs text-sa-strawberry mt-0.5 leading-snug">
                      📝 {l.personalizacion}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => decrementar(l.lineaId)}
                    className="w-7 h-7 rounded-full bg-white hover:bg-sa-strawberry/10 text-sa-green-ink hover:text-sa-strawberry text-sm flex items-center justify-center font-bold transition-colors border border-sa-green-ink/10"
                  >
                    −
                  </button>
                  <span className="w-6 text-center font-mono text-sm font-medium text-sa-green-ink">
                    {l.cantidad}
                  </span>
                  <button
                    onClick={() => incrementar(l.lineaId)}
                    className="w-7 h-7 rounded-full bg-sa-green hover:bg-sa-green-deep text-sa-cream text-sm flex items-center justify-center font-bold transition-colors"
                  >
                    +
                  </button>
                </div>
                <div className="w-16 text-right flex-shrink-0">
                  <p className="font-mono text-sm font-medium text-sa-green-ink">
                    {mxn(precioDe(l.producto) * l.cantidad)}
                  </p>
                </div>
                <button
                  onClick={() => quitarItem(l.lineaId)}
                  className="text-sa-green-ink/30 hover:text-sa-strawberry transition-colors ml-1 flex-shrink-0"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pie: cupón + descuento + totales + cobrar */}
      {items.length > 0 && (
        <div className="border-t border-sa-green-ink/10 flex-shrink-0 bg-sa-cream-paper/30">
          {/* Descuento manual. El boton de "Cliente" que iba aqui al lado
              era para identificar a un cliente de lealtad; la panaderia no
              opera lealtad, asi que el descuento se queda con todo el ancho. */}
          <div className="flex gap-2 px-4 py-3">
            <button
              onClick={() => setModalDescuento(true)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-full font-mono text-xs uppercase tracking-wide transition-colors ${
                descuentoManual
                  ? 'bg-sa-banana/30 text-sa-green-ink border border-sa-banana'
                  : 'bg-white text-sa-green-ink/70 border border-sa-green-ink/15 hover:bg-sa-cream-soft'
              }`}
            >
              <span>🏷️</span>
              {descuentoManual
                ? descuentoManual.tipo === 'porcentaje'
                  ? `${descuentoManual.valor}% off`
                  : `-${mxn(descuentoManual.valor)}`
                : 'Descuento'}
            </button>
          </div>

          <SugerenciaVenta productos={productos} />

          {/* Totales */}
          <div className="px-5 py-3 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-sa-green-ink/60">Subtotal</span>
              <span className="font-mono text-sa-green-ink/70">{mxn(subtotal())}</span>
            </div>
            {dManual > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-sa-strawberry">Descuento</span>
                <span className="font-mono text-sa-strawberry">−{mxn(dManual)}</span>
              </div>
            )}
            <div className="flex justify-between items-baseline pt-2 border-t border-sa-green-ink/10">
              <span className="font-display text-lg text-sa-green-ink">Total</span>
              <span className="font-display text-3xl text-sa-green-ink">{mxn(neto())}</span>
            </div>
          </div>

          {/* Botón de cobro */}
          <div className="px-4 pb-4">
            <button
              onClick={onCobrar}
              className="w-full bg-sa-strawberry hover:brightness-110 active:scale-[0.98] text-white py-4 rounded-sa-lg font-display text-2xl shadow-sa-sm transition-all"
            >
              Cobrar {mxn(neto())}
            </button>
          </div>
        </div>
      )}

      {/* Modales */}
      <ModalDescuento
        open={modalDescuento}
        onClose={() => setModalDescuento(false)}
        descuentoActual={descuentoManual}
        onAplicar={(d) => { setDescuentoManual(d); setModalDescuento(false) }}
        onQuitar={() => { setDescuentoManual(null); setModalDescuento(false) }}
        subtotal={subtotal()}
      />
    </div>
  )
}
