/**
 * La franja de estado de la caja (dirección A), en sus estados.
 *
 *     cd apps/pos && pnpm dev   →   http://localhost:5173/mirar/franja.html
 *
 * Presentación pura (sin Supabase): los tres casos que importan, sobre una
 * cabecera de muestra para verla en su sitio.
 */
import { createRoot } from 'react-dom/client'
import { FranjaDeProduccion } from '../src/components/pos/FranjaDeProduccion'
import '../src/index.css'

function Cabecera() {
  return (
    <div className="flex items-center justify-between px-5 py-2.5 bg-sa-green text-sa-cream">
      <span className="font-display text-xl">Hojaldras Lily</span>
      <span className="font-mono text-xs uppercase tracking-widest text-sa-cream/60">Caja 1 · Rosa</span>
    </div>
  )
}

function Caso({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <p className="font-mono text-[11px] uppercase tracking-wide text-sa-green-ink/50 mb-1 px-1">{titulo}</p>
      <div className="rounded-sa overflow-hidden shadow-sa-sm">
        <Cabecera />
        {children}
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <div className="p-4" style={{ background: 'var(--sa-cream)', minHeight: '100vh' }}>
    <Caso titulo="Hora pico: horno lleno, algo se pasó, encargos por empacar">
      <FranjaDeProduccion enHorno={3} proximaSalida="12:10 p.m." tarde={1} sinEmpacar={2} encargosHoy={5} onEncargos={() => {}} />
    </Caso>
    <Caso titulo="Tranquilo: horno trabajando, nada pasado, todo empacado">
      <FranjaDeProduccion enHorno={2} proximaSalida="1:30 p.m." tarde={0} sinEmpacar={0} encargosHoy={4} onEncargos={() => {}} />
    </Caso>
    <Caso titulo="Vacío: nada en el horno, nadie pasa hoy">
      <FranjaDeProduccion enHorno={0} proximaSalida={null} tarde={0} sinEmpacar={0} encargosHoy={0} onEncargos={() => {}} />
    </Caso>
  </div>,
)
