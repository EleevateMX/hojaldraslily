import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { CandadoAdmin } from './CandadoAdmin'
import '@shake/brand/tokens.css'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CandadoAdmin>
      <App />
    </CandadoAdmin>
  </React.StrictMode>,
)
