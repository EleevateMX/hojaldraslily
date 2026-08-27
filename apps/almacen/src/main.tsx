import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '@shake/brand/tokens.css'
import './index.css'
import { escucharRecargas } from '@shake/supabase'
import { sb } from './lib/sb'

// El timbre de "actualizar pantallas" del Admin. Aquí SÍ se puede recargar
// sin pensarlo: lo que se marca como hecho ya quedó guardado en la base en
// ese momento, no hay nada a medias que se pueda perder.
escucharRecargas(sb, 'cocina', () => window.location.reload())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
