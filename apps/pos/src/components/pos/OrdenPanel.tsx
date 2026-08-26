import React, { useState } from 'react'
import { usePosStore } from '@/store/posStore'
import { sb } from '../../lib/sb'
import { buscarCupon } from '@shake/supabase'
import { mxn } from '@shake/utils'
import type { Cupon } from '@shake/types'
import { ModalDescuento } from './ModalDescuento'
import { ModalCliente } from './ModalCliente'
import { ModalAutorizacion } from './ModalAutorizacion'
import { SugerenciaVenta } from './SugerenciaVenta'
import type { ProductoVenta } from '@shake/supabase'

interface Props {
  onCobrar: () => void
  /** Catálogo activo, para sugerir venta cruzada al cajero. */
  productos: ProductoVenta[]
}

export function OrdenPanel({ onCobrar, productos }: Props) {
  const {
    items, incrementar, decrementar, quitarItem, limpiarOrden,
    cliente, cupon, promo, promosDisp,
    setCupon, setPromo, setCliente, setPromosDisp,
    descuentoManual, setDescuentoManual,
    itemsElegiblesCupon,
    subtotal, descuentoCupon, descuentoPromoMonto, descuentoManualMonto, neto, totalItems,
  } = usePosStore()

  const [modalDescuento, setModalDescuento] = useState(false)
  const [modalCliente, setModalCliente] = useState(false)
  const [codigoCupon, setCodigoCupon] = useState('')
  const [cuponMsg, setCuponMsg] = useState<string | null>(null)
  // Cupón escaneado a mano: válido, pero esperando el PIN de gerente/admin.
  const [cuponPendiente, setCuponPendiente] = useState<Cupon | null>(null)

  function aplicarCupon(cup: Cupon) {
    setCuponMsg(null)
    if (itemsElegiblesCupon(cup).length === 0) {
      setCuponMsg(
        cup.tipo === 'cumpleanos'
          ? 'Agrega un shake al ticket para usar el cupón de cumpleaños.'
          : 'Agrega un producto para aplicar el cupón.',
      )
      return
    }
    setCupon(cup)
  }

  async function escanearCupon() {
    setCuponMsg(null)
    const c = await buscarCupon(sb, codigoCupon).catch(() => null)
    if (!c) return setCuponMsg('Cupón no encontrado.')
    if (c.estado !== 'activo') return setCuponMsg('El cupón no está activo.')
    if (new Date(c.vence_en).getTime() < Date.now()) return setCuponMsg('El cupón está vencido.')
    // Un cupón tecleado/escaneado a mano requiere autorización de gerente
    // (los cupones del cliente identificado se aplican directo porque ya
    // están ligados a su cuenta).
    setCuponPendiente(c)
  }

  const dCupon = descuentoCupon()
  const dPromo = descuentoPromoMonto()
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
            onClick={() => { limpiarOrden(); setCuponMsg(null) }}
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
            <img src="/milo-transparent.png" alt="Hojaldra de la casa" className="w-32 h-32 opacity-80" />
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
                  <p className="font-mono text-xs text-sa-green-ink/50">{mxn(l.producto.precio)} c/u</p>
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
                    {mxn(l.producto.precio * l.cantidad)}
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

      {/* Pie: cliente + cupón/promo + descuento + totales + cobrar */}
      {items.length > 0 && (
        <div className="border-t border-sa-green-ink/10 flex-shrink-0 bg-sa-cream-paper/30">
          {/* Cliente + descuento manual */}
          <div className="flex gap-2 px-4 py-3">
            <button
              onClick={() => setModalCliente(true)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-full font-mono text-xs uppercase tracking-wide transition-colors ${
                cliente
                  ? 'bg-sa-mint/30 text-sa-green-ink border border-sa-mint'
                  : 'bg-white text-sa-green-ink/70 border border-sa-green-ink/15 hover:bg-sa-cream-soft'
              }`}
            >
              <span>👤</span>
              {cliente ? cliente.nombre.split(' ')[0] : 'Cliente'}
            </button>
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

          {/* Cupones y promos del cliente */}
          {cliente && (
            <div className="px-4 pb-1 space-y-1">
              {cliente.cupones.length > 0 && !cupon && cliente.cupones.map((c) => (
                <div key={c.id} className="flex items-center justify-between bg-white border border-sa-green-ink/10 rounded-full px-3 py-1.5">
                  <span className="font-mono text-xs text-sa-green-ink truncate flex-1 mr-2">
                    {c.tipo === 'cumpleanos' ? '🎂' : '🎁'} {c.beneficio}
                  </span>
                  <button
                    onClick={() => aplicarCupon(c)}
                    className="text-sa-green text-xs font-mono uppercase tracking-wide hover:brightness-110 flex-shrink-0"
                  >
                    Aplicar
                  </button>
                </div>
              ))}
              {promosDisp.length > 0 && !promo && promosDisp.map((pr) => (
                <div key={pr.id} className="flex items-center justify-between bg-white border border-sa-green-ink/10 rounded-full px-3 py-1.5">
                  <span className="font-mono text-xs text-sa-green-ink truncate flex-1 mr-2">🎯 {pr.nombre}</span>
                  <button
                    onClick={() => setPromo(pr)}
                    className="text-sa-green text-xs font-mono uppercase tracking-wide hover:brightness-110 flex-shrink-0"
                  >
                    Aplicar
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Escáner de cupón por código (CUP-…) o cupón aplicado */}
          <div className="px-4 pb-2">
            {cupon ? (
              <div className="flex items-center gap-2 bg-sa-green/10 border border-sa-green/30 rounded-full px-3 py-1.5">
                <span className="font-mono text-xs text-sa-green-ink flex-1">🎟️ Cupón −{mxn(dCupon)}</span>
                <button
                  onClick={() => { setCupon(null); setCuponMsg(null) }}
                  className="text-sa-strawberry/70 hover:text-sa-strawberry text-xs"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={codigoCupon}
                  onChange={(e) => setCodigoCupon(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void escanearCupon() }}
                  placeholder="Escanear cupón (CUP-…)"
                  className="flex-1 px-3 py-1.5 bg-white border border-sa-green-ink/10 rounded-full font-mono text-xs text-sa-green-ink focus:outline-none focus:ring-2 focus:ring-sa-green/30"
                />
                <button
                  onClick={() => void escanearCupon()}
                  className="px-3 py-1.5 bg-sa-green text-sa-cream rounded-full font-mono text-xs uppercase tracking-wide hover:bg-sa-green-deep"
                >
                  Canjear
                </button>
              </div>
            )}
            {cuponMsg && <p className="font-mono text-xs text-sa-strawberry mt-1.5">{cuponMsg}</p>}
          </div>

          {/* Promo aplicada */}
          {promo && (
            <div className="px-4 pb-2">
              <div className="flex items-center justify-between bg-sa-green/10 border border-sa-green/20 rounded-sa px-3 py-1.5">
                <span className="font-mono text-xs text-sa-green-ink truncate flex-1 mr-2">🎯 {promo.nombre}</span>
                <span className="font-mono text-xs text-sa-green flex-shrink-0">−{mxn(dPromo)}</span>
                <button
                  onClick={() => setPromo(null)}
                  className="text-sa-strawberry/70 hover:text-sa-strawberry text-xs ml-2"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

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
            {dCupon > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-sa-green">Cupón</span>
                <span className="font-mono text-sa-green">−{mxn(dCupon)}</span>
              </div>
            )}
            {dPromo > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-sa-green">Promo</span>
                <span className="font-mono text-sa-green">−{mxn(dPromo)}</span>
              </div>
            )}
            {cliente && (
              <div className="flex justify-between text-xs">
                <span className="text-sa-blueberry">🏋️ Mancuernas</span>
                <span className="font-mono text-sa-blueberry">{cliente.mancuernas}</span>
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
      <ModalCliente
        open={modalCliente}
        onClose={() => setModalCliente(false)}
        onCliente={(c, promos) => { setCliente(c); setPromosDisp(promos); setCupon(null); setPromo(null) }}
        onQuitar={() => { setCliente(null); setPromosDisp([]); setCupon(null); setPromo(null) }}
      />
      <ModalAutorizacion
        open={cuponPendiente !== null}
        accion="canjear este cupón"
        onClose={() => setCuponPendiente(null)}
        onAutorizado={() => {
          if (cuponPendiente) {
            setCodigoCupon('')
            aplicarCupon(cuponPendiente)
          }
          setCuponPendiente(null)
        }}
      />
    </div>
  )
}
