import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { CandadoAdmin } from './CandadoAdmin'
import '@shake/brand/tokens.css'
import './index.css'
import { registrarPwa } from '@shake/pwa/registrar'

// Deja la app instalable (icono propio, a pantalla completa) y guarda su
// casco para que abra aunque el internet esté intermitente.
// Se pasa a la versión nueva en cuanto está: gerencia no tiene una venta
// abierta, y la peor recarga aquí cuesta volver a entrar a la sección.
registrarPwa()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CandadoAdmin>
      <App />
    </CandadoAdmin>
  </React.StrictMode>,
)
