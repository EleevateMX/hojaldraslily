/**
 * Como sale la ETIQUETA de comanda en las estaciones.
 *
 *     cd apps/pos && pnpm dev  →  /mirar/comanda.html
 *
 * No es el ticket del cliente: es la etiqueta chica que sale en Produccion,
 * Horno y Empaque, una por renglon del pedido. Se dibuja con la misma
 * `vistaPrevia` que usa el agente, para que lo que se ve aqui sea lo que la
 * impresora pone en el papel y no una maqueta aparte.
 */
import { createRoot } from 'react-dom/client'
import { vistaPrevia, type EtiquetaComanda } from '../../../agente-impresion/src/tspl'

const base = { ticket: '1042', nombre: 'Doña Carmen', fecha: '05/10 13:24', deTotal: 3 }

const etiquetas: EtiquetaComanda[] = [
  { ...base, destino: 'Produccion', item: 1, producto: 'Jamón y Queso · Chica · 24 cuadros' },
  { ...base, destino: 'Produccion', item: 2, producto: 'Pan de Muerto Tradicional · Chica',
    notas: 'sin azúcar encima' },
  { ...base, destino: 'Empaque', item: 3, producto: 'Pastelitos solo queso · 1 pza',
    notas: 'van 13 piezas, caja aparte' },
]

createRoot(document.getElementById('root')!).render(
  <div style={{ padding: 24, background: '#e9e4d8', minHeight: '100vh', fontFamily: 'sans-serif' }}>
    <p style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700 }}>
      Etiqueta de comanda
    </p>
    <p style={{ margin: '0 0 16px', fontSize: 13, color: '#555' }}>
      Una por renglón del pedido. Sale en la estación que le toca.
    </p>
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      {etiquetas.map((e, i) => (
        <pre key={i} style={{
          background: '#fff', padding: '14px 16px', margin: 0,
          fontFamily: 'ui-monospace, "DM Mono", monospace', fontSize: 13, lineHeight: 1.45,
          boxShadow: '0 2px 10px rgba(0,0,0,.18)', borderRadius: 2,
        }}>{vistaPrevia(e)}</pre>
      ))}
    </div>
  </div>,
)
