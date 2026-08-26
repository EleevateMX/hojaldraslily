import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '@shake/brand/tokens.css'
import './index.css'
import { escucharRecargas } from '@shake/supabase'
import { sb } from './lib/sb'

// El timbre de "actualizar pantallas" del Admin: esta pantalla es de solo
// lectura, así que recarga al instante — sin nadie caminando a picarle F5.
escucharRecargas(sb, 'barra', () => window.location.reload())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
