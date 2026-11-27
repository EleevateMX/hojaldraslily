/**
 * La cola de encargos y su historial, con una tienda ocupada.
 *
 *     cd apps/pos && pnpm dev   →   http://localhost:5173/mirar/encargos.html
 *
 * Mismo motivo que `main.tsx`: desde este contenedor el navegador no alcanza
 * Supabase, y los defectos de una lista con treinta tarjetas no se ven
 * leyendo el código. Hacen falta los casos raros juntos: uno que se pasó de
 * su día, varios el mismo día a horas distintas, una hora ilegible, uno sin
 * fecha, y encargos ya empacados conviviendo con los que no.
 *
 * El encabezado del día va aquí IGUAL que en la pantalla real
 * (`src/pages/Encargos.tsx`): grande y centrado, con el resumen por producto
 * del día debajo. Por eso los encargos traen productos variados, para que el
 * resumen no salga de un solo renglón.
 */
import { createRoot } from 'react-dom/client'
import {
  encargosPorDia,
  loQueHayQueEmpacar,
  horaEn12h,
  type Encargo,
  type Encargo as _E,
} from '../../../packages/supabase/src/queries/produccion'
import { partirNombreDeVenta } from '../../../packages/supabase/src/queries/catalogo'
import '../src/index.css'

type Item = _E['items'][number]
let n = 0
let ii = 0
// El `producto_id` SALE DEL NOMBRE a propósito: así el mismo pan en dos
// encargos comparte id y `loQueHayQueEmpacar` lo suma, como en producción
// (donde el id es el UUID real). Un id único por renglón mentiría: el resumen
// saldría con «6 Fiesta» y «4 Fiesta» en vez de «10 Fiesta».
const item = (producto: string, cantidad: number, precio: number): Item =>
  ({ id: 'i' + ++ii, producto_id: 'p-' + producto, producto, imagen_url: null, cantidad, precio_unitario: precio }) as Item

const e = (
  cliente: string,
  fecha: string | null,
  hora: string | null,
  items: Item[],
  extra: Partial<Encargo> = {},
): Encargo => {
  const piezas = items.reduce((s, i) => s + i.cantidad, 0)
  const total = items.reduce((s, i) => s + i.cantidad * i.precio_unitario, 0)
  return {
    id: String(++n), folio: 1000 + n, cliente, telefono: '999 123 4567',
    fecha_entrega: fecha, hora_entrega: hora, estado: 'apartado', anticipo: 0,
    nota: null, creado_por: 'Caja', created_at: '', empacado_at: null, empacado_por: null,
    items, total, piezas, ...extra,
  } as Encargo
}

// Hoy es martes 20 de octubre en esta pantalla.
const hoy = new Date('2026-10-20T11:00:00')
const encargos = [
  e('Marisol Pech', '2026-10-18', '10:00', [item('Jamón y Queso · Chica · 24 cuadros', 2, 310)]),
  e('Doña Carmen', '2026-10-20', '6 pm',
    [item('Fiesta · Mini · 12 cuadros', 4, 160)],
    { empacado_at: '2026-10-20T08:00:00Z', empacado_por: 'Empaque' }),
  e('Luis Canul', '2026-10-20', '10:00',
    [item('Guayaba · Grande · 48 cuadros', 1, 540), item('Fiesta · Mini · 12 cuadros', 2, 160)],
    { anticipo: 200 }),
  e('Oficina Kanasín', '2026-10-20', 'por la tarde',
    [item('Jamón y Queso · Chica · 24 cuadros', 6, 310)],
    { nota: 'Son 3 cajas, para un cumpleaños' }),
  e('Rosy', '2026-10-21', '9:30', [item('Rosca de Queso Philadelphia', 1, 290)]),
  // Dos a la misma hora en punto y uno a y media: tienen que caer en UN bloque.
  e('Fer Canto', '2026-10-20', '12:00', [item('Fiesta · Mini · 12 cuadros', 6, 160)]),
  e('Sra. Tun', '2026-10-20', '12:30', [item('Guayaba · Grande · 48 cuadros', 2, 540)]),
  e('Panadería Sur', '2026-10-20', '12:00',
    [item('Jamón y Queso · Chica · 24 cuadros', 4, 310)], { para_viaje: true }),
  e('Jorge Uc', '2026-10-21', null, [item('Trenza Suiza', 3, 220)]),
  e('Escuela Lily', '2026-10-22', '7 am', [item('Fiesta · Mini · 12 cuadros', 10, 160)]),
  e('Pasa más tarde', null, null, [item('Guayaba · Chica · 24 cuadros', 1, 310)]),
]

const dias = encargosPorDia(encargos, hoy)

createRoot(document.getElementById('root')!).render(
  <div className="p-4 space-y-5" style={{ background: 'var(--sa-cream)', minHeight: '100vh' }}>
    {dias.map((d) => (
      <div key={d.fecha ?? 'sin'} className="space-y-3">
        {/* Encabezado del día: grande y centrado, con el resumen por producto
            debajo. Copia exacta de `src/pages/Encargos.tsx`. */}
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
        {/* Los bloques de hora. Con uno solo el separador no se pinta: ahí
            estorba más de lo que ayuda. */}
        {d.horas.map((h) => (
          <div key={h.minutos ?? 'sin-hora'} className="space-y-3">
            {d.horas.length > 1 && (
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-sa-green text-center">
                {h.titulo}
              </p>
            )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {h.encargos.map((x) => (
            <div key={x.id} className="rounded-sa border border-sa-green-ink/10 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-display text-lg text-sa-green-ink leading-tight">{x.cliente}</p>
                  <p className="font-mono text-[11px] uppercase tracking-wide text-sa-green-ink/50 mt-0.5">
                    #{x.folio} · {x.telefono}
                  </p>
                  {x.empacado_at && (
                    <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink bg-sa-mint/25 rounded-full px-2 py-0.5 inline-block mt-1">
                      Empacado · {x.empacado_por}
                    </p>
                  )}
                </div>
                <p className="font-display text-base shrink-0 text-sa-green-ink/70">
                  {/* Pintada en 12 h, que es como la lee la casa. Lo que no se
                      entiende se deja tal cual lo escribieron. */}
                  {horaEn12h(x.hora_entrega) || 'sin hora'}
                </p>
              </div>
              <div className="mt-2 space-y-0.5">
                {x.items.map((i) => {
                  const { sabor, medida } = partirNombreDeVenta(i.producto)
                  return (
                    <p key={i.id} className="font-body text-sm text-sa-green-ink">
                      <span className="font-display text-base">{i.cantidad}</span> {sabor}
                      {medida && <span className="text-sa-green-ink/50"> · {medida}</span>}
                    </p>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
          </div>
        ))}
      </div>
    ))}
  </div>,
)
