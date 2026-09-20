import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '@lily/brand/tokens.css'
import './index.css'
import { registrarPwa } from '@lily/pwa/registrar'
import { escucharRecargas } from '@lily/supabase'
import { sb } from './lib/sb'

// El timbre de "actualizar pantallas" del Admin. Aquí SÍ se puede recargar
// sin pensarlo: lo que se marca como hecho ya quedó guardado en la base en
// ese momento, no hay nada a medias que se pueda perder.
escucharRecargas(sb, 'cocina', () => window.location.reload())

// Deja la app instalable (icono propio, a pantalla completa) y guarda su
// casco para que abra aunque el internet esté intermitente.
// Se pasa a la versión nueva en cuanto está: lo que se marca como hecho
// ya quedó en la base en ese momento, no hay nada a medias que perder.
registrarPwa()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
