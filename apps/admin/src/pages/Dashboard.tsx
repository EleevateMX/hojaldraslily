import { useEffect, useRef, useState } from 'react'
import { sb } from '../lib/sb'
import {
  ventasDiarias, productosMasVendidos, stockPorAlmacen, hornoEnVivo,
  listarEncargos, cortesDeCaja, facturasListar, suscribirProduccion,
  type HornoEnVivo, type Encargo, type CorteDeCaja, type FacturaGlobal,
} from '@lily/supabase'
import type { VentaDiaria, ProductoVendido, StockAlmacen } from '@lily/types'
import { mensajeDeError } from '@lily/utils'
import { Loading, ErrorMsg } from '../ui'
import DashboardVista, { type DashboardData, type HornoItem, type Periodo } from './DashboardVista'
import MandarAHacerModal from './MandarAHacerModal'
import type { Callout, Delta } from './dashboardUi'

/**
 * Dashboard del día: KPIs con cambio vs el periodo anterior, el riel «qué hay
 * que atender», la tendencia de ventas (Hoy / 7 / 30 días), cómo se cobró, lo
 * más vendido, el horno en vivo y el stock bajo mínimo.
 *
 * Solo arma los datos; la forma vive en `DashboardVista`. La fecha se decide en
 * Mérida (igual que las vistas de la base), no en la hora del aparato.
 */

const ZONA = 'America/Merida'
function fechaMerida(off = 0): string {
  return new Date(Date.now() - off * 86400000).toLocaleDateString('en-CA', { timeZone: ZONA })
}
function diaCorto(dia: string): string {
  return new Date(dia + 'T12:00:00Z').toLocaleDateString('es-MX', { weekday: 'short', timeZone: ZONA })
}
function diaDeTimestamp(ts: string): string {
  return new Date(ts).toLocaleDateString('en-CA', { timeZone: ZONA })
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mandar, setMandar] = useState(false)
  const hayData = useRef(false)

  useEffect(() => {
    let vivo = true
    async function cargar() {
      const HOY = fechaMerida(0)
      const AYER = fechaMerida(1)
      try {
        const [dias, top, stock, horno, encargos, cortes, facturas] = await Promise.all([
          ventasDiarias(sb, 60),
          productosMasVendidos(sb, 6),
          stockPorAlmacen(sb),
          hornoEnVivo(sb),
          listarEncargos(sb),
          cortesDeCaja(sb, AYER, HOY),
          facturasListar(sb, AYER, HOY),
        ])
        if (!vivo) return
        setData(armar({ dias, top, stock, horno, encargos, cortes, facturas }))
        hayData.current = true
        setError(null)
      } catch (e) {
        // Si ya hay datos en pantalla, un fallo de refresco se ignora y se
        // reintenta al siguiente ciclo; solo la primera carga muestra el error
        // (la regla de la casa: si se recupera con un reintento, en silencio).
        if (vivo && !hayData.current) setError(mensajeDeError(e))
      } finally {
        if (vivo) setCargando(false)
      }
    }
    void cargar()
    // Se refresca solo: cada minuto, y al instante cuando cambia el camino del
    // pan (horno/encargos) por Realtime, como las pantallas de estación.
    const id = setInterval(() => void cargar(), 60000)
    const off = suscribirProduccion(sb, () => void cargar())
    return () => {
      vivo = false
      clearInterval(id)
      off()
    }
  }, [])

  if (cargando) return <Loading>Cargando panel…</Loading>
  if (error) return <ErrorMsg>{error}</ErrorMsg>
  if (!data) return <ErrorMsg>No se pudo cargar el panel.</ErrorMsg>
  // «Mandar a hacer» abre el envío rápido ahí mismo; su botón «Ver todo en
  // Producción» lleva al flujo completo. El camino del pan se actualiza solo
  // (Realtime de ordenes_produccion) tras mandar.
  return (
    <>
      <DashboardVista data={data} onMandarAHacer={() => setMandar(true)} />
      {mandar && <MandarAHacerModal onClose={() => setMandar(false)} />}
    </>
  )
}

type Fuentes = {
  dias: VentaDiaria[]
  top: ProductoVendido[]
  stock: StockAlmacen[]
  horno: HornoEnVivo
  encargos: Encargo[]
  cortes: CorteDeCaja[]
  facturas: FacturaGlobal[]
}

/**
 * Un cambio porcentual solo cuando es creíble: si el periodo anterior fue (casi)
 * cero o el salto es disparatado (>500%), no se muestra pastilla. Evita el
 * «+13361%» que sale cuando la semana pasada no tuvo ventas.
 */
function deltaSano(cur: number, prev: number): number | undefined {
  if (prev <= 0) return undefined
  const pct = ((cur - prev) / prev) * 100
  if (!isFinite(pct) || Math.abs(pct) > 500) return undefined
  return pct
}
function pill(pct: number | undefined): Delta | undefined {
  return pct == null ? undefined : { pct, buenoSiSube: true }
}

/** Convierte las consultas en lo que pinta la vista. */
function armar({ dias, top, stock, horno, encargos, cortes, facturas }: Fuentes): DashboardData {
  const HOY = fechaMerida(0)
  const AYER = fechaMerida(1)
  const porDia = new Map(dias.filter((d) => d.dia).map((d) => [d.dia as string, d]))
  const totalDe = (dia: string) => Number(porDia.get(dia)?.total_ventas ?? 0)
  const ordDe = (dia: string) => Number(porDia.get(dia)?.num_ordenes ?? 0)

  // 60 días de calendario ascendentes (el último es hoy), para no perder los
  // días sin ventas, que no vienen en la vista.
  const dias60 = Array.from({ length: 60 }, (_, i) => fechaMerida(59 - i))
  const rango = (n: number, atras = 0) => dias60.slice(60 - atras - n, 60 - atras)
  const sumT = (ds: string[]) => ds.reduce((a, d) => a + totalDe(d), 0)
  const sumO = (ds: string[]) => ds.reduce((a, d) => a + ordDe(d), 0)

  const u7 = rango(7), p7 = rango(7, 7), u30 = rango(30), p30 = rango(30, 30)
  const total7 = sumT(u7), prev7 = sumT(p7), total30 = sumT(u30), prev30 = sumT(p30)
  const ord7 = sumO(u7), ord30 = sumO(u30)

  const hoyRow = porDia.get(HOY)
  const ayerRow = porDia.get(AYER)
  const ventasHoy = Number(hoyRow?.total_ventas ?? 0)
  const ventasAyer = Number(ayerRow?.total_ventas ?? 0)
  const ordHoy = ordDe(HOY)
  const ticketHoy = Number(hoyRow?.ticket_promedio ?? 0)
  const ticketAyer = Number(ayerRow?.ticket_promedio ?? 0)

  const bajos = stock.filter((s) => s.bajo_minimo)

  // Cómo se cobró hoy, con el desglose REAL por método desde los cortes de hoy
  // (separan Banorte, Inbursa, transferencia y Rappi). Sin corte aún, cae a la
  // vista de ventas.
  const cortesHoy = cortes.filter((c) => diaDeTimestamp(c.abierto_en) === HOY)
  const sumaCorte = (sel: (c: CorteDeCaja) => number) => cortesHoy.reduce((a, c) => a + (sel(c) ?? 0), 0)
  const pagos = cortesHoy.length
    ? [
        { lbl: 'Efectivo', val: sumaCorte((c) => c.total_efectivo) },
        { lbl: 'Terminal 1', val: sumaCorte((c) => c.total_tarjeta), nota: 'Banorte' },
        { lbl: 'Terminal 2', val: sumaCorte((c) => c.total_inbursa), nota: 'Inbursa' },
        { lbl: 'Transferencia', val: sumaCorte((c) => c.total_transferencia) },
        { lbl: 'Rappi', val: sumaCorte((c) => c.total_rappi), nota: 'plataforma' },
      ]
    : [
        { lbl: 'Efectivo', val: Number(hoyRow?.efectivo ?? 0) },
        { lbl: 'Tarjeta', val: Number(hoyRow?.tarjeta ?? 0), nota: 'terminal' },
        { lbl: 'Otro', val: Number(hoyRow?.otro ?? 0) + Number(hoyRow?.clip ?? 0) + Number(hoyRow?.cortesia ?? 0), nota: 'transf., Rappi…' },
      ]

  // Encargos de HOY o antes (regla «ese día o antes»), y cuántos sin empacar.
  const encHoy = encargos.filter((e) => !e.fecha_entrega || e.fecha_entrega <= HOY)
  const sinEmpacar = encHoy.filter((e) => !e.empacado_at)

  const ultimoCorte = cortes
    .filter((c) => c.estado === 'cerrada' && c.cerrado_en)
    .sort((a, b) => (a.cerrado_en! < b.cerrado_en! ? 1 : -1))[0]

  const folioAyer = `GLOBAL-${AYER.replaceAll('-', '')}`
  const timbradaAyer = facturas.some((f) => f.estatus === 'timbrada' && f.folio_original === folioAyer)
  const ayerConTarjeta = Number(ayerRow?.tarjeta ?? 0) > 0

  const tarde = horno.resumen?.tarde ?? 0
  const enHorno = horno.resumen?.en_horno ?? 0

  // Riel «qué hay que atender»: urgentes primero, luego avisos, luego lo bueno.
  const pendientes: Callout[] = []
  if (sinEmpacar.length > 0) {
    const quienes = sinEmpacar.slice(0, 3).map((e) => e.cliente).filter(Boolean).join(', ')
    pendientes.push({ tono: 'urgente', titulo: `${sinEmpacar.length} ${sinEmpacar.length === 1 ? 'encargo' : 'encargos'} sin empacar`, detalle: `${quienes}${sinEmpacar.length > 3 ? '…' : ''}. Revisa Empaque.` })
  }
  if (tarde > 0) {
    pendientes.push({ tono: 'urgente', titulo: `${tarde} ${tarde === 1 ? 'tanda pasada' : 'tandas pasadas'} de su hora`, detalle: 'Llevan tiempo fuera en el horno. Revisa Producción.' })
  }
  if (bajos.length > 0) {
    const nombres = bajos.slice(0, 3).map((b) => b.insumo).filter(Boolean).join(', ')
    pendientes.push({ tono: 'urgente', titulo: `${bajos.length} ${bajos.length === 1 ? 'insumo' : 'insumos'} bajo mínimo`, detalle: `${nombres}${bajos.length > 3 ? '…' : ''}. Revisa la lista de compra.` })
  }
  if (ultimoCorte && (ultimoCorte.diferencia ?? 0) !== 0) {
    const dif = ultimoCorte.diferencia ?? 0
    pendientes.push({ tono: 'aviso', titulo: `El último corte tuvo ${dif < 0 ? 'faltante' : 'sobrante'} de ${money(Math.abs(dif))}`, detalle: `Corte #${ultimoCorte.folio}. Revisa Cortes de caja.` })
  }
  if (ayerConTarjeta && !timbradaAyer) {
    pendientes.push({ tono: 'aviso', titulo: 'Factura global de ayer sin timbrar', detalle: `Hubo cobros con tarjeta el ${AYER}. Entra a Facturación.` })
  }
  if (enHorno > 0) {
    pendientes.push({ tono: 'aviso', titulo: `${enHorno} ${enHorno === 1 ? 'tanda' : 'tandas'} en el horno`, detalle: 'Saldrán pronto; ten listo el mostrador.' })
  }
  if (ultimoCorte && (ultimoCorte.diferencia ?? 0) === 0) {
    pendientes.push({ tono: 'ok', titulo: 'El último corte cuadró', detalle: `Corte #${ultimoCorte.folio}, sin faltante ni sobrante.` })
  }
  if (pendientes.length === 0) {
    pendientes.push({ tono: 'ok', titulo: 'Todo en orden', detalle: 'Sin pendientes urgentes ahora mismo.' })
  }

  const unidadTxt = (u: string, n: number) => (u === 'molde' ? (n === 1 ? 'molde' : 'moldes') : 'pz')
  const hornoItems: HornoItem[] = [
    ...horno.adentro.map((h) => ({ sabor: h.sabor, estado: 'horno' as const, detalle: `${h.moldes} ${unidadTxt(h.unidad, h.moldes)}` })),
    ...horno.esperando.map((h) => ({ sabor: h.sabor, estado: 'espera' as const, detalle: `${h.moldes} ${unidadTxt(h.unidad, h.moldes)} · esperando turno` })),
  ].slice(0, 6)

  const alertaStock = { lbl: 'Alertas de stock', val: String(bajos.length), sub: 'bajo mínimo' }
  const barras7 = u7.map((dia) => ({ etiqueta: dia === HOY ? 'hoy' : diaCorto(dia), total: totalDe(dia), esHoy: dia === HOY }))
  const barras30 = u30.map((dia) => ({ etiqueta: '', total: totalDe(dia), esHoy: dia === HOY }))

  const periodos: Periodo[] = [
    {
      id: 'hoy', label: 'Hoy',
      kpis: [
        { lbl: 'Ventas de hoy', val: money(ventasHoy), sub: `${ordHoy} ${ordHoy === 1 ? 'orden' : 'órdenes'}`, delta: pill(deltaSano(ventasHoy, ventasAyer)) },
        { lbl: 'Ticket promedio', val: money(ticketHoy), sub: 'hoy', delta: pill(deltaSano(ticketHoy, ticketAyer)) },
        { lbl: 'Encargos de hoy', val: String(encHoy.length), sub: encHoy.length ? `${sinEmpacar.length} sin empacar` : 'nada por entregar' },
        alertaStock,
      ],
      barras: barras7, tituloBarras: 'Ventas últimos 7 días', total: total7, delta: deltaSano(total7, prev7), etiquetaTotal: 'Total 7 días',
    },
    {
      id: '7d', label: '7 días',
      kpis: [
        { lbl: 'Ventas 7 días', val: money(total7), sub: 'acumulado', delta: pill(deltaSano(total7, prev7)) },
        { lbl: 'Órdenes 7 días', val: String(ord7), sub: 'en la semana' },
        { lbl: 'Ticket promedio', val: money(ord7 > 0 ? total7 / ord7 : 0), sub: 'promedio 7 días' },
        alertaStock,
      ],
      barras: barras7, tituloBarras: 'Ventas últimos 7 días', total: total7, delta: deltaSano(total7, prev7), etiquetaTotal: 'Total 7 días',
    },
    {
      id: '30d', label: '30 días',
      kpis: [
        { lbl: 'Ventas 30 días', val: money(total30), sub: 'acumulado', delta: pill(deltaSano(total30, prev30)) },
        { lbl: 'Órdenes 30 días', val: String(ord30), sub: 'en el mes' },
        { lbl: 'Ticket promedio', val: money(ord30 > 0 ? total30 / ord30 : 0), sub: 'promedio 30 días' },
        alertaStock,
      ],
      barras: barras30, tituloBarras: 'Ventas últimos 30 días', total: total30, delta: deltaSano(total30, prev30), etiquetaTotal: 'Total 30 días',
    },
  ]

  return {
    fecha: HOY,
    sucursal: 'Principal',
    periodos,
    pendientes,
    camino: {
      porArmar: horno.resumen?.sin_armar ?? 0,
      esperando: horno.resumen?.esperando ?? 0,
      enHorno: enHorno,
      porEmpacar: sinEmpacar.length,
    },
    pagos,
    top: top.map((p) => ({ nombre: p.nombre ?? '—', vendido: Number(p.total_vendido ?? 0) })),
    horno: hornoItems,
    stockBajo: bajos.map((s) => ({
      insumo: s.insumo ?? '—',
      almacen: s.almacen ?? '',
      actual: `${Number(s.stock_actual ?? 0)} ${s.unidad ?? ''}`.trim(),
      minimo: String(Number(s.stock_minimo ?? 0)),
    })),
  }
}

// Cifra en pesos sin centavos, para los KPIs grandes (la vista usa `mxn` con
// centavos en el resto).
function money(n: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
}
