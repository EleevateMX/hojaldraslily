import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '@shake/brand/tokens.css'
import './index.css'
import { registrarPwa } from '@shake/pwa/registrar'
import { escucharRecargas } from '@shake/supabase'
import { sb } from './lib/sb'

// El timbre de "actualizar pantallas" del Admin: esta pantalla es de solo
// lectura, así que recarga al instante — sin nadie caminando a picarle F5.
escucharRecargas(sb, 'pantalla', () => window.location.reload())

// Deja la app instalable (icono propio, a pantalla completa) y guarda su
// casco para que abra aunque el internet esté intermitente.
// Se pasa a la versión nueva en cuanto está: es una TV de folios, no hay
// nadie tecleando nada.
registrarPwa()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
