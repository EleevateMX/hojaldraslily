/**
 * El modal de anticipo con selector de método.
 *
 *     cd apps/pos && pnpm dev   →   http://localhost:5173/mirar/anticipo.html
 *
 * Se pinta abierto y con un anticipo ya dejado, para ver el saldo y el atajo
 * «todo lo que falta». Sin Supabase: el `onCobrar` solo cierra en consola.
 */
import { createRoot } from 'react-dom/client'
import { ModalAnticipo } from '../src/components/pos/ModalAnticipo'
import '../src/index.css'

createRoot(document.getElementById('root')!).render(
  <div style={{ background: 'var(--sa-cream)', minHeight: '100vh' }}>
    <ModalAnticipo
      open
      cliente="María Pérez"
      total={620}
      yaAnticipado={200}
      onClose={() => console.log('cerrar')}
      onCobrar={(m, met) => console.log('cobrar', m, met)}
    />
  </div>,
)
