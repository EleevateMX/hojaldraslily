import { useEffect, useRef } from 'react'
import QRCode from 'qrcode'

/** Renderiza un QR local (sin llamadas externas) a partir de un texto. */
export default function QR({ value, size = 180 }: { value: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (ref.current) {
      void QRCode.toCanvas(ref.current, value, { width: size, margin: 1 })
    }
  }, [value, size])
  return <canvas ref={ref} width={size} height={size} />
}
