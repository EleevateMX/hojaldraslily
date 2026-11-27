/**
 * Los encargos de HOY, con DATOS REALES de producción (27/11/2026).
 *
 *     cd apps/pos && pnpm dev   →   http://localhost:5173/mirar/encargos-hoy.html
 *
 * Reusa el componente `Tarjeta` real de la pantalla y el mismo layout del día
 * (encabezado grande con mes + resumen por producto + bloques de hora), así
 * que es lo que ve el mostrador, solo que alimentado con los encargos reales
 * en vez de la base (el navegador del contenedor no alcanza Supabase).
 */
import { createRoot } from 'react-dom/client'
import { encargosPorDia, loQueHayQueEmpacar, type Encargo } from '../../../packages/supabase/src/queries/produccion'
import { partirNombreDeVenta } from '../../../packages/supabase/src/queries/catalogo'
import { Tarjeta } from '../src/pages/Encargos'
import '../src/index.css'

const btn = 'font-mono text-xs uppercase tracking-wide px-4 py-2 rounded-full transition-colors'

// Datos reales de la base (encargos con fecha de entrega = hoy 2026-11-27).
const hoy = new Date('2026-11-27T11:00:00')
const encargos: Encargo[] = [
  { id: '1', folio: null, cliente: 'Jorge Fernández', telefono: '5554086722', fecha_entrega: '2026-11-27', hora_entrega: '09:00', estado: 'apartado', anticipo: 0, para_viaje: true, nota: 'Todas de viaje', creado_por: 'Lily (gerencia)', created_at: '2026-11-25T20:37:09Z', empacado_at: null, empacado_por: null, total: 1930, piezas: 4, items: [
    { id: 'a', producto_id: 'g', cantidad: 3, precio_unitario: 540, producto: 'Jamón y Queso · Grande · 48 cuadros', imagen_url: 'jamon-y-queso.png' },
    { id: 'b', producto_id: 'c', cantidad: 1, precio_unitario: 310, producto: 'Jamón y Queso · Chica · 24 cuadros', imagen_url: 'jamon-y-queso.png' } ] },
  { id: '2', folio: null, cliente: 'Alan Manuel', telefono: null, fecha_entrega: '2026-11-27', hora_entrega: '09:00', estado: 'apartado', anticipo: 0, para_viaje: false, nota: null, creado_por: 'Lily (gerencia)', created_at: '2026-11-26T22:20:00Z', empacado_at: null, empacado_por: null, total: 310, piezas: 1, items: [
    { id: 'c', producto_id: 'c', cantidad: 1, precio_unitario: 310, producto: 'Jamón y Queso · Chica · 24 cuadros', imagen_url: 'jamon-y-queso.png' } ] },
  { id: '3', folio: null, cliente: 'Roxana Peniche', telefono: '9991295902', fecha_entrega: '2026-11-27', hora_entrega: '10:00', estado: 'apartado', anticipo: 0, para_viaje: false, nota: null, creado_por: 'Lily (gerencia)', created_at: '2026-11-23T16:38:16Z', empacado_at: null, empacado_por: null, total: 620, piezas: 2, items: [
    { id: 'd', producto_id: 'r', cantidad: 2, precio_unitario: 310, producto: 'Rosca de Queso de Bola', imagen_url: 'rosca-de-queso-de-bola.png' } ] },
  { id: '4', folio: 42, cliente: 'Marisa Pérez', telefono: '9999478159', fecha_entrega: '2026-11-27', hora_entrega: '10:30', estado: 'pagado', anticipo: 0, para_viaje: false, nota: null, creado_por: 'Lily (gerencia)', created_at: '2026-11-24T22:09:45Z', empacado_at: null, empacado_por: null, total: 1240, piezas: 4, items: [
    { id: 'e', producto_id: 'r', cantidad: 3, precio_unitario: 310, producto: 'Rosca de Queso de Bola', imagen_url: 'rosca-de-queso-de-bola.png' },
    { id: 'f', producto_id: 'c', cantidad: 1, precio_unitario: 310, producto: 'Jamón y Queso · Chica · 24 cuadros', imagen_url: 'jamon-y-queso.png' } ] },
  { id: '5', folio: null, cliente: 'Carolina Castillo', telefono: null, fecha_entrega: '2026-11-27', hora_entrega: '11:30', estado: 'apartado', anticipo: 0, para_viaje: false, nota: null, creado_por: 'Lily (gerencia)', created_at: '2026-11-26T15:52:50Z', empacado_at: null, empacado_por: null, total: 310, piezas: 1, items: [
    { id: 'g', producto_id: 'c', cantidad: 1, precio_unitario: 310, producto: 'Jamón y Queso · Chica · 24 cuadros', imagen_url: 'jamon-y-queso.png' } ] },
  { id: '6', folio: 56, cliente: 'Lilian Albornoz', telefono: '9996119232', fecha_entrega: '2026-11-27', hora_entrega: '15:00', estado: 'pagado', anticipo: 0, para_viaje: false, nota: 'pendiente transferencia', creado_por: 'Lily (gerencia)', created_at: '2026-11-25T19:25:28Z', empacado_at: null, empacado_por: null, total: 840, piezas: 6, items: [
    { id: 'h', producto_id: 'p', cantidad: 6, precio_unitario: 140, producto: 'Pastelitos de Lomo · 5 pzas', imagen_url: 'pastelitos-de-lomo.png' } ] },
  { id: '7', folio: 63, cliente: 'Cinthya Delgado', telefono: '9999550308', fecha_entrega: '2026-11-27', hora_entrega: '16:00', estado: 'pagado', anticipo: 0, para_viaje: true, nota: 'Viaje', creado_por: 'Lily (gerencia)', created_at: '2026-11-26T22:26:03Z', empacado_at: null, empacado_por: null, total: 540, piezas: 1, items: [
    { id: 'i', producto_id: 'g', cantidad: 1, precio_unitario: 540, producto: 'Jamón y Queso · Grande · 48 cuadros', imagen_url: 'jamon-y-queso.png' } ] },
] as Encargo[]

const porDia = encargosPorDia(encargos, hoy)

function Acciones({ e }: { e: Encargo }) {
  if (e.estado === 'pagado') {
    return (
      <button className="bg-sa-green text-sa-cream px-4 py-2 rounded-full font-mono text-xs uppercase tracking-wide">
        Entregar
      </button>
    )
  }
  return (
    <>
      <button className={`${btn} border border-sa-green-ink/15 text-sa-green-ink/70`}>Cancelar</button>
      <button className={`${btn} border border-sa-green-ink/15 text-sa-green-ink/70`}>Editar</button>
      <button className={`${btn} border border-sa-green-ink/15 text-sa-green-ink/70`}>Anticipo</button>
      <button className="bg-sa-green text-sa-cream px-4 py-2 rounded-full font-mono text-xs uppercase tracking-wide">
        Cobrar
      </button>
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <div className="p-4" style={{ background: 'var(--sa-cream-paper)', minHeight: '100vh' }}>
    <div className="space-y-5">
      {porDia.map((d) => (
        <div key={d.fecha ?? 'sin'} className="space-y-3">
          <div className="text-center space-y-2 pt-1">
            <div className="flex items-center justify-center gap-3">
              <span className="hidden sm:block flex-1 border-b border-sa-green-ink/10" />
              <p className={`font-display text-2xl lg:text-3xl leading-none ${d.vencido ? 'text-sa-green-deep bg-sa-strawberry/25 rounded-full px-4 py-1.5' : 'text-sa-green-ink'}`}>
                {d.titulo}
              </p>
              <span className="hidden sm:block flex-1 border-b border-sa-green-ink/10" />
            </div>
            <p className="font-mono text-[11px] uppercase tracking-wide text-sa-green-ink/45">
              {d.encargos.length} encargo{d.encargos.length === 1 ? '' : 's'}
            </p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {loQueHayQueEmpacar(d.encargos).map((p) => {
                const { sabor, medida } = partirNombreDeVenta(p.producto)
                return (
                  <span key={p.producto_id} className="inline-flex items-baseline gap-1 bg-white border border-sa-green-ink/10 rounded-full px-3 py-1">
                    <span className="font-display text-base text-sa-green leading-none">{p.cantidad}</span>
                    <span className="font-body text-sm text-sa-green-ink">{sabor}</span>
                    {medida && <span className="font-body text-xs text-sa-green-ink/50">· {medida}</span>}
                  </span>
                )
              })}
            </div>
          </div>
          {d.horas.map((h) => (
            <div key={h.minutos ?? 'sin-hora'} className="space-y-3">
              {d.horas.length > 1 && (
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-sa-green text-center">{h.titulo}</p>
              )}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {h.encargos.map((e) => (
                  <Tarjeta key={e.id} e={e} acciones={<Acciones e={e} />} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  </div>,
)
