import React, { useState } from 'react'
import { usePosStore } from '@/store/posStore'
import { mxn, urlDeFoto } from '@lily/utils'
import { ModalDescuento } from './ModalDescuento'
import { Etiqueta, Nota } from './IconosUI'
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
    subtotal, descuentoManualMonto, neto, aCobrar, totalItems,
    precioDe, encargo, nombreCliente, setNombreCliente,
  } = usePosStore()

  const [modalDescuento, setModalDescuento] = useState(false)

  const dManual = descuentoManualMonto()
  const n = totalItems()

  return (
    <div className="flex flex-col h-full">
      {/* Encabezado: «Ticket · N pzas» (como el prototipo). */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-sa-green-ink/10 flex-shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-xl text-sa-green-ink">
            {encargo ? 'Entregando un encargo' : 'Ticket'}
          </h2>
          {n > 0 && (
            <span className="font-mono text-xs font-semibold bg-sa-green text-sa-cream px-2.5 py-0.5 rounded-full">
              {n} {n === 1 ? 'pza' : 'pzas'}
            </span>
          )}
        </div>
        {items.length > 0 && (
          <button
            onClick={() => limpiarOrden()}
            className="font-mono text-xs uppercase tracking-wide text-sa-green-deep hover:brightness-110"
          >
            Cancelar
          </button>
        )}
      </div>

      {/* De quién es este ticket.
          En un encargo, el nombre es el del encargo (banda amarilla). En una
          venta de mostrador es opcional —para gritar el pedido cuando esté
          listo—: si no, queda en blanco y no pasa nada. */}
      {encargo ? (
        <div className="bg-sa-banana/25 border-b border-sa-banana px-5 py-3 flex-shrink-0">
          <p className="font-display text-lg text-sa-green-ink leading-tight">
            Encargo #{encargo.folio} · {encargo.cliente}
          </p>
          <p className="font-mono text-[11px] uppercase tracking-wide text-sa-green-ink/60 mt-0.5">
            {encargo.anticipo > 0
              ? `Ya dejó ${mxn(encargo.anticipo)} de anticipo`
              : 'Sin anticipo'}
            {' · se cobra todo en un solo ticket'}
          </p>
        </div>
      ) : (
        <div className="px-4 pt-3 flex-shrink-0">
          <input
            type="text"
            value={nombreCliente}
            onChange={(e) => setNombreCliente(e.target.value)}
            placeholder="¿A nombre de quién? (opcional)"
            className="w-full px-4 py-2.5 bg-sa-cream-soft rounded-sa-lg text-sm text-sa-green-ink placeholder:font-mono placeholder:text-sa-green-ink/40 placeholder:text-xs focus:outline-none focus:ring-2 focus:ring-sa-green/30 border border-sa-green-ink/10"
          />
        </div>
      )}

      {/* Lista de ítems */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-sa-green-ink/40 gap-3 pb-10 px-6">
            <img src={`${import.meta.env.BASE_URL}hojaldra.png`} alt="Hojaldra de la casa" className="w-32 h-32 opacity-80" />
            <p className="font-display text-lg text-sa-green-ink/60 text-center leading-tight">
              Aún no hay nada en el ticket
            </p>
            <p className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/40 text-center">
              Toca un producto para empezar
            </p>
          </div>
        ) : (
          <div className="px-3 py-3 space-y-2">
            {items.map((l) => {
              const foto = urlDeFoto(l.producto.imagen_url, import.meta.env.BASE_URL)
              return (
                <div key={l.lineaId} className="flex items-center gap-2.5 bg-sa-cream-soft rounded-sa-lg px-3 py-2.5">
                  {foto && (
                    <img
                      src={foto}
                      alt=""
                      className="w-10 h-10 object-contain flex-shrink-0 bg-white rounded-sa p-0.5"
                      draggable={false}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-sa-green-ink leading-tight">{l.producto.nombre}</p>
                    <p className="font-mono text-xs text-sa-green-ink/50">{mxn(precioDe(l.producto))} c/u</p>
                    {l.personalizacion && (
                      <p className="flex items-start gap-1 font-mono text-xs text-sa-green-deep mt-0.5 leading-snug">
                        <Nota className="w-3 h-3 shrink-0 mt-0.5" />
                        {l.personalizacion}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => decrementar(l.lineaId)}
                      className="w-8 h-8 rounded-full bg-white hover:bg-sa-green-deep/10 text-sa-green-ink text-base flex items-center justify-center font-bold transition-colors border border-sa-green-ink/10"
                    >
                      −
                    </button>
                    <span className="w-6 text-center font-mono text-base font-semibold text-sa-green-ink">
                      {l.cantidad}
                    </span>
                    <button
                      onClick={() => incrementar(l.lineaId)}
                      className="w-8 h-8 rounded-full bg-sa-green hover:bg-sa-green-deep text-sa-cream text-base flex items-center justify-center font-bold transition-colors"
                    >
                      +
                    </button>
                  </div>
                  <div className="w-16 text-right flex-shrink-0">
                    <p className="font-mono text-sm font-bold text-sa-green-ink">
                      {mxn(precioDe(l.producto) * l.cantidad)}
                    </p>
                  </div>
                  <button
                    onClick={() => quitarItem(l.lineaId)}
                    className="text-sa-green-ink/30 hover:text-sa-green-deep transition-colors flex-shrink-0"
                    aria-label="Quitar"
                  >
                    ✕
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Pie: descuento + totales + cobrar */}
      {items.length > 0 && (
        <div className="border-t border-sa-green-ink/10 flex-shrink-0 bg-white">
          <SugerenciaVenta productos={productos} />

          {/* Totales */}
          <div className="px-5 pt-4 pb-1 space-y-1.5">
            <div className="flex justify-between items-center text-sm">
              <span className="text-sa-green-ink/60">Subtotal</span>
              <span className="font-mono text-sa-green-ink/70">{mxn(subtotal())}</span>
            </div>
            {/* Descuento manual, como enlace (estilo del prototipo). */}
            <button
              onClick={() => setModalDescuento(true)}
              className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-wide text-sa-green-deep hover:brightness-110"
            >
              <Etiqueta className="w-3.5 h-3.5" />
              {descuentoManual
                ? descuentoManual.tipo === 'porcentaje'
                  ? `Descuento ${descuentoManual.valor}%`
                  : `Descuento −${mxn(descuentoManual.valor)}`
                : 'Aplicar descuento'}
            </button>
            {dManual > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-sa-green-deep">Descuento</span>
                <span className="font-mono text-sa-green-deep">−{mxn(dManual)}</span>
              </div>
            )}
            {/* El anticipo NO es un descuento: ese dinero sí entró, en el corte
                del día en que se recibió. Va en su propio renglón. */}
            {encargo && encargo.anticipo > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-sa-green-ink/60">Ya pagó de anticipo</span>
                <span className="font-mono text-sa-green-ink/70">−{mxn(encargo.anticipo)}</span>
              </div>
            )}
          </div>

          <div className="px-5 pt-2 pb-3 flex justify-between items-baseline border-t border-sa-green-ink/10 mx-5">
            <span className="font-display text-xl text-sa-green-ink">
              {encargo && encargo.anticipo > 0 ? 'Le falta' : 'Total'}
            </span>
            <span className="font-display text-4xl text-sa-green-ink leading-none">{mxn(aCobrar())}</span>
          </div>

          {/* Botón de cobro. En carmín, el botón más importante del sistema. */}
          <div className="px-4 pb-4">
            <button
              onClick={onCobrar}
              className="w-full bg-sa-green hover:bg-sa-green-deep active:scale-[0.98] text-sa-cream py-4 rounded-sa-lg font-display text-2xl shadow-sa-sm transition-all"
            >
              Cobrar {mxn(aCobrar())}
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
