import React, { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePosStore } from '@/store/posStore'
import { sb } from '../lib/sb'
import {
  crearOrden,
  cobrarOrden,
  cobrarOrdenMixto,
  entregarEncargoConVenta,
  cobrarModificacion,
} from '@lily/supabase'
import { obtenerTerminal, type VoucherTerminal } from '@lily/payments'
import { type TicketData } from '@lily/ui'
import { sacarTicket, imprimirComprobanteRechazo } from '../lib/ticket'
import { mxn, mensajeDeError } from '@lily/utils'
import type { MetodoPago } from '@lily/types'
import { useConexion, esErrorDeRed, revisarAhora } from '../lib/conexion'
import {
  guardarVentaSinInternet,
  siguienteFolioLocal,
  type VentaSinInternet,
} from '../store/sinInternet'

/* Dos formas de cobro y ya: efectivo o terminal. Cuantas menos opciones,
   menos se equivoca quien cobra con gente esperando.
   La terminal es la pinpad de Banorte: el importe se le manda desde aquí
   (`obtenerTerminal`), la pinpad cobra y el servidor registra la venta en la
   misma llamada. Se guarda como `tarjeta` en la base —el enum de metodos no
   cambia—. Si la terminal todavia no esta conectada al sistema, la caja cae
   al cobro manual de siempre: se cobra en la pinpad a mano y la referencia
   (folio del voucher) queda opcional para conciliar el corte.
   Los iconos son SVG, no emoji: el emoji se ve distinto en cada equipo y no
   se puede tenir (esta escrito en docs/replicar-el-sistema.md). */
// Formas de cobro. 'tarjeta' es la terminal de Banorte (pasa por la pinpad);
// 'inbursa' es una SEGUNDA terminal que se cobra a mano en su aparato y se
// confirma aquí; 'transferencia' es depósito/transferencia bancaria. Las tres
// que no son efectivo piden una referencia opcional para cuadrar el corte, y
// cada una sale POR SEPARADO en el corte (la casa lo pidió, 27/10/26).
type IconoPago = 'efectivo' | 'terminal' | 'transferencia'
const METODOS: { key: MetodoPago; label: string; icono: IconoPago; pideRef?: boolean }[] = [
  { key: 'efectivo', label: 'Efectivo', icono: 'efectivo' },
  { key: 'tarjeta', label: 'Terminal', icono: 'terminal', pideRef: true },
  { key: 'inbursa', label: 'Inbursa', icono: 'terminal', pideRef: true },
  { key: 'transferencia', label: 'Transferencia', icono: 'transferencia', pideRef: true },
]

/**
 * Cómo se llama el método EN EL TICKET del cliente. La casa pidió que las dos
 * terminales salgan como "Terminal 1" (la de Banorte) y "Terminal 2" (la de
 * Inbursa). En el corte y adentro siguen como Terminal e Inbursa, para cuadrar.
 */
function etiquetaEnTicket(m: MetodoPago): string {
  if (m === 'tarjeta') return 'Terminal 1'
  if (m === 'inbursa') return 'Terminal 2'
  return METODOS.find((x) => x.key === m)?.label ?? m
}

function IconoMetodo({ tipo }: { tipo: IconoPago }) {
  if (tipo === 'efectivo')
    return (
      <svg viewBox="0 0 32 24" className="h-8 w-11" aria-hidden="true">
        <rect x="1" y="3" width="30" height="18" rx="3" fill="currentColor" opacity=".16" />
        <rect x="1.5" y="3.5" width="29" height="17" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="16" cy="12" r="4.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    )
  if (tipo === 'transferencia')
    // Dos flechas opuestas: dinero que va de una cuenta a otra.
    return (
      <svg viewBox="0 0 32 24" className="h-8 w-11" aria-hidden="true">
        <path d="M6 9 h17 l-4 -4 M23 9 l-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M26 15 H9 l4 4 M9 15 l4 -4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  return (
    <svg viewBox="0 0 24 32" className="h-8 w-7" aria-hidden="true">
      <rect x="3" y="1" width="18" height="30" rx="3" fill="currentColor" opacity=".16" />
      <rect x="3.5" y="1.5" width="17" height="29" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="6.5" y="5" width="11" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8.5" cy="17" r="1.4" fill="currentColor" /><circle cx="12" cy="17" r="1.4" fill="currentColor" />
      <circle cx="15.5" cy="17" r="1.4" fill="currentColor" /><circle cx="8.5" cy="21.5" r="1.4" fill="currentColor" />
      <circle cx="12" cy="21.5" r="1.4" fill="currentColor" /><circle cx="15.5" cy="21.5" r="1.4" fill="currentColor" />
    </svg>
  )
}

/** Mixto: un billete y una terminal, juntos. */
function IconoMixto() {
  return (
    <svg viewBox="0 0 40 28" className="h-8 w-12" aria-hidden="true">
      <rect x="1" y="6" width="24" height="15" rx="2.5" fill="currentColor" opacity=".16" />
      <rect x="1.5" y="6.5" width="23" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="13" cy="13.5" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="24" y="1" width="14" height="24" rx="2.5" fill="#FDF6E3" stroke="currentColor" strokeWidth="1.6" />
      <rect x="27" y="4" width="8" height="5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="28.5" cy="13.5" r="1.1" fill="currentColor" /><circle cx="31" cy="13.5" r="1.1" fill="currentColor" />
      <circle cx="33.5" cy="13.5" r="1.1" fill="currentColor" /><circle cx="28.5" cy="17" r="1.1" fill="currentColor" />
      <circle cx="31" cy="17" r="1.1" fill="currentColor" /><circle cx="33.5" cy="17" r="1.1" fill="currentColor" />
    </svg>
  )
}

/**
 * Los atajos de «recibido»: lo que el cliente de verdad entrega.
 *
 * Antes era una lista fija [50, 100, 200, 500] filtrada por «mayor o igual
 * al total», así que con un ticket de $625 no salía NINGÚN atajo y la cajera
 * tenía que teclear. Ahora se redondea el total hacia arriba a 50, 100, 200,
 * 500 y 1,000: para $625 salen $650, $700, $800 y $1,000, que es lo que
 * alguien saca de la cartera.
 */
function montosRapidos(total: number): number[] {
  const out = new Set<number>()
  for (const base of [50, 100, 200, 500, 1000]) {
    const v = Math.ceil(total / base) * base
    if (v > total) out.add(v)
  }
  return [...out].sort((a, b) => a - b).slice(0, 4)
}

export function Cobro() {
  const navigate = useNavigate()
  const {
    empleado, almacen, corte,
    items, encargo, modificacion,
    subtotal, descuentoTotal, neto, aCobrar, limpiarOrden,
    canal, precioDe,
  } = usePosStore()

  const [metodo, setMetodo] = useState<MetodoPago>('efectivo')
  // Pago mixto: "le doy $200 en efectivo y el resto con tarjeta". Se captura
  // SOLO la parte en efectivo; el resto es lo que queda, para que no haya
  // forma de teclear dos números que no sumen el total.
  const [mixto, setMixto] = useState(false)
  const [parteEfectivo, setParteEfectivo] = useState('')
  const [referencia, setReferencia] = useState('')
  // Rappi: el ID de 4 números que el cajero copia de la plataforma. No se
  // vincula solo —Rappi no da su API por un botón—, se teclea a mano, y es lo
  // que identifica el pedido en vez del folio de la tienda.
  const [rappiId, setRappiId] = useState('')
  const [recibido, setRecibido] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Un aviso que no es error: «la terminal no está conectada, se cobra a mano». */
  const [aviso, setAviso] = useState<string | null>(null)
  /** El importe que está esperando en la pinpad, mientras se espera la tarjeta. */
  const [enTerminal, setEnTerminal] = useState<number | null>(null)
  /**
   * Inbursa (Terminal 2) se cobra a MANO en su propio aparato, así que el
   * sistema no sabe si aprobó: antes de registrar, el cajero confirma «¿Ya
   * pagó?» o «¿Rebotó?». Un rebote no registra nada.
   */
  const [confirmandoInbursa, setConfirmandoInbursa] = useState(false)
  /**
   * Cuando la Terminal 1 (Banorte) rechaza, se guarda el motivo para poder
   * imprimirle al cliente un comprobante de por qué salió declinado — su
   * respaldo de que el cobro no pasó, no que la tienda se quedó con su dinero.
   */
  const [rechazo, setRechazo] = useState<{ monto: number; motivo: string } | null>(null)
  /**
   * La orden que ya nació para este ticket. Si la tarjeta se rechaza y el
   * cajero vuelve a intentar, se cobra ESTA orden en vez de crear otra: una
   * orden sin pagar por cada intento ensucia los folios y el corte.
   */
  const ordenViva = useRef<{ id: string; folio: number } | null>(null)
  const enLinea = useConexion((s) => s.enLinea)

  // Guarda: sin corte o sin ítems no hay nada que cobrar.
  if (!corte || !almacen || items.length === 0) {
    navigate('/', { replace: true })
    return null
  }

  // Lo que se teclea y lo que se valida es el SALDO: el neto menos lo que ya
  // dejó de anticipo. El servidor hace la misma resta leyéndola de la base,
  // así que si las dos no coincidieran el cobro se rechaza — que es
  // exactamente lo que tiene que pasar.
  const totalNeto = aCobrar()
  // Rappi: no se cobra aquí (paga la plataforma), no hay método ni mixto.
  const esRappi = canal === 'rappi'
  const rappiIdOk = /^\d{3,6}$/.test(rappiId.trim())
  // Modificación: se cobra la DIFERENCIA contra lo ya pagado (el crédito). El
  // nuevo total es el del carrito. Si la nueva es más barata, no se puede por
  // aquí (habría que devolver): se manda a Cancelar.
  const difModif = modificacion ? Math.round((neto() - modificacion.credito) * 100) / 100 : null
  const modifMasBarata = difModif != null && difModif < -0.01
  // Lo que la pantalla cobra: en una modificación, la diferencia (nunca < 0).
  const montoACobrar = difModif != null ? Math.max(0, difModif) : totalNeto
  const metodoSel = METODOS.find((m) => m.key === metodo)!
  const recibidoNum = parseFloat(recibido) || 0
  const cambio = recibidoNum - montoACobrar
  const efectivoMixto = Math.round((parseFloat(parteEfectivo) || 0) * 100) / 100
  const tarjetaMixto = Math.round((totalNeto - efectivoMixto) * 100) / 100
  const mixtoValido = mixto && efectivoMixto > 0 && tarjetaMixto > 0
  const listo = esRappi
    ? rappiIdOk && totalNeto > 0
    : modificacion
    ? !modifMasBarata && (metodo !== 'efectivo' || montoACobrar <= 0 || recibidoNum >= montoACobrar)
    : mixto
    ? mixtoValido
    : metodo !== 'efectivo' || totalNeto <= 0 || recibidoNum >= totalNeto

  /** El ticket del papel, con el folio que corresponda y, si la terminal cobró, su voucher. */
  function armarDatosDelTicket(folio: number | string, voucher: VoucherTerminal | null = null): TicketData {
    return {
      tarjeta: voucher ?? undefined,
      folio,
      fecha: new Date(),
      cajero: empleado?.nombre,
      canal: esRappi ? 'Rappi' : 'Caja',
      // El pedido de Rappi se identifica con su ID, no con el folio, y el
      // ticket no lleva método de pago (lo decide `rappiId` en @lily/ui).
      rappiId: esRappi ? (rappiId.trim() || null) : undefined,
      items: items.map((l) => ({
        cantidad: l.cantidad,
        nombre: l.producto.nombre,
        precioUnitario: precioDe(l.producto),
      })),
      descuento: descuentoTotal(),
      // El anticipo va en su propio renglón del papel, no sumado al
      // descuento: el cliente pagó ese dinero y el negocio lo cobró. En el
      // descuento diría que se le regalaron $200 que están en el cajón
      // desde el lunes.
      // El crédito de una modificación se muestra igual que el anticipo de un
      // encargo: «ya pagó $X», y el TOTAL del papel baja a la diferencia.
      anticipo: encargo?.anticipo || modificacion?.credito || undefined,
      // El nombre primero: el recuadro del papel ya dice «ENCARGO PARA», y
      // lo que se lee a un metro en el mostrador es a quién se le entrega.
      // El folio va detrás, que es con lo que se concilia después.
      clienteNombre: encargo
        ? `${encargo.cliente} (encargo #${encargo.folio})`
        : undefined,
      metodoPago: mixto
        ? `Efectivo ${mxn(efectivoMixto)} + Terminal 1 ${mxn(tarjetaMixto)}`
        : etiquetaEnTicket(metodo),
      // En mixto van las dos partes por separado, para que en el papel se
      // vea que suman el total. La frase de arriba se queda de respaldo.
      partes: mixto
        ? [
            { metodo: 'Efectivo', monto: efectivoMixto },
            { metodo: 'Terminal 1', monto: tarjetaMixto },
          ]
        : undefined,
      // La autorización del banco manda sobre lo que se haya tecleado: si la
      // terminal cobró, la referencia es la suya.
      referenciaPago: voucher?.autorizacion ?? (referencia.trim() || null),
      recibido: !mixto && metodo === 'efectivo' && recibidoNum > 0 ? recibidoNum : undefined,
    }
  }

  /**
   * Cobrar sin internet.
   *
   * La venta se escribe en ESTE navegador **antes** de imprimir y antes de
   * cambiar de pantalla, con un folio provisional. Si el navegador no la pudo
   * guardar, no se da por cobrada: que la cajera la vuelva a teclear es
   * molesto; tener el dinero en el cajón y la venta en ningún lado es otra
   * cosa.
   *
   * El precio que se le cobra al cliente es el de la pantalla. El servidor
   * recalculará el suyo al registrarla y, si no coincidieran, la diferencia
   * queda anotada para revisión — pero no se esconde ni se inventa.
   */
  function cobrarSinInternet(): boolean {
    const folioLocal = siguienteFolioLocal()
    const venta: VentaSinInternet = {
      id: crypto.randomUUID(),
      folio_local: folioLocal,
      vendida_en: new Date().toISOString(),
      sucursal_id: almacen!.sucursal_id,
      almacen_id: almacen!.id,
      corte_id: corte?.id ?? null,
      empleado_id: empleado?.id ?? null,
      nombre_cliente: null,
      descuento: descuentoTotal(),
      referencia: referencia.trim() || null,
      metodo: mixto ? 'mixto' : metodo === 'efectivo' ? 'efectivo' : 'tarjeta',
      efectivo: mixto ? efectivoMixto : metodo === 'efectivo' ? totalNeto : 0,
      tarjeta: mixto ? tarjetaMixto : metodo === 'efectivo' ? 0 : totalNeto,
      total_pantalla: totalNeto,
      items: items.map((l) => ({
        producto_id: l.producto.id,
        cantidad: l.cantidad,
        personalizacion: l.personalizacion,
      })),
      resumen: items.map((l) => ({ nombre: l.producto.nombre, cantidad: l.cantidad })),
      intentos: 0,
      ultimoError: null,
    }

    if (!guardarVentaSinInternet(venta)) {
      setError(
        'Este navegador no pudo guardar la venta, así que NO se cobró. ' +
          'Vuelve a intentar; si sigue igual, apunta la venta en papel y avisa a gerencia.',
      )
      return false
    }

    // El papel sale por el navegador: el agente de tickets habla con la base,
    // y ahora mismo no hay base.
    void sacarTicket(null, armarDatosDelTicket(folioLocal))
    limpiarOrden()
    navigate('/', { replace: true })
    return true
  }

  /**
   * El botón «Confirmar» pasa por aquí. Para Inbursa (cobro manual) abre antes
   * la pregunta «¿Ya pagó?»; para todo lo demás va directo a cobrar.
   */
  function iniciarCobro() {
    if (procesando) return
    if (!mixto && metodo === 'inbursa' && enLinea) { setConfirmandoInbursa(true); return }
    void confirmarPago()
  }

  async function confirmarPago() {
    if (procesando) return
    setConfirmandoInbursa(false)
    setProcesando(true)
    setError(null)
    setRechazo(null)
    // Si el internet se cae EN MEDIO de esto, importa muchísimo en qué
    // momento: antes de tocar el servidor se puede cobrar sin internet sin
    // riesgo; después, no se sabe si la orden alcanzó a nacer, y guardarla
    // otra vez la cobraría dos veces. Va fuera del `try` para que el `catch`
    // lo pueda leer.
    let yaTocamosElServidor = false
    try {
      // --- Sin internet ---
      if (!enLinea) {
        if (encargo) {
          setError(
            'Sin internet no se puede cerrar un encargo: el anticipo vive en el servidor ' +
              'y hay que descontarlo de ahí. Cóbralo cuando vuelva la conexión. ' +
              'Lo demás sí se puede cobrar aparte.',
          )
          return
        }
        if (canal !== 'pos') {
          setError(
            'Sin internet solo se cobra en Mostrador: los pedidos de Rappi entran por la ' +
              'plataforma, que también necesita conexión.',
          )
          return
        }
        cobrarSinInternet()
        return
      }

      // --- Rappi ---
      // Un pedido de Rappi se registra para que descuente inventario y dispare
      // la producción, pero a la tienda le paga la PLATAFORMA días después, no
      // el repartidor: se cobra con método `rappi`, que el corte cuenta aparte
      // y el efectivo esperado ignora —así el cajón no queda corto—. No hay
      // método que elegir ni pinpad: se registra y se imprime de una vez.
      if (esRappi) {
        yaTocamosElServidor = true
        const orden =
          ordenViva.current ??
          (await crearOrden(
            sb,
            {
              sucursal_id: almacen!.sucursal_id,
              almacen_id: almacen!.id,
              canal,
              corte_id: corte!.id,
              cliente_id: null,
              empleado_id: empleado?.id ?? null,
              descuento: descuentoTotal(),
            },
            items.map((l) => ({
              producto_id: l.producto.id,
              cantidad: l.cantidad,
              precio_unitario: precioDe(l.producto),
              personalizacion: l.personalizacion,
            })),
          ))
        await cobrarOrden(sb, orden.id, 'rappi', totalNeto, {
          referencia: `Rappi ${rappiId.trim()}`,
          idempotencyKey: crypto.randomUUID(),
        })
        ordenViva.current = null
        await sacarTicket(orden.id, armarDatosDelTicket(orden.folio))
        limpiarOrden()
        navigate('/', { replace: true })
        return
      }

      // --- Modificación (cancelar y rearmar) ---
      // El servidor lo hace TODO atómico: deja la venta vieja a crédito (su pan
      // vuelve al inventario, su dinero se queda en el corte) y cobra la
      // diferencia de la nueva. Un solo método, sin pinpad: la diferencia se
      // cobra a mano (si fuera tarjeta, en la terminal del banco).
      if (modificacion) {
        yaTocamosElServidor = true
        const r = await cobrarModificacion(
          sb,
          modificacion.ordenVieja,
          items.map((l) => ({ producto_id: l.producto.id, cantidad: l.cantidad })),
          metodo,
          modificacion.autorizadoPor,
          canal,
          descuentoTotal(),
        )
        await sacarTicket(r.orden_id, armarDatosDelTicket(r.folio))
        limpiarOrden()
        navigate('/', { replace: true })
        return
      }

      // Cuánto va por cada lado. En mixto son las dos partes; si no, todo el
      // saldo por el método elegido. `conTarjeta` es SOLO lo que pasa por la
      // pinpad de Banorte ('tarjeta'): Inbursa y transferencia son cobros
      // manuales, así que no tocan la terminal y caen al cobro normal de abajo
      // con su propio método.
      const enEfectivo = mixto ? efectivoMixto : metodo === 'efectivo' ? totalNeto : 0
      const conTarjeta = mixto ? tarjetaMixto : metodo === 'tarjeta' ? totalNeto : 0

      let folio = 0
      // El id de la orden, para mandarle el ticket a la térmica. Si queda en
      // null, el papel sale por el navegador como hasta hoy.
      let ordenId: string | null = null
      let voucher: VoucherTerminal | null = null

      /**
       * Lo que va con tarjeta pasa por la pinpad de Banorte.
       *
       * El importe aparece en la terminal, el cliente pone la tarjeta y el
       * servidor registra la venta en la misma llamada —por el mismo camino
       * que una venta de mostrador—. Aquí solo se espera y se lee la
       * respuesta. Tres salidas:
       *
       *   - aprobada: la venta ya está registrada; queda imprimir.
       *   - la terminal no está conectada al sistema (`no_configurado`): se
       *     avisa y se sigue por el cobro manual de siempre, con la orden que
       *     ya nació si es el caso.
       *   - rechazada / sin respuesta / anulada: se enseña tal cual y NO se
       *     limpia el ticket, para volver a intentar o cambiar de método.
       */
      let registradaEnTerminal = false
      if (conTarjeta > 0) {
        const terminal = obtenerTerminal(sb)
        let peticion
        if (encargo) {
          peticion = {
            encargo: {
              encargo_id: encargo.id,
              sucursal_id: almacen!.sucursal_id,
              almacen_id: almacen!.id,
              canal,
              corte_id: corte!.id,
              descuento: descuentoTotal(),
              efectivo: enEfectivo,
              tarjeta: conTarjeta,
              items: items.map((l) => ({ producto_id: l.producto.id, cantidad: l.cantidad })),
            },
            idempotencyKey: crypto.randomUUID(),
            empleadoId: empleado?.id ?? null,
          }
        } else {
          yaTocamosElServidor = true
          if (!ordenViva.current) {
            const orden = await crearOrden(
              sb,
              {
                sucursal_id: almacen!.sucursal_id,
                almacen_id: almacen!.id,
                canal,
                corte_id: corte!.id,
                cliente_id: null,
                empleado_id: empleado?.id ?? null,
                descuento: descuentoTotal(),
              },
              items.map((l) => ({
                producto_id: l.producto.id,
                cantidad: l.cantidad,
                precio_unitario: precioDe(l.producto),
                personalizacion: l.personalizacion,
              })),
            )
            ordenViva.current = { id: orden.id, folio: orden.folio }
          }
          peticion = {
            ordenId: ordenViva.current.id,
            efectivo: enEfectivo,
            idempotencyKey: crypto.randomUUID(),
            empleadoId: empleado?.id ?? null,
          }
        }

        yaTocamosElServidor = true
        setEnTerminal(conTarjeta)
        let r
        try {
          r = await terminal.cobrar(peticion)
        } finally {
          setEnTerminal(null)
        }

        if (r.ok) {
          folio = r.folio ?? ordenViva.current?.folio ?? 0
          ordenId = r.ordenId
          voucher = r.voucher
          registradaEnTerminal = true
          ordenViva.current = null
          if (r.modo && r.modo !== 'PRD') {
            setAviso(`La terminal está en modo de PRUEBA (${r.modo}): esta venta NO se cobró de verdad.`)
          }
        } else if (r.estado === 'no_configurado') {
          setAviso('La terminal de Banorte todavía no está conectada al sistema: cobra en la pinpad a mano y confirma aquí.')
        } else {
          // Terminal 1 (Banorte) rechazó. Se enseña el motivo y se ofrece
          // imprimirlo para el cliente, como respaldo de que el cargo no pasó.
          setError(r.mensaje)
          setRechazo({ monto: conTarjeta, motivo: r.mensaje })
          return
        }
      }

      if (registradaEnTerminal) {
        // nada: ya está
      } else if (encargo) {
        /**
         * Vienen por su encargo y se llevan algo más: UNA sola llamada.
         *
         * Crear la orden aquí y cerrar el encargo después serían dos pasos, y
         * si el segundo fallara el cliente habría pagado con el encargo
         * todavía apartado — o sea el mismo pan contado dos veces, como
         * vendido y como separado. El servidor lo hace todo junto o no hace
         * nada.
         */
        yaTocamosElServidor = true
        const r = await entregarEncargoConVenta(
          sb,
          encargo.id,
          {
            sucursal_id: almacen!.sucursal_id,
            almacen_id: almacen!.id,
            canal,
            corte_id: corte!.id,
            empleado_id: empleado?.id ?? null,
            descuento: descuentoTotal(),
            efectivo: enEfectivo,
            tarjeta: conTarjeta,
            referencia: referencia.trim() || null,
            idempotencyKey: crypto.randomUUID(),
          },
          items.map((l) => ({ producto_id: l.producto.id, cantidad: l.cantidad })),
        )
        folio = r.folio
        ordenId = r.orden_id
      } else {
        yaTocamosElServidor = true
        // La orden que ya nació para la terminal, si la hubo; si no, nace aquí.
        const orden =
          ordenViva.current ??
          (await crearOrden(
            sb,
            {
              sucursal_id: almacen!.sucursal_id,
              almacen_id: almacen!.id,
              canal,
              corte_id: corte!.id,
              cliente_id: null,
              empleado_id: empleado?.id ?? null,
              descuento: descuentoTotal(),
            },
            items.map((l) => ({
              producto_id: l.producto.id,
              cantidad: l.cantidad,
              precio_unitario: precioDe(l.producto),
              personalizacion: l.personalizacion,
            })),
          ))
        folio = orden.folio
        ordenId = orden.id
        // Cobro inmediato aprobado → el trigger descuenta inventario y manda a
        // cocina. `idempotencyKey`: si esta llamada se reintenta (timeout de
        // red, doble toque) la base devuelve el mismo pago en vez de crear uno
        // duplicado.
        if (mixto) {
          await cobrarOrdenMixto(sb, orden.id, efectivoMixto, tarjetaMixto, {
            metodoTarjeta: 'tarjeta',
            referencia: referencia.trim() || undefined,
            autorizadoPor: empleado?.id,
            idempotencyKey: crypto.randomUUID(),
          })
        } else {
          await cobrarOrden(sb, orden.id, metodo, totalNeto, {
            referencia: referencia.trim() || undefined,
            idempotencyKey: crypto.randomUUID(),
          })
        }
        ordenViva.current = null
      }

      await sacarTicket(ordenId, armarDatosDelTicket(folio, voucher))

      limpiarOrden()
      navigate('/', { replace: true })
    } catch (e) {
      // ¿Se cayó el internet justo ahora?
      if (esErrorDeRed(e)) {
        const hay = await revisarAhora()
        if (!hay && !yaTocamosElServidor && !encargo && canal === 'pos') {
          // No llegamos a tocar el servidor: la venta se puede cobrar sin
          // internet tal cual, sin riesgo de duplicarla.
          if (cobrarSinInternet()) return
        } else if (!hay) {
          // Aquí NO se reintenta solo. La orden pudo alcanzar a nacer, y
          // guardarla otra vez la cobraría dos veces. Que lo decida alguien
          // mirando el corte.
          setError(
            'Se fue el internet a media venta y no se sabe si alcanzó a registrarse. ' +
              'NO vuelvas a cobrar: busca el folio en el corte cuando regrese la conexión. ' +
              'Si no está, cóbrala de nuevo.',
          )
          return
        }
      }
      setError(mensajeDeError(e))
    } finally {
      setProcesando(false)
    }
  }

  return (
    <div className="h-dvh flex flex-col bg-sa-cream-paper overflow-hidden">
      {/* El importe ya está en la pinpad: lo único que hay que hacer es esperar
          la tarjeta. Encima de todo, sin botón de cancelar: la llamada al
          banco no se puede cortar desde aquí, y cerrar esta pantalla a medias
          es la forma de no saber si cobró. Se cancela desde la pinpad. */}
      {enTerminal != null && (
        <div className="fixed inset-0 z-50 bg-sa-green-deep flex flex-col items-center justify-center gap-5 px-8 text-sa-cream text-center">
          <svg className="animate-spin w-14 h-14 text-sa-cream/70" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <p className="font-display text-4xl leading-tight">Cobra en la terminal</p>
          <p className="font-display text-6xl">{mxn(enTerminal)}</p>
          <p className="font-body text-base text-sa-cream/70 max-w-sm">
            El importe ya está en la pinpad de Banorte: acerca, inserta o desliza la
            tarjeta. No cierres esta pantalla hasta que conteste.
          </p>
        </div>
      )}
      {/* Inbursa (Terminal 2) se cobra a MANO en su aparato: el sistema no sabe
          si aprobó. El cajero cobra allá y aquí dice qué pasó. «Rebotó» no
          registra nada; «Ya pagó» sigue al cobro normal. */}
      {confirmandoInbursa && (
        <div className="fixed inset-0 z-50 bg-sa-green-deep flex flex-col items-center justify-center gap-6 px-8 text-sa-cream text-center">
          <p className="font-display text-3xl md:text-4xl leading-tight">
            Cobra {mxn(totalNeto)} en la terminal Inbursa
          </p>
          <p className="font-body text-base text-sa-cream/70 max-w-sm">
            Pasa la tarjeta en el aparato de Inbursa. ¿Qué dijo la terminal?
          </p>
          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-md">
            <button
              onClick={() => void confirmarPago()}
              className="flex-1 bg-sa-cream text-sa-green-deep py-5 rounded-sa-lg font-display text-xl active:scale-[0.98] transition-all"
            >
              Sí, ya pagó
            </button>
            <button
              onClick={() => setConfirmandoInbursa(false)}
              className="flex-1 bg-transparent border-2 border-sa-cream/40 text-sa-cream py-5 rounded-sa-lg font-display text-xl active:scale-[0.98] transition-all"
            >
              No, rebotó el pago
            </button>
          </div>
        </div>
      )}
      {/* Hero con total */}
      <header className="bg-sa-green-deep text-sa-cream flex-shrink-0">
        <div className="flex items-center gap-4 px-4 md:px-6 py-2 md:py-3 border-b border-sa-cream/10">
          <button
            onClick={() => navigate('/')}
            className="text-sa-cream/70 hover:text-sa-cream transition-colors text-2xl"
          >
            ←
          </button>
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-sa-cream/50">
              {encargo ? `Encargo #${encargo.folio} · ${encargo.cliente}` : 'Cobrar orden'}
            </p>
            <p className="font-display text-lg text-sa-cream">
              {items.length} {items.length === 1 ? 'producto' : 'productos'}
            </p>
          </div>
        </div>
        <div className="px-6 py-3 md:py-6 text-center">
          <p className="font-mono text-xs uppercase tracking-widest text-sa-cream/50 mb-1 md:mb-2">
            {modificacion ? 'Diferencia a cobrar' : 'Total a cobrar'}
          </p>
          <p className="font-display text-5xl md:text-7xl text-sa-cream leading-none">{mxn(montoACobrar)}</p>
          {modificacion && (
            <p className="font-mono text-xs text-sa-cream/60 mt-1">
              Modificando #{modificacion.folioVieja} · ya pagó {mxn(modificacion.credito)} · nuevo total {mxn(neto())}
            </p>
          )}
        </div>
      </header>

      {/* En PC y tableta acostada, el método a la izquierda y el ticket a la
          derecha. En teléfono y tableta parada se apilan: el ticket con su
          «Confirmar» queda abajo, a la altura del pulgar, y el método arriba
          con scroll propio. Antes la columna fija de 320 px aplastaba los
          tres botones a una tira de dos dedos. */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Izquierda: método de pago */}
        <div className="flex-1 min-h-0 p-4 md:p-6 overflow-y-auto">
          {/* Rappi: no se elige método (paga la plataforma); se teclea el ID. */}
          {esRappi && (
            <div className="bg-white rounded-sa p-5 shadow-sa-sm mb-4">
              <p className="font-display text-lg text-sa-green-ink mb-1">Pedido de Rappi</p>
              <p className="font-mono text-xs text-sa-green-ink/50 mb-3 leading-relaxed">
                A la tienda le paga Rappi, no el cliente: no se cobra aquí. Escribe el ID del
                pedido (los números de la plataforma) y dale «Cobrar e imprimir».
              </p>
              <label className="block font-mono text-xs uppercase tracking-wide text-sa-green-ink/60 mb-2">
                ID de Rappi
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={rappiId}
                onChange={(e) => setRappiId(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="1234"
                className="w-full px-4 py-3 bg-sa-cream-soft border border-sa-green-ink/10 rounded-sa font-mono text-2xl tracking-[0.3em] text-sa-green-ink focus:outline-none focus:ring-2 focus:ring-sa-green/30"
              />
              {!rappiIdOk && rappiId.length > 0 && (
                <p className="font-mono text-xs text-sa-strawberry mt-2">El ID es de 3 a 6 números.</p>
              )}
            </div>
          )}
          {!esRappi && (<>
          {/* Tres botones iguales: Efectivo, Terminal y Mixto. La casa lo
              pidió así —«que solo diga efectivo, terminal o mixto»— y tiene
              razón: la pregunta del mostrador es UNA, «¿cómo paga?», y las
              tres respuestas tienen que verse como tres respuestas, no como
              dos grandes y una chica escondida abajo. */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 md:gap-4 mb-4 md:mb-5">
            {METODOS.map((m) => (
              <button
                key={m.key}
                onClick={() => { setMetodo(m.key); setMixto(false); setRechazo(null); setError(null) }}
                aria-pressed={!mixto && metodo === m.key}
                className={`flex flex-col items-center justify-center gap-2.5 py-7 rounded-sa transition-all ${
                  !mixto && metodo === m.key
                    ? 'bg-sa-green text-sa-cream shadow-sa'
                    : 'bg-sa-cream-soft text-sa-green-ink hover:bg-sa-cream-warm'
                }`}
              >
                <IconoMetodo tipo={m.icono} />
                <span className="font-display text-lg">{m.label}</span>
              </button>
            ))}
            {/* En una modificación se cobra la diferencia con UN solo método. */}
            {!modificacion && (
              <button
                onClick={() => { setMixto(true); setParteEfectivo(''); setRechazo(null); setError(null) }}
                aria-pressed={mixto}
                className={`flex flex-col items-center justify-center gap-2.5 py-7 rounded-sa transition-all ${
                  mixto
                    ? 'bg-sa-green text-sa-cream shadow-sa'
                    : 'bg-sa-cream-soft text-sa-green-ink hover:bg-sa-cream-warm'
                }`}
              >
                <IconoMixto />
                <span className="font-display text-lg">Mixto</span>
                <span className="font-mono text-[10px] uppercase tracking-wide opacity-70 -mt-1">
                  una parte y otra parte
                </span>
              </button>
            )}
          </div>

          {modifMasBarata && (
            <div className="bg-sa-strawberry/10 border border-sa-strawberry/30 rounded-sa px-4 py-3 mb-4">
              <p className="font-mono text-sm text-sa-strawberry">
                La nueva venta es más barata que la original. Hay que devolver dinero:
                regresa, cancela la venta #{modificacion?.folioVieja} y cóbrala de nuevo.
              </p>
            </div>
          )}

          {/* Se captura SOLO el efectivo; el resto se calcula. Pedir los dos
              números deja teclear dos que no sumen el total, y eso lo rechaza
              el servidor con el cliente enfrente. */}
          {mixto && totalNeto > 0 && (
            <div className="bg-white rounded-sa p-5 shadow-sa-sm mb-4">
              <label className="block font-mono text-xs uppercase tracking-wide text-sa-green-ink/60 mb-2">
                ¿Cuánto da en efectivo?
              </label>
              <div className="relative mb-4">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono text-sa-green-ink/40 text-xl">$</span>
                <input
                  type="number"
                  value={parteEfectivo}
                  onChange={(e) => setParteEfectivo(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-10 pr-4 py-3 bg-sa-cream-soft border border-sa-green-ink/10 rounded-sa font-mono text-2xl text-sa-green-ink focus:outline-none focus:ring-2 focus:ring-sa-green/30"
                />
              </div>
              <div className="flex gap-2 mb-3">
                {[100, 200, 500].filter((v) => v < totalNeto).map((v) => (
                  <button
                    key={v}
                    onClick={() => setParteEfectivo(String(v))}
                    className="flex-1 py-2.5 bg-sa-cream-warm hover:bg-sa-banana rounded-full font-mono text-sm text-sa-green-ink transition-colors"
                  >
                    ${v}
                  </button>
                ))}
                <button
                  onClick={() => setParteEfectivo((totalNeto / 2).toFixed(2))}
                  className="flex-1 py-2.5 bg-sa-banana/40 hover:bg-sa-banana rounded-full font-mono text-sm text-sa-green-ink transition-colors"
                >
                  Mitad
                </button>
              </div>
              {mixtoValido ? (
                <div className="flex justify-between items-center bg-sa-mint/25 rounded-sa px-4 py-3 border border-sa-mint/50">
                  <span className="font-mono text-sm uppercase tracking-wide text-sa-green-ink/70">
                    Con la terminal
                  </span>
                  <span className="font-display text-2xl text-sa-green">{mxn(tarjetaMixto)}</span>
                </div>
              ) : (
                <p className="font-mono text-xs text-sa-green-ink/50 leading-relaxed">
                  {efectivoMixto >= totalNeto && efectivoMixto > 0
                    ? 'Eso es todo el total: si paga completo en efectivo, use el botón de Efectivo.'
                    : 'El resto se cobra con la terminal. Lo que se apunte aquí es lo que el corte va a esperar en el cajón.'}
                </p>
              )}
            </div>
          )}

          {/* Efectivo: recibido + cambio */}
          {!mixto && metodo === 'efectivo' && montoACobrar > 0 && (
            <div className="bg-white rounded-sa p-5 shadow-sa-sm mb-4">
              <label className="block font-mono text-xs uppercase tracking-wide text-sa-green-ink/60 mb-2">
                Recibido
              </label>
              <div className="relative mb-4">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono text-sa-green-ink/40 text-xl">$</span>
                <input
                  type="number"
                  value={recibido}
                  onChange={(e) => setRecibido(e.target.value)}
                  placeholder={montoACobrar.toFixed(2)}
                  className="w-full pl-10 pr-4 py-3 bg-sa-cream-soft border border-sa-green-ink/10 rounded-sa font-mono text-2xl text-sa-green-ink focus:outline-none focus:ring-2 focus:ring-sa-green/30"
                />
              </div>
              <div className="flex gap-2 mb-3">
                {montosRapidos(montoACobrar).map((v) => (
                  <button
                    key={v}
                    onClick={() => setRecibido(String(v))}
                    className="flex-1 py-2.5 bg-sa-cream-warm hover:bg-sa-banana rounded-full font-mono text-sm text-sa-green-ink transition-colors"
                  >
                    ${v}
                  </button>
                ))}
                <button
                  onClick={() => setRecibido(montoACobrar.toFixed(2))}
                  className="flex-1 py-2.5 bg-sa-banana/40 hover:bg-sa-banana rounded-full font-mono text-sm text-sa-green-ink transition-colors"
                >
                  Exacto
                </button>
              </div>
              {recibidoNum >= totalNeto && recibidoNum > 0 && (
                <div className="flex justify-between items-center bg-sa-mint/25 rounded-sa px-4 py-3 border border-sa-mint/50">
                  <span className="font-mono text-sm uppercase tracking-wide text-sa-green-ink/70">Cambio</span>
                  <span className="font-display text-2xl text-sa-green">{mxn(cambio)}</span>
                </div>
              )}
            </div>
          )}

          {/* Con tarjeta: al confirmar, el importe se manda a la pinpad de
              Banorte. El folio a mano solo hace falta si la terminal no está
              conectada al sistema (entonces la caja lo avisa). */}
          {(mixto || metodoSel.pideRef) && (
            <div className="bg-white rounded-sa p-5 shadow-sa-sm mb-4">
              {mixto || metodo === 'tarjeta' ? (
                <>
                  <p className="font-display text-base text-sa-green-ink mb-1">
                    Al confirmar, {mixto ? mxn(tarjetaMixto) : mxn(totalNeto)} aparece en la terminal
                  </p>
                  <p className="font-mono text-xs text-sa-green-ink/50 mb-3 leading-relaxed">
                    El cliente acerca o inserta su tarjeta en la pinpad de Banorte y la venta
                    queda registrada sola, con su voucher en el ticket.
                  </p>
                  <label className="block font-mono text-xs uppercase tracking-wide text-sa-green-ink/60 mb-2">
                    Folio del voucher (solo si cobró a mano en la pinpad)
                  </label>
                </>
              ) : metodo === 'inbursa' ? (
                <>
                  <p className="font-display text-base text-sa-green-ink mb-1">
                    Cobra {mxn(totalNeto)} en la terminal Inbursa
                  </p>
                  <p className="font-mono text-xs text-sa-green-ink/50 mb-3 leading-relaxed">
                    Pasa la tarjeta en el aparato de Inbursa; cuando apruebe, confirma aquí.
                  </p>
                  <label className="block font-mono text-xs uppercase tracking-wide text-sa-green-ink/60 mb-2">
                    Folio del voucher de Inbursa (opcional)
                  </label>
                </>
              ) : (
                <>
                  <p className="font-display text-base text-sa-green-ink mb-1">
                    Cobra {mxn(totalNeto)} por transferencia
                  </p>
                  <p className="font-mono text-xs text-sa-green-ink/50 mb-3 leading-relaxed">
                    Confirma aquí cuando te llegue la transferencia a la cuenta.
                  </p>
                  <label className="block font-mono text-xs uppercase tracking-wide text-sa-green-ink/60 mb-2">
                    Clave de rastreo o referencia (opcional)
                  </label>
                </>
              )}
              <input
                type="text"
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                placeholder="Opcional, para cuadrar el corte"
                className="w-full px-4 py-3 bg-sa-cream-soft border border-sa-green-ink/10 rounded-sa font-mono text-sm text-sa-green-ink focus:outline-none focus:ring-2 focus:ring-sa-green/30"
              />
            </div>
          )}
          </>)}

          {aviso && (
            <div className="bg-sa-banana/30 border border-sa-banana rounded-sa px-4 py-3 mb-4">
              <p className="font-mono text-sm text-sa-green-ink">{aviso}</p>
            </div>
          )}

          {error && (
            <div className="bg-sa-strawberry/10 border border-sa-strawberry/30 rounded-sa px-4 py-3 mb-4">
              <p className="font-mono text-sm text-sa-strawberry">{error}</p>
              {rechazo && (
                <button
                  onClick={() => imprimirComprobanteRechazo(rechazo.monto, rechazo.motivo)}
                  className="mt-3 w-full bg-sa-green-deep text-sa-cream py-2.5 rounded-sa font-display text-base active:scale-[0.98] transition-all"
                >
                  Imprimir comprobante de rechazo para el cliente
                </button>
              )}
            </div>
          )}
        </div>

        {/* Derecha: resumen + confirmar */}
        <div className="w-full lg:w-80 max-h-[46dvh] lg:max-h-none bg-white border-t lg:border-t-0 lg:border-l border-sa-green-ink/10 flex flex-col p-4 lg:p-5 flex-shrink-0">
          <h3 className="hidden lg:block font-display text-lg text-sa-green-ink mb-3">Ticket</h3>
          <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 mb-3 lg:mb-4 font-mono text-sm">
            {items.map((l) => (
              <div key={l.lineaId} className="py-1 border-b border-dashed border-sa-green-ink/10">
                <div className="flex justify-between">
                  <span className="text-sa-green-ink/70 truncate flex-1 mr-2">×{l.cantidad} {l.producto.nombre}</span>
                  <span className="font-medium text-sa-green-ink flex-shrink-0">{mxn(precioDe(l.producto) * l.cantidad)}</span>
                </div>
                {l.personalizacion && (
                  <p className="text-xs text-sa-strawberry leading-snug">📝 {l.personalizacion}</p>
                )}
              </div>
            ))}
          </div>
          <div className="border-t border-sa-green-ink/15 pt-2 lg:pt-3 space-y-1 mb-3 lg:mb-4 font-mono text-sm flex-shrink-0">
            <div className="flex justify-between text-sa-green-ink/60">
              <span>Subtotal</span>
              <span>{mxn(subtotal())}</span>
            </div>
            {descuentoTotal() > 0 && (
              <div className="flex justify-between text-sa-strawberry">
                <span>Descuento</span>
                <span>−{mxn(descuentoTotal())}</span>
              </div>
            )}
            {encargo && encargo.anticipo > 0 && (
              <div className="flex justify-between text-sa-green-ink/60">
                <span>Ya pagó de anticipo</span>
                <span>−{mxn(encargo.anticipo)}</span>
              </div>
            )}
            <div className="flex justify-between items-baseline pt-2 border-t border-sa-green-ink/10">
              <span className="font-display text-xl text-sa-green-ink">
                {encargo && encargo.anticipo > 0 ? 'Le falta' : 'Total'}
              </span>
              <span className="font-display text-2xl text-sa-green-ink">{mxn(totalNeto)}</span>
            </div>
          </div>
          {/* En carmín, no en el rosa salmón de la marca: ese rosa es un
              acento y con letras blancas casi no se lee (§4). Es el botón más
              importante de todo el sistema y tiene que verse como tal. */}
          <button
            onClick={iniciarCobro}
            disabled={!listo || procesando}
            className="w-full flex-shrink-0 bg-sa-green hover:bg-sa-green-deep disabled:opacity-40 disabled:hover:bg-sa-green active:scale-[0.98] text-sa-cream py-4 rounded-sa-lg font-display text-xl shadow-sa-sm transition-all"
          >
            {procesando
              ? 'Cobrando…'
              : esRappi
              ? `Cobrar e imprimir ${mxn(totalNeto)}`
              : modificacion
              ? `Cobrar diferencia ${mxn(montoACobrar)}`
              : `Confirmar pago ${mxn(totalNeto)}`}
          </button>
        </div>
      </div>
    </div>
  )
}
