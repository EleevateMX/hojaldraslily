/**
 * PREVIA de Hojaldr-IA, la asistente de Admin.
 *   →  http://localhost:5186/mirar/hojaldria.html
 */
import { createRoot } from 'react-dom/client'
import HojaldrIA from '../src/components/HojaldrIA'
import '../src/index.css'

const MOCK = [
  { role: 'user' as const, content: 'No me sale el ticket del cliente, ¿qué hago?' },
  {
    role: 'assistant' as const,
    content:
      'Checa primero si ya tienes una térmica dada de alta:\n\n• Si la hay, el trabajo se ve en Admin → Impresoras (dice si salió o falló).\n• Si no la hay, el ticket va por el navegador, así que es otra impresora: revisa que la PREDETERMINADA de Windows sea la térmica.\n\n¿Ya tienes térmica dada de alta?',
  },
]

createRoot(document.getElementById('root')!).render(
  <div style={{ minHeight: '100vh', background: 'var(--sa-cream-paper)', padding: '24px', position: 'relative' }}>
    <div style={{ maxWidth: '900px', margin: '0 auto', color: 'var(--sa-green-ink)' }}>
      <h1 style={{ fontFamily: 'Jost', fontSize: '28px' }}>Panel de gerencia (fondo de ejemplo)</h1>
      <p style={{ opacity: 0.6 }}>La burbuja de Hojaldr-IA va abajo a la derecha, arriba de la pastilla de “Salir”.</p>
    </div>
    <HojaldrIA abiertoInicial mensajesIniciales={MOCK} />
  </div>,
)
