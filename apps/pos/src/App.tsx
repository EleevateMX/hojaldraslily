import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Login } from './pages/Login'
import { Caja } from './pages/Caja'
import { Cobro } from './pages/Cobro'
import { CorteCaja } from './pages/CorteCaja'
import { PedidosPendientes } from './pages/PedidosPendientes'
import { usePosStore } from './store/posStore'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const empleado = usePosStore((s) => s.empleado)
  if (!empleado) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<RequireAuth><Caja /></RequireAuth>} />
      <Route path="/cobro" element={<RequireAuth><Cobro /></RequireAuth>} />
      <Route path="/pendientes" element={<RequireAuth><PedidosPendientes /></RequireAuth>} />
      <Route path="/corte" element={<RequireAuth><CorteCaja /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
