import React from 'react'
import { useNavigate } from 'react-router-dom'
import { QrRewards } from '@/components/QrRewards'

/**
 * Pantalla de invitación a Rewards: un QR grande que el cliente escanea con
 * la cámara de su celular para abrir la app de lealtad y darse de alta.
 *
 * Está pensada para dejarse puesta en la pantalla mientras no hay nadie
 * pidiendo, y para mostrarla a propósito cuando el cajero quiere invitar al
 * cliente al programa. También sirve como arte para imprimir un letrero: el
 * QR apunta a una URL fija, no a nada que caduque.
 */
export function Rewards() {
  const navigate = useNavigate()

  return (
    <div className="relative flex flex-col h-screen items-center justify-center bg-sa-green-deep text-sa-cream px-8 overflow-hidden">
      <button
        onClick={() => navigate('/catalogo')}
        className="absolute top-8 left-8 w-12 h-12 rounded-full bg-sa-green-ink hover:bg-sa-green flex items-center justify-center text-2xl"
        aria-label="Volver al catálogo"
      >
        ←
      </button>

      <div className="w-20 h-20 rounded-full bg-sa-banana/20 flex items-center justify-center mb-5">
        <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#C9A227" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      </div>

      <h1 className="font-display text-5xl leading-none text-center">Hojaldras Lily Rewards</h1>
      <p className="font-body text-lg text-sa-cream/70 mt-4 text-center max-w-md">
        Escanea con la cámara de tu celular y entra con tu cuenta de Google.
        Tu tarjeta de lealtad queda ahí, sin instalar nada.
      </p>

      <QrRewards tamano={280} className="mt-8 shadow-2xl" />

      <div className="grid grid-cols-3 gap-4 w-full max-w-md mt-8">
        {[
          { dato: '$10', pie: '1 mancuerna' },
          { dato: '100', pie: 'Cupón' },
          { dato: '1 año', pie: 'Vigencia' },
        ].map((b) => (
          <div key={b.pie} className="bg-sa-green-ink rounded-sa p-3 text-center">
            <p className="font-display text-xl leading-none">{b.dato}</p>
            <p className="font-mono text-[10px] uppercase tracking-wide text-sa-banana mt-1">{b.pie}</p>
          </div>
        ))}
      </div>

      <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-sa-cream/40 mt-8 text-center">
        ¿Sin celular a la mano? El cajero te da de alta con tu teléfono
      </p>
    </div>
  )
}
