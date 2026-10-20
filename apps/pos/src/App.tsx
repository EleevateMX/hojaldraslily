import React, { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Login } from './pages/Login'
import { Caja } from './pages/Caja'
import { Cobro } from './pages/Cobro'
import { CorteCaja } from './pages/CorteCaja'
import { PedidosPendientes } from './pages/PedidosPendientes'
import { Encargos } from './pages/Encargos'
import { usePosStore } from './store/posStore'
import { registrarPwa } from '@lily/pwa/registrar'
import { vigilarConexion } from './lib/conexion'
import { cargarDatosDelTicket } from './lib/ticket'
import { useVentasSinInternet, vigilarVentasSinInternet } from './store/sinInternet'
import { recuperarCajero } from './lib/sesion'
import { recuperarTicketEnCurso, guardarTicketEnCurso } from './lib/ticketEnCurso'
import { vigilarSesion } from '@lily/supabase'
import { sb } from './lib/sb'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const empleado = usePosStore((s) => s.empleado)
  if (!empleado) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  // ¿Hay un cajero con sesión viva? Se pregunta ANTES de pintar nada: si se
  // mandara al login mientras se averigua, la tableta recién desbloqueada
  // enseñaría el PIN un segundo y luego la caja — o peor, el cajero
  // alcanzaría a teclearlo. Ver `lib/sesion.ts`.
  const [revisando, setRevisando] = useState(() => usePosStore.getState().empleado === null)
  useEffect(() => {
    if (!revisando) return
    void recuperarCajero()
      .then((e) => {
        if (!e) return
        usePosStore.getState().iniciarSesion(e)
        // Y el ticket que estaba a medias, si lo había y es de hace poco.
        recuperarTicketEnCurso()
      })
      .finally(() => setRevisando(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => guardarTicketEnCurso(), [])

  // Y mientras la caja vive: si la sesión se cierra desde otra pestaña o se
  // vence del todo, se vuelve al PIN en vez de seguir enseñando errores. El
  // «al volver» renueva el token antes de que el siguiente cobro salga con
  // uno vencido.
  useEffect(
    () =>
      vigilarSesion(sb, {
        alSalir: () => {
          if (usePosStore.getState().empleado) usePosStore.getState().cerrarSesion()
        },
      }),
    [],
  )
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
      !window.location.pathname.endsWith('/cobro') &&
      // Y nada cobrado esperando registro: una recarga no las pierde —viven
      // en localStorage— pero sí corta la vuelta a medias, y la vuelta es lo
      // que convierte un cajon lleno de efectivo en ventas de verdad.
      useVentasSinInternet.getState().pendientes.length === 0
    return registrarPwa({ activarCuando: esSeguro })
  }, [])

  // Saber si hay internet, y mandar lo cobrado a oscuras en cuanto vuelva.
  // Van en la app y no en una pantalla porque tienen que seguir corriendo
  // aunque el cajero se mueva entre la caja, los encargos y el corte.
  useEffect(() => {
    vigilarConexion()
    vigilarVentasSinInternet()
    void cargarDatosDelTicket()
  }, [])

  if (revisando) {
    return (
      <div className="min-h-screen grid place-items-center bg-sa-green-deep">
        <p className="font-mono text-sm uppercase tracking-wide text-sa-cream/60">Un momento…</p>
      </div>
    )
  }

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
