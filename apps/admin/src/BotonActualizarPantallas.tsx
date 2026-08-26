import { useState } from 'react'
import {
  pedirRecargaPantallas, publicarCatalogo, cambiosDelCatalogo, contarCambios,
  type CambiosCatalogo,
} from '@shake/supabase'
import { mensajeDeError } from '@shake/utils'
import { sb } from './lib/sb'
import { cx } from './ui'
import { ResumenCambios } from './ResumenCambios'

type Pantalla = 'todas' | 'kiosko' | 'barra' | 'cocina' | 'pantalla'

const OPCIONES: { id: Pantalla; label: string }[] = [
  { id: 'todas', label: 'Todas' },
  { id: 'kiosko', label: 'Kiosko' },
  { id: 'barra', label: 'Barra' },
  { id: 'cocina', label: 'Cocina' },
  { id: 'pantalla', label: 'Folios' },
]

/**
 * "Actualizar pantallas": después de cambiar precios o productos (aquí o
 * en Costeos), este botón hace que las pantallas de la tienda se recarguen
 * solas — nadie tiene que caminar a picarles F5.
 *
 * El kiosko es el delicado: si hay un cliente con carrito o a media orden,
 * la señal se le queda pendiente y se aplica en cuanto la pantalla vuelva
 * al menú. Las demás (barra, cocina, folios) recargan al instante.
 */
export function BotonActualizarPantallas({ compacto = false }: { compacto?: boolean }) {
  const [abierto, setAbierto] = useState(false)
  const [enviando, setEnviando] = useState<Pantalla | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Publicar pasa por una ventana con el diff, igual que en Costeos: las
  // dos puertas al mismo acto tienen que enseñar lo mismo antes de tocarlo.
  const [revisando, setRevisando] = useState<CambiosCatalogo | null>(null)
  const [cargandoDiff, setCargandoDiff] = useState(false)

  async function abrirRevision() {
    setCargandoDiff(true)
    setError(null)
    setAviso(null)
    setAbierto(false)
    try {
      setRevisando(await cambiosDelCatalogo(sb))
    } catch (e) {
      setError(mensajeDeError(e))
      setTimeout(() => setError(null), 8000)
    } finally {
      setCargandoDiff(false)
    }
  }

  async function mandar(p: Pantalla) {
    setEnviando(p)
    setError(null)
    setAviso(null)
    try {
      // "Todas" es publicar: además de tocar el timbre guarda la foto del
      // catálogo, que es contra la que Costeos compara. Si aquí solo se
      // recargara, el contador de Costeos seguiría diciendo "sin publicar"
      // aunque las pantallas ya tuvieran el cambio.
      if (p === 'todas') await publicarCatalogo(sb)
      else await pedirRecargaPantallas(sb, p)
      setRevisando(null)
      setAviso(
        p === 'kiosko' || p === 'todas'
          ? 'Señal enviada. El kiosko se actualiza en cuanto no tenga un pedido a medias.'
          : 'Señal enviada — esa pantalla ya se está recargando.',
      )
      setAbierto(false)
      setTimeout(() => setAviso(null), 6000)
    } catch (e) {
      setError(mensajeDeError(e))
      setTimeout(() => setError(null), 8000)
    } finally {
      setEnviando(null)
    }
  }

  return (
    <div className="relative inline-block">
      <div className="flex items-center gap-2">
        <button
          className={cx.btnPrimary}
          onClick={() => void abrirRevision()}
          disabled={enviando !== null || cargandoDiff}
        >
          {cargandoDiff
            ? 'Revisando…'
            : compacto
              ? '⟳ Actualizar pantallas'
              : '⟳ Actualizar pantallas de la tienda'}
        </button>
        <button
          className={cx.btnSec}
          onClick={() => setAbierto((v) => !v)}
          disabled={enviando !== null}
          title="Elegir una pantalla en particular"
        >
          ▾
        </button>
      </div>

      {abierto && (
        <div className="absolute right-0 mt-2 z-20 bg-white border border-sa-green-ink/10 rounded-sa shadow-sa p-1.5 min-w-[190px]">
          <p className="px-3 pt-1 pb-2 text-[11px] leading-snug text-sa-green-ink/50">
            Recargar una sola pantalla, para cuando se queda pegada. Publicar
            el catálogo es el botón de al lado.
          </p>
          {OPCIONES.filter((o) => o.id !== 'todas').map((o) => (
            <button
              key={o.id}
              onClick={() => void mandar(o.id)}
              className="w-full text-left px-3 py-2 rounded-sa text-sm text-sa-green-ink hover:bg-sa-cream-soft"
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      {revisando && (
        <div className="fixed inset-0 z-50 bg-sa-green-ink/50 flex items-center justify-center p-4"
             onClick={() => setRevisando(null)}>
          <div className="bg-white rounded-sa-lg shadow-sa max-w-lg w-full p-6"
               onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-2xl text-sa-green-ink leading-tight">
              Esto es lo que va a ver la tienda
            </h3>
            <p className="text-xs text-sa-green-ink/55 mt-0.5 mb-4">
              {revisando.desde
                ? `Desde la última publicación, el ${revisando.desde}.`
                : 'Todavía no hay una publicación anterior.'}
            </p>

            <ResumenCambios c={revisando} />

            <div className="flex gap-2 justify-end mt-5">
              <button className={cx.btnSec} onClick={() => setRevisando(null)}>
                Cancelar
              </button>
              <button
                className={cx.btnPrimary}
                onClick={() => void mandar('todas')}
                disabled={enviando !== null}
              >
                {enviando ? 'Publicando…' : 'Actualizar la tienda'}
              </button>
            </div>
          </div>
        </div>
      )}

      {(aviso || error) && (
        <p
          className={`absolute right-0 top-full mt-2 z-10 whitespace-nowrap text-xs font-mono px-3 py-2 rounded-sa shadow-sa-sm ${
            error ? 'bg-sa-strawberry text-white' : 'bg-sa-mint/25 text-sa-green-ink'
          }`}
        >
          {error ?? aviso}
        </p>
      )}
    </div>
  )
}
