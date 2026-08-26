import { useEffect, useState } from 'react'
import { sb } from '../lib/sb'
import {
  listarProductos,
  listarCategorias,
  listarCocinas,
  crearProducto,
  actualizarProducto,
  desactivarProducto,
  moverCategoriaProducto,
  crearCategoria,
  subirFotoProducto,
  quitarFotoProducto,
  listarCategoriasPantalla,
  guardarCategoriaPantalla,
} from '@shake/supabase'
import type { Producto, Categoria, Cocina } from '@shake/types'
import type { CategoriaPantalla } from '@shake/supabase'
import { mxn, mensajeDeError } from '@shake/utils'
import { Panel, PageHeader, Field, Loading, ErrorMsg, OkMsg, Chip, cx } from '../ui'

interface FormProducto {
  nombre: string
  precio: string
  categoria_id: string
  iva_incluido: boolean
  descripcion: string
}

const FORM_VACIO: FormProducto = {
  nombre: '', precio: '', categoria_id: '', iva_incluido: true, descripcion: '',
}

/**
 * Lo que cabe en la tarjeta del kiosko sin que se corte.
 *
 * No es un limite de la base —la columna es texto libre— sino del espacio:
 * la tarjeta recorta a dos lineas y lo que pase de ahi no lo lee nadie. Se
 * avisa mientras escriben, no despues.
 */
const DESCRIPCION_COMODA = 120

export default function Menu() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [cocinas, setCocinas] = useState<Cocina[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  // form producto (crear / editar)
  const [form, setForm] = useState<FormProducto>(FORM_VACIO)
  const [editId, setEditId] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  // form categoría
  const [catNombre, setCatNombre] = useState('')
  const [catCocinaId, setCatCocinaId] = useState('')
  const [guardandoCat, setGuardandoCat] = useState(false)

  // Foto que se está subiendo (id del producto) para bloquear ese botón
  const [subiendoFoto, setSubiendoFoto] = useState<string | null>(null)

  // A qué pantalla llega cada categoría
  const [pantallas, setPantallas] = useState<CategoriaPantalla[]>([])

  async function cargar() {
    try {
      const [ps, cs, ks] = await Promise.all([
        listarProductos(sb),
        listarCategorias(sb),
        listarCocinas(sb),
      ])
      setProductos(ps)
      setCategorias(cs)
      setCocinas(ks)
      setError(null)
      // Aparte y sin bloquear: si esto falla, el resto del Menú sigue usable.
      void cargarPantallas()
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setCargando(false)
    }
  }

  async function cargarPantallas() {
    try {
      setPantallas(await listarCategoriasPantalla(sb))
    } catch {
      // Silencio a propósito: es un panel secundario. Si la migración
      // todavía no corre en esta base, el Menú no tiene por qué caerse.
      setPantallas([])
    }
  }

  useEffect(() => {
    void cargar()
  }, [])

  /**
   * Cambio de categoría directo desde la tabla, sin abrir el formulario.
   *
   * Existe porque reorganizar el menú (Shakes → Café, Tés, Kombuchas…) son
   * decenas de productos: a formulario por producto nadie lo termina. La
   * sincronización desde costeo no pisa la categoría al actualizar, así que
   * el movimiento es permanente.
   */
  const [moviendoCategoria, setMoviendoCategoria] = useState<string | null>(null)
  async function moverCategoria(p: Producto, categoriaId: string) {
    setMoviendoCategoria(p.id)
    setError(null)
    try {
      await moverCategoriaProducto(sb, p.id, categoriaId || null)
      await cargar()
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setMoviendoCategoria(null)
    }
  }

  /** Onzas del vaso: solo informa al visor de comandas, no toca precio ni ticket. */
  const [cambiandoOnzas, setCambiandoOnzas] = useState<string | null>(null)
  async function cambiarOnzas(p: Producto, valor: string) {
    setCambiandoOnzas(p.id)
    setError(null)
    try {
      await actualizarProducto(sb, p.id, { onzas: valor ? Number(valor) : null })
      await cargar()
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setCambiandoOnzas(null)
    }
  }

  function editar(p: Producto) {
    setEditId(p.id)
    setForm({
      nombre: p.nombre,
      precio: String(p.precio),
      categoria_id: p.categoria_id ?? '',
      iva_incluido: p.iva_incluido,
      descripcion: p.descripcion ?? '',
    })
    setOk(null)
  }

  function cancelarEdicion() {
    setEditId(null)
    setForm(FORM_VACIO)
  }

  async function guardarProducto() {
    if (!form.nombre.trim()) return
    setGuardando(true)
    setError(null)
    try {
      const datos = {
        nombre: form.nombre.trim(),
        precio: Number(form.precio) || 0,
        categoria_id: form.categoria_id || null,
        iva_incluido: form.iva_incluido,
        // Vacia se guarda como NULL, no como cadena vacia: el kiosko y la web
        // preguntan `if (descripcion)` para decidir si pintan el parrafo, y
        // una cadena vacia les dejaria un hueco.
        descripcion: form.descripcion.trim() || null,
      }
      if (editId) {
        // La categoría va por su propia vía: además de mover el producto, la
        // escribe en el JSON de costeo para que ambos mundos digan lo mismo.
        const { categoria_id, ...resto } = datos
        await actualizarProducto(sb, editId, resto)
        await moverCategoriaProducto(sb, editId, categoria_id)
        setOk('Producto actualizado.')
      } else {
        await crearProducto(sb, datos)
        setOk('Producto creado.')
      }
      cancelarEdicion()
      await cargar()
      setTimeout(() => setOk(null), 3000)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setGuardando(false)
    }
  }

  async function handleFoto(p: Producto, archivo: File | undefined) {
    if (!archivo) return
    setSubiendoFoto(p.id)
    setError(null)
    try {
      await subirFotoProducto(sb, p.id, archivo)
      setOk(`Foto de "${p.nombre}" actualizada.`)
      await cargar()
      setTimeout(() => setOk(null), 3000)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setSubiendoFoto(null)
    }
  }

  async function handleQuitarFoto(p: Producto) {
    if (!confirm(`¿Quitar la foto de "${p.nombre}"?`)) return
    setError(null)
    try {
      await quitarFotoProducto(sb, p.id)
      await cargar()
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }

  async function handleDesactivar(p: Producto) {
    if (!confirm(`¿Desactivar "${p.nombre}"?`)) return
    setError(null)
    try {
      await desactivarProducto(sb, p.id)
      if (editId === p.id) cancelarEdicion()
      await cargar()
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }

  async function cambiarPantalla(cat: CategoriaPantalla, slug: string) {
    setError(null)
    try {
      await guardarCategoriaPantalla(sb, cat.id, slug || null)
      setOk(
        slug
          ? `"${cat.nombre}" ahora sale en la pantalla de ${slug}.`
          : `"${cat.nombre}" ya no sale en ninguna pantalla. Se sigue vendiendo y registrando igual.`,
      )
      await cargarPantallas()
      setTimeout(() => setOk(null), 4000)
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }

  async function guardarCategoria() {
    if (!catNombre.trim() || !catCocinaId) return
    setGuardandoCat(true)
    setError(null)
    try {
      await crearCategoria(sb, { nombre: catNombre.trim(), cocina_id: catCocinaId })
      setCatNombre('')
      setCatCocinaId('')
      setOk('Categoría creada.')
      await cargar()
      setTimeout(() => setOk(null), 3000)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setGuardandoCat(false)
    }
  }

  if (cargando) return <Loading>Cargando menú…</Loading>

  return (
    <div>
      <PageHeader title="Menú" subtitle="Productos y categorías" />

      {error && <ErrorMsg>{error}</ErrorMsg>}
      {ok && <OkMsg>{ok}</OkMsg>}

      <div className="space-y-6">
        {/* A qué pantalla llega cada categoría */}
        {pantallas.length > 0 && (
          <Panel title="¿A qué pantalla llega cada categoría?">
            <p className={`${cx.muted} mb-4`}>
              Lo que se marca <strong>Ninguna</strong> se sigue vendiendo, cobrando y
              guardando en la orden — solo deja de ocupar espacio en una pantalla de
              producción. Es para lo que nadie prepara: un refresco del refrigerador,
              una galleta del anaquel.
            </p>
            <div className={cx.tableWrap}>
              <table className={cx.table}>
                <thead>
                  <tr className={cx.thead}>
                    <th className={cx.th}>Categoría</th>
                    <th className={cx.thNum}>Productos</th>
                    <th className={cx.th}>Sale en la pantalla de</th>
                  </tr>
                </thead>
                <tbody className={cx.tbody}>
                  {pantallas.map((c) => (
                    <tr key={c.id}>
                      <td className={cx.td}>{c.nombre}</td>
                      <td className={cx.tdNum}>{c.productos_activos}</td>
                      <td className={cx.td}>
                        <select
                          className={cx.input}
                          value={c.va_a_pantalla ? c.cocina_slug : ''}
                          onChange={(e) => void cambiarPantalla(c, e.target.value)}
                        >
                          <option value="">Ninguna — nadie lo prepara</option>
                          {cocinas.map((k) => (
                            <option key={k.id} value={k.slug}>{k.nombre}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}

        {/* Form producto */}
        <Panel title={editId ? 'Editar producto' : 'Nuevo producto'}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Field label="Nombre">
              <input className={cx.input} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </Field>
            <Field label="Precio ($)">
              <input className={cx.input} type="number" value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value })} />
            </Field>
            <Field label="Categoría">
              <select className={cx.input} value={form.categoria_id} onChange={(e) => setForm({ ...form, categoria_id: e.target.value })}>
                <option value="">— Sin categoría —</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </Field>
            <div className="flex flex-col gap-1.5">
              <span className={cx.label}>IVA</span>
              <label className="flex items-center gap-2 text-sm text-sa-green-ink h-[42px]">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-sa-green"
                  checked={form.iva_incluido}
                  onChange={(e) => setForm({ ...form, iva_incluido: e.target.checked })}
                />
                IVA incluido en el precio
              </label>
            </div>
          </div>

          {/* La descripción va a lo ancho: es lo único de este formulario que
              se escribe en prosa, y en una columna estrecha no se ve lo que
              se lleva escrito. */}
          <div className="mt-4">
            <Field label="Descripción (la que lee el cliente en el kiosko y en la web)">
              <textarea
                className={`${cx.input} resize-y min-h-[72px]`}
                rows={2}
                value={form.descripcion}
                placeholder="Proteína de vainilla, leche de coco, mango, piña…"
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              />
            </Field>
            <p className={`text-xs mt-1 ${form.descripcion.length > DESCRIPCION_COMODA ? 'text-sa-strawberry' : cx.muted}`}>
              {form.descripcion.length === 0
                ? 'Opcional. Sin descripción, la tarjeta solo muestra el nombre y el precio.'
                : form.descripcion.length > DESCRIPCION_COMODA
                  ? `${form.descripcion.length} caracteres — la tarjeta del kiosko corta a dos líneas, así que lo de más no se va a leer.`
                  : `${form.descripcion.length} de ~${DESCRIPCION_COMODA} caracteres cómodos.`}
            </p>
          </div>

          <div className="flex gap-2 mt-4">
            <button className={cx.btnPrimary} disabled={guardando || !form.nombre.trim()} onClick={() => void guardarProducto()}>
              {guardando ? 'Guardando…' : editId ? 'Guardar cambios' : 'Crear producto'}
            </button>
            {editId && <button className={cx.btnSec} onClick={cancelarEdicion}>Cancelar</button>}
          </div>
        </Panel>

        {/* Tabla productos */}
        <div>
          <h3 className={`${cx.h3} mb-4`}>Productos</h3>
          {productos.length === 0 ? (
            <Panel><p className={cx.muted}>No hay productos activos.</p></Panel>
          ) : (
            <div className={cx.tableWrap}>
              <table className={cx.table}>
                <thead>
                  <tr className={cx.thead}>
                    <th className={cx.th}>Foto</th>
                    <th className={cx.th}>Nombre</th>
                    <th className={cx.th}>Categoría</th>
                    <th className={cx.th}>Onzas</th>
                    <th className={cx.thNum}>Precio</th>
                    <th className={cx.th}>Activo</th>
                    <th className={cx.thNum}>Acciones</th>
                  </tr>
                </thead>
                <tbody className={cx.tbody}>
                  {productos.map((p) => (
                    <tr key={p.id} className={cx.tr}>
                      <td className={cx.td}>
                        <div className="flex items-center gap-2">
                          {p.imagen_url ? (
                            <img
                              src={p.imagen_url}
                              alt={p.nombre}
                              className="w-12 h-12 rounded-sa object-cover border border-sa-green-ink/10"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-sa bg-sa-cream-soft border border-dashed border-sa-green-ink/15 flex items-center justify-center text-lg text-sa-green-ink/30">
                              📷
                            </div>
                          )}
                          <div className="flex flex-col gap-1">
                            <label className="px-2 py-1 text-[11px] font-medium border border-sa-green-ink/15 rounded-lg hover:bg-sa-cream-soft text-sa-green-ink cursor-pointer whitespace-nowrap">
                              {subiendoFoto === p.id ? 'Subiendo…' : p.imagen_url ? 'Cambiar' : 'Subir'}
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                disabled={subiendoFoto === p.id}
                                onChange={(e) => {
                                  void handleFoto(p, e.target.files?.[0])
                                  e.target.value = ''
                                }}
                              />
                            </label>
                            {p.imagen_url && (
                              <button
                                onClick={() => void handleQuitarFoto(p)}
                                className="px-2 py-1 text-[11px] font-medium text-sa-strawberry hover:underline whitespace-nowrap"
                              >
                                Quitar
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className={cx.td}>
                        <span className="font-medium">{p.nombre}</span>
                        {/* Se pinta debajo del nombre y no en su propia
                            columna: sin descripción, la fila tiene que
                            saltar a la vista, no obligar a buscar en una
                            columna que se fue detrás del scroll. */}
                        {p.descripcion ? (
                          <div className="text-xs text-sa-green-ink/50 mt-0.5 max-w-[28rem]">
                            {p.descripcion}
                          </div>
                        ) : (
                          <div className="text-xs text-sa-green-ink/30 mt-0.5 italic">
                            sin descripción
                          </div>
                        )}
                      </td>
                      <td className={cx.td}>
                        <select
                          className={`${cx.input} !py-1.5 text-xs`}
                          style={{ minWidth: 150 }}
                          value={p.categoria_id ?? ''}
                          disabled={moviendoCategoria === p.id}
                          onChange={(e) => void moverCategoria(p, e.target.value)}
                        >
                          <option value="">— Sin categoría —</option>
                          {categorias.map((c) => (
                            <option key={c.id} value={c.id}>{c.nombre}</option>
                          ))}
                        </select>
                      </td>
                      <td className={cx.td}>
                        <select
                          className={`${cx.input} !py-1.5 text-xs`}
                          style={{ minWidth: 84 }}
                          value={p.onzas ?? ''}
                          disabled={cambiandoOnzas === p.id}
                          onChange={(e) => void cambiarOnzas(p, e.target.value)}
                        >
                          <option value="">—</option>
                          <option value="12">12 oz</option>
                          <option value="16">16 oz</option>
                          <option value="20">20 oz</option>
                          <option value="24">24 oz</option>
                        </select>
                      </td>
                      <td className={cx.tdNum}>{mxn(p.precio)}</td>
                      <td className={cx.td}><Chip tone={p.activo ? 'si' : 'no'}>{p.activo ? 'Sí' : 'No'}</Chip></td>
                      <td className={cx.tdNum}>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => editar(p)}
                            className="px-3 py-1.5 text-xs font-medium border border-sa-green-ink/15 rounded-lg hover:bg-sa-cream-soft text-sa-green-ink"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => void handleDesactivar(p)}
                            className="px-3 py-1.5 text-xs font-medium border border-sa-strawberry/30 rounded-lg hover:bg-sa-strawberry/10 text-sa-strawberry"
                          >
                            Desactivar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Form categoría */}
        <Panel title="Nueva categoría">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Nombre">
              <input className={cx.input} value={catNombre} onChange={(e) => setCatNombre(e.target.value)} />
            </Field>
            <Field label="Cocina / estación">
              <select className={cx.input} value={catCocinaId} onChange={(e) => setCatCocinaId(e.target.value)}>
                <option value="">— Elige cocina —</option>
                {cocinas.map((k) => (
                  <option key={k.id} value={k.id}>{k.nombre}</option>
                ))}
              </select>
            </Field>
          </div>
          <button
            className={`${cx.btnPrimary} mt-4`}
            disabled={guardandoCat || !catNombre.trim() || !catCocinaId}
            onClick={() => void guardarCategoria()}
          >
            {guardandoCat ? 'Guardando…' : 'Crear categoría'}
          </button>
        </Panel>
      </div>
    </div>
  )
}
