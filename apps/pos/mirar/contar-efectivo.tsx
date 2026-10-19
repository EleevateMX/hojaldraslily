/**
 * El conteo del cajón, mirado con un turno de verdad.
 *
 *     cd apps/pos && pnpm dev  →  http://localhost:5181/mirar/contar-efectivo.html
 *
 * Lo que hay que ver aquí no se lee en el código:
 *
 *   - que **billetes y monedas se distingan de un vistazo**, porque el $20
 *     aparece en las dos columnas y tiene que verse que son dos cosas;
 *   - que catorce renglones no se conviertan en catorce «$0» que nadie lee;
 *   - que el total se note.
 */
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ContarEfectivo, CONTEO_VACIO } from '../src/components/pos/ContarEfectivo'
import { sumaConteo, mxn, type Conteo } from '@lily/utils'
import '../src/index.css'

// Un cajón de cierre de un sábado: mezcla de todo, con las dos especies
// del $20 llenas a propósito.
const CAJON: Conteo = {
  billetes: { 500: 2, 200: 5, 100: 7, 50: 3, 20: 4 },
  monedas: { 20: 6, 10: 11, 5: 8, 2: 3, 1: 14 },
}

function Caso({ titulo, inicial }: { titulo: string; inicial: Conteo }) {
  const [c, setC] = useState<Conteo>(inicial)
  return (
    <section className="mb-7">
      <p className="font-mono text-xs uppercase tracking-widest text-sa-green-ink/50 mb-2">{titulo}</p>
      <div className="bg-sa-cream-soft rounded-sa p-5 shadow-sa-sm max-w-xl">
        <ContarEfectivo conteo={c} onCambio={setC} />
      </div>
    </section>
  )
}

createRoot(document.getElementById('root')!).render(
  <div className="min-h-screen bg-sa-cream-paper p-6">
    <h1 className="font-display text-2xl text-sa-green-ink mb-1">Contar el cajón</h1>
    <p className="font-body text-sm text-sa-green-ink/60 mb-6">
      El sábado cerró con {mxn(sumaConteo(CAJON))}. Ojo con el $20: sale en las dos columnas.
    </p>
    <Caso titulo="Al cerrar — el cajón lleno" inicial={CAJON} />
    <Caso titulo="Al abrir — en blanco" inicial={CONTEO_VACIO} />
  </div>,
)
