import { useEffect, useState } from 'react'
import { sb } from '../lib/sb'
import {
  ventasDiarias, productosMasVendidos, stockPorAlmacen, hornoEnVivo,
  listarEncargos, cortesDeCaja, facturasListar,
  type HornoEnVivo, type Encargo, type CorteDeCaja, type FacturaGlobal,
} from '@lily/supabase'
import type { VentaDiaria, ProductoVendido, StockAlmacen } from '@lily/types'
import { mensajeDeError } from '@lily/utils'
import { Loading, ErrorMsg } from '../ui'
import DashboardVista, { type DashboardData, type HornoItem } from './DashboardVista'
import type { Callout } from './dashboardUi'

/**
 * Dashboard del día: KPIs con cambio vs ayer, el riel «qué hay que atender»,
 * ventas de 7 días con comparación semanal, cómo se cobró, lo más vendido, el
 * horno en vivo y el stock bajo mínimo.
 *
 * Solo arma los datos; la forma vive en `DashboardVista`. La fecha se decide en
 * Mérida (igual que las vistas de la base), no en la hora del aparato.
 */

const ZONA = 'America/Merida'
/** La fecha de Mérida hace `off` días (hoy = 0), como 'YYYY-MM-DD'. */
function fechaMerida(off = 0): string {
  return new Date(Date.now() - off * 86400000).toLocaleDateString('en-CA', { timeZone: ZONA })
}
function diaCorto(dia: string): string {
  // Mediodía UTC para que el nombre del día no se corra por zona horaria.
  return new Date(dia + 'T12:00:00Z').toLocaleDateString('es-MX', { weekday: 'short', timeZone: ZONA })
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const HOY = fechaMerida(0)
    const AYER = fechaMerida(1)
    Promise.all([
      ventasDiarias(sb, 14),
      productosMasVendidos(sb, 6),
      stockPorAlmacen(sb),
      hornoEnVivo(sb),
      listarEncargos(sb),
      cortesDeCaja(sb, AYER, HOY),
      facturasListar(sb, AYER, HOY),
    ])
      .then(([dias, top, stock, horno, encargos, cortes, facturas]) => {
        setData(armar({ dias, top, stock, horno, encargos, cortes, facturas }))
        setError(null)
      })
      .catch((e) => setError(mensajeDeError(e)))
      .finally(() => setCargando(false))
  }, [])

  if (cargando) return <Loading>Cargando panel…</Loading>
  if (error) return <ErrorMsg>{error}</ErrorMsg>
  if (!data) return <ErrorMsg>No se pudo cargar el panel.</ErrorMsg>
  return <DashboardVista data={data} />
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

/** Convierte las consultas en lo que pinta la vista. */
function armar({ dias, top, stock, horno, encargos, cortes, facturas }: Fuentes): DashboardData {
  const HOY = fechaMerida(0)
  const AYER = fechaMerida(1)
  const porDia = new Map(dias.filter((d) => d.dia).map((d) => [d.dia as string, d]))
  const totalDe = (dia: string) => Number(porDia.get(dia)?.total_ventas ?? 0)

  // 14 días de calendario ascendentes (el último es hoy), para no perder los
  // días sin ventas, que no vienen en la vista.
  const dias14 = Array.from({ length: 14 }, (_, i) => fechaMerida(13 - i))
  const previos = dias14.slice(0, 7)
  const ultimos = dias14.slice(7)
  const total7 = ultimos.reduce((a, d) => a + totalDe(d), 0)
  const prev7 = previos.reduce((a, d) => a + totalDe(d), 0)
  const deltaSemana = prev7 > 0 ? ((total7 - prev7) / prev7) * 100 : 0

  const hoyRow = porDia.get(HOY)
  const ayerRow = porDia.get(AYER)
  const ventasHoy = Number(hoyRow?.total_ventas ?? 0)
  const ventasAyer = Number(ayerRow?.total_ventas ?? 0)
  const ordHoy = Number(hoyRow?.num_ordenes ?? 0)
  const ticket = Number(hoyRow?.ticket_promedio ?? 0)
  const ticketAyer = Number(ayerRow?.ticket_promedio ?? 0)
  const pct = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : 0)

  const bajos = stock.filter((s) => s.bajo_minimo)

  // Encargos de HOY o antes (regla de la casa: «ese día o antes»). Lo que se
  // pasó de su día sigue contando porque sigue en una bolsa con nombre.
  const encHoy = encargos.filter((e) => !e.fecha_entrega || e.fecha_entrega <= HOY)
  const sinEmpacar = encHoy.filter((e) => !e.empacado_at)

  // El último corte cerrado: ¿cuadró el cajón?
  const ultimoCorte = cortes
    .filter((c) => c.estado === 'cerrada' && c.cerrado_en)
    .sort((a, b) => (a.cerrado_en! < b.cerrado_en! ? 1 : -1))[0]

  // Factura global de ayer: si ayer hubo cobro con tarjeta y no está timbrada.
  const folioAyer = `GLOBAL-${AYER.replaceAll('-', '')}`
  const timbradaAyer = facturas.some((f) => f.estatus === 'timbrada' && f.folio_original === folioAyer)
  const ayerConTarjeta = Number(ayerRow?.tarjeta ?? 0) > 0

  const tarde = horno.resumen?.tarde ?? 0
  const enHorno = horno.resumen?.en_horno ?? 0

  // Riel «qué hay que atender»: urgentes primero (lo que duele hoy), luego
  // avisos, luego lo que está bien.
  const pendientes: Callout[] = []
  if (sinEmpacar.length > 0) {
    const quienes = sinEmpacar.slice(0, 3).map((e) => e.cliente).filter(Boolean).join(', ')
    pendientes.push({
      tono: 'urgente',
      titulo: `${sinEmpacar.length} ${sinEmpacar.length === 1 ? 'encargo' : 'encargos'} sin empacar`,
      detalle: `${quienes}${sinEmpacar.length > 3 ? '…' : ''}. Revisa Empaque.`,
    })
  }
  if (tarde > 0) {
    pendientes.push({
      tono: 'urgente',
      titulo: `${tarde} ${tarde === 1 ? 'tanda pasada' : 'tandas pasadas'} de su hora`,
      detalle: 'Llevan tiempo fuera en el horno. Revisa Producción.',
    })
  }
  if (bajos.length > 0) {
    const nombres = bajos.slice(0, 3).map((b) => b.insumo).filter(Boolean).join(', ')
    pendientes.push({
      tono: 'urgente',
      titulo: `${bajos.length} ${bajos.length === 1 ? 'insumo' : 'insumos'} bajo mínimo`,
      detalle: `${nombres}${bajos.length > 3 ? '…' : ''}. Revisa la lista de compra.`,
    })
  }
  if (ultimoCorte && (ultimoCorte.diferencia ?? 0) !== 0) {
    const dif = ultimoCorte.diferencia ?? 0
    pendientes.push({
      tono: 'aviso',
      titulo: `El último corte tuvo ${dif < 0 ? 'faltante' : 'sobrante'} de ${money(Math.abs(dif))}`,
      detalle: `Corte #${ultimoCorte.folio}. Revisa Cortes de caja.`,
    })
  }
  if (ayerConTarjeta && !timbradaAyer) {
    pendientes.push({
      tono: 'aviso',
      titulo: 'Factura global de ayer sin timbrar',
      detalle: `Hubo cobros con tarjeta el ${AYER}. Entra a Facturación.`,
    })
  }
  if (enHorno > 0) {
    pendientes.push({
      tono: 'aviso',
      titulo: `${enHorno} ${enHorno === 1 ? 'tanda' : 'tandas'} en el horno`,
      detalle: 'Saldrán pronto; ten listo el mostrador.',
    })
  }
  if (ultimoCorte && (ultimoCorte.diferencia ?? 0) === 0) {
    pendientes.push({
      tono: 'ok',
      titulo: 'El último corte cuadró',
      detalle: `Corte #${ultimoCorte.folio}, sin faltante ni sobrante.`,
    })
  }
  if (pendientes.length === 0) {
    pendientes.push({ tono: 'ok', titulo: 'Todo en orden', detalle: 'Sin pendientes urgentes ahora mismo.' })
  }

  const unidadTxt = (u: string, n: number) => (u === 'molde' ? (n === 1 ? 'molde' : 'moldes') : 'pz')
  const hornoItems: HornoItem[] = [
    ...horno.adentro.map((h) => ({ sabor: h.sabor, estado: 'horno' as const, detalle: `${h.moldes} ${unidadTxt(h.unidad, h.moldes)}` })),
    ...horno.esperando.map((h) => ({ sabor: h.sabor, estado: 'espera' as const, detalle: `${h.moldes} ${unidadTxt(h.unidad, h.moldes)} · esperando turno` })),
  ].slice(0, 6)

  return {
    fecha: HOY,
    sucursal: 'Principal',
    kpis: [
      { lbl: 'Ventas de hoy', val: money(ventasHoy), sub: `${ordHoy} ${ordHoy === 1 ? 'orden' : 'órdenes'}`, delta: ayerRow ? { pct: pct(ventasHoy, ventasAyer), buenoSiSube: true } : undefined },
      { lbl: 'Ticket promedio', val: money(ticket), sub: 'hoy', delta: ticketAyer > 0 ? { pct: pct(ticket, ticketAyer), buenoSiSube: true } : undefined },
      { lbl: 'Ventas 7 días', val: money(total7), sub: 'acumulado', delta: prev7 > 0 ? { pct: deltaSemana, buenoSiSube: true } : undefined },
      { lbl: 'Encargos de hoy', val: String(encHoy.length), sub: encHoy.length ? `${sinEmpacar.length} sin empacar` : 'nada por entregar' },
    ],
    pendientes,
    semana: ultimos.map((dia) => ({
      etiqueta: dia === HOY ? 'hoy' : diaCorto(dia),
      total: totalDe(dia),
      esHoy: dia === HOY,
    })),
    totalSemana: total7,
    deltaSemana,
    pagos: [
      { lbl: 'Efectivo', val: Number(hoyRow?.efectivo ?? 0) },
      { lbl: 'Tarjeta', val: Number(hoyRow?.tarjeta ?? 0), nota: 'terminal' },
      { lbl: 'Otro', val: Number(hoyRow?.otro ?? 0) + Number(hoyRow?.clip ?? 0) + Number(hoyRow?.cortesia ?? 0), nota: 'transf., Rappi…' },
    ],
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
