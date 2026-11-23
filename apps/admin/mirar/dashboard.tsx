/**
 * PREVIA del dashboard mejorado, con datos de una tienda de mediodía.
 *
 *     cd apps/admin && pnpm dev
 *     →   http://localhost:5185/mirar/dashboard.html
 *
 * No toca el Dashboard.tsx real: es una propuesta para mirar antes de armar.
 */
import { createRoot } from 'react-dom/client'
import DashboardPreview, { type DashboardData } from '../src/pages/DashboardPreview'
import '../src/index.css'

const DATA: DashboardData = {
  fecha: '2026-11-23',
  sucursal: 'Miguel Alemán',
  kpis: [
    { lbl: 'Ventas de hoy', val: '$8,450', sub: '48 órdenes · corte abierto', delta: { pct: 12.5, buenoSiSube: true } },
    { lbl: 'Ticket promedio', val: '$176', sub: 'hoy', delta: { pct: -3.2, buenoSiSube: true } },
    { lbl: 'Ventas 7 días', val: '$66,150', sub: 'acumulado', delta: { pct: 8.1, buenoSiSube: true } },
    { lbl: 'Encargos de hoy', val: '6', sub: '2 sin empacar · 1 se pasó', delta: { pct: 0, buenoSiSube: true } },
  ],
  pendientes: [
    { tono: 'urgente', titulo: '2 encargos sin empacar para las 12:00 p.m.', detalle: 'Jamón y Queso Chica ×10 · Fiesta Mini ×5. Para la hora pico.' },
    { tono: 'urgente', titulo: '3 insumos bajo mínimo', detalle: 'Harina, mantequilla y bolsas chicas. Revisa la lista de compra.' },
    { tono: 'aviso', titulo: 'Pan pasado de su hora en producción', detalle: 'Guayaba de 48 lleva 20 min fuera de tiempo en el horno.' },
    { tono: 'aviso', titulo: 'Factura global de ayer sin timbrar', detalle: '24 folios con tarjeta ($8,545). Entra a Facturación.' },
    { tono: 'ok', titulo: 'El corte de ayer cuadró', detalle: 'Sin faltante ni sobrante. $8,120 en 73 folios.' },
  ],
  semana: [
    { etiqueta: 'lun', total: 6100 },
    { etiqueta: 'mar', total: 8900 },
    { etiqueta: 'mié', total: 7600 },
    { etiqueta: 'jue', total: 9100 },
    { etiqueta: 'vie', total: 11200 },
    { etiqueta: 'sáb', total: 14800 },
    { etiqueta: 'hoy', total: 8450, esHoy: true },
  ],
  totalSemana: 66150,
  deltaSemana: 8.1,
  pagos: [
    { lbl: 'Efectivo', val: 4100 },
    { lbl: 'Terminal 1', val: 2800, nota: 'Banorte' },
    { lbl: 'Terminal 2', val: 650, nota: 'Inbursa' },
    { lbl: 'Transferencia', val: 400 },
    { lbl: 'Rappi', val: 500, nota: 'paga la plataforma' },
  ],
  top: [
    { nombre: 'Guayaba · Chica', vendido: 42 },
    { nombre: 'Queso · Chica', vendido: 36 },
    { nombre: 'Fiesta · Mini', vendido: 28 },
    { nombre: 'Jamón y Queso · Chica', vendido: 24 },
    { nombre: 'Trenza Suiza', vendido: 18 },
    { nombre: 'Rosca de Queso Philadelphia', vendido: 12 },
  ],
  horno: [
    { sabor: 'Guayaba', estado: 'horno', detalle: 'Sale 12:40 p.m. · 3 moldes de 48' },
    { sabor: 'Trenza Suiza', estado: 'horno', detalle: 'Sale 1:05 p.m. · 12 piezas' },
    { sabor: 'Queso de Bola', estado: 'espera', detalle: 'Armado, esperando turno · 2 moldes' },
    { sabor: 'Fiesta', estado: 'listo', detalle: 'Salió del horno · falta empacar' },
  ],
  stockBajo: [
    { insumo: 'Harina de trigo', almacen: 'Almacén', actual: '2 sacos', minimo: '5' },
    { insumo: 'Mantequilla', almacen: 'Refrigerador', actual: '3 cubetas', minimo: '4' },
    { insumo: 'Bolsas chicas', almacen: 'Almacén', actual: '1 paquete', minimo: '6' },
  ],
}

createRoot(document.getElementById('root')!).render(
  <div style={{ minHeight: '100vh', background: 'var(--sa-cream-paper)', padding: '24px' }}>
    <div style={{ maxWidth: '1152px', margin: '0 auto' }}>
      <DashboardPreview data={DATA} />
    </div>
  </div>,
)
