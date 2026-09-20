import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '@lily/brand/tokens.css'
import './index.css'
import { registrarPwa } from '@lily/pwa/registrar'
import { escucharRecargas } from '@lily/supabase'
import { sb } from './lib/sb'

// El timbre de "actualizar pantallas" del Admin. Aquí se puede recargar sin
// pensarlo: lo que se mete y se saca del horno queda en la base en ese
// momento, no hay nada a medias en la pantalla.
escucharRecargas(sb, 'cocina', () => window.location.reload())

// Deja la app instalable (icono propio, a pantalla completa) y guarda su
// casco para que abra aunque el internet esté intermitente.
// Se pasa a la versión nueva en cuanto está: el horno no arma pedidos.
registrarPwa()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
