import React, { useMemo, useState } from 'react'
import { mxn } from '@shake/utils'
import { partirNombreDeVenta, type ProductoVenta, type ExtraDeProducto } from '@shake/supabase'
import { urlDeFoto } from '@shake/utils'

interface Props {
  producto: ProductoVenta | null
  extras: ExtraDeProducto[]
  /** Chips por estación, administrados desde Admin → Observaciones. */
  observaciones?: Record<string, string[]>
  onCerrar: () => void
  onAgregar: (nota: string | null, extrasElegidos: ExtraDeProducto[]) => void
}

/**
 * «¿Algo más?» — el paso antes de agregar una pieza al carrito.
 *
 * Este modal **era el de los shakes**: elegía la leche base, la marca de
 * proteína, el doble scoop y la galleta. Nada de eso existe en una panadería,
 * y sin embargo se abría con CADA hojaldra, porque se dispara para todo lo que
 * va a la estación de alimentos. Se reemplazó por lo que sí aplica aquí:
 * los extras que gerencia haya dado de alta, y una nota para la cocina.
 *
 * Si un producto no tiene extras ni observaciones, el modal se salta solo
 * desde el catálogo — no tiene caso preguntar «¿algo más?» cuando no hay nada
 * que ofrecer.
 */
export function ModalExtras({
  producto,
  extras,
  observaciones: catalogoObs,
  onCerrar,
  onAgregar,
}: Props) {
  const [elegidos, setElegidos] = useState<Record<string, boolean>>({})
  const [nota, setNota] = useState('')

  // Las sugerencias de la estación a la que va este producto. Son chips para
  // no obligar a nadie a escribir en una pantalla táctil de pie.
  const sugerencias = useMemo(() => {
    const slug = producto?.categorias?.cocinas?.slug
    if (!slug || !catalogoObs) return []
    return catalogoObs[slug] ?? []
  }, [producto, catalogoObs])

  if (!producto) return null

  const { sabor, medida } = partirNombreDeVenta(producto.nombre)
  const foto = urlDeFoto(producto.imagen_url, import.meta.env.BASE_URL)
  const escogidos = extras.filter((e) => elegidos[e.extra_id])
  const sobreprecio = escogidos.reduce((s, e) => s + Number(e.precio ?? 0), 0)

  function alternarSugerencia(texto: string) {
    // Se agrega o se quita del texto de la nota, para que el chip se pueda
    // usar como interruptor y no solo para sumar.
    setNota((actual) => {
      const partes = actual.split('·').map((p) => p.trim()).filter(Boolean)
      const i = partes.indexOf(texto)
      if (i >= 0) partes.splice(i, 1)
      else partes.push(texto)
      return partes.join(' · ')
    })
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-sa-green-ink/50 p-0 sm:p-6"
      onClick={onCerrar}
    >
      <div
        className="w-full sm:max-w-lg bg-sa-cream-paper rounded-t-sa-lg sm:rounded-sa-lg shadow-sa max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-4 p-5 border-b border-sa-green-ink/10">
          {foto && <img src={foto} alt="" className="w-16 h-16 object-contain shrink-0" />}
          <div className="min-w-0 flex-1">
            <p className="font-display text-2xl text-sa-green-ink leading-tight">{sabor}</p>
            {medida && (
              <p className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/50 mt-1">
                {medida}
              </p>
            )}
          </div>
          <button
            onClick={onCerrar}
            className="shrink-0 w-10 h-10 rounded-full text-sa-green-ink/50 font-display text-2xl"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-5">
          {extras.length > 0 && (
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.15em] text-sa-green mb-3">
                ¿Algo más?
              </p>
              <div className="space-y-2">
                {extras.map((e) => {
                  const activo = !!elegidos[e.extra_id]
                  return (
                    <button
                      key={e.extra_id}
                      onClick={() =>
                        setElegidos((p) => ({ ...p, [e.extra_id]: !p[e.extra_id] }))
                      }
                      className={[
                        'w-full flex items-center justify-between gap-3 rounded-sa border-2 px-4 py-3 text-left transition-colors',
                        activo
                          ? 'border-sa-green bg-sa-green/5'
                          : 'border-sa-green-ink/10 bg-white',
                      ].join(' ')}
                    >
                      <span className="font-body text-sa-green-ink">{e.nombre}</span>
                      <span className="flex items-center gap-3 shrink-0">
                        {Number(e.precio ?? 0) > 0 && (
                          <span className="font-mono text-sm text-sa-green-ink/60">
                            +{mxn(Number(e.precio))}
                          </span>
                        )}
                        <span
                          className={[
                            'w-7 h-7 rounded-full grid place-items-center font-display',
                            activo
                              ? 'bg-sa-green text-sa-cream'
                              : 'border-2 border-sa-green-ink/15 text-transparent',
                          ].join(' ')}
                        >
                          ✓
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div>
            <p className="font-mono text-xs uppercase tracking-[0.15em] text-sa-green mb-3">
              ¿Alguna indicación?
            </p>
            {sugerencias.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {sugerencias.map((s) => {
                  const activo = nota.split('·').map((p) => p.trim()).includes(s)
                  return (
                    <button
                      key={s}
                      onClick={() => alternarSugerencia(s)}
                      className={[
                        'font-body text-sm rounded-full px-4 py-2 border transition-colors',
                        activo
                          ? 'bg-sa-green text-sa-cream border-sa-green'
                          : 'bg-white text-sa-green-ink border-sa-green-ink/15',
                      ].join(' ')}
                    >
                      {s}
                    </button>
                  )
                })}
              </div>
            )}
            <input
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Escriba aquí si hace falta…"
              className="w-full px-4 py-3 rounded-sa border border-sa-green-ink/15 bg-white font-body text-sa-green-ink"
            />
          </div>
        </div>

        <div className="sticky bottom-0 bg-sa-cream-paper border-t border-sa-green-ink/10 p-5 flex items-center gap-3">
          <div className="flex-1">
            <p className="font-display text-2xl text-sa-green leading-none">
              {mxn(Number(producto.precio) + sobreprecio)}
            </p>
            {sobreprecio > 0 && (
              <p className="font-mono text-[11px] text-sa-green-ink/50 mt-1">
                incluye +{mxn(sobreprecio)} de extras
              </p>
            )}
          </div>
          <button
            onClick={() => onAgregar(nota.trim() || null, escogidos)}
            className="bg-sa-green hover:bg-sa-green-deep text-sa-cream font-display text-xl px-8 py-4 rounded-sa-lg active:scale-95 transition-all"
          >
            Agregar
          </button>
        </div>
      </div>
    </div>
  )
}
