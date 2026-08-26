import React, { useState, useMemo } from 'react'
import { usePosStore } from '@/store/posStore'
import { mxn } from '@shake/utils'
import type { ProductoVenta, ExtraDeProducto } from '@shake/supabase'
import type { CategoriaPOS } from '@/hooks/useProductosPOS'
import { ModalPersonalizar } from './ModalPersonalizar'
import { nombreParaOrdenar } from '@shake/supabase'

interface Props {
  productos: ProductoVenta[]
  categorias: CategoriaPOS[]
  extras: ExtraDeProducto[]
  /** Los productos extra en sí (el catálogo normal los excluye). */
  productosExtra: ProductoVenta[]
}

export function CatalogoBusqueda({ productos, categorias, extras, productosExtra }: Props) {
  const agregarItem = usePosStore((s) => s.agregarItem)
  const [busqueda, setBusqueda] = useState('')
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null)
  const [marcaActiva, setMarcaActiva] = useState<string | null>(null)
  const [personalizando, setPersonalizando] = useState<ProductoVenta | null>(null)

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

  // Marcas de la categoría abierta (snacks/bebidas/suplementos vienen con
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
            placeholder="Buscar shake, café, lo que sea…"
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

      {/* Grid de productos */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {productosFiltrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-sa-green-ink/40">
            <p className="font-mono text-sm uppercase tracking-wide">Nada por aquí</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {productosFiltrados.map((p) => (
              <button
                key={p.id}
                onClick={() => tocar(p)}
                className="flex flex-col items-center p-3 bg-white rounded-sa shadow-sa-sm border border-sa-green-ink/5 hover:border-sa-green/30 hover:-translate-y-0.5 active:scale-95 transition-all text-left group"
              >
                {p.imagen_url ? (
                  <img src={p.imagen_url} alt={nombreParaOrdenar(p.nombre)} className="w-16 h-16 rounded-sa object-cover mb-2" />
                ) : (
                  /* Sin foto: Milo, igual que en el kiosko — mismo lenguaje en
                     las dos pantallas, y de paso se ve de un vistazo a qué
                     productos les falta subir la imagen. */
                  <div className="w-16 h-16 rounded-sa bg-sa-cream-soft border border-sa-green-ink/5 flex items-center justify-center mb-2">
                    <img src="/milo-transparent.png" alt="" className="h-12 opacity-80" />
                  </div>
                )}
                {!p.imagen_url && (
                  <p className="font-mono text-[9px] uppercase tracking-wide text-sa-green-ink/35 -mt-1 mb-1">
                    Se lo comió Milo
                  </p>
                )}
                <p className="font-display text-sm text-sa-green-ink text-center leading-tight line-clamp-2 w-full">
                  {nombreParaOrdenar(p.nombre)}
                </p>
                {/* Los ingredientes del shake, para que el cajero conteste
                    "¿qué trae?" sin salirse de la pantalla ni preguntar. */}
                {p.descripcion && (
                  <p className="font-body text-[11px] text-sa-green-ink/50 text-center leading-snug line-clamp-2 w-full mt-1">
                    {p.descripcion}
                  </p>
                )}
                <p className="font-mono text-sm font-medium text-sa-strawberry mt-2">{mxn(p.precio)}</p>
              </button>
            ))}
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
