/**
 * Admin entero, sin el candado del PIN, para MIRARLO a lo ancho de un
 * teléfono, una tableta y una PC.
 *
 *     cd apps/admin && pnpm dev   →   http://localhost:5173/mirar/admin.html#impresoras
 *
 * Desde este contenedor el navegador no alcanza Supabase, así que cada
 * pestaña abre con su error de red y sus listas vacías. Para lo que esto
 * sirve —ver si la barra, las cabeceras, los formularios y las tablas CABEN
 * en 390 px— alcanza: lo que no cabe, no cabe con datos ni sin ellos. Lo que
 * sí necesita datos se mira con los arneses de cada pantalla
 * (`produccion.html`).
 *
 * Sin el candado a propósito: con él, las catorce capturas salían idénticas
 * (la pantalla del PIN) y pareció que todo se veía igual de bien.
 */
import { createRoot } from 'react-dom/client'
import App from '../src/App'
import '../src/index.css'

createRoot(document.getElementById('root')!).render(<App />)

// Un renglón de medidas al pie, SOLO en el arnés: con `--dump-dom` se lee
// cuánto mide el viewport y cuánto el documento. Si el segundo es mayor, la
// pantalla se desborda a lo ancho — y en un teléfono eso es scroll lateral.
setTimeout(() => {
  const d = document.createElement('div')
  d.id = 'medidas'
  d.textContent = `viewport=${window.innerWidth} documento=${document.documentElement.scrollWidth}`
  document.body.appendChild(d)
}, 1500)
