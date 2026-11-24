import { useEffect, useMemo, useState } from 'react'
import { sb } from '../lib/sb'
import {
  listarProductosDelDia, mandarAProducir, fijarHoraDeProduccion,
  type ProductoDelDia, type Molde,
} from '@lily/supabase'
import { mensajeDeError } from '@lily/utils'
import { SelectorDeHora } from '@lily/ui'
import { cx } from '../ui'

/**
 * Envío RÁPIDO de una tanda desde el Dashboard, sin cambiar de pantalla.
 *
 * Es el caso común —«manda a hacer 3 moldes de guayaba para las 12»—. El flujo
 * completo multi-renglón (varias cosas de un jalón, merma, etc.) sigue en
 * Producción, con su enlace aquí abajo. Reusa el MISMO camino que esa pantalla:
 * `mandarAProducir` + `fijarHoraDeProduccion`, así no hay dos verdades.
 *
 * Las hojaldras van por molde (48/24); lo que se hornea al pedido (roscas,
 * trenzas, panes, bocadillos: `sabor` en null) va en piezas y sin molde.
 */

type Opcion = { valor: string; label: string; unidad: 'molde' | 'pieza'; grupo: string }

function opcionesDe(productos: ProductoDelDia[]): Opcion[] {
  // Hojaldras: un sabor que se corta de un molde (sabor y existencia no nulos).
  const hojaldras = Array.from(
    new Set(productos.filter((p) => p.sabor != null && p.paquetes_posibles != null).map((p) => p.sabor as string)),
  ).map((s) => ({ valor: s, label: s, unidad: 'molde' as const, grupo: 'Hojaldras' }))
  // Al pedido: lo que no sale de molde (sabor en null). Se manda por nombre,
  // que es lo que la mesa lee. Se deduplica por nombre.
  const piezas = Array.from(
    new Map(productos.filter((p) => p.sabor === null).map((p) => [p.nombre, p])).values(),
  ).map((p) => ({ valor: p.nombre, label: p.nombre, unidad: 'pieza' as const, grupo: p.categoria }))
  return [...hojaldras, ...piezas]
}

export default function MandarAHacerModal({
  onClose,
  onHecho,
  fuente = () => listarProductosDelDia(sb),
}: {
  onClose: () => void
  onHecho?: () => void
  /** Para el arnés: sustituye el catálogo real por datos de ejemplo. */
  fuente?: () => Promise<ProductoDelDia[]>
}) {
  const [productos, setProductos] = useState<ProductoDelDia[] | null>(null)
  const [idx, setIdx] = useState(-1)
  const [cantidad, setCantidad] = useState('')
  const [molde, setMolde] = useState<Molde>(48)
  const [hora, setHora] = useState('')
  const [mandando, setMandando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => {
    fuente()
      .then(setProductos)
      .catch((e) => setError(mensajeDeError(e)))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const opciones = useMemo(() => (productos ? opcionesDe(productos) : []), [productos])
  const op = idx >= 0 ? opciones[idx] : undefined

  async function mandar() {
    const cant = Math.floor(Number(cantidad))
    if (!op) { setError('Elige qué mandar a hacer.'); return }
    if (!Number.isFinite(cant) || cant <= 0) { setError('Escribe cuántos.'); return }
    setMandando(true); setError(null)
    try {
      const item = op.unidad === 'molde'
        ? { sabor: op.valor, moldes: cant, molde, unidad: 'molde' as const }
        : { sabor: op.valor, moldes: cant, unidad: 'pieza' as const }
      const orden = await mandarAProducir(sb, [item])
      // La hora va en una segunda llamada (cambiarle la firma al RPC lo
      // duplicaría). Si falla, la orden ya existe: se avisa y se sigue.
      if (hora.trim()) await fijarHoraDeProduccion(sb, orden, hora.trim())
      const uni = op.unidad === 'molde' ? (cant === 1 ? 'molde' : 'moldes') : (cant === 1 ? 'pieza' : 'piezas')
      setAviso(`Mandado a hacer: ${cant} ${uni} de ${op.label}${hora.trim() ? ` para las ${hora.trim()}` : ''}.`)
      setIdx(-1); setCantidad(''); setHora('')
      onHecho?.()
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setMandando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-sa-lg shadow-sa w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className={cx.h3}>Mandar a hacer</h3>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-sa-green-ink/50 hover:text-sa-green-ink text-xl leading-none">×</button>
        </div>

        {error && <div className="bg-sa-green-deep/10 border border-sa-green-deep/30 text-sa-green-deep px-3 py-2 rounded-sa text-sm">{error}</div>}
        {aviso && <div className="bg-sa-mint/20 border border-sa-mint/40 text-sa-green-ink px-3 py-2 rounded-sa text-sm">{aviso}</div>}

        {productos === null ? (
          <p className={`text-sm ${cx.muted} py-4 text-center`}>Cargando el catálogo…</p>
        ) : (
          <>
            <label className="flex flex-col gap-1.5">
              <span className={cx.label}>Qué</span>
              <select value={idx} onChange={(e) => { setIdx(Number(e.target.value)); setAviso(null) }} className={cx.input}>
                <option value={-1}>Elige un sabor o producto…</option>
                {opciones.map((o, i) => (
                  <option key={`${o.grupo}-${o.valor}`} value={i}>{o.grupo} · {o.label}{o.unidad === 'pieza' ? ' (piezas)' : ''}</option>
                ))}
              </select>
            </label>

            <div className="flex items-end gap-3 flex-wrap">
              <label className="flex flex-col gap-1.5">
                <span className={cx.label}>{op?.unidad === 'pieza' ? 'Piezas' : 'Moldes'}</span>
                <input type="number" min="1" inputMode="numeric" value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder="0" className={cx.input} style={{ width: '7rem' }} />
              </label>

              {op?.unidad === 'molde' && (
                <div className="flex flex-col gap-1.5">
                  <span className={cx.label}>Molde</span>
                  <div className="flex gap-1">
                    {([48, 24] as const).map((m) => (
                      <button key={m} type="button" onClick={() => setMolde(m)} aria-pressed={molde === m}
                        className={`px-4 py-2.5 rounded-sa text-sm font-semibold ${molde === m ? 'bg-sa-green text-sa-cream' : 'bg-sa-cream-soft text-sa-green-ink'}`}>
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <label className="flex flex-col gap-1.5">
              <span className={cx.label}>Hora en que debe estar lista (opcional)</span>
              <SelectorDeHora value={hora} onChange={setHora} className={cx.input} aria-label="Hora a la que tiene que estar lista" />
            </label>

            <div className="flex items-center justify-between gap-3 pt-1">
              <button type="button" className="text-sm text-sa-green underline" onClick={() => { window.location.hash = 'produccion' }}>
                Ver todo en Producción
              </button>
              <div className="flex gap-2">
                <button type="button" className={cx.btnSec} onClick={onClose}>Cerrar</button>
                <button type="button" className={cx.btnPrimary} disabled={mandando || !op || !cantidad} onClick={() => void mandar()}>
                  {mandando ? 'Mandando…' : 'Mandar a hacer'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
