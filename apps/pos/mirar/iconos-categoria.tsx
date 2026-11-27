import { createRoot } from 'react-dom/client'
import { IconoCategoria } from '../src/components/pos/IconosCategoria'
import '../src/index.css'

const cats = ['Menú del día', 'Bocadillos', 'Panes', 'Galletas', 'Anís', 'Menú de Temporada', 'Bebidas', 'Por encargo']

function Pill({ nombre, activa }: { nombre: string; activa: boolean }) {
  return (
    <button className={`flex items-center gap-1.5 px-5 py-2.5 rounded-full font-mono text-sm uppercase tracking-wide ${activa ? 'bg-sa-green text-sa-cream' : 'bg-sa-cream-soft text-sa-green-ink/70'}`}>
      <IconoCategoria nombre={nombre} className="w-4 h-4" />
      {nombre}
    </button>
  )
}

createRoot(document.getElementById('root')!).render(
  <div className="p-6" style={{ background: 'var(--sa-cream-paper)', minHeight: '100vh' }}>
    <p className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/50 mb-2">Apagadas (crema)</p>
    <div className="flex flex-wrap gap-2 mb-8">{cats.map((c) => <Pill key={c} nombre={c} activa={false} />)}</div>
    <p className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/50 mb-2">Activa (carmín)</p>
    <div className="flex flex-wrap gap-2 mb-8">{cats.map((c) => <Pill key={c} nombre={c} activa={true} />)}</div>
    <p className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/50 mb-2">Grandes (para revisar el dibujo)</p>
    <div className="flex flex-wrap gap-4">{cats.map((c) => (
      <div key={c} className="flex flex-col items-center gap-1 text-sa-green-ink">
        <IconoCategoria nombre={c} className="w-10 h-10" />
        <span className="font-mono text-[10px] text-sa-green-ink/50">{c}</span>
      </div>
    ))}</div>
  </div>,
)
