/**
 * Admin visto por la cuenta CONTABILIDAD, para MIRARLO.
 *
 *     cd apps/admin && pnpm dev
 *     →   http://localhost:5185/mirar/contabilidad.html
 *
 * Contabilidad entra a Admin pero es un puesto acotado: la barra lateral le
 * enseña SOLO «Facturación» y el contenido cae ahí aunque fuerce otro hash. Se
 * monta `App` de verdad dentro de una sesión con rol 'contabilidad' (lo que en
 * producción baja `CandadoAdmin`). El panel de Facturación intentará consultar
 * y sin Supabase se queda en «Cargando…»; lo que esta vista comprueba es la
 * BARRA, no los datos.
 */
import { createRoot } from 'react-dom/client'
import App from '../src/App'
import { SesionContext } from '../src/sesion'
import '../src/index.css'

createRoot(document.getElementById('root')!).render(
  <SesionContext.Provider value={{ nombre: 'Contabilidad', rol: 'contabilidad' }}>
    <App />
  </SesionContext.Provider>,
)
