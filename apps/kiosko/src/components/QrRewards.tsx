import React, { useEffect, useState } from 'react'
import QRCode from 'qrcode'

/**
 * URL de la app de Rewards. Configurable porque cuando el negocio conecte su
 * dominio pasa a ser `rewards.hojaldraslily.com`, y no queremos volver a
 * compilar por eso.
 */
export const URL_REWARDS =
  ((import.meta.env.VITE_URL_REWARDS as string | undefined) ?? 'https://rewards.hojaldraslily.com')
    // Si la variable en Cloudflare aún trae la URL vieja, se traduce sola.
    .replace('lily-cliente-pwa.pages.dev', 'rewards.hojaldraslily.com')

interface Props {
  /** Lado del QR en píxeles. */
  tamano?: number
  className?: string
}

/**
 * QR para que el cliente entre a Rewards desde su celular.
 *
 * Se genera en el navegador (paquete `qrcode`), sin llamar a ningún servicio
 * externo: la pantalla del kiosko tiene que seguir sirviendo aunque se caiga
 * internet a media venta.
 */
export function QrRewards({ tamano = 260, className = '' }: Props) {
  const [url, setUrl] = useState('')

  useEffect(() => {
    QRCode.toDataURL(URL_REWARDS, {
      width: tamano,
      margin: 2,
      color: { dark: '#14241D', light: '#FFFFFF' },
    })
      .then(setUrl)
      .catch(console.error)
  }, [tamano])

  if (!url) return null
  return <img src={url} alt="QR para entrar a Hojaldras Lily Rewards" className={`rounded-sa bg-white p-3 ${className}`} />
}
