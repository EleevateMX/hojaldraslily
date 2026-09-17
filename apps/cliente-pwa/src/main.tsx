import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '@shake/brand/tokens.css'
import './index.css'
import { registrarPwa } from '@shake/pwa/registrar'

// Deja la app instalable (icono propio, a pantalla completa) y guarda su
// casco para que abra aunque el internet esté intermitente.
// Se pasa a la versión nueva en cuanto está: Rewards no arma pedidos, es
// la tarjeta y el menú.
registrarPwa()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
