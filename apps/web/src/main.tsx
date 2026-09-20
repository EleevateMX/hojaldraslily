import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '@lily/brand/tokens.css'
import './index.css'
import { registrarPwa } from '@lily/pwa/registrar'

// Deja la app instalable (icono propio, a pantalla completa) y guarda su
// casco para que abra aunque el internet esté intermitente.
// Se pasa a la versión nueva en cuanto está: es la web pública.
registrarPwa()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
