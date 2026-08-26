import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import QRCode from 'qrcode'
import { cerrarSesion } from '@shake/supabase'
import { sb } from '@/lib/sb'
import { QrRewards } from '@/components/QrRewards'
import { HistorialPedidos } from '@/components/HistorialPedidos'
import type { ItemCarrito, UsuarioKiosko } from '@/store/carritoStore'

interface EstadoConfirmacion {
  folio?: string | null
  /** Con esto el QR abre el recibo digital real (/recibo/:ordenId). */
  ordenId?: string | null
  total?: number
  metodo?: 'terminal' | 'efectivo'
  items?: ItemCarrito[]
  usuario?: UsuarioKiosko | null
  demo?: boolean
}

/**
 * Cuánto vive la pantalla antes de volver al menú. Antes eran 15 s y no
 * alcanzaban: sacar el teléfono, abrir la cámara y escanear el recibo toma
 * su tiempo — y si la pantalla se va antes, el recibo se pierde.
 */
const SEGUNDOS_EN_PANTALLA = 40

export function Confirmacion() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state as EstadoConfirmacion | null) ?? {}

  const folioReal  = state.folio  ?? null
  const ordenId    = state.ordenId ?? null
  const totalOrden = state.total  ?? 0
  const usuario    = state.usuario ?? null

  const [segundos, setSegundos] = useState(SEGUNDOS_EN_PANTALLA)
  const [qrUrl, setQrUrl] = useState<string>('')
  const [verHistorial, setVerHistorial] = useState(false)

  const fallbackNumero = useMemo(
    () => Math.floor(100 + Math.random() * 900).toString().padStart(3, '0'),
    [],
  )
  const numeroOrden   = folioReal ?? fallbackNumero
  // Mismo cálculo que hace el servidor al cobrar (fn_acumular_mancuernas):
  // 1 mancuerna por cada $10, con tope de 100 por orden. Si aquí no se pone el
  // tope, el ticket promete más mancuernas de las que realmente se abonan.
  const puntosGanados = usuario?.clienteId ? Math.min(100, Math.floor(totalOrden / 10)) : 0
  const esDemo        = state.demo ?? false

  // El QR es una URL de verdad: el teléfono la abre y ve su recibo, con
  // botones para mandarlo por WhatsApp o entrar a Rewards. (El viejo QR
  // codificaba un JSON que la cámara mostraba como texto crudo.)
  useEffect(() => {
    if (!ordenId) return
    const url = `${window.location.origin}/recibo/${ordenId}`
    QRCode.toDataURL(url, { width: 280, margin: 2, color: { dark: '#14241D', light: '#F8F4EC' } })
      .then(setQrUrl)
      .catch(console.error)
  }, [ordenId])

  useEffect(() => {
    // Con el historial abierto la cuenta se pausa: quien lo está leyendo no
    // debe perder la pantalla a media consulta. Al cerrarlo, vuelve a contar
    // desde el principio.
    if (verHistorial) return
    setSegundos(SEGUNDOS_EN_PANTALLA)
    const timer = setTimeout(async () => {
      await cerrarSesion(sb).catch(console.error)
      navigate('/catalogo')
    }, SEGUNDOS_EN_PANTALLA * 1000)
    const tick = setInterval(() => setSegundos((s) => (s > 0 ? s - 1 : 0)), 1000)
    return () => { clearTimeout(timer); clearInterval(tick) }
  }, [navigate, verHistorial])

  return (
    <div className="relative flex flex-col items-center justify-center h-screen bg-sa-green-deep text-sa-cream overflow-hidden px-8">
      {esDemo && (
        <div className="absolute top-0 left-0 right-0 bg-sa-banana text-sa-coffee text-center py-1.5 font-mono text-xs uppercase tracking-[0.3em]">
          ⚠ Modo demostración — ninguna venta es real
        </div>
      )}
      <span className="absolute top-10 left-10 font-mono text-xs uppercase tracking-[0.3em] text-sa-banana">
        #ORDEN {numeroOrden}
      </span>
      <span className="absolute top-10 right-10 font-mono text-xs uppercase tracking-[0.3em] text-sa-cream/60">
        Hojaldras Lily
      </span>

      <img src={`${import.meta.env.BASE_URL}hojaldra-solida.png`} alt="Hojaldra de la casa" className="h-44 w-auto drop-shadow-2xl mb-3" />

      <h1 className="font-display text-5xl leading-none text-center text-sa-cream">
        ¡Listo, campeón!
      </h1>
      <p className="font-body text-base mt-3 text-center text-sa-cream/80 max-w-sm">
        Su pedido ya está en el horno de la casa. Recién hecho, como debe ser.
      </p>

      {/* Loyalty earned */}
      {puntosGanados > 0 && (
        <div className="mt-3 bg-sa-banana/20 border border-sa-banana/40 rounded-sa px-5 py-2 flex items-center gap-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C9A227" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
          <p className="font-display text-lg text-sa-banana">
            +{puntosGanados} puntos para {usuario?.nombre?.split(' ')[0]}
          </p>
        </div>
      )}

      {/* Invitación a Rewards: solo si el cliente NO está identificado.
          Es el mejor momento para engancharlo — acaba de comprar, está
          esperando, y le acaba de quedar claro que se perdió las mancuernas
          de esta compra. A quien ya es cliente no se le estorba con esto. */}
      {!usuario?.clienteId && (
        <div className="mt-4 flex items-center gap-4 bg-sa-green-ink/70 rounded-sa-lg pl-5 pr-3 py-3">
          <div className="text-left">
            <p className="font-display text-xl leading-tight text-sa-cream">
              La próxima, que te cuente
            </p>
            <p className="font-body text-sm text-sa-cream/60 mt-1 max-w-[15rem]">
              Escanea y acumula mancuernas con cada compra.
            </p>
          </div>
          <QrRewards tamano={104} />
        </div>
      )}

      {/* Info row */}
      <div className="mt-4 flex items-center gap-4">
        <div className="bg-sa-green-ink rounded-sa-lg px-6 py-4 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-sa-banana">Orden</p>
          <p className="font-display text-4xl text-sa-cream mt-1 leading-none">#{numeroOrden}</p>
        </div>
        <div className="bg-sa-green-ink rounded-sa-lg px-6 py-4 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-sa-banana">Listo en</p>
          <p className="font-display text-4xl text-sa-cream mt-1 leading-none">5 min</p>
        </div>
        <div className="bg-sa-green-ink rounded-sa-lg px-6 py-4 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-sa-banana">Total</p>
          <p className="font-display text-4xl text-sa-cream mt-1 leading-none">${totalOrden.toFixed(0)}</p>
        </div>
      </div>

      {/* Recibo digital: el QR es lo único que hay que hacer con el ticket.
          Se muestra directo (sin botones que abrir) porque el cliente tiene
          los segundos contados para sacar el teléfono y escanear. */}
      {ordenId && qrUrl && (
        <div className="mt-5 flex items-center gap-4 bg-sa-cream rounded-sa-lg px-5 py-4 shadow-sa">
          <img src={qrUrl} alt="QR de tu recibo" className="w-36 h-36 rounded-sa" />
          <div className="text-left max-w-[13rem]">
            <p className="font-display text-2xl leading-tight text-sa-green-ink">
              Tu recibo, en tu cel
            </p>
            <p className="font-body text-sm text-sa-green-ink/60 mt-1.5">
              Escanéalo con la cámara: lo ves, lo guardas o lo mandas por WhatsApp.
            </p>
          </div>
        </div>
      )}

      <div className="mt-5 flex items-center gap-4">
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-sa-cream/50">
          Menú en {segundos}s
        </p>
        <button
          onClick={() => setVerHistorial(true)}
          className="border border-sa-cream/30 text-sa-cream px-6 h-12 rounded-full font-display text-lg hover:bg-sa-cream/10 active:scale-95 transition-all"
        >
          Historial de pedidos
        </button>
        <button
          onClick={() => navigate('/catalogo')}
          className="bg-sa-strawberry text-white px-8 h-12 rounded-full font-display text-xl shadow-sa active:scale-95 transition-transform"
        >
          Otro round
        </button>
      </div>

      <HistorialPedidos abierto={verHistorial} onCerrar={() => setVerHistorial(false)} />
    </div>
  )
}
