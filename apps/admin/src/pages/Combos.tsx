import { useEffect, useMemo, useState } from 'react'
import { sb } from '../lib/sb'
import {
  listarCombos,
  listarProductos,
  listarCategorias,
  crearCombo,
  actualizarProducto,
  agregarComponenteCombo,
  quitarComponenteCombo,
  moverCategoriaProducto,
} from '@shake/supabase'
import type { ComboVista, Producto, Categoria } from '@shake/types'
import { mxn, mensajeDeError } from '@shake/utils'
import { Panel, PageHeader, Field, Loading, ErrorMsg, OkMsg, Chip, cx } from '../ui'

interface ComponenteCombo {
  producto_id: string
  nombre: string
  cantidad: number
  activo: boolean
}

interface FormCombo {
  nombre: string
  precio: string
  categoria_id: string
}

const FORM_VACIO: FormCombo = { nombre: '', precio: '', categoria_id: '' }

function componentesDe(combo: ComboVista): ComponenteCombo[] {
  const raw = combo.componentes
  if (!Array.isArray(raw)) return []
  return raw as unknown as ComponenteCombo[]
}

export default function Combos() {
  const [combos, setCombos] = useState<ComboVista[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const [form, setForm] = useState<FormCombo>(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)

  const [comboEditando, setComboEditando] = useState<string | null>(null)
  const [nuevoComponenteId, setNuevoComponenteId] = useState('')
  const [nuevaCantidad, setNuevaCantidad] = useState('1')
  const [guardandoComponente, setGuardandoComponente] = useState(false)
  const [paqueteEdit, setPaqueteEdit] = useState<{ id: string; nombre: string; precio: string } | null>(null)

  async function guardarPaquete() {
    if (!paqueteEdit || !paqueteEdit.nombre.trim()) return
    setGuardando(true)
    setError(null)
    try {
      await actualizarProducto(sb, paqueteEdit.id, {
        nombre: paqueteEdit.nombre.trim(),
        precio: Number(paqueteEdit.precio) || 0,
      })
      setPaqueteEdit(null)
      setOk('Paquete guardado')
      await cargar()
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setGuardando(false)
    }
  }

  async function alternarPaquete(p: Producto) {
    setError(null)
    try {
      await actualizarProducto(sb, p.id, { activo: !p.activo })
      await cargar()
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }

  const catPorId = useMemo(() => {
    const m = new Map<string, Categoria>()
    categorias.forEach((c) => m.set(c.id, c))
    return m
  }, [categorias])

  /** Estación (cocina) de un producto, vía su categoría. */
  const cocinaDe = (productoId: string | null | undefined): string | null => {
    if (!productoId) return null
    const p = productos.find((x) => x.id === productoId)
    return p?.categoria_id ? catPorId.get(p.categoria_id)?.cocina_id ?? null : null
  }

  /**
   * La estación a la que ya quedó comprometido un combo: la de su categoría
   * o, si no tiene, la de su primer componente. El servidor exige que todos
   * los componentes sean de la misma (v1 no arma combos que crucen barra y
   * cocina), así que conviene saberla antes de ofrecer la lista.
   */
  const cocinaDelCombo = (combo: ComboVista | undefined): string | null => {
    if (!combo) return null
    const porCategoria = combo.categoria_id ? catPorId.get(combo.categoria_id)?.cocina_id : null
    if (porCategoria) return porCategoria
    const primero = componentesDe(combo)[0]
    return primero ? cocinaDe(primero.producto_id) : null
  }

  /**
   * Productos que se pueden agregar como componente.
   *
   * Antes la lista ofrecía TODO lo activo y el servidor rechazaba con un
   * error que además se veía como "[object Object]": elegir "Americano" en
   * un combo de alimentos era un callejón sin salida sin explicación. Ahora
   * se ofrece solo lo que va a pasar: nada de combos (no hay anidados),
   * nada de extras (leches y "Sin leche" no son componentes) y solo la
   * estación a la que el combo ya pertenece.
   */
  const productosParaComponente = useMemo(() => {
    const combo = combos.find((c) => c.id === comboEditando)
    const cocina = cocinaDelCombo(combo)
    return productos.filter((p) => {
      if (p.es_combo || p.es_extra) return false
      if (!cocina) return true
      return cocinaDe(p.id) === cocina
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productos, combos, comboEditando, catPorId])

  async function cargar() {
    try {
      const [cs, ps, cats] = await Promise.all([listarCombos(sb), listarProductos(sb), listarCategorias(sb)])
      setCombos(cs)
      setProductos(ps)
      setCategorias(cats)
      setError(null)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    void cargar()
  }, [])

  async function guardarCombo() {
    if (!form.nombre.trim()) return
    setGuardando(true)
    setError(null)
    try {
      await crearCombo(sb, {
        nombre: form.nombre.trim(),
        precio: Number(form.precio) || 0,
        categoria_id: form.categoria_id || null,
      })
      setForm(FORM_VACIO)
      setOk('Combo creado. Ahora agrégale sus componentes abajo.')
      await cargar()
      setTimeout(() => setOk(null), 4000)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setGuardando(false)
    }
  }

  async function toggleActivo(combo: ComboVista) {
    if (!combo.id) return
    setError(null)
    try {
      await actualizarProducto(sb, combo.id, { activo: !combo.activo })
      await cargar()
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }

  async function agregarComponente(comboId: string) {
    if (!nuevoComponenteId || !(Number(nuevaCantidad) > 0)) return
    setGuardandoComponente(true)
    setError(null)
    try {
      // El formulario prometía "se fija con el primer componente" y nadie
      // lo cumplía: el combo se quedaba sin categoría para siempre y así
      // no sale bajo ningún botón del kiosko. Aquí se cumple de verdad.
      const combo = combos.find((c) => c.id === comboId)
      const componente = productos.find((p) => p.id === nuevoComponenteId)
      if (combo && !combo.categoria_id && componente?.categoria_id) {
        await moverCategoriaProducto(sb, comboId, componente.categoria_id)
      }
      await agregarComponenteCombo(sb, comboId, nuevoComponenteId, Number(nuevaCantidad))
      setNuevoComponenteId('')
      setNuevaCantidad('1')
      await cargar()
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setGuardandoComponente(false)
    }
  }

  async function quitarComponente(comboId: string, productoId: string) {
    setError(null)
    try {
      await quitarComponenteCombo(sb, comboId, productoId)
      await cargar()
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }

  if (cargando) return <Loading>Cargando combos…</Loading>

  const combo = combos.find((c) => c.id === comboEditando) ?? null
  // Paquetes tipo "Paquete Americano": viven en la categoría Combos pero no
  // son combos de componentes — sus opciones son extras del producto.
  const paquetes = productos.filter(
    (p) => !p.es_combo && p.categoria_id && catPorId.get(p.categoria_id)?.nombre === 'Combos',
  )

  return (
    <div>
      <PageHeader
        title="Combos"
        subtitle="Productos que agrupan otros productos ya existentes con un precio propio — se venden y descuentan de inventario exactamente igual que cualquier producto."
      />

      {error && <ErrorMsg>{error}</ErrorMsg>}
      {ok && <OkMsg>{ok}</OkMsg>}

      <div className="space-y-6">
        {paquetes.length > 0 && (
          <Panel title="Paquetes (armados con extras)">
            <p className={`${cx.muted} text-sm mb-4`}>
              Estos no son combos de componentes: son un producto normal cuyas
              opciones (el americano frío o caliente, la galleta) se ofrecen
              como extras. Aquí cambias nombre, precio y si está a la venta;
              sus opciones se administran en <b>Extras → Dónde se ofrece</b>.
              Es también la única forma hoy de vender juntos barra y cocina
              (café + galletas) en un solo botón.
            </p>
            <div className="space-y-2">
              {paquetes.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center gap-3 bg-sa-cream-soft rounded-sa px-4 py-3">
                  {paqueteEdit?.id === p.id ? (
                    <>
                      <input
                        className={cx.input}
                        style={{ maxWidth: 260 }}
                        value={paqueteEdit.nombre}
                        onChange={(e) => setPaqueteEdit({ ...paqueteEdit, nombre: e.target.value })}
                      />
                      <input
                        className={cx.input}
                        style={{ maxWidth: 110 }}
                        type="number"
                        value={paqueteEdit.precio}
                        onChange={(e) => setPaqueteEdit({ ...paqueteEdit, precio: e.target.value })}
                      />
                      <button className={cx.btnPrimary} disabled={guardando} onClick={() => void guardarPaquete()}>
                        Guardar
                      </button>
                      <button className={cx.btnSec} onClick={() => setPaqueteEdit(null)}>Cancelar</button>
                    </>
                  ) : (
                    <>
                      <span className="font-semibold text-sm text-sa-green-ink">{p.nombre}</span>
                      <span className="font-mono text-sm text-sa-green-ink/60">{mxn(p.precio)}</span>
                      <Chip tone={p.activo ? 'si' : 'no'}>{p.activo ? 'A la venta' : 'Apagado'}</Chip>
                      <span className="flex-1" />
                      <button
                        className={cx.btnSec}
                        onClick={() => setPaqueteEdit({ id: p.id, nombre: p.nombre, precio: String(p.precio) })}
                      >
                        Editar
                      </button>
                      <button className={cx.btnSec} onClick={() => void alternarPaquete(p)}>
                        {p.activo ? 'Apagar' : 'Prender'}
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </Panel>
        )}

        <Panel title="Nuevo combo">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Field label="Nombre">
              <input className={cx.input} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </Field>
            <Field label="Precio ($)">
              <input className={cx.input} type="number" value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value })} />
            </Field>
            <Field label="Categoría">
              <select className={cx.input} value={form.categoria_id} onChange={(e) => setForm({ ...form, categoria_id: e.target.value })}>
                <option value="">— Sin categoría (se fija con el primer componente) —</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </Field>
          </div>
          <p className={`${cx.muted} text-xs mt-2`}>
            Todos los componentes de un combo deben ser de la misma estación (cocina) — no se puede mezclar, por
            ejemplo, una hojaldra con una bebida en el mismo combo.
          </p>
          <div className="flex gap-2 mt-4">
            <button className={cx.btnPrimary} disabled={guardando || !form.nombre.trim()} onClick={() => void guardarCombo()}>
              {guardando ? 'Guardando…' : 'Crear combo'}
            </button>
          </div>
        </Panel>

        <div>
          <h3 className={`${cx.h3} mb-4`}>Combos existentes</h3>
          {combos.length === 0 ? (
            <Panel><p className={cx.muted}>No hay combos todavía.</p></Panel>
          ) : (
            <div className={cx.tableWrap}>
              <table className={cx.table}>
                <thead>
                  <tr className={cx.thead}>
                    <th className={cx.th}>Nombre</th>
                    <th className={cx.th}>Categoría</th>
                    <th className={cx.thNum}>Precio</th>
                    <th className={cx.thNum}>Costo</th>
                    <th className={cx.thNum}>Margen</th>
                    <th className={cx.th}>Componentes</th>
                    <th className={cx.th}>Activo</th>
                    <th className={cx.thNum}>Acciones</th>
                  </tr>
                </thead>
                <tbody className={cx.tbody}>
                  {combos.map((c) => {
                    const comps = componentesDe(c)
                    return (
                      <tr key={c.id} className={cx.tr}>
                        <td className={`${cx.td} font-medium`}>{c.nombre}</td>
                        <td className={cx.td}>{c.categoria_id ? catPorId.get(c.categoria_id)?.nombre ?? '—' : '—'}</td>
                        <td className={cx.tdNum}>{mxn(c.precio ?? 0)}</td>
                        <td className={cx.tdNum}>{c.costo_total != null ? mxn(c.costo_total) : '—'}</td>
                        <td className={cx.tdNum}>
                          {c.margen != null ? mxn(c.margen) : '—'}
                          {c.margen_pct != null && <span className={`${cx.muted} ml-1`}>({(c.margen_pct * 100).toFixed(0)}%)</span>}
                        </td>
                        <td className={cx.td}>
                          {comps.length === 0 ? (
                            <span className={cx.muted}>Sin componentes</span>
                          ) : (
                            <div className="flex flex-col gap-0.5">
                              {comps.map((comp) => (
                                <span key={comp.producto_id} className={comp.activo ? '' : 'text-sa-strawberry'}>
                                  {comp.cantidad}× {comp.nombre}{!comp.activo && ' (inactivo)'}
                                </span>
                              ))}
                            </div>
                          )}
                          {c.todos_componentes_activos === false && (
                            <div className="mt-1"><Chip tone="no">⚠ tiene un componente inactivo</Chip></div>
                          )}
                        </td>
                        <td className={cx.td}><Chip tone={c.activo ? 'si' : 'no'}>{c.activo ? 'Sí' : 'No'}</Chip></td>
                        <td className={cx.tdNum}>
                          <div className="flex items-center justify-end gap-2">
                            <button className={cx.btnSec} onClick={() => setComboEditando(comboEditando === c.id ? null : c.id)}>
                              {comboEditando === c.id ? 'Cerrar' : 'Componentes'}
                            </button>
                            <button className={cx.btnSec} onClick={() => void toggleActivo(c)}>
                              {c.activo ? 'Desactivar' : 'Activar'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {combo && combo.id && (
          <Panel title={`Componentes de "${combo.nombre}"`}>
            <div className="space-y-2 mb-4">
              {componentesDe(combo).length === 0 && <p className={cx.muted}>Este combo todavía no tiene componentes.</p>}
              {componentesDe(combo).map((comp) => (
                <div key={comp.producto_id} className="flex items-center justify-between gap-3 py-1.5 border-b border-sa-green-ink/5 last:border-0">
                  <span>{comp.cantidad}× {comp.nombre}{!comp.activo && <span className="text-sa-strawberry"> (inactivo)</span>}</span>
                  <button className={cx.btnSec} onClick={() => void quitarComponente(combo.id as string, comp.producto_id)}>
                    Quitar
                  </button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Agregar producto">
                <select className={cx.input} value={nuevoComponenteId} onChange={(e) => setNuevoComponenteId(e.target.value)}>
                  <option value="">— Selecciona —</option>
                  {productosParaComponente.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              </Field>
              <Field label="Cantidad">
                <input className={cx.input} style={{ width: 90 }} type="number" min="1" value={nuevaCantidad} onChange={(e) => setNuevaCantidad(e.target.value)} />
              </Field>
              <button
                className={cx.btnPrimary}
                disabled={guardandoComponente || !nuevoComponenteId}
                onClick={() => void agregarComponente(combo.id as string)}
              >
                {guardandoComponente ? 'Agregando…' : '+ Agregar'}
              </button>
            </div>
          </Panel>
        )}
      </div>
    </div>
  )
}
