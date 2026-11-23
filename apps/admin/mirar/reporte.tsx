/**
 * PREVIA del reporte gerencial, con datos de ejemplo de un mes.
 *
 *     cd apps/admin && pnpm dev
 *     →   http://localhost:5186/mirar/reporte.html
 *
 * No toca nada real: es una propuesta para mirar antes de armar.
 */
import { createRoot } from 'react-dom/client'
import ReporteGerencial, { type ReporteData, type CeldaCalor } from '../src/pages/ReporteGerencial'
import '../src/index.css'

const DIAS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']
const HORAS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]

// Patrón real de panadería: pico al mediodía (12–14 h), fin de semana más alto,
// con un bultito a media mañana. El pico global cae el sábado a la 1 p.m.
const MULT_DIA = [1, 1.05, 1.0, 1.1, 1.2, 1.55, 1.25]
function formaHora(h: number): number {
  const medio = Math.exp(-((h - 13) ** 2) / 7) // pico 1 p.m.
  const manana = 0.45 * Math.exp(-((h - 9) ** 2) / 3) // bulto 9 a.m.
  return medio + manana
}
const calor: CeldaCalor[] = []
for (let d = 0; d < 7; d++) {
  for (const h of HORAS) {
    const total = Math.round(2600 * MULT_DIA[d] * formaHora(h))
    calor.push({ dia: d, hora: h, total })
  }
}

const DATA: ReporteData = {
  periodo: 'Noviembre 2026',
  insights: [
    { tono: 'alza', titulo: 'El sábado vende 34% más que el promedio', detalle: 'Es tu mejor día: conviene reforzar la producción del viernes por la tarde.' },
    { tono: 'dato', titulo: 'Hora pico: 12 a 2 p.m.', detalle: 'El 38% de las ventas del día pasan en esa franja. Ten la vitrina llena antes de las 12.' },
    { tono: 'alza', titulo: 'Guayaba es tu producto estrella', detalle: '1 de cada 5 piezas vendidas; manda casi todos los días de la semana.' },
    { tono: 'dato', titulo: 'El mes va +12% vs el anterior', detalle: '$248,500 este mes contra $221,300 el pasado.' },
  ],
  kpis: [
    { lbl: 'Ventas del mes', val: '$248,500', sub: 'vs $221,300 el mes pasado', delta: { pct: 12.3, buenoSiSube: true } },
    { lbl: 'Ticket promedio', val: '$168', sub: 'por orden', delta: { pct: 2.1, buenoSiSube: true } },
    { lbl: 'Órdenes del mes', val: '1,480', sub: 'vs 1,348', delta: { pct: 9.8, buenoSiSube: true } },
    { lbl: 'Mejor día', val: 'Sáb 15', sub: '$18,420 · récord del mes' },
  ],
  horas: HORAS,
  dias: DIAS,
  calor,
  porDiaSemana: [
    { dia: 'lun', promedio: 6800 },
    { dia: 'mar', promedio: 7200 },
    { dia: 'mié', promedio: 6900 },
    { dia: 'jue', promedio: 7600 },
    { dia: 'vie', promedio: 9100 },
    { dia: 'sáb', promedio: 12800, esPico: true },
    { dia: 'dom', promedio: 9400 },
  ],
  productoPorDia: [
    { dia: 'lun', producto: 'Guayaba · Chica', unidades: 38 },
    { dia: 'mar', producto: 'Queso · Chica', unidades: 41 },
    { dia: 'mié', producto: 'Guayaba · Chica', unidades: 36 },
    { dia: 'jue', producto: 'Fiesta · Mini', unidades: 44 },
    { dia: 'vie', producto: 'Jamón y Queso · Chica', unidades: 52 },
    { dia: 'sáb', producto: 'Guayaba · Chica', unidades: 86 },
    { dia: 'dom', producto: 'Pan de Muerto Tradicional', unidades: 61 },
  ],
  categorias: [
    { etiqueta: 'Hojaldras', pct: 58, total: 144130 },
    { etiqueta: 'Panes', pct: 18, total: 44730 },
    { etiqueta: 'Bocadillos', pct: 10, total: 24850 },
    { etiqueta: 'Roscas y trenzas', pct: 8, total: 19880 },
    { etiqueta: 'Bebidas', pct: 6, total: 14910 },
  ],
  canales: [
    { etiqueta: 'Mostrador', pct: 72, total: 178920 },
    { etiqueta: 'Encargos', pct: 20, total: 49700 },
    { etiqueta: 'Rappi', pct: 8, total: 19880 },
  ],
  subieron: [
    { producto: 'Pan de Muerto', pct: 142.0 },
    { producto: 'Fiesta · Mini', pct: 22.4 },
    { producto: 'Trenza Suiza', pct: 15.1 },
  ],
  bajaron: [
    { producto: 'Rosca de Reyes', pct: -38.0 },
    { producto: 'Café de olla', pct: -17.5 },
    { producto: 'Concha', pct: -9.2 },
  ],
}

createRoot(document.getElementById('root')!).render(
  <div style={{ minHeight: '100vh', background: 'var(--sa-cream-paper)', padding: '24px' }}>
    <div style={{ maxWidth: '1152px', margin: '0 auto' }}>
      <ReporteGerencial data={DATA} />
    </div>
  </div>,
)
