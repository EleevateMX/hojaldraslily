import React, { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { listarAlmacenes, escucharRecargas } from '@shake/supabase'
import type { ModoPagoKiosko } from '@shake/types'
import { resolverModoKiosko } from './lib/modoKiosko'
import { CandadoCajero } from './components/CandadoCajero'
import { useCarrito } from './store/carritoStore'
import { sb } from './lib/sb'
import { Catalogo } from './pages/Catalogo'
import { Carrito } from './pages/Carrito'
import { LoginLealtad } from './pages/LoginLealtad'
import { AuthCallback } from './pages/AuthCallback'
import { Pago } from './pages/Pago'
import { PagarEnCaja } from './pages/PagarEnCaja'
import { Recibo } from './pages/Recibo'
import { Confirmacion } from './pages/Confirmacion'
import { EstadoPedido } from './pages/EstadoPedido'
import { Rewards } from './pages/Rewards'

export default function App() {
  // El kiosko es una pantalla fija: no debe hacer scroll nunca. Pero
  // /pedido/:codigo y /recibo/:ordenId las abre el cliente en su CELULAR,
  // donde el contenido sí puede ser más alto que la pantalla — con
  // `overflow-hidden` se le quedaría el total recortado sin poder bajar.
  // Además, la vista de celular NUNCA pide el PIN del turno: es del cliente.
  const rutaActual = useLocation().pathname
  const esVistaCelular = rutaActual.startsWith('/pedido/') || rutaActual.startsWith('/recibo/')

  const cajero = useCarrito((s) => s.cajero)
  const setCajero = useCarrito((s) => s.setCajero)
  const [modo, setModo] = useState<ModoPagoKiosko | null>(null)

  useEffect(() => {
    // La vista pública del celular no depende del modo del kiosko ni pide
    // turno: la abre el cliente desde su teléfono.
    if (esVistaCelular) return
    let vivo = true
    ;(async () => {
      try {
        const almacenes = await listarAlmacenes(sb)
        const kiosko = almacenes.find((a) => a.tipo === 'kiosko') ?? almacenes[0]
        if (!kiosko || !vivo) return
        setModo(await resolverModoKiosko(sb, kiosko.sucursal_id))
      } catch (e) {
        // Si no se puede leer el modo, se sigue como kiosko normal: es peor
        // dejar la pantalla en blanco que operar sin el candado.
        console.error('[kiosko] no se pudo resolver el modo', e)
      }
    })()
    return () => { vivo = false }
  }, [esVistaCelular])

  // El timbre de "actualizar pantallas" del Admin. El kiosko NO recarga a
  // media venta: si hay carrito o el flujo va más allá del catálogo, la
  // señal queda pendiente y se ejecuta en cuanto la pantalla vuelva a
  // estar libre. (La vista del celular del cliente no participa.)
  useEffect(() => {
    if (esVistaCelular) return
    let pendiente = false
    const esSeguro = () => {
      const ruta = window.location.pathname
      const enCatalogo = ruta === '/' || ruta.startsWith('/catalogo')
      return enCatalogo && useCarrito.getState().items.length === 0
    }
    const intentar = () => {
      if (!pendiente) return
      if (esSeguro()) window.location.reload()
    }
    const colgar = escucharRecargas(sb, 'kiosko', () => {
      pendiente = true
      intentar()
    })
    const vigia = setInterval(intentar, 10_000)
    return () => { colgar(); clearInterval(vigia) }
  }, [esVistaCelular])

  if (modo === 'cajero' && !cajero && !esVistaCelular) {
    return <CandadoCajero onEntrar={(e) => setCajero({ id: e.id, nombre: e.nombre, rol: e.rol })} />
  }

  return (
    <div
      className={
        esVistaCelular
          ? 'min-h-screen w-full bg-sa-cream-paper font-body text-sa-green-ink'
          : 'h-screen w-screen overflow-hidden bg-sa-cream-paper font-body text-sa-green-ink'
      }
    >
      <Routes>
        <Route path="/" element={<Navigate to="/catalogo" replace />} />
        <Route path="/catalogo" element={<Catalogo />} />
        <Route path="/carrito" element={<Carrito />} />
        <Route path="/lealtad" element={<LoginLealtad />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/pago" element={<Pago />} />
        <Route path="/pagar-en-caja" element={<PagarEnCaja />} />
        <Route path="/confirmacion" element={<Confirmacion />} />
        {/* Vista pública para el celular del cliente (destino del QR). */}
        <Route path="/pedido/:codigo" element={<EstadoPedido />} />
        <Route path="/recibo/:ordenId" element={<Recibo />} />
        {/* Invitación a lealtad: QR grande para escanear con el celular. */}
        <Route path="/rewards" element={<Rewards />} />
      </Routes>
    </div>
  )
}
