import { useEffect, useMemo, useState } from 'react'
import { sb } from '../lib/sb'
import {
  listarImpresoras, crearImpresora, actualizarImpresora, activarImpresora, rotarTokenImpresora, listarCocinasParaImpresoras,
  listarTrabajosImpresion, suscribirTrabajosImpresion, reimprimirTrabajo,
  listarAlmacenes, type ImpresoraAdmin,
} from '@shake/supabase'
import type { Cocina, TrabajoImpresion, TipoConexionImpresora, AnchoPapel, EstadoTrabajoImpresion } from '@shake/types'
import { PageHeader, Loading, ErrorMsg, OkMsg, Panel, Field, cx, Chip } from '../ui'
import { mensajeDeError } from '@shake/utils'

interface FormState {
  id: string | null
  nombre: string
  cocina_id: string
  tipo_conexion: TipoConexionImpresora
  ip: string
  puerto: string
  nombre_dispositivo: string
  ancho_papel: AnchoPapel
  copias: string
  corte_automatico: boolean
  buzzer: boolean
}
const VACIO: FormState = {
  id: null, nombre: '', cocina_id: '', tipo_conexion: 'red', ip: '', puerto: '9100',
  nombre_dispositivo: '', ancho_papel: '80mm', copias: '1', corte_automatico: true, buzzer: false,
}

const ESTADO_LABEL: Record<EstadoTrabajoImpresion, string> = {
  pending: 'En espera', claimed: 'Reclamado', printing: 'Imprimiendo', printed: 'Impreso',
  retry: 'Reintentando', failed: 'Falló', cancelled: 'Cancelado',
}
const ESTADO_TONO: Record<EstadoTrabajoImpresion, 'si' | 'no' | 'neutral'> = {
  pending: 'neutral', claimed: 'neutral', printing: 'neutral', printed: 'si',
  retry: 'no', failed: 'no', cancelled: 'neutral',
}

/**
 * El bloque exacto que va en `printers.config.json` del agente.
 *
 * Se entrega armado y no solo el token porque armarlo a mano es donde esto
 * se rompe: el campo que más se olvida es `lenguaje`, y una etiquetadora
 * configurada como ESC/POS no imprime **ni da error** — el trabajo queda
 * marcado como impreso y la comanda desaparece.
 */
function bloqueConfig(t: { nombre: string; token: string; ip: string | null; puerto: number | null }): string {
  const esEtiquetadora = t.ip != null
  return JSON.stringify(
    {
      id: t.nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      descripcion: t.nombre,
      token: t.token,
      interface: esEtiquetadora ? `tcp://${t.ip}:${t.puerto ?? 9100}` : 'printer:NOMBRE_EN_WINDOWS',
      lenguaje: esEtiquetadora ? 'tspl' : 'escpos',
      anchoPapel: '80mm',
      copias: 1,
      corteAutomatico: false,
      buzzer: false,
    },
    null,
    2,
  )
}

export default function Impresoras() {
  const [impresoras, setImpresoras] = useState<ImpresoraAdmin[]>([])
  const [cocinas, setCocinas] = useState<Cocina[]>([])
  const [trabajos, setTrabajos] = useState<TrabajoImpresion[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(VACIO)
  const [guardando, setGuardando] = useState(false)
  // Se guarda junto con la impresora: el token solo sirve acompañado de la
  // IP y del lenguaje, y pedirle a alguien que arme el JSON a mano es la
  // parte donde esto se rompe.
  const [tokenVisible, setTokenVisible] = useState<{ nombre: string; token: string; ip: string | null; puerto: number | null } | null>(null)
  const [filtroEstado, setFiltroEstado] = useState<EstadoTrabajoImpresion | 'todos'>('todos')
  const [sucursalId, setSucursalId] = useState<string | null>(null)

  async function cargar() {
    try {
      const [imps, cocs, trbs, almacenes] = await Promise.all([
        listarImpresoras(sb), listarCocinasParaImpresoras(sb), listarTrabajosImpresion(sb, { limite: 100 }),
        listarAlmacenes(sb),
      ])
      setImpresoras(imps)
      setCocinas(cocs)
      setTrabajos(trbs)
      setSucursalId(almacenes[0]?.sucursal_id ?? null)
      setError(null)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    void cargar()
    const off = suscribirTrabajosImpresion(sb, () => void cargar())
    return off
  }, [])

  const editando = form.id !== null

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setOk(null)
    if (!form.nombre.trim()) { setError('El nombre de la impresora es obligatorio.'); return }
    if (form.tipo_conexion === 'red' && !form.ip.trim()) { setError('Para conexión por red, la IP es obligatoria.'); return }
    if (form.tipo_conexion === 'usb' && !form.nombre_dispositivo.trim()) { setError('Para USB, indica el nombre/ruta del dispositivo.'); return }
    setGuardando(true)
    try {
      const datosComunes = {
        nombre: form.nombre.trim(),
        cocina_id: form.cocina_id || null,
        tipo_conexion: form.tipo_conexion,
        ip: form.tipo_conexion === 'red' ? form.ip.trim() : null,
        puerto: form.tipo_conexion === 'red' ? Number(form.puerto) || 9100 : null,
        nombre_dispositivo: form.tipo_conexion === 'usb' ? form.nombre_dispositivo.trim() : null,
        ancho_papel: form.ancho_papel,
        copias: Math.min(5, Math.max(1, Number(form.copias) || 1)),
        corte_automatico: form.corte_automatico,
        buzzer: form.buzzer,
      }
      if (editando) {
        await actualizarImpresora(sb, form.id!, datosComunes)
        setOk('Impresora actualizada.')
      } else {
        if (!sucursalId) { setError('No hay sucursal configurada todavía.'); setGuardando(false); return }
        const nueva = await crearImpresora(sb, { ...datosComunes, sucursal_id: sucursalId })
        setOk('Impresora agregada. Abajo está su configuración para el agente local.')
        setTokenVisible({
          nombre: datosComunes.nombre,
          token: nueva.agente_token,
          ip: datosComunes.ip,
          puerto: datosComunes.puerto,
        })
      }
      setForm(VACIO)
      await cargar()
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setGuardando(false)
    }
  }

  /**
   * Muestra la configuración que necesita el agente de esa estación.
   *
   * El token no se puede volver a leer —no sale nunca en la lista, es lo
   * único que prueba la identidad de una impresora ante la cola— así que
   * "verlo" es en realidad generar uno nuevo. Por eso avisa: si ya había un
   * agente andando con el anterior, deja de imprimir hasta que se actualice.
   */
  async function rotarToken(imp: ImpresoraAdmin) {
    setError(null); setOk(null)
    if (!window.confirm(
      `Se va a generar un token nuevo para "${imp.nombre}".\n\n` +
      `Si ya hay un agente andando con el token anterior, dejará de imprimir ` +
      `hasta que lo actualices. ¿Continuar?`,
    )) return
    try {
      const nuevoToken = await rotarTokenImpresora(sb, imp.id)
      setTokenVisible({ nombre: imp.nombre, token: nuevoToken, ip: imp.ip, puerto: imp.puerto })
      setOk(`Configuración de "${imp.nombre}" lista abajo.`)
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }

  function editar(imp: ImpresoraAdmin) {
    setForm({
      id: imp.id, nombre: imp.nombre, cocina_id: imp.cocina_id ?? '', tipo_conexion: imp.tipo_conexion,
      ip: imp.ip ?? '', puerto: String(imp.puerto ?? 9100), nombre_dispositivo: imp.nombre_dispositivo ?? '',
      ancho_papel: imp.ancho_papel, copias: String(imp.copias), corte_automatico: imp.corte_automatico, buzzer: imp.buzzer,
    })
    setOk(null); setError(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function toggleActiva(imp: ImpresoraAdmin) {
    setError(null); setOk(null)
    try {
      await activarImpresora(sb, imp.id, !imp.activa)
      await cargar()
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }

  async function reimprimir(trabajo: TrabajoImpresion) {
    setError(null); setOk(null)
    const motivo = window.prompt('Motivo de la reimpresión (opcional):') ?? undefined
    try {
      await reimprimirTrabajo(sb, trabajo.id, { motivo })
      setOk('Reimpresión encolada.')
      await cargar()
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }

  const cocinaNombrePorId = useMemo(
    () => new Map(cocinas.map((c) => [c.id, c.nombre])),
    [cocinas],
  )

  const trabajosFiltrados = useMemo(
    () => (filtroEstado === 'todos' ? trabajos : trabajos.filter((t) => t.estado === filtroEstado)),
    [trabajos, filtroEstado],
  )
  const fallidos = trabajos.filter((t) => t.estado === 'failed').length
  const enCola = trabajos.filter((t) => ['pending', 'claimed', 'printing', 'retry'].includes(t.estado)).length

  if (cargando) return <Loading>Cargando impresoras…</Loading>

  return (
    <div>
      <PageHeader
        title="Impresoras"
        subtitle="Configura las impresoras térmicas por estación y vigila la cola de comandas"
      />

      {error && <ErrorMsg>{error}</ErrorMsg>}
      {ok && <OkMsg>{ok}</OkMsg>}

      {(fallidos > 0) && (
        <div className="mb-6 rounded-sa border border-sa-strawberry bg-sa-strawberry/10 px-5 py-3">
          <p className="text-sa-strawberry font-medium text-sm">
            ⚠ {fallidos} comanda{fallidos === 1 ? '' : 's'} no se pudo imprimir tras varios intentos. Revisa la cola abajo y reimprime manualmente.
          </p>
        </div>
      )}

      {/* Formulario alta / edición */}
      <Panel title={editando ? 'Editar impresora' : 'Nueva impresora'} className="mb-6">
        <form onSubmit={guardar} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Field label="Nombre">
            <input className={cx.input} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Impresora Cocina" />
          </Field>
          <Field label="Estación">
            <select className={cx.input} value={form.cocina_id} onChange={(e) => setForm({ ...form, cocina_id: e.target.value })}>
              <option value="">— Sin asignar —</option>
              {cocinas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </Field>
          <Field label="Conexión">
            <select className={cx.input} value={form.tipo_conexion} onChange={(e) => setForm({ ...form, tipo_conexion: e.target.value as TipoConexionImpresora })}>
              <option value="red">Red (IP)</option>
              <option value="usb">USB</option>
            </select>
          </Field>
          <Field label="Ancho de papel">
            <select className={cx.input} value={form.ancho_papel} onChange={(e) => setForm({ ...form, ancho_papel: e.target.value as AnchoPapel })}>
              <option value="80mm">80mm</option>
              <option value="58mm">58mm</option>
            </select>
          </Field>

          {form.tipo_conexion === 'red' ? (
            <>
              <Field label="IP">
                <input className={cx.input} value={form.ip} onChange={(e) => setForm({ ...form, ip: e.target.value })} placeholder="192.168.1.50" />
              </Field>
              <Field label="Puerto">
                <input className={cx.input} value={form.puerto} inputMode="numeric" onChange={(e) => setForm({ ...form, puerto: e.target.value.replace(/\D/g, '') })} placeholder="9100" />
              </Field>
            </>
          ) : (
            <Field label="Dispositivo (USB)">
              <input className={cx.input} value={form.nombre_dispositivo} onChange={(e) => setForm({ ...form, nombre_dispositivo: e.target.value })} placeholder="/dev/usb/lp0 o nombre compartido en Windows" />
            </Field>
          )}

          <Field label="Copias">
            <input className={cx.input} value={form.copias} inputMode="numeric" onChange={(e) => setForm({ ...form, copias: e.target.value.replace(/\D/g, '') })} />
          </Field>
          <div className="flex items-end gap-4 pb-2.5">
            <label className="flex items-center gap-2 text-sm text-sa-green-ink">
              <input type="checkbox" checked={form.corte_automatico} onChange={(e) => setForm({ ...form, corte_automatico: e.target.checked })} />
              Corte automático
            </label>
            <label className="flex items-center gap-2 text-sm text-sa-green-ink">
              <input type="checkbox" checked={form.buzzer} onChange={(e) => setForm({ ...form, buzzer: e.target.checked })} />
              Buzzer
            </label>
          </div>

          <div className="flex gap-2 items-end">
            <button className={cx.btnPrimary} disabled={guardando} type="submit">
              {guardando ? 'Guardando…' : editando ? 'Guardar' : 'Agregar'}
            </button>
            {editando && (
              <button type="button" className={cx.btnSec} onClick={() => setForm(VACIO)}>Cancelar</button>
            )}
          </div>
        </form>
        <p className={`text-xs mt-3 ${cx.muted}`}>
          El token del agente se genera solo al crear la impresora — cópialo entonces y pégalo en
          <code className="mx-1 px-1 bg-sa-cream-soft rounded">printers.config.json</code>
          del agente local de esa estación (ver docs/instalacion-agente-impresion.md).
        </p>
      </Panel>

      {tokenVisible && (
        <Panel className="mb-6 border-sa-mint">
          <p className="text-sm text-sa-green-ink mb-1">
            Configuración de <b>{tokenVisible.nombre}</b> para el agente local.
          </p>
          <p className={`text-xs mb-3 ${cx.muted}`}>
            Cópiala ahora: el token no se vuelve a mostrar. Va en{' '}
            <code className="px-1 bg-sa-cream-soft rounded">printers.config.json</code>, dentro de
            los corchetes, separada de las demás por una coma.
          </p>
          <pre className="bg-sa-green-ink text-sa-cream px-4 py-3 rounded-sa text-xs font-mono overflow-x-auto whitespace-pre">
{bloqueConfig(tokenVisible)}
          </pre>
          <div className="flex gap-2 mt-3">
            <button
              className={cx.btnPrimary}
              onClick={() => void navigator.clipboard.writeText(bloqueConfig(tokenVisible))}
            >
              Copiar
            </button>
            <button className={cx.btnSec} onClick={() => setTokenVisible(null)}>Cerrar</button>
          </div>
        </Panel>
      )}

      {/* Tabla de impresoras */}
      {impresoras.length === 0 ? (
        <Panel className="mb-8"><p className={cx.muted}>Aún no hay impresoras configuradas. Agrega la primera arriba.</p></Panel>
      ) : (
        <div className={`${cx.tableWrap} mb-8`}>
          <table className={cx.table}>
            <thead>
              <tr className={cx.thead}>
                <th className={cx.th}>Impresora</th>
                <th className={cx.th}>Estación</th>
                <th className={cx.th}>Conexión</th>
                <th className={cx.th}>Conectada</th>
                <th className={cx.th}>Última impresión</th>
                <th className={cx.thAcciones}>Acciones</th>
              </tr>
            </thead>
            <tbody className={cx.tbody}>
              {impresoras.map((imp) => (
                <tr key={imp.id} className={cx.tr} style={{ opacity: imp.activa ? 1 : 0.55 }}>
                  <td className={cx.td}>
                    <span className="font-medium">{imp.nombre}</span>
                    <div className="text-xs font-mono text-sa-green-ink/40">{imp.ancho_papel} · {imp.copias} copia{imp.copias > 1 ? 's' : ''}</div>
                  </td>
                  <td className={cx.td}>{cocinaNombrePorId.get(imp.cocina_id ?? '') ?? <span className={cx.muted}>Sin asignar</span>}</td>
                  <td className={cx.td}>
                    {imp.tipo_conexion === 'red' ? `${imp.ip}:${imp.puerto}` : imp.nombre_dispositivo}
                  </td>
                  <td className={cx.td}>
                    {imp.conectada ? <Chip tone="si">🟢 En línea</Chip> : <Chip tone="no">⚪ Desconectada</Chip>}
                  </td>
                  <td className={cx.td}>
                    {imp.ultima_impresion ? new Date(imp.ultima_impresion).toLocaleString('es-MX') : <span className={cx.muted}>—</span>}
                  </td>
                  <td className={cx.tdAcciones}>
                    <div className="inline-flex gap-2">
                      <button className={cx.btnPrimary} onClick={() => void rotarToken(imp)}>
                        Conectar agente
                      </button>
                      <button className={cx.btnSec} onClick={() => editar(imp)}>Editar</button>
                      <button className={cx.btnSec} onClick={() => void toggleActiva(imp)}>{imp.activa ? 'Desactivar' : 'Activar'}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Cola de impresión */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h3 className={cx.h3}>Cola de impresión ({enCola} activa{enCola === 1 ? '' : 's'})</h3>
        <select className={cx.input} style={{ width: 200 }} value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value as EstadoTrabajoImpresion | 'todos')}>
          <option value="todos">Todos los estados</option>
          {(Object.keys(ESTADO_LABEL) as EstadoTrabajoImpresion[]).map((s) => (
            <option key={s} value={s}>{ESTADO_LABEL[s]}</option>
          ))}
        </select>
      </div>

      {trabajosFiltrados.length === 0 ? (
        <Panel><p className={cx.muted}>No hay trabajos con ese filtro.</p></Panel>
      ) : (
        <div className={cx.tableWrap}>
          <table className={cx.table}>
            <thead>
              <tr className={cx.thead}>
                <th className={cx.th}>Folio</th>
                <th className={cx.th}>Estado</th>
                <th className={cx.th}>Intentos</th>
                <th className={cx.th}>Último error</th>
                <th className={cx.th}>Creado</th>
                <th className={cx.thNum}>Acciones</th>
              </tr>
            </thead>
            <tbody className={cx.tbody}>
              {trabajosFiltrados.map((t) => {
                const payload = t.payload as { folio?: number; estacion?: string }
                return (
                  <tr key={t.id} className={cx.tr}>
                    <td className={cx.td}>
                      #{payload.folio ?? '—'}
                      {t.numero_copia > 1 && <span className="ml-2 text-xs text-sa-blueberry">copia {t.numero_copia}</span>}
                      <div className="text-xs text-sa-green-ink/40">{payload.estacion ?? '—'}</div>
                    </td>
                    <td className={cx.td}><Chip tone={ESTADO_TONO[t.estado]}>{ESTADO_LABEL[t.estado]}</Chip></td>
                    <td className={cx.td}>{t.intentos}/{t.max_intentos}</td>
                    <td className={cx.td}>
                      {t.error_ultimo ? <span className="text-sa-strawberry text-xs">{t.error_ultimo}</span> : <span className={cx.muted}>—</span>}
                    </td>
                    <td className={cx.td}>{new Date(t.created_at).toLocaleString('es-MX')}</td>
                    <td className={cx.tdNum}>
                      <button className={cx.btnSec} onClick={() => void reimprimir(t)}>Reimprimir</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
