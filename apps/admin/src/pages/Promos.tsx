import { useEffect, useState } from 'react'
import { sb } from '../lib/sb'
import { listarPromociones, crearPromocion, actualizarPromocion } from '@shake/supabase'
import type { Promocion, TipoPromocion } from '@shake/types'
import { mxn, pct, mensajeDeError } from '@shake/utils'
import { PageHeader, Loading, ErrorMsg, Panel, Field, cx } from '../ui'

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

const FORM_VACIO = {
  nombre: '',
  tipo: 'descuento_pct' as TipoPromocion,
  valor: '',
  categoria_gratis: '',
  vence_en: '',
  sabor_favorito: '',
  dias_semana: [] as number[],
  hora_inicio: '',
  hora_fin: '',
  min_compras_30d: '',
}

export default function Promos() {
  const [promos, setPromos] = useState<Promocion[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)

  async function cargar() {
    try {
      setPromos(await listarPromociones(sb))
      setError(null)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setCargando(false)
    }
  }
  useEffect(() => { void cargar() }, [])

  function toggleDia(d: number) {
    setForm((f) => ({
      ...f,
      dias_semana: f.dias_semana.includes(d) ? f.dias_semana.filter((x) => x !== d) : [...f.dias_semana, d],
    }))
  }

  async function guardar() {
    if (!form.nombre.trim()) return
    setGuardando(true)
    setError(null)
    try {
      await crearPromocion(sb, {
        nombre: form.nombre.trim(),
        descripcion: null,
        tipo: form.tipo,
        valor: form.tipo === 'descuento_pct' ? (Number(form.valor) || 0) / 100 : Number(form.valor) || 0,
        categoria_gratis: form.tipo === 'producto_gratis' ? form.categoria_gratis.trim() || null : null,
        activa: true,
        vence_en: form.vence_en || null,
        sabor_favorito: form.sabor_favorito.trim() || null,
        dias_semana: form.dias_semana.length ? form.dias_semana : null,
        hora_inicio: form.hora_inicio || null,
        hora_fin: form.hora_fin || null,
        min_compras_30d: form.min_compras_30d ? Number(form.min_compras_30d) : null,
      })
      setForm(FORM_VACIO)
      await cargar()
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setGuardando(false)
    }
  }

  async function toggleActiva(p: Promocion) {
    await actualizarPromocion(sb, p.id, { activa: !p.activa })
    await cargar()
  }

  if (cargando) return <Loading>Cargando promociones…</Loading>

  return (
    <div>
      <PageHeader title="Promociones" subtitle="Promociones personalizadas y segmentadas" />

      {error && <ErrorMsg>{error}</ErrorMsg>}

      <div className="space-y-6">
        <Panel title="Nueva promoción personalizada">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Field label="Nombre">
              <input className={cx.input} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </Field>
            <Field label="Tipo">
              <select className={cx.input} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoPromocion })}>
                <option value="descuento_pct">% descuento</option>
                <option value="descuento_monto">$ descuento</option>
                <option value="producto_gratis">Producto gratis</option>
              </select>
            </Field>
            {form.tipo !== 'producto_gratis' && (
              <Field label={form.tipo === 'descuento_pct' ? 'Porcentaje (ej. 10)' : 'Monto ($)'}>
                <input className={cx.input} type="number" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
              </Field>
            )}
            {form.tipo === 'producto_gratis' && (
              <Field label="Categoría gratis (ej. Hojaldras)">
                <input className={cx.input} value={form.categoria_gratis} onChange={(e) => setForm({ ...form, categoria_gratis: e.target.value })} />
              </Field>
            )}
            <Field label="Vence (opcional)">
              <input className={cx.input} type="date" value={form.vence_en} onChange={(e) => setForm({ ...form, vence_en: e.target.value })} />
            </Field>
          </div>

          <h4 className="text-sm font-mono uppercase tracking-wide text-sa-green-ink/60 mt-6 mb-3">Segmentación (todo opcional)</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Field label="Sabor favorito">
              <input className={cx.input} value={form.sabor_favorito} onChange={(e) => setForm({ ...form, sabor_favorito: e.target.value })} />
            </Field>
            <Field label="Frecuencia mín. (compras/30 días)">
              <input className={cx.input} type="number" value={form.min_compras_30d} onChange={(e) => setForm({ ...form, min_compras_30d: e.target.value })} />
            </Field>
            <Field label="Hora inicio">
              <input className={cx.input} type="time" value={form.hora_inicio} onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })} />
            </Field>
            <Field label="Hora fin">
              <input className={cx.input} type="time" value={form.hora_fin} onChange={(e) => setForm({ ...form, hora_fin: e.target.value })} />
            </Field>
          </div>
          <div className="mt-4">
            <span className={cx.label}>Días</span>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {DIAS.map((d, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleDia(i)}
                  className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    form.dias_semana.includes(i)
                      ? 'bg-sa-green-ink text-sa-cream'
                      : 'bg-white text-sa-green-ink/70 border border-sa-green-ink/15 hover:border-sa-green-ink/30'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <button className={`${cx.btnPrimary} mt-6`} disabled={guardando || !form.nombre.trim()} onClick={() => void guardar()}>
            {guardando ? 'Guardando…' : 'Crear promoción'}
          </button>
        </Panel>

        <div>
          <h3 className={`${cx.h3} mb-4`}>Promociones</h3>
          <div className={cx.tableWrap}>
            <table className={cx.table}>
              <thead>
                <tr className={cx.thead}>
                  <th className={cx.th}>Promoción</th>
                  <th className={cx.th}>Beneficio</th>
                  <th className={cx.th}>Segmento</th>
                  <th className={cx.th}>Vence</th>
                  <th className={cx.th}>Activa</th>
                </tr>
              </thead>
              <tbody className={cx.tbody}>
                {promos.map((p) => (
                  <tr key={p.id} className={cx.tr}>
                    <td className={`${cx.td} font-medium`}>{p.nombre}</td>
                    <td className={`${cx.td} font-mono`}>
                      {p.tipo === 'descuento_pct' && `−${pct(p.valor)}`}
                      {p.tipo === 'descuento_monto' && `−${mxn(p.valor)}`}
                      {p.tipo === 'producto_gratis' && `Gratis: ${p.categoria_gratis ?? 'ítem'}`}
                    </td>
                    <td className={`${cx.td} text-xs text-sa-green-ink/60`}>
                      {[
                        p.sabor_favorito && `sabor ${p.sabor_favorito}`,
                        p.dias_semana && p.dias_semana.map((d) => DIAS[d]).join('/'),
                        p.hora_inicio && `${p.hora_inicio}-${p.hora_fin ?? ''}`,
                        p.min_compras_30d && `≥${p.min_compras_30d} compras/30d`,
                      ].filter(Boolean).join(' · ') || 'todos'}
                    </td>
                    <td className={cx.td}>{p.vence_en ?? '—'}</td>
                    <td className={cx.td}>
                      <button
                        onClick={() => void toggleActiva(p)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                          p.activa ? 'bg-sa-mint/30 text-sa-green-ink hover:bg-sa-mint/40' : 'bg-sa-cream-warm text-sa-green-ink/60 hover:bg-sa-cream-warm/70'
                        }`}
                      >
                        {p.activa ? '● Sí' : '○ No'}
                      </button>
                    </td>
                  </tr>
                ))}
                {promos.length === 0 && (
                  <tr><td className={cx.td} colSpan={5}><span className={cx.muted}>Sin promociones aún.</span></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
