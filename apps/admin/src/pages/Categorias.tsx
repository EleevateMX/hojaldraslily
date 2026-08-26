import { useEffect, useMemo, useState } from 'react'
import { sb } from '../lib/sb'
import {
  listarProductos,
  listarCategorias,
  listarCocinas,
  crearCategoria,
  actualizarCategoria,
  moverCategoriaProducto,
} from '@shake/supabase'
import type { Producto, Categoria, Cocina } from '@shake/types'
import { mxn, mensajeDeError } from '@shake/utils'
import { Panel, PageHeader, Loading, ErrorMsg, OkMsg, Chip, cx } from '../ui'

/**
 * El mapa del menú: las categorías tal como las ve el cliente en el kiosko.
 *
 * Aquí se crean, se renombran, se reordenan (el orden de aquí ES el orden de
 * los botones del kiosko) y — lo más usado — se reparte el menú: abrir una
 * categoría muestra lo que tiene y permite traer productos registrados desde
 * cualquier otra.
 *
 * Mover un producto pasa por fn_producto_mover_categoria, que además escribe
 * la categoría en el JSON de costeo: el reparto hecho aquí queda en la base
 * de la que se arma todo, no solo en la vista.
 */

/** Categorías del sistema que no son del menú: los extras nunca salen como botón. */
const INTERNAS = new Set(['Extras', 'Extras Bebidas'])

export default function Categorias() {
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [cocinas, setCocinas] = useState<Cocina[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  // crear
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevaCocina, setNuevaCocina] = useState('')
  const [creando, setCreando] = useState(false)

  // editar (una a la vez, en línea)
  const [editId, setEditId] = useState<string | null>(null)
  const [editNombre, setEditNombre] = useState('')
  const [editCocina, setEditCocina] = useState('')

  // panel de productos
  const [abierta, setAbierta] = useState<string | null>(null)
  const [filtro, setFiltro] = useState('')
  const [moviendo, setMoviendo] = useState<string | null>(null)

  const visibles = useMemo(
    () => categorias.filter((c) => !INTERNAS.has(c.nombre)),
    [categorias],
  )

  const activosPorCategoria = useMemo(() => {
    const m = new Map<string, Producto[]>()
    for (const p of productos) {
      if (!p.activo || p.es_extra || !p.categoria_id) continue
      const lista = m.get(p.categoria_id) ?? []
      lista.push(p)
      m.set(p.categoria_id, lista)
    }
    return m
  }, [productos])

  const catPorId = useMemo(() => new Map(categorias.map((c) => [c.id, c])), [categorias])

  async function cargar() {
    try {
      const [cs, ps, ks] = await Promise.all([
        listarCategorias(sb), listarProductos(sb), listarCocinas(sb),
      ])
      setCategorias(cs)
      setProductos(ps)
      setCocinas(ks)
      setError(null)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => { void cargar() }, [])

  async function crear() {
    if (!nuevoNombre.trim() || !nuevaCocina) return
    setCreando(true)
    setError(null)
    try {
      await crearCategoria(sb, { nombre: nuevoNombre.trim(), cocina_id: nuevaCocina })
      setNuevoNombre('')
      setOk('Categoría creada. Aparece en el kiosko en cuanto tenga su primer producto.')
      await cargar()
      setTimeout(() => setOk(null), 4000)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setCreando(false)
    }
  }

  /**
   * Subir/bajar reescribe `orden` de TODA la lista visible (1, 2, 3…), no
   * solo de las dos filas que se intercambian: había órdenes duplicados
   * heredados, y con duplicados un solo swap no cambia nada visible.
   */
  async function mover(idx: number, delta: -1 | 1) {
    const destino = idx + delta
    if (destino < 0 || destino >= visibles.length) return
    const nuevas = [...visibles]
    const [fila] = nuevas.splice(idx, 1)
    nuevas.splice(destino, 0, fila)
    setError(null)
    try {
      await Promise.all(
        nuevas.map((c, i) => (c.orden === i + 1 ? null : actualizarCategoria(sb, c.id, { orden: i + 1 }))),
      )
      await cargar()
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }

  function empezarEdicion(c: Categoria) {
    setEditId(c.id)
    setEditNombre(c.nombre)
    setEditCocina(c.cocina_id ?? '')
  }

  async function guardarEdicion() {
    if (!editId || !editNombre.trim()) return
    setError(null)
    try {
      await actualizarCategoria(sb, editId, {
        nombre: editNombre.trim(),
        ...(editCocina ? { cocina_id: editCocina } : {}),
      })
      setEditId(null)
      await cargar()
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }

  async function traer(producto: Producto, categoriaId: string) {
    setMoviendo(producto.id)
    setError(null)
    try {
      // Pasa por la RPC: mueve el producto Y deja la categoría escrita en el
      // JSON de costeo, para que ambos mundos digan lo mismo.
      await moverCategoriaProducto(sb, producto.id, categoriaId)
      await cargar()
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setMoviendo(null)
    }
  }

  if (cargando) return <Loading>Cargando categorías…</Loading>

  return (
    <div>
      <PageHeader
        title="Categorías"
        subtitle="Los botones del menú del kiosko: en este mismo orden. Abre una categoría para repartir los productos registrados."
      />

      {error && <ErrorMsg>{error}</ErrorMsg>}
      {ok && <OkMsg>{ok}</OkMsg>}

      {/* Crear */}
      <Panel className="mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div>
            <span className={cx.label}>Nueva categoría</span>
            <input
              className={cx.input}
              placeholder="Smoothie Bowls"
              value={nuevoNombre}
              onChange={(e) => setNuevoNombre(e.target.value)}
            />
          </div>
          <div>
            <span className={cx.label}>Estación (a dónde va la comanda)</span>
            <select className={cx.input} value={nuevaCocina} onChange={(e) => setNuevaCocina(e.target.value)}>
              <option value="">— Elegir —</option>
              {cocinas.map((k) => <option key={k.id} value={k.id}>{k.nombre}</option>)}
            </select>
          </div>
          <button
            className={cx.btnPrimary}
            disabled={creando || !nuevoNombre.trim() || !nuevaCocina}
            onClick={() => void crear()}
          >
            {creando ? 'Creando…' : 'Crear categoría'}
          </button>
        </div>
      </Panel>

      <div className="space-y-3">
        {visibles.map((c, idx) => {
          const dentro = activosPorCategoria.get(c.id) ?? []
          const estaAbierta = abierta === c.id
          const editando = editId === c.id
          return (
            <Panel key={c.id}>
              <div className="flex items-center gap-3 flex-wrap">
                {/* Reordenar: el orden de esta lista ES el de los botones del kiosko */}
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => void mover(idx, -1)}
                    disabled={idx === 0}
                    className="w-8 h-7 rounded-lg border border-sa-green-ink/15 text-sa-green-ink text-xs disabled:opacity-25 hover:bg-sa-cream-soft"
                    aria-label={`Subir ${c.nombre}`}
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => void mover(idx, +1)}
                    disabled={idx === visibles.length - 1}
                    className="w-8 h-7 rounded-lg border border-sa-green-ink/15 text-sa-green-ink text-xs disabled:opacity-25 hover:bg-sa-cream-soft"
                    aria-label={`Bajar ${c.nombre}`}
                  >
                    ▼
                  </button>
                </div>

                {editando ? (
                  <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                    <input
                      className={cx.input}
                      style={{ maxWidth: 220 }}
                      value={editNombre}
                      onChange={(e) => setEditNombre(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') void guardarEdicion() }}
                      autoFocus
                    />
                    <select
                      className={cx.input}
                      style={{ maxWidth: 170 }}
                      value={editCocina}
                      onChange={(e) => setEditCocina(e.target.value)}
                    >
                      {cocinas.map((k) => <option key={k.id} value={k.id}>{k.nombre}</option>)}
                    </select>
                    <button className={cx.btnPrimary} onClick={() => void guardarEdicion()}>Guardar</button>
                    <button className={cx.btnSec} onClick={() => setEditId(null)}>Cancelar</button>
                  </div>
                ) : (
                  <button
                    className="flex-1 min-w-0 text-left"
                    onClick={() => { setAbierta(estaAbierta ? null : c.id); setFiltro('') }}
                  >
                    <span className="font-display text-xl text-sa-green-ink">{c.nombre}</span>
                    <span className={`${cx.muted} text-sm ml-3`}>
                      {dentro.length === 0
                        ? 'vacía — no aparece en el kiosko todavía'
                        : `${dentro.length} producto${dentro.length === 1 ? '' : 's'}`}
                    </span>
                  </button>
                )}

                {!editando && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/40">
                      {cocinas.find((k) => k.id === c.cocina_id)?.nombre ?? 'sin estación'}
                    </span>
                    <button className={cx.btnSec} onClick={() => empezarEdicion(c)}>Editar</button>
                    <button className={cx.btnSec} onClick={() => { setAbierta(estaAbierta ? null : c.id); setFiltro('') }}>
                      {estaAbierta ? 'Cerrar' : 'Productos'}
                    </button>
                  </div>
                )}
              </div>

              {estaAbierta && (
                <div className="mt-4 border-t border-sa-green-ink/10 pt-4">
                  {/* Lo que YA está en la categoría */}
                  {dentro.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {dentro.map((p) => (
                        <span
                          key={p.id}
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-sa-mint/20 text-sa-green-ink text-sm"
                        >
                          {p.nombre} · {mxn(p.precio)}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Traer productos registrados desde otras categorías */}
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <input
                      className={cx.input}
                      style={{ maxWidth: 300 }}
                      placeholder="Buscar en todo el menú para traer aquí…"
                      value={filtro}
                      onChange={(e) => setFiltro(e.target.value)}
                    />
                    <span className={`${cx.muted} text-xs`}>
                      Mover aquí lo saca de su categoría actual (un producto vive en una sola)
                      y lo deja escrito en costeo.
                    </span>
                  </div>
                  {filtro.trim().length >= 2 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                      {productos
                        .filter(
                          (p) =>
                            p.activo && !p.es_extra && p.categoria_id !== c.id &&
                            p.nombre.toLowerCase().includes(filtro.trim().toLowerCase()),
                        )
                        .slice(0, 30)
                        .map((p) => (
                          <div
                            key={p.id}
                            className="flex items-center justify-between gap-2 px-3 py-2 rounded-sa bg-white border border-sa-green-ink/10 text-sm"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sa-green-ink">{p.nombre}</p>
                              <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/40">
                                {p.categoria_id ? catPorId.get(p.categoria_id)?.nombre ?? '—' : 'sin categoría'}
                              </p>
                            </div>
                            <button
                              className={`${cx.btnSec} flex-shrink-0`}
                              disabled={moviendo === p.id}
                              onClick={() => void traer(p, c.id)}
                            >
                              {moviendo === p.id ? '…' : 'Mover aquí'}
                            </button>
                          </div>
                        ))}
                    </div>
                  )}
                  {filtro.trim().length < 2 && (
                    <p className={`${cx.muted} text-xs`}>
                      Escribe al menos dos letras para buscar qué traer.
                    </p>
                  )}
                </div>
              )}

              {estaAbierta && dentro.length === 0 && (
                <p className={`${cx.muted} text-xs mt-2`}>
                  Vacía. En cuanto le muevas el primer producto, su botón aparece en el kiosko.
                </p>
              )}
            </Panel>
          )
        })}
      </div>

      <p className={`${cx.muted} text-xs mt-4`}>
        <Chip tone="neutral">Nota</Chip> El kiosko solo muestra las categorías que tienen
        productos activos, en este mismo orden. Los cambios se ven al recargar la pantalla.
      </p>
    </div>
  )
}
