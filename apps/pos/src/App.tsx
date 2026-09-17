import React, { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Login } from './pages/Login'
import { Caja } from './pages/Caja'
import { Cobro } from './pages/Cobro'
import { CorteCaja } from './pages/CorteCaja'
import { PedidosPendientes } from './pages/PedidosPendientes'
import { Encargos } from './pages/Encargos'
import { usePosStore } from './store/posStore'
import { registrarPwa } from '@shake/pwa/registrar'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const empleado = usePosStore((s) => s.empleado)
  if (!empleado) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  // Deja la caja instalable (icono propio, a pantalla completa) y guarda su
  // casco para que abra con internet intermitente.
  //
  // La versión nueva ESPERA: activarla recarga la pestaña, y una recarga con
  // el ticket a medias le borra a la cajera lo que ya capturó, con el cliente
  // enfrente. Es la misma regla del kiosko (CLAUDE.md §4). Se considera
  // seguro cuando no hay líneas en el ticket y la pantalla no está en el
  // cobro — ahí es donde se está hablando con la terminal.
  useEffect(() => {
    const esSeguro = () =>
      usePosStore.getState().items.length === 0 &&
      !window.location.pathname.endsWith('/cobro')
    return registrarPwa({ activarCuando: esSeguro })
  }, [])

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<RequireAuth><Caja /></RequireAuth>} />
      <Route path="/cobro" element={<RequireAuth><Cobro /></RequireAuth>} />
      <Route path="/pendientes" element={<RequireAuth><PedidosPendientes /></RequireAuth>} />
      <Route path="/encargos" element={<RequireAuth><Encargos /></RequireAuth>} />
      <Route path="/corte" element={<RequireAuth><CorteCaja /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
