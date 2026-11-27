import React, { useState, useMemo } from 'react'
import { usePosStore } from '@/store/posStore'
import { mxn } from '@lily/utils'
import type { ProductoVenta, ExtraDeProducto } from '@lily/supabase'
import type { CategoriaPOS } from '@/hooks/useProductosPOS'
import { ModalPersonalizar } from './ModalPersonalizar'
import { nombreParaOrdenar, partirNombreDeVenta } from '@lily/supabase'
import { urlDeFoto, medidaDeVenta } from '@lily/utils'

interface Props {
  productos: ProductoVenta[]
  categorias: CategoriaPOS[]
  extras: ExtraDeProducto[]
  /** Los productos extra en sí (el catálogo normal los excluye). */
  productosExtra: ProductoVenta[]
}

/**
 * El nombre de la variante dentro de su grupo: «Chica», «Grande», «Nutella».
 *
 * Sale de lo que va después del primer `·` del nombre. Se devuelve vacío
 * cuando eso NO nombra nada, sino que repite la medida: el renglón
 * «Pastelitos de Lomo · 5 pzas» tiene por medida «5 pzas», y el mosaico ya
 * pinta «5 / piezas» arriba. Escribirlo otra vez abajo daba
 * «5 · PIEZAS · 5 pzas», que es el mismo defecto que ya se corrigió una vez
 * en el Horno («3 moldes de 48 · 3 moldes»).
 */
const SOLO_MEDIDA = /^[\d\s.,]*(pza|pzas|pieza|piezas|cuadro|cuadros)?$/i

function nombreDeVariante(medida: string): string {
  const primera = medida.replace(/·.*$/, '').trim()
  return SOLO_MEDIDA.test(primera) ? '' : primera
}

/**
 * La etiqueta corta de un tamaño para el botón en la tarjeta: el nombre de la
 * variante (Mini/Chica/Grande) si lo hay, o la medida (12, 24, 48). Es lo que
 * el cajero lee de un vistazo, estando de pie.
 */
function etiquetaTamano(p: ProductoVenta): string {
  const med = medidaDeVenta(p)
  const variante = nombreDeVariante(partirNombreDeVenta(p.nombre).medida)
  if (variante) return variante
  if (med.cuanto !== null) return String(med.cuanto)
  return 'Normal'
}

/** La unidad chica debajo del número, cuando el botón muestra una medida. */
function unidadTamano(p: ProductoVenta): string | null {
  const med = medidaDeVenta(p)
  const variante = nombreDeVariante(partirNombreDeVenta(p.nombre).medida)
  if (variante || med.cuanto === null) return null
  return med.unidad
}

/**
 * El precio para el botón de tamaño de la tarjeta: SIN centavos cuando es
 * entero ($160, no $160.00). Los botones son angostos (tres por tarjeta, y en
 * el teléfono la tarjeta es media pantalla), y «$160.00» no cabe y se encima.
 * El total y el ticket sí llevan centavos (ahí sí hay espacio y es el monto
 * que se cobra).
 */
function precioCorto(n: number): string {
  return n % 1 === 0 ? '$' + n.toLocaleString('es-MX') : mxn(n)
}

export function CatalogoBusqueda({ productos, categorias, extras, productosExtra }: Props) {
  const agregarItem = usePosStore((s) => s.agregarItem)
  const precioDe = usePosStore((s) => s.precioDe)
  const [busqueda, setBusqueda] = useState('')
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null)
  const [marcaActiva, setMarcaActiva] = useState<string | null>(null)
  const [personalizando, setPersonalizando] = useState<ProductoVenta | null>(null)
  /**
   * El sabor abierto. Solo se usa para los sabores con MUCHAS variantes (4 o
   * más, p. ej. la Coca Cola): esos no caben en la tarjeta y se abren a un
   * segundo paso. Los de 1 a 3 tamaños ya muestran todo en la tarjeta —que es
   * como lo pidió la casa: sin toques de más y todo a la vista.
   */
  const [saborAbierto, setSaborAbierto] = useState<string | null>(null)

  const extrasPorProducto = useMemo(() => {
    const m = new Map<string, ExtraDeProducto[]>()
    for (const e of extras) {
      const lista = m.get(e.producto_id) ?? []
      lista.push(e)
      m.set(e.producto_id, lista)
    }
    return m
  }, [extras])

  // Los alimentos se personalizan (extras + restricciones); el resto entra
  // directo al ticket con un toque, que es lo que espera la caja rápida.
  function esPersonalizable(p: ProductoVenta): boolean {
    return (
      p.categorias?.cocinas?.slug === 'alimentos' || (extrasPorProducto.get(p.id)?.length ?? 0) > 0
    )
  }

  function tocar(p: ProductoVenta) {
    if (esPersonalizable(p)) setPersonalizando(p)
    else agregarItem(p)
  }

  // Marcas de la categoría abierta (lo de reventa viene con
  // marca desde costosshake). Con varias marcas se muestra un segundo nivel
  // de filtro para no tener que buscar entre decenas de sabores sueltos.
  const marcasDeCategoria = useMemo(() => {
    if (!categoriaActiva) return []
    const set = new Set<string>()
    for (const p of productos) {
      if (p.categoria_id === categoriaActiva && p.marca) set.add(p.marca)
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [productos, categoriaActiva])

  const productosFiltrados = useMemo(() => {
    return productos.filter((p) => {
      const coincideBusqueda = !busqueda || p.nombre.toLowerCase().includes(busqueda.toLowerCase())
      const coincideCategoria = !categoriaActiva || p.categoria_id === categoriaActiva
      const coincideMarca = !marcaActiva || p.marca === marcaActiva
      return coincideBusqueda && coincideCategoria && coincideMarca
    })
  }, [productos, busqueda, categoriaActiva, marcaActiva])

  /**
   * Los productos agrupados por sabor, y dentro ordenados por tamano.
   *
   * Es el mismo catalogo, contado como se pide: "una de guayaba" primero, y
   * el tamano despues.
   */
  const porSabor = useMemo(() => {
    const m = new Map<string, ProductoVenta[]>()
    for (const p of productosFiltrados) {
      const clave = partirNombreDeVenta(p.nombre).sabor
      const l = m.get(clave) ?? []
      l.push(p)
      m.set(clave, l)
    }
    // Del mas chico al mas grande. Un renglon se mide en cuadros (una
    // hojaldra) o en piezas (un pastelito), nunca en los dos.
    const tamano = (p: ProductoVenta) => medidaDeVenta(p).cuanto ?? 0
    for (const l of m.values()) l.sort((a, b) => tamano(a) - tamano(b))
    return [...m.entries()]
  }, [productosFiltrados])

  return (
    <div className="flex flex-col h-full">
      {/* Buscador */}
      <div className="px-4 pt-4 pb-2">
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sa-green-ink/50 text-lg">🔍</span>
          <input
            type="text"
            value={busqueda}
            onChange={(e) => { setBusqueda(e.target.value); setCategoriaActiva(null); setMarcaActiva(null) }}
            placeholder="Buscar sabor, tamaño, bebida…"
            className="w-full pl-11 pr-10 py-3.5 bg-white rounded-sa-lg text-sa-green-ink text-base placeholder:font-mono placeholder:text-sa-green-ink/40 placeholder:text-sm focus:outline-none focus:ring-2 focus:ring-sa-green/30 border border-sa-green-ink/10 transition-all"
          />
          {busqueda && (
            <button
              onClick={() => setBusqueda('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-sa-green-ink/40 hover:text-sa-strawberry"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Filtros por categoría. Más grandes que antes: se leen y se tocan de
          pie, que es como se usa la caja (lo pidió la casa). */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto flex-shrink-0">
        <button
          onClick={() => { setCategoriaActiva(null); setMarcaActiva(null) }}
          className={`flex-shrink-0 px-5 py-2.5 rounded-full font-mono text-sm uppercase tracking-wide transition-colors ${
            !categoriaActiva
              ? 'bg-sa-green text-sa-cream'
              : 'bg-sa-cream-soft text-sa-green-ink/70 hover:bg-sa-cream-warm'
          }`}
        >
          Todos
        </button>
        {categorias.map((cat) => (
          <button
            key={cat.id}
            onClick={() => { setCategoriaActiva(cat.id); setMarcaActiva(null) }}
            className={`flex-shrink-0 px-5 py-2.5 rounded-full font-mono text-sm uppercase tracking-wide transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              categoriaActiva === cat.id
                ? 'bg-sa-green text-sa-cream'
                : 'bg-sa-cream-soft text-sa-green-ink/70 hover:bg-sa-cream-warm'
            }`}
          >
            {cat.cocinas && <span>{cat.cocinas.slug === 'alimentos' ? '🍽️' : '🥤'}</span>}
            {cat.nombre}
          </button>
        ))}
      </div>

      {/* Segundo nivel: marcas de la categoría abierta (Lenny & Larrys, Raw…) */}
      {marcasDeCategoria.length > 1 && (
        <div className="flex gap-2 px-4 pb-3 overflow-x-auto flex-shrink-0">
          <button
            onClick={() => setMarcaActiva(null)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full font-mono text-xs uppercase tracking-wide transition-colors ${
              !marcaActiva
                ? 'bg-sa-green-ink text-sa-cream'
                : 'bg-white border border-sa-green-ink/10 text-sa-green-ink/60 hover:bg-sa-cream-warm'
            }`}
          >
            Todas las marcas
          </button>
          {marcasDeCategoria.map((m) => (
            <button
              key={m}
              onClick={() => setMarcaActiva(m === marcaActiva ? null : m)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full font-mono text-xs uppercase tracking-wide transition-colors ${
                marcaActiva === m
                  ? 'bg-sa-green-ink text-sa-cream'
                  : 'bg-white border border-sa-green-ink/10 text-sa-green-ink/60 hover:bg-sa-cream-warm'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      )}

      {/* Catálogo: una tarjeta por sabor, con sus tamaños y precios A LA VISTA.
          Tarjetas grandes para que llenen el espacio y se lean de pie. */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {porSabor.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-sa-green-ink/40">
            <p className="font-mono text-sm uppercase tracking-wide">Nada por aquí</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 content-start">
            {porSabor.map(([sabor, variantes]) => {
              /**
               * La pieza suelta no se pinta como un tamano mas (ver el porqué
               * largo abajo): es el paquete y su forma de cuadrar lo que no es
               * múltiplo. Se pinta como +1, +2, +3, +4.
               */
              const suelta =
                variantes.length > 1 ? variantes.find((p) => medidaDeVenta(p).esSuelta) : undefined
              const tamanos = suelta ? variantes.filter((p) => p.id !== suelta.id) : variantes
              const foto = urlDeFoto(tamanos[0].imagen_url, import.meta.env.BASE_URL)
              // Un sabor con un solo tamaño entra al ticket de un toque.
              const unico = tamanos.length === 1 && !suelta
              const conMedida = tamanos.some((t) => medidaDeVenta(t).cuanto !== null)
              // De 1 a 3 tamaños se muestran EN la tarjeta; con 4 o más
              // (bebidas) se abre un segundo paso para no amontonar.
              const inline = tamanos.length <= 3
              const abierto = saborAbierto === sabor
              const precioMin = Math.min(...tamanos.map((p) => precioDe(p)))
              const badge = unico
                ? null
                : tamanos.length === 1 && suelta
                  ? 'pza o paquete'
                  : `${tamanos.length} ${conMedida ? 'tamaños' : 'opciones'}`

              return (
                <div
                  key={sabor}
                  className={[
                    'relative flex flex-col justify-center rounded-sa-lg border transition-all',
                    abierto
                      ? 'col-span-full bg-sa-cream-soft border-sa-green shadow-sa'
                      : 'bg-white border-sa-green-ink/5 shadow-sa-sm',
                  ].join(' ')}
                >
                  {badge && (
                    <span className="absolute top-2.5 right-2.5 z-10 font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/45 bg-sa-cream-soft rounded-full px-2 py-0.5">
                      {badge}
                    </span>
                  )}

                  {/* Cabecera de la tarjeta: foto + nombre remarcado. En un
                      sabor de un solo tamaño, toda la cabecera cobra. */}
                  <button
                    onClick={() => unico && tocar(tamanos[0])}
                    disabled={!unico}
                    className={`flex flex-col items-center px-3 pt-4 pb-2 ${unico ? 'active:scale-95 transition-transform' : 'cursor-default'}`}
                  >
                    {foto && (
                      <img src={foto} alt="" className="w-24 h-24 object-contain mb-1.5" draggable={false} />
                    )}
                    <p className="font-display text-lg lg:text-xl text-sa-green-ink text-center leading-tight w-full">
                      {sabor}
                    </p>
                    {unico && (
                      <div className="flex items-center justify-center gap-1.5 mt-1.5 flex-wrap">
                        {medidaDeVenta(tamanos[0]).texto && (
                          <span className="font-mono text-[11px] uppercase tracking-wide text-sa-green-ink/45">
                            {medidaDeVenta(tamanos[0]).texto}
                          </span>
                        )}
                        <span className="font-mono text-base font-bold text-sa-green-deep bg-sa-green/10 rounded-full px-3 py-1">
                          {mxn(precioDe(tamanos[0]))}
                        </span>
                      </div>
                    )}
                  </button>

                  {/* Tamaños a la vista (1–3). Cada uno es su botón: cobra o,
                      si el producto se personaliza, abre el modal. */}
                  {!unico && inline && (
                    <div className="px-3 pb-3">
                      <div
                        className={[
                          'grid gap-2',
                          tamanos.length === 1 ? 'grid-cols-1' : tamanos.length === 2 ? 'grid-cols-2' : 'grid-cols-3',
                        ].join(' ')}
                      >
                        {tamanos.map((p) => {
                          const uni = unidadTamano(p)
                          return (
                            <button
                              key={p.id}
                              onClick={() => tocar(p)}
                              className="flex flex-col items-center justify-center rounded-sa bg-sa-cream-soft border border-sa-green-ink/10 hover:border-sa-green hover:bg-sa-cream-warm px-1.5 py-2 active:scale-95 transition-all"
                            >
                              <span className="font-display text-sm lg:text-base text-sa-green-ink leading-none text-center">
                                {etiquetaTamano(p)}
                              </span>
                              {uni && (
                                <span className="font-mono text-[9px] uppercase tracking-wide text-sa-green-ink/45 mt-0.5">
                                  {uni}
                                </span>
                              )}
                              <span className="font-mono text-sm font-bold text-sa-green-deep mt-1">
                                {precioCorto(precioDe(p))}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                      {suelta && <PiezasSueltas suelta={suelta} precio={precioDe(suelta)} onAgregar={(n) => agregarItem(suelta, null, n)} />}
                    </div>
                  )}

                  {/* 4 o más variantes: se muestra «desde $X» y se abre. */}
                  {!unico && !inline && (
                    <div className="px-3 pb-3">
                      <button
                        onClick={() => setSaborAbierto(abierto ? null : sabor)}
                        className="w-full rounded-sa bg-sa-cream-soft border border-sa-green-ink/10 hover:border-sa-green px-3 py-2.5 active:scale-95 transition-all"
                      >
                        <span className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/55">
                          {abierto ? '¿cuál?' : `desde `}
                        </span>
                        {!abierto && (
                          <span className="font-mono text-sm font-bold text-sa-green-deep ml-1">{mxn(precioMin)}</span>
                        )}
                      </button>
                      {abierto && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                          {tamanos.map((p) => {
                            const uni = unidadTamano(p)
                            return (
                              <button
                                key={p.id}
                                onClick={() => { tocar(p); setSaborAbierto(null) }}
                                className="flex flex-col items-center justify-center rounded-sa bg-white border border-sa-green-ink/10 hover:border-sa-green px-1.5 py-2 active:scale-95 transition-all"
                              >
                                <span className="font-display text-sm lg:text-base text-sa-green-ink leading-tight text-center">
                                  {etiquetaTamano(p)}
                                </span>
                                {uni && (
                                  <span className="font-mono text-[9px] uppercase tracking-wide text-sa-green-ink/45 mt-0.5">
                                    {uni}
                                  </span>
                                )}
                                <span className="font-mono text-sm font-bold text-sa-green-deep mt-1">
                                  {mxn(precioDe(p))}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                      {suelta && <PiezasSueltas suelta={suelta} precio={precioDe(suelta)} onAgregar={(n) => agregarItem(suelta, null, n)} />}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <ModalPersonalizar
        producto={personalizando}
        extras={personalizando ? (extrasPorProducto.get(personalizando.id) ?? []) : []}
        onCerrar={() => setPersonalizando(null)}
        onAgregar={(nota, extrasElegidos) => {
          if (personalizando) {
            agregarItem(personalizando, nota)
            // Cada extra entra como su propia línea: cuesta, cobra y
            // descuenta inventario como cualquier producto.
            for (const e of extrasElegidos) {
              const prodExtra = productosExtra.find((p) => p.id === e.extra_id)
              if (prodExtra) agregarItem(prodExtra)
            }
          }
          setPersonalizando(null)
        }}
      />
    </div>
  )
}

/**
 * Las piezas sueltas (+1 … +4), para cuadrar lo que no es múltiplo del
 * paquete. Llega hasta 4 a propósito: con 5 ya se toca el paquete, que cuesta
 * exactamente lo mismo.
 */
function PiezasSueltas({ suelta, precio, onAgregar }: { suelta: ProductoVenta; precio: number; onAgregar: (n: number) => void }) {
  return (
    <div className="mt-2 rounded-sa bg-white border border-sa-green-ink/10 px-3 py-2.5">
      <div className="flex items-baseline justify-between mb-2">
        <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/50">y piezas sueltas</p>
        <p className="font-mono text-[11px] text-sa-green-ink/45">{mxn(precio)} c/u</p>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {[1, 2, 3, 4].map((n) => (
          <button
            key={n}
            onClick={() => onAgregar(n)}
            className="rounded-sa bg-sa-cream-soft border border-sa-green-ink/10 hover:border-sa-green py-2 active:scale-95 transition-all"
          >
            <p className="font-display text-xl text-sa-green-ink leading-none">+{n}</p>
            <p className="font-mono text-[9px] uppercase tracking-wide text-sa-green-ink/45 mt-0.5">
              {n === 1 ? 'pieza' : 'piezas'}
            </p>
          </button>
        ))}
      </div>
    </div>
  )
}
