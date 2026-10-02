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

export function CatalogoBusqueda({ productos, categorias, extras, productosExtra }: Props) {
  const agregarItem = usePosStore((s) => s.agregarItem)
  const precioDe = usePosStore((s) => s.precioDe)
  const [busqueda, setBusqueda] = useState('')
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null)
  const [marcaActiva, setMarcaActiva] = useState<string | null>(null)
  const [personalizando, setPersonalizando] = useState<ProductoVenta | null>(null)
  /**
   * El sabor abierto.
   *
   * La caja elige en dos pasos —primero QUE hojaldra, luego DE QUE TAMANO—
   * porque asi se pide en el mostrador. Antes cada combinacion de sabor y
   * tamano era una tarjeta suelta: 18 tarjetas donde el mismo sabor aparecia
   * tres o cuatro veces, y el cajero tenia que leerlas todas para encontrar
   * la que le pidieron.
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
   * el tamano despues. De paso la rejilla se hace mucho mas corta.
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
            placeholder="Buscar sabor, tamaño, café…"
            className="w-full pl-11 pr-10 py-3 bg-white rounded-sa-lg text-sa-green-ink placeholder:font-mono placeholder:text-sa-green-ink/40 placeholder:text-sm focus:outline-none focus:ring-2 focus:ring-sa-green/30 border border-sa-green-ink/10 transition-all"
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

      {/* Filtros por categoría */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto flex-shrink-0">
        <button
          onClick={() => { setCategoriaActiva(null); setMarcaActiva(null) }}
          className={`flex-shrink-0 px-4 py-2 rounded-full font-mono text-xs uppercase tracking-wide transition-colors ${
            !categoriaActiva
              ? 'bg-sa-green text-sa-cream'
              : 'bg-sa-cream-soft text-sa-green-ink/60 hover:bg-sa-cream-warm'
          }`}
        >
          Todos
        </button>
        {categorias.map((cat) => (
          <button
            key={cat.id}
            onClick={() => { setCategoriaActiva(cat.id); setMarcaActiva(null) }}
            className={`flex-shrink-0 px-4 py-2 rounded-full font-mono text-xs uppercase tracking-wide transition-colors flex items-center gap-1.5 ${
              categoriaActiva === cat.id
                ? 'bg-sa-green text-sa-cream'
                : 'bg-sa-cream-soft text-sa-green-ink/60 hover:bg-sa-cream-warm'
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
            className={`flex-shrink-0 px-3 py-1.5 rounded-full font-mono text-[11px] uppercase tracking-wide transition-colors ${
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
              className={`flex-shrink-0 px-3 py-1.5 rounded-full font-mono text-[11px] uppercase tracking-wide transition-colors ${
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

      {/* Catalogo en dos pasos: sabor, y dentro sus tamanos. */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {porSabor.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-sa-green-ink/40">
            <p className="font-mono text-sm uppercase tracking-wide">Nada por aquí</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {porSabor.map(([sabor, variantes]) => {
              /**
               * La pieza suelta no se pinta como un tamano mas.
               *
               * Un paquete de 5 y "una pieza" no son dos tamanos entre los
               * que se elige: son el paquete, y la forma de cuadrar lo que no
               * es multiplo de 5 (17 pastelitos = 3 paquetes y 2 piezas). Como
               * tarjeta de tamano se leeria "1 pieza $22" al lado de "5 pzas
               * $110", y alguien terminaria cobrando cinco piezas de una en
               * una. Abajo se pinta como lo que es: +1, +2, +3 y +4.
               *
               * Si la pieza anda sola (sin su paquete en la pantalla) si es
               * una tarjeta normal: ahi no hay con que confundirla.
               */
              const suelta =
                variantes.length > 1 ? variantes.find((p) => medidaDeVenta(p).esSuelta) : undefined
              const tamanos = suelta ? variantes.filter((p) => p.id !== suelta.id) : variantes
              const abierto = saborAbierto === sabor
              const foto = urlDeFoto(tamanos[0].imagen_url, import.meta.env.BASE_URL)
              // Un sabor con un solo tamano no necesita segundo paso: entra
              // al ticket de un toque, como un cafe.
              const unico = tamanos.length === 1 && !suelta
              /**
               * ¿Las variantes de este grupo se distinguen por un NUMERO?
               *
               * Una hojaldra si (12, 24, 48 cuadros); un paquete de pastelitos
               * tambien (5 piezas). La Hojaldra de Corazon no: es un solo
               * tamano con cinco rellenos, y ahi el numero grande salia «—»
               * con «uno» debajo, tapando lo unico que importa, que es el
               * relleno. Cuando no hay numero, manda el nombre.
               */
              const conMedida = tamanos.some((t) => medidaDeVenta(t).cuanto !== null)

              return (
                <div
                  key={sabor}
                  className={[
                    'rounded-sa border transition-all',
                    abierto
                      ? 'col-span-3 bg-sa-cream-soft border-sa-green shadow-sa'
                      : 'bg-white border-sa-green-ink/5 shadow-sa-sm hover:border-sa-green/30',
                  ].join(' ')}
                >
                  <button
                    onClick={() => (unico ? tocar(tamanos[0]) : setSaborAbierto(abierto ? null : sabor))}
                    className="w-full flex flex-col items-center p-3 active:scale-95 transition-transform"
                  >
                    {foto && (
                      <img src={foto} alt="" className="w-14 h-14 object-contain mb-1" draggable={false} />
                    )}
                    <p className="font-display text-base text-sa-green-ink text-center leading-tight w-full">
                      {sabor}
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/45 mt-1">
                      {unico
                        ? [medidaDeVenta(tamanos[0]).texto, mxn(precioDe(tamanos[0]))]
                            .filter(Boolean)
                            .join(' · ')
                        : abierto
                          ? conMedida ? '¿de qué tamaño?' : '¿cuál?'
                          : tamanos.length === 1 && suelta
                            ? 'paquete o piezas'
                            : `${tamanos.length} ${conMedida ? 'tamaños' : 'opciones'}`}
                    </p>
                  </button>

                  {abierto && !unico && (
                    <>
                      <div
                        className={[
                          'grid gap-2 px-3 pb-3',
                          // Un solo tamano no se queda flotando en un tercio
                          // de ancho con dos tercios de hueco al lado.
                          tamanos.length === 1 ? 'grid-cols-1' : tamanos.length === 2 ? 'grid-cols-2' : 'grid-cols-3',
                        ].join(' ')}
                      >
                        {tamanos.map((p) => {
                          const med = medidaDeVenta(p)
                          const variante =
                            nombreDeVariante(partirNombreDeVenta(p.nombre).medida) ||
                            (conMedida ? '' : 'Normal')
                          return (
                            <button
                              key={p.id}
                              onClick={() => { tocar(p); setSaborAbierto(null) }}
                              className="rounded-sa bg-white border border-sa-green-ink/10 hover:border-sa-green px-3 py-3 active:scale-95 transition-all"
                            >
                              {med.cuanto !== null ? (
                                <>
                                  <p className="font-display text-2xl text-sa-green-ink leading-none">
                                    {med.cuanto}
                                  </p>
                                  <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/50 mt-1">
                                    {med.unidad}
                                  </p>
                                  {variante && (
                                    <p className="font-body text-xs text-sa-green-ink/70 mt-1 leading-tight">
                                      {variante}
                                    </p>
                                  )}
                                </>
                              ) : (
                                /* Sin numero que pintar, el nombre ES el titular. */
                                <p className="font-display text-lg text-sa-green-ink leading-tight">
                                  {variante}
                                </p>
                              )}
                              <p className="font-mono text-sm font-medium text-sa-green mt-1.5">
                                {mxn(precioDe(p))}
                              </p>
                            </button>
                          )
                        })}
                      </div>

                      {/*
                        Las piezas sueltas, para cuadrar lo que no es multiplo
                        del paquete. Llega hasta 4 a proposito: con 5 ya se
                        toca el paquete, que cuesta exactamente lo mismo.
                      */}
                      {suelta && (
                        <div className="mx-3 mb-3 rounded-sa bg-white border border-sa-green-ink/10 px-3 py-2.5">
                          <div className="flex items-baseline justify-between mb-2">
                            <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/50">
                              y piezas sueltas
                            </p>
                            <p className="font-mono text-[11px] text-sa-green-ink/45">
                              {mxn(precioDe(suelta))} c/u
                            </p>
                          </div>
                          <div className="grid grid-cols-4 gap-2">
                            {[1, 2, 3, 4].map((n) => (
                              <button
                                key={n}
                                onClick={() => { agregarItem(suelta, null, n); setSaborAbierto(null) }}
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
                      )}
                    </>
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
