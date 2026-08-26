import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  crearOrden, crearOrdenKioskoCaja, cobrarOrden, listarAlmacenes,
  listarCajas, corteAbierto, nombresPedidoFrecuentes,
} from '@shake/supabase'
import { obtenerPaymentProvider } from '@shake/payments'
import type { Almacen, CajaCorte, MetodoPago } from '@shake/types'
import type { ModoPagoKiosko } from '@shake/types'
import { useCarrito, type ItemCarrito } from '@/store/carritoStore'
import { TecladoNombre } from '@/components/TecladoNombre'
import { sb } from '@/lib/sb'
import { resolverModoKiosko } from '@/lib/modoKiosko'
import { canjearMancuernas, canjearSellos } from '@shake/supabase'
import { PanelRewards, SIN_REWARDS, type DecisionRewards } from '@/components/PanelRewards'
import { mensajeDeError } from '@shake/utils'

type EstadoPago = 'cargando' | 'eligiendo' | 'procesando' | 'no_disponible'

/**
 * Traduce una línea del carrito a una línea de la orden.
 *
 * `linea`/`padre_linea` son etiquetas del navegador: el servidor genera los
 * uuid reales y solo las usa para resolver quién acompaña a quién dentro de
 * este mismo envío. Es lo que hace que las galletas queden pegadas a SU
 * shake y no al otro que iba en el mismo pedido.
 */
const lineaParaOrden = (i: ItemCarrito) => ({
  producto_id: i.producto_id,
  cantidad: i.cantidad,
  personalizacion: i.personalizacion ?? null,
  linea: i.linea,
  padre_linea: i.padreLinea ?? null,
})

/**
 * Nombres semilla para los chips del cajero. Solo rellenan mientras la
 * tienda junta historia: los nombres reales de pedidos anteriores siempre
 * van primero y con el tiempo desplazan a estos.
 */
const NOMBRES_BASE = [
  'Pedro', 'Adrián', 'Manuel', 'Carlos', 'Luis', 'José',
  'Juan', 'Miguel', 'Jorge', 'Ana', 'María', 'Sofía',
]

/** Para comparar nombres sin pelearse con acentos ni mayúsculas. */
const clave = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

const IconCard = () => (
  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="4" width="22" height="16" rx="2"/>
    <line x1="1" y1="10" x2="23" y2="10"/>
  </svg>
)

const IconCounter = () => (
  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" />
  </svg>
)

function ProcesandoOverlay({ monto }: { monto: number }) {
  return (
    <div className="fixed inset-0 z-50 bg-sa-green-deep flex flex-col items-center justify-center gap-6 px-8 text-sa-cream">
      <svg className="animate-spin w-16 h-16 text-sa-banana" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
        <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
      <p className="font-display text-3xl">Procesando…</p>
      <p className="font-display text-4xl">${monto.toFixed(2)}</p>
    </div>
  )
}

export function Pago() {
  const navigate = useNavigate()
  const { items, total, usuario, cajero, nombrePedido, setNombrePedido, limpiar } = useCarrito()
  const [rewards, setRewards] = useState<DecisionRewards>(SIN_REWARDS)
  const [estado, setEstado] = useState<EstadoPago>('cargando')
  const [modo, setModo] = useState<ModoPagoKiosko | null>(null)
  const [almacen, setAlmacen] = useState<Almacen | null>(null)
  const [corte, setCorte] = useState<CajaCorte | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errorProveedor, setErrorProveedor] = useState<string | null>(null)
  /** Nombres aprendidos de pedidos anteriores, para los chips del cajero. */
  const [nombresGuardados, setNombresGuardados] = useState<string[]>([])
  /** Cobro vivo en la terminal Clip: monto en pantalla + id para sondear. */
  const [terminal, setTerminal] = useState<{ monto: number; proveedorPaymentId: string } | null>(null)
  const cobroCancelado = useRef(false)

  /**
   * Chips de nombre para el cajero: los aprendidos primero (por frecuencia),
   * la semilla rellena mientras hay poca historia. Al teclear se vuelven
   * predictivos: solo quedan los que empiezan como lo escrito, sin
   * distinguir acentos ("adri" también encuentra "Adrián").
   */
  const sugerenciasNombre = useMemo(() => {
    const lista = [...nombresGuardados]
    for (const n of NOMBRES_BASE) {
      if (!lista.some((g) => clave(g) === clave(n))) lista.push(n)
    }
    const escrito = clave(nombrePedido)
    const visibles = escrito
      ? lista.filter((n) => clave(n).startsWith(escrito) && clave(n) !== escrito)
      : lista
    return visibles.slice(0, 12)
  }, [nombresGuardados, nombrePedido])

  useEffect(() => {
    ;(async () => {
      try {
        const almacenes = await listarAlmacenes(sb)
        const kiosko = almacenes.find((a) => a.tipo === 'kiosko') ?? almacenes[0] ?? null
        if (!kiosko) throw new Error('No hay almacén configurado para el kiosko.')
        setAlmacen(kiosko)
        const modoResuelto = await resolverModoKiosko(sb, kiosko.sucursal_id)
        setModo(modoResuelto)

        // En modo cajero la venta tiene que caer en el corte abierto; si no,
        // no aparece en el arqueo del día. Se resuelve aquí y no al cobrar
        // para que un problema de configuración salte antes, no a media venta.
        if (modoResuelto === 'cajero') {
          const cajas = await listarCajas(sb)
          const caja = cajas.find((c) => c.sucursal_id === kiosko.sucursal_id) ?? cajas[0] ?? null
          setCorte(caja ? await corteAbierto(sb, caja.id) : null)
          // Sin await ni catch ruidoso: si esto falla, el cajero escribe el
          // nombre a mano como siempre y la venta no se entera.
          nombresPedidoFrecuentes(sb).then(setNombresGuardados).catch(() => {})
        }

        setEstado('eligiendo')
      } catch (e) {
        setError(mensajeDeError(e))
        setEstado('eligiendo')
      }
    })()
  }, [])

  /**
   * Modo "pagar en caja": crea la orden en awaiting_counter_payment y
   * punto — NINGUNA venta se confirma aquí. El cliente se va a caja con
   * su folio/código; solo cuando el cajero la cobre desde POS se
   * descuenta inventario, se otorgan mancuernas y se generan comandas.
   */
  async function confirmarPagarEnCaja() {
    if (!almacen) return
    setEstado('procesando')
    setError(null)
    try {
      const orden = await crearOrdenKioskoCaja(
        sb,
        {
          sucursalId: almacen.sucursal_id,
          almacenId: almacen.id,
          clienteId: usuario?.clienteId ?? null,
          nombreCliente: nombrePedido.trim() || usuario?.nombre?.split(' ')[0] || null,
        },
        items.map(lineaParaOrden),
      )
      limpiar()
      navigate('/pagar-en-caja', { state: { orden } })
    } catch (e) {
      setError(mensajeDeError(e))
      setEstado('eligiendo')
    }
  }

  /**
   * Modo "cajero": la misma pantalla del kiosko, pero operada por un
   * empleado que levanta el pedido frente al cliente. Cobra en el mismo
   * acto, así que la comanda sale a cocina de inmediato.
   *
   * Esto NO es saltarse el cobro. Se registra el método de pago, el
   * empleado que cobró y el corte abierto — sin eso, el corte de caja no
   * cuadraría al cierre y no habría a quién atribuir la venta. La
   * diferencia con 'pagar_en_caja' es sólo que no hay un segundo paso en
   * otra pantalla: quien opera ya es el cajero.
   */
  /**
   * Cobro en la terminal física (API de PinPad de Clip): el monto aparece
   * solo en la Stand 2 y aquí solo se espera. La venta se confirma DEL
   * LADO SERVIDOR (webhook o sondeo verifican contra Clip); esta pantalla
   * nunca decide que algo se pagó — solo se entera.
   */
  async function cobrarEnTerminal(orden: { id: string; folio: number; total: number }) {
    const proveedor = obtenerPaymentProvider('clip', sb)
    const resultado = await proveedor.createPayment({
      ordenId: orden.id,
      monto: orden.total,
      idempotencyKey: crypto.randomUUID(),
      sucursalId: almacen!.sucursal_id,
    })

    if (!resultado.ok || !resultado.proveedorPaymentId) {
      const mensaje = resultado.error?.mensaje ?? 'No se pudo mandar el cobro a la terminal.'
      if (modo === 'clip') {
        // Autoservicio: al cliente se le ofrece la salida de "pagar en caja".
        setErrorProveedor(mensaje)
        setEstado('no_disponible')
      } else {
        // Cajero: mensaje directo y que elija otro método.
        setError(mensaje)
        setEstado('eligiendo')
      }
      return
    }

    cobroCancelado.current = false
    setEstado('eligiendo')
    setTerminal({ monto: orden.total, proveedorPaymentId: resultado.proveedorPaymentId })

    const inicio = Date.now()
    let final: 'authorized' | 'rechazado' | 'timeout' = 'timeout'
    while (Date.now() - inicio < 120_000) {
      await new Promise((r) => setTimeout(r, 3000))
      if (cobroCancelado.current) {
        // Si la cancelacion falla hay que decirlo: la terminal se queda
        // esperando el cobro y el siguiente cliente pagaria lo del anterior.
        try {
          await proveedor.cancelPayment(resultado.proveedorPaymentId)
        } catch {
          setError(
            'No se pudo cancelar en la terminal: puede seguir esperando el cobro. ' +
              'Cancélalo desde la terminal antes de volver a cobrar.',
          )
        }
        setTerminal(null)
        return
      }
      const s = await proveedor.getPaymentStatus(resultado.proveedorPaymentId)
      if (s.estado === 'authorized') { final = 'authorized'; break }
      if (['declined', 'cancelled', 'expired'].includes(s.estado)) { final = 'rechazado'; break }
    }

    setTerminal(null)
    if (final === 'authorized') {
      const itemsSnapshot = [...items]
      const usuarioSnapshot = usuario ? { ...usuario } : null
      limpiar()
      navigate('/confirmacion', {
        state: {
          folio: String(orden.folio),
          ordenId: orden.id,
          total: orden.total,
          metodo: 'terminal',
          items: itemsSnapshot,
          usuario: usuarioSnapshot,
          demo: false,
        },
      })
    } else if (final === 'rechazado') {
      setError('La terminal rechazó o canceló el pago. Puedes reintentar o cobrar con otro método.')
    } else {
      let avisoCancelacion = ''
      try {
        await proveedor.cancelPayment(resultado.proveedorPaymentId)
      } catch {
        avisoCancelacion = ' Tampoco se pudo cancelar el cobro: puede seguir vivo en la terminal.'
      }
      setError(
        'La terminal no confirmó el pago. OJO: si la terminal SÍ cobró, la venta se confirmará sola en unos segundos — verifícalo antes de volver a cobrar.' +
          avisoCancelacion,
      )
    }
  }

  async function confirmarCajero(metodo: MetodoPago) {
    if (!almacen || !cajero) return
    setEstado('procesando')
    setError(null)
    try {
      const orden = await crearOrden(
        sb,
        {
          sucursal_id: almacen.sucursal_id,
          almacen_id: almacen.id,
          canal: 'pos',
          empleado_id: cajero.id,
          corte_id: corte?.id ?? null,
          cliente_id: usuario?.clienteId ?? null,
          nombre_cliente: nombrePedido.trim() || usuario?.nombre?.split(' ')[0] || null,
        },
        items.map(lineaParaOrden),
      )
      // Clip: el cobro viaja a la terminal física y la venta la confirma
      // el servidor cuando Clip avisa. Los demás métodos se cobran aquí.
      if (metodo === 'clip') {
        await cobrarEnTerminal(orden)
        return
      }

      // Rewards, entre crear y cobrar. El orden importa: primero el
      // premio de sellos y después las mancuernas, porque el servidor
      // recorta las mancuernas a lo que cuesta la orden — si fuera al
      // revés se gastarían de más sobre un total que aún iba a bajar.
      let totalAPagar = orden.total
      if (rewards.sello) {
        const r = await canjearSellos(sb, orden.id, rewards.sello.tipo, rewards.sello.productoId)
        totalAPagar = r.total_a_pagar
      }
      if (rewards.mancuernas > 0) {
        const r = await canjearMancuernas(sb, orden.id, rewards.mancuernas)
        totalAPagar = r.total_a_pagar
      }

      // El monto sale de la orden que devolvió el servidor, no del carrito:
      // el total autoritativo es el que recalculó la base.
      await cobrarOrden(sb, orden.id, metodo, totalAPagar, {
        autorizadoPor: cajero.id,
        idempotencyKey: crypto.randomUUID(),
      })

      const itemsSnapshot = [...items]
      const usuarioSnapshot = usuario ? { ...usuario } : null
      limpiar()
      navigate('/confirmacion', {
        state: {
          folio: String(orden.folio),
          ordenId: orden.id,
          total: totalAPagar,
          metodo: metodo === 'efectivo' ? 'efectivo' : 'terminal',
          items: itemsSnapshot,
          usuario: usuarioSnapshot,
          demo: false,
        },
      })
    } catch (e) {
      setError(mensajeDeError(e))
      setEstado('eligiendo')
    }
  }

  /**
   * Modo "clip": SIEMPRE pasa por el proveedor de pagos real — nunca se
   * autoaprueba nada aquí. Mientras Clip no tenga credenciales
   * configuradas (ver supabase/functions/clip-crear-cobro), el proveedor
   * devuelve ok:false y se ofrece "pagar en caja" como salida segura.
   */
  async function confirmarClip() {
    if (!almacen) return
    setEstado('procesando')
    setError(null)
    setErrorProveedor(null)
    try {
      const orden = await crearOrden(
        sb,
        {
          sucursal_id: almacen.sucursal_id,
          almacen_id: almacen.id,
          canal: 'kiosko',
          cliente_id: usuario?.clienteId ?? null,
          descuento: 0,
          nombre_cliente: nombrePedido.trim() || usuario?.nombre?.split(' ')[0] || null,
        },
        items.map(lineaParaOrden),
      )

      // El mismo flujo de terminal que usa el cajero: el monto aparece en
      // la Stand 2 y la venta la confirma el servidor con la verdad de Clip.
      await cobrarEnTerminal(orden)
    } catch (e) {
      setError(mensajeDeError(e))
      setEstado('eligiendo')
    }
  }

  /**
   * Modo "demo": SOLO alcanzable si resolverModoKiosko() lo permitió (es
   * decir, nunca en un build de producción — ver lib/modoKiosko.ts). Usa
   * MockPaymentProvider (simulado, se niega a existir en build de
   * producción por su cuenta también) y crea la orden con
   * `es_demo=true`: se marca pagada para que la pantalla de confirmación
   * se vea completa, pero el trigger de inventario/cocina/mancuernas la
   * ignora por completo — cero efectos reales.
   */
  async function confirmarDemo() {
    if (!almacen) return
    setEstado('procesando')
    setError(null)
    try {
      const orden = await crearOrden(
        sb,
        {
          sucursal_id: almacen.sucursal_id,
          almacen_id: almacen.id,
          canal: 'kiosko',
          cliente_id: usuario?.clienteId ?? null,
          descuento: 0,
          es_demo: true,
          nombre_cliente: nombrePedido.trim() || usuario?.nombre?.split(' ')[0] || null,
        },
        items.map(lineaParaOrden),
      )

      const proveedor = obtenerPaymentProvider('demo', sb)
      const resultado = await proveedor.createPayment({
        ordenId: orden.id,
        monto: orden.total,
        idempotencyKey: crypto.randomUUID(),
        sucursalId: almacen.sucursal_id,
      })
      if (!resultado.ok) throw new Error(resultado.error?.mensaje ?? 'Fallo simulado')

      await cobrarOrden(sb, orden.id, 'clip', orden.total, { idempotencyKey: crypto.randomUUID() })

      const itemsSnapshot = [...items]
      limpiar()
      navigate('/confirmacion', {
        state: {
          folio: String(orden.folio),
          ordenId: orden.id,
          total: orden.total,
          metodo: 'terminal',
          items: itemsSnapshot,
          usuario: usuario ? { ...usuario } : null,
          demo: true,
        },
      })
    } catch (e) {
      setError(mensajeDeError(e))
      setEstado('eligiendo')
    }
  }

  if (estado === 'cargando') {
    return (
      <div className="flex flex-col h-screen items-center justify-center bg-sa-cream-paper">
        <p className="font-mono text-sm text-sa-green-ink/50 animate-pulse">Cargando…</p>
      </div>
    )
  }

  if (estado === 'procesando') {
    return <ProcesandoOverlay monto={total()} />
  }

  if (estado === 'no_disponible') {
    return (
      <div className="flex flex-col h-screen items-center justify-center gap-6 px-8 bg-sa-cream-paper text-center">
        <div className="w-20 h-20 rounded-full bg-sa-strawberry/15 flex items-center justify-center">
          <span className="text-4xl">⚠️</span>
        </div>
        <h1 className="font-display text-3xl text-sa-green-ink">Pago temporalmente no disponible</h1>
        <p className="font-body text-sa-green-ink/60 max-w-sm">{errorProveedor}</p>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button
            onClick={() => void confirmarPagarEnCaja()}
            className="bg-sa-green text-sa-cream py-4 rounded-sa-lg font-display text-xl hover:bg-sa-green-deep transition-colors"
          >
            Pagar en caja
          </button>
          <button
            onClick={() => setEstado('eligiendo')}
            className="border border-sa-green-ink/15 text-sa-green-ink py-3 rounded-sa font-mono text-sm uppercase tracking-wide"
          >
            Volver
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-sa-cream-paper">
      {/* Cobro vivo en la terminal: pantalla de espera con salida de emergencia. */}
      {terminal && (
        <div className="fixed inset-0 z-50 bg-sa-green-deep flex flex-col items-center justify-center gap-5 px-8 text-sa-cream">
          <svg className="animate-spin w-14 h-14 text-sa-banana" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <p className="font-display text-4xl text-center leading-tight">Cobra en la terminal</p>
          <p className="font-display text-6xl text-sa-banana">${terminal.monto.toFixed(2)}</p>
          <p className="font-body text-base text-sa-cream/70 text-center max-w-sm">
            El monto ya está en la Clip Stand — acerca, inserta o desliza la tarjeta.
          </p>
          <button
            onClick={() => { cobroCancelado.current = true }}
            className="mt-2 border border-sa-cream/25 hover:border-sa-cream/60 text-sa-cream/80 px-8 py-3 rounded-full font-display text-lg transition-colors"
          >
            Cancelar cobro
          </button>
        </div>
      )}
      {modo === 'demo' && (
        <div className="bg-sa-banana text-sa-coffee text-center py-1.5 font-mono text-xs uppercase tracking-[0.3em]">
          ⚠ Modo demostración — ninguna venta es real
        </div>
      )}
      <header className="flex items-center gap-4 px-8 py-6 bg-sa-green-deep text-sa-cream">
        <button
          onClick={() => navigate('/carrito')}
          className="w-12 h-12 rounded-full bg-sa-green-ink hover:bg-sa-green flex items-center justify-center text-2xl"
          aria-label="Volver"
        >
          ←
        </button>
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-sa-banana">#PAGO</p>
          <h1 className="font-display text-3xl mt-1">¿Cómo lo pagas?</h1>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center gap-8 px-8 py-10">
        {/* A nombre de quién: es lo más grande de la etiqueta y lo que barra
            grita al entregar. Opcional a propósito — sin nombre, la etiqueta
            sale con el folio y nada se detiene. Si el cliente se identificó
            en lealtad, su nombre de pila ya viaja solo. */}
        <div className="w-full max-w-md">
          <label className="font-mono text-xs uppercase tracking-[0.25em] text-sa-green/70 block mb-2">
            ¿A nombre de quién va?
          </label>
          <input
            className="w-full rounded-sa-lg border-2 border-sa-green-ink/15 bg-white px-5 py-4 font-display text-2xl text-sa-green-ink focus:border-sa-green outline-none"
            placeholder={usuario?.nombre ? usuario.nombre.split(' ')[0] : 'Nombre para el pedido'}
            value={nombrePedido}
            onChange={(e) => setNombrePedido(e.target.value)}
            maxLength={20}
            autoComplete="off"
            /* En cajero escribe el teclado en pantalla propio; esto evita
               que Windows encime el suyo al tocar el campo. El teclado
               físico (si hay) sigue funcionando. */
            inputMode={modo === 'cajero' ? 'none' : undefined}
          />
          {/* Chips solo en la vista de cajero: el cajero teclea decenas de
              nombres al día y un toque gana. Cuando entre el cobro con Clip
              en el propio kiosko, el cliente escribirá el suyo como hoy. */}
          {modo === 'cajero' && sugerenciasNombre.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {sugerenciasNombre.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setNombrePedido(n)}
                  className="px-4 py-2.5 rounded-full font-mono text-xs uppercase tracking-wider transition-all bg-white border-2 border-sa-green-ink/15 text-sa-green-ink hover:border-sa-green active:scale-95"
                >
                  {n}
                </button>
              ))}
            </div>
          )}
          {modo === 'cajero' && (
            <div className="mt-4">
              <TecladoNombre valor={nombrePedido} onCambio={setNombrePedido} />
            </div>
          )}
        </div>

        <div className="text-center">
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-sa-green/70">
            Total a soltar
          </p>
          <p className="font-display text-7xl text-sa-green-ink leading-none mt-2">
            ${total().toFixed(2)}
          </p>
          <p className="font-mono text-sm text-sa-green-ink/60 mt-2">MXN</p>
        </div>

        <div className="flex flex-col gap-4 w-full max-w-md">
          {modo === 'clip' && (
            <button
              onClick={() => void confirmarClip()}
              className="flex items-center gap-5 p-6 rounded-sa-lg bg-sa-cream-soft hover:bg-sa-cream shadow-sa-sm transition-all text-left"
            >
              <span className="text-sa-green-ink/70"><IconCard /></span>
              <div>
                <p className="font-display text-2xl text-sa-green-ink leading-tight">Terminal</p>
                <p className="font-mono text-xs uppercase tracking-wider text-sa-green-ink/60 mt-1">
                  Clip · tarjeta
                </p>
              </div>
            </button>
          )}

          {modo === 'pagar_en_caja' && (
            <button
              onClick={() => void confirmarPagarEnCaja()}
              className="flex items-center gap-5 p-6 rounded-sa-lg bg-sa-cream-soft hover:bg-sa-cream shadow-sa-sm transition-all text-left"
            >
              <span className="text-sa-green-ink/70"><IconCounter /></span>
              <div>
                <p className="font-display text-2xl text-sa-green-ink leading-tight">Pagar en caja</p>
                <p className="font-mono text-xs uppercase tracking-wider text-sa-green-ink/60 mt-1">
                  Toma tu folio y paga con el cajero
                </p>
              </div>
            </button>
          )}

          {modo === 'cajero' && (
            <>
              {/* El canje va ANTES de los botones de cobro: es una decisión
                  que cambia el monto, no algo que se agrega después. */}
              {usuario?.clienteId && (
                <PanelRewards
                  clienteId={usuario.clienteId}
                  items={items}
                  total={total()}
                  decision={rewards}
                  onCambiar={setRewards}
                />
              )}
              {!corte && (
                <p className="font-mono text-sm text-sa-strawberry text-center">
                  No hay caja abierta. Ábrela en el POS antes de cobrar, o la
                  venta no entrará al corte del día.
                </p>
              )}
              {([
                { metodo: 'efectivo', titulo: 'Efectivo', sub: 'Cobro en el cajón' },
                { metodo: 'tarjeta',  titulo: 'Tarjeta',  sub: 'Terminal bancaria' },
                { metodo: 'clip',     titulo: 'Clip',     sub: 'El monto aparece en la terminal' },
              ] as const).map((m) => (
                <button
                  key={m.metodo}
                  onClick={() => void confirmarCajero(m.metodo)}
                  className="flex items-center gap-5 p-6 rounded-sa-lg bg-sa-cream-soft hover:bg-sa-cream shadow-sa-sm transition-all text-left active:scale-[0.98]"
                >
                  <span className="text-sa-green-ink/70"><IconCard /></span>
                  <div>
                    <p className="font-display text-2xl text-sa-green-ink leading-tight">{m.titulo}</p>
                    <p className="font-mono text-xs uppercase tracking-wider text-sa-green-ink/60 mt-1">
                      {m.sub}
                    </p>
                  </div>
                </button>
              ))}
              <p className="font-mono text-[11px] uppercase tracking-wide text-sa-green-ink/40 text-center">
                Al cobrar, la comanda sale a cocina de inmediato
              </p>
            </>
          )}

          {modo === 'demo' && (
            <button
              onClick={() => void confirmarDemo()}
              className="flex items-center gap-5 p-6 rounded-sa-lg bg-sa-banana/20 hover:bg-sa-banana/30 shadow-sa-sm transition-all text-left border-2 border-dashed border-sa-banana"
            >
              <span className="text-sa-coffee"><IconCard /></span>
              <div>
                <p className="font-display text-2xl text-sa-green-ink leading-tight">Confirmar pago (demo)</p>
                <p className="font-mono text-xs uppercase tracking-wider text-sa-green-ink/60 mt-1">
                  Simulado — no descuenta inventario ni imprime nada real
                </p>
              </div>
            </button>
          )}
        </div>

        {error && (
          <p className="font-mono text-sm text-sa-strawberry text-center max-w-md">{error}</p>
        )}
      </main>
    </div>
  )
}
