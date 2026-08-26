import { useEffect, useState } from 'react'
import { sb } from '../lib/sb'
import {
  listarEmpleadosAdmin, listarRoles, crearEmpleado, actualizarEmpleado,
  type EmpleadoAdmin, type Rol,
} from '@shake/supabase'
import { PageHeader, Loading, ErrorMsg, OkMsg, Panel, Field, cx } from '../ui'
import { mensajeDeError } from '@shake/utils'

const ROL_COLOR: Record<string, string> = {
  Administrador: 'bg-sa-blueberry/15 text-sa-blueberry',
  Gerente: 'bg-sa-green/15 text-sa-green-deep',
  Cajero: 'bg-sa-mint/30 text-sa-green-ink',
  Cocina: 'bg-sa-mango/15 text-sa-mango',
}
const colorRol = (r: string) => ROL_COLOR[r] ?? 'bg-sa-cream-warm text-sa-green-ink/70'

interface FormState { id: string | null; nombre: string; rol_id: string; pin: string }
const VACIO: FormState = { id: null, nombre: '', rol_id: '', pin: '' }

export default function Empleados() {
  const [empleados, setEmpleados] = useState<EmpleadoAdmin[]>([])
  const [roles, setRoles] = useState<Rol[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(VACIO)
  const [guardando, setGuardando] = useState(false)

  async function cargar() {
    try {
      const [emps, rls] = await Promise.all([listarEmpleadosAdmin(sb), listarRoles(sb)])
      setEmpleados(emps)
      setRoles(rls)
      setForm((f) => (f.rol_id ? f : { ...f, rol_id: rls.find((r) => r.nombre === 'Cajero')?.id ?? rls[0]?.id ?? '' }))
      setError(null)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setCargando(false)
    }
  }
  useEffect(() => { void cargar() }, [])

  const editando = form.id !== null

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setOk(null)
    if (!form.nombre.trim()) { setError('El nombre es obligatorio.'); return }
    if (form.pin && !/^\d{4,6}$/.test(form.pin)) { setError('El PIN debe ser de 4 a 6 dígitos.'); return }
    if (!editando && !form.pin) { setError('Asigna un PIN (4–6 dígitos) para que el empleado pueda entrar.'); return }
    setGuardando(true)
    try {
      if (editando) {
        await actualizarEmpleado(sb, form.id!, { nombre: form.nombre, rol_id: form.rol_id, pin: form.pin || undefined })
        setOk('Empleado actualizado.')
      } else {
        await crearEmpleado(sb, { nombre: form.nombre, rol_id: form.rol_id, pin: form.pin })
        setOk('Empleado agregado.')
      }
      setForm({ ...VACIO, rol_id: form.rol_id })
      await cargar()
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setGuardando(false)
    }
  }

  async function toggleActivo(emp: EmpleadoAdmin) {
    setError(null); setOk(null)
    try {
      await actualizarEmpleado(sb, emp.id, { activo: !emp.activo })
      await cargar()
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }

  function editar(emp: EmpleadoAdmin) {
    setForm({ id: emp.id, nombre: emp.nombre, rol_id: emp.rol_id, pin: '' })
    setOk(null); setError(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (cargando) return <Loading>Cargando empleados…</Loading>

  return (
    <div>
      <PageHeader title="Empleados y Roles" subtitle="Da de alta cajeros y gestiona su PIN de acceso" />

      {error && <ErrorMsg>{error}</ErrorMsg>}
      {ok && <OkMsg>{ok}</OkMsg>}

      {/* Formulario alta / edición */}
      <Panel title={editando ? 'Editar empleado' : 'Nuevo empleado'} className="mb-6">
        <form onSubmit={guardar} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <Field label="Nombre">
            <input className={cx.input} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre y apellido" />
          </Field>
          <Field label="Rol">
            <select className={cx.input} value={form.rol_id} onChange={(e) => setForm({ ...form, rol_id: e.target.value })}>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </select>
          </Field>
          <Field label={editando ? 'Nuevo PIN (vacío = no cambia)' : 'PIN (4–6 dígitos)'}>
            <input className={cx.input} value={form.pin} inputMode="numeric" maxLength={6}
              onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '') })} placeholder="••••" />
          </Field>
          <div className="flex gap-2">
            <button className={cx.btnPrimary} disabled={guardando} type="submit">
              {guardando ? 'Guardando…' : editando ? 'Guardar' : 'Agregar'}
            </button>
            {editando && (
              <button type="button" className={cx.btnSec} onClick={() => setForm({ ...VACIO, rol_id: form.rol_id })}>Cancelar</button>
            )}
          </div>
        </form>
        <p className={`text-xs mt-3 ${cx.muted}`}>El PIN se guarda cifrado (hash) en el servidor; nunca se muestra.</p>
      </Panel>

      {/* Tabla */}
      {empleados.length === 0 ? (
        <Panel><p className={cx.muted}>Aún no hay empleados. Agrega el primero arriba.</p></Panel>
      ) : (
        <div className={cx.tableWrap}>
          <table className={cx.table}>
            <thead>
              <tr className={cx.thead}>
                <th className={cx.th}>Empleado</th>
                <th className={cx.th}>Rol</th>
                <th className={cx.th}>PIN</th>
                <th className={cx.th}>Estado</th>
                <th className={cx.thNum}>Acciones</th>
              </tr>
            </thead>
            <tbody className={cx.tbody}>
              {empleados.map((e) => (
                <tr key={e.id} className={cx.tr} style={{ opacity: e.activo ? 1 : 0.55 }}>
                  <td className={cx.td}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-sa-cream-warm flex items-center justify-center text-base font-semibold text-sa-green-ink/70 flex-shrink-0">
                        {e.nombre.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-sa-green-ink">{e.nombre}</span>
                    </div>
                  </td>
                  <td className={cx.td}>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${colorRol(e.rol)}`}>{e.rol}</span>
                  </td>
                  <td className={cx.td}>
                    {e.tiene_pin
                      ? <span className="text-xs font-mono text-sa-green">•••• ✓</span>
                      : <span className="text-xs font-mono text-sa-strawberry">sin PIN</span>}
                  </td>
                  <td className={cx.td}>
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${e.activo ? 'text-sa-green' : 'text-sa-green-ink/40'}`}>
                      <span className={`w-2 h-2 rounded-full ${e.activo ? 'bg-sa-mint' : 'bg-sa-green-ink/30'}`} />
                      {e.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className={cx.tdNum}>
                    <div className="inline-flex gap-2">
                      <button className={cx.btnSec} onClick={() => editar(e)}>Editar</button>
                      <button className={cx.btnSec} onClick={() => void toggleActivo(e)}>
                        {e.activo ? 'Desactivar' : 'Activar'}
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
  )
}
