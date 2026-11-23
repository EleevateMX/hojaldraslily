/**
 * PREVIA de la navegación del Admin (antes/después + teléfono).
 *   →  http://localhost:5186/mirar/nav.html
 */
import { createRoot } from 'react-dom/client'
import NavPreview from '../src/pages/NavPreview'
import '../src/index.css'

createRoot(document.getElementById('root')!).render(
  <div style={{ minHeight: '100vh', background: 'var(--sa-cream-paper)', padding: '28px' }}>
    <NavPreview />
  </div>,
)
