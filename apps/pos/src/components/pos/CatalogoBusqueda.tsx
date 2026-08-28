import React, { useState, useMemo } from 'react'
import { usePosStore } from '@/store/posStore'
import { mxn } from '@shake/utils'
import type { ProductoVenta, ExtraDeProducto } from '@shake/supabase'
import type { CategoriaPOS } from '@/hooks/useProductosPOS'
import { ModalPersonalizar } from './ModalPersonalizar'
import { nombreParaOrdenar, partirNombreDeVenta } from '@shake/supabase'
import { urlDeFoto } from '@shake/utils'

interface Props {
  productos: ProductoVenta[]
  categorias: CategoriaPOS[]
  extras: ExtraDeProducto[]
  /** Los productos extra en sí (el catálogo normal los excluye). */
  productosExtra: ProductoVenta[]
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
    for (const l of m.values()) l.sort((a, b) => (a.cuadros ?? 0) - (b.cuadros ?? 0))
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
            {porSabor.map(([sabor, piezas]) => {
              const abierto = saborAbierto === sabor
              const foto = urlDeFoto(piezas[0].imagen_url, import.meta.env.BASE_URL)
              // Un sabor con un solo tamano no necesita segundo paso: entra
              // al ticket de un toque, como un cafe.
              const unico = piezas.length === 1

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
                    onClick={() => (unico ? tocar(piezas[0]) : setSaborAbierto(abierto ? null : sabor))}
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
                        ? mxn(precioDe(piezas[0]))
                        : abierto
                          ? '¿de qué tamaño?'
                          : `${piezas.length} tamaños`}
                    </p>
                  </button>

                  {abierto && !unico && (
                    <div className="grid grid-cols-3 gap-2 px-3 pb-3">
                      {piezas.map((p) => {
                        const { medida } = partirNombreDeVenta(p.nombre)
                        return (
                          <button
                            key={p.id}
                            onClick={() => { tocar(p); setSaborAbierto(null) }}
                            className="rounded-sa bg-white border border-sa-green-ink/10 hover:border-sa-green px-3 py-3 active:scale-95 transition-all"
                          >
                            <p className="font-display text-2xl text-sa-green-ink leading-none">
                              {p.cuadros ?? '—'}
                            </p>
                            <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/50 mt-1">
                              cuadros
                            </p>
                            <p className="font-body text-xs text-sa-green-ink/70 mt-1 leading-tight">
                              {medida.replace(/·.*$/, '').trim() || 'Paquete'}
                            </p>
                            <p className="font-mono text-sm font-medium text-sa-green mt-1.5">
                              {mxn(precioDe(p))}
                            </p>
                          </button>
                        )
                      })}
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
