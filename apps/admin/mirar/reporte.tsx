/**
 * PREVIA del reporte gerencial, con datos de ejemplo de un mes.
 *
 *     cd apps/admin && pnpm dev
 *     →   http://localhost:5186/mirar/reporte.html
 */
import { createRoot } from 'react-dom/client'
import ReporteGerencial from '../src/pages/ReporteGerencial'
import { REPORTE_EJEMPLO } from '../src/pages/reporteEjemplo'
import '../src/index.css'

createRoot(document.getElementById('root')!).render(
  <div style={{ minHeight: '100vh', background: 'var(--sa-cream-paper)', padding: '24px' }}>
    <div style={{ maxWidth: '1152px', margin: '0 auto' }}>
      <ReporteGerencial data={REPORTE_EJEMPLO} />
    </div>
  </div>,
)
