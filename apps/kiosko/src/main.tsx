import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import '@shake/brand/tokens.css'
import './index.css'

// Kiosko de tienda: el menú contextual del navegador (clic derecho o dejar
// el dedo puesto — "buscar imagen con Google", "abrir en otra pestaña") no
// tiene nada que hacer frente a un cliente. Se apaga completo.
window.addEventListener('contextmenu', (e) => e.preventDefault())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
