import { useEffect, useState } from 'react'
import { sb } from '../lib/sb'
import {
  obtenerSaludSistema, listarConfiguracionesKiosko, actualizarConfiguracionKiosko,
  reconciliarPagos, expirarOrdenesKiosko,
  datosDelTicket, guardarDatosDelTicket,
  type SaludSistema, type ResultadoReconciliacion, type DatosDelTicket,
} from '@lily/supabase'
import type { ConfiguracionKiosko, ModoPagoKiosko } from '@lily/types'
import { PageHeader, Loading, ErrorMsg, OkMsg, Panel, Field, cx, Chip } from '../ui'
import { BotonActualizarPantallas } from '../BotonActualizarPantallas'
import { mensajeDeError } from '@lily/utils'

interface Indicador {
  label: string
  valor: number
  tono: 'si' | 'no' | 'neutral'
  ayuda: string
}

function construirIndicadores(salud: SaludSistema): Indicador[] {
  return [
    {
      label: 'Pagos pendientes/procesando', valor: salud.pagosPendientes,
      tono: salud.pagosPendientes > 0 ? 'no' : 'si',
      ayuda: 'Intentos de pago sin resolver todavía. Se resuelven solos por reconciliación o webhook.',
    },
    {
      label: 'Pagos con estado desconocido', valor: salud.pagosDesconocidos,
      tono: salud.pagosDesconocidos > 0 ? 'no' : 'si',
      ayuda: 'Requieren revisión — la reconciliación los toma en cuenta, pero uno viejo merece mirarse a mano.',
    },
    {
      label: 'Órdenes esperando pago en caja', valor: salud.ordenesEsperandoCaja,
      tono: 'neutral',
      ayuda: 'Clientes con folio/código en mano que todavía no pasan a pagar. Normal tener algunas.',
    },
    {
      label: 'Órdenes expiradas (24h)', valor: salud.ordenesExpiradas24h,
      tono: salud.ordenesExpiradas24h > 5 ? 'no' : 'neutral',
      ayuda: 'Pedidos de kiosko abandonados sin pagar. Muchas seguidas puede indicar que el kiosko confunde al cliente.',
    },
    {
      label: 'Impresoras conectadas', valor: salud.impresorasConectadas,
      tono: salud.impresorasConectadas < salud.impresorasActivas ? 'no' : 'si',
      ayuda: `De ${salud.impresorasActivas} activas — revisa Impresoras si hay menos conectadas que activas.`,
    },
    {
      label: 'Comandas que fallaron', valor: salud.trabajosImpresionFallidos,
      tono: salud.trabajosImpresionFallidos > 0 ? 'no' : 'si',
      ayuda: 'Agotaron reintentos. Reimprime manual desde Impresoras o Cocina/Barra.',
    },
    {
      label: 'Pedidos sin comanda', valor: salud.pedidosSinComanda,
      tono: salud.pedidosSinComanda > 0 ? 'no' : 'si',
      ayuda: 'Pedido de cocina sin ningún trabajo de impresión — revisa si la estación tiene impresora asignada.',
    },
    {
      label: 'Ventas sin movimiento de inventario', valor: salud.ventasSinMovimientoInventario,
      tono: salud.ventasSinMovimientoInventario > 0 ? 'no' : 'si',
      ayuda: 'Venta confirmada que no descontó insumos — revisa si el producto tiene receta.',
    },
  ]
}

const MODO_LABEL: Record<ModoPagoKiosko, string> = {
  clip: 'Clip (terminal)',
  pagar_en_caja: 'Pagar en caja',
  cajero: 'Cajero (levanta el pedido y cobra ahí mismo)',
  demo: 'Demostración (solo no-producción)',
}

export default function Sistema() {
  const [salud, setSalud] = useState<SaludSistema | null>(null)
  const [configs, setConfigs] = useState<ConfiguracionKiosko[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [reconciliando, setReconciliando] = useState(false)
  const [ultimaReconciliacion, setUltimaReconciliacion] = useState<ResultadoReconciliacion[] | null>(null)

  async function cargar() {
    try {
      const [saludData, configsData] = await Promise.all([
        obtenerSaludSistema(sb), listarConfiguracionesKiosko(sb),
      ])
      setSalud(saludData)
      setConfigs(configsData)
      setError(null)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    void cargar()
    const id = setInterval(() => void cargar(), 30000)
    return () => clearInterval(id)
  }, [])

  async function cambiarModo(sucursalId: string, modo: ModoPagoKiosko) {
    setError(null); setOk(null)
    try {
      await actualizarConfiguracionKiosko(sb, sucursalId, modo)
      setOk('Modo de pago del kiosko actualizado.')
      await cargar()
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }

  async function ejecutarReconciliacion() {
    setReconciliando(true)
    setError(null); setOk(null)
    try {
      const [resultado, expiradas] = await Promise.all([reconciliarPagos(sb), expirarOrdenesKiosko(sb)])
      setUltimaReconciliacion(resultado)
      setOk(`Reconciliación completa: ${resultado.length} corrección(es), ${expiradas} orden(es) expirada(s).`)
      await cargar()
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setReconciliando(false)
    }
  }

  if (cargando || !salud) return <Loading>Cargando estado del sistema…</Loading>

  const indicadores = construirIndicadores(salud)
  const hayCriticos = indicadores.some((i) => i.tono === 'no')

  return (
    <div>
      <PageHeader
        title="Sistema"
        subtitle="Salud operativa, modo de pago del kiosko y reconciliación de pagos"
        action={
          <div className="flex items-center gap-3 flex-wrap justify-end">
            <BotonActualizarPantallas compacto />
            <button className={cx.btnPrimary} onClick={() => void ejecutarReconciliacion()} disabled={reconciliando}>
              {reconciliando ? 'Reconciliando…' : 'Reconciliar ahora'}
            </button>
          </div>
        }
      />

      {error && <ErrorMsg>{error}</ErrorMsg>}
      {ok && <OkMsg>{ok}</OkMsg>}

      {hayCriticos && (
        <div className="mb-6 rounded-sa border border-sa-strawberry bg-sa-strawberry/10 px-5 py-3">
          <p className="text-sa-strawberry font-medium text-sm">⚠ Hay indicadores en advertencia — revísalos abajo.</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {indicadores.map((ind) => (
          <Panel key={ind.label}>
            <div className="flex items-start justify-between mb-2">
              <p className="font-mono text-[11px] uppercase tracking-wide text-sa-green-ink/50 max-w-[70%]">{ind.label}</p>
              <Chip tone={ind.tono}>{ind.tono === 'si' ? 'OK' : ind.tono === 'no' ? '⚠' : '•'}</Chip>
            </div>
            <p className="font-display text-4xl text-sa-green-ink">{ind.valor}</p>
            <p className="text-xs text-sa-green-ink/40 mt-2 leading-snug">{ind.ayuda}</p>
          </Panel>
        ))}
      </div>

      <DatosDelTicketPanel />

      <Panel title="Modo de pago del kiosko (para después)" className="mb-8">
        <p className={`text-sm mb-4 ${cx.muted}`}>
          Hoy se vende desde la <b>caja</b>: el cajero arma el ticket y cobra. El kiosko de
          autoservicio queda para más adelante, y cuando vuelva tendrá que entrar con sesión
          como las demás pantallas. Esto sigue aquí para ese día.
        </p>
        {configs.length === 0 ? (
          <p className={cx.muted}>Sin configuración todavía — se sembró "pagar_en_caja" (seguro) al aplicar la migración.</p>
        ) : (
          <div className="space-y-4">
            {configs.map((c) => (
              <div key={c.sucursal_id} className="flex items-center justify-between flex-wrap gap-3 pb-4 border-b border-sa-green-ink/5 last:border-0 last:pb-0">
                <div>
                  <p className="font-mono text-xs text-sa-green-ink/50">Sucursal {c.sucursal_id.slice(0, 8)}…</p>
                  <p className="font-display text-lg text-sa-green-ink">{MODO_LABEL[c.modo_pago]}</p>
                  <p className="text-xs text-sa-green-ink/40 mt-1">
                    Clip {c.clip_configurado ? 'configurado' : 'sin configurar'} · expira en {c.expira_minutos} min
                  </p>
                </div>
                <div className="flex gap-2">
                  {(['pagar_en_caja', 'clip', 'demo'] as ModoPagoKiosko[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => void cambiarModo(c.sucursal_id, m)}
                      disabled={c.modo_pago === m}
                      className={`px-3 py-2 rounded-sa font-mono text-xs uppercase tracking-wide transition-colors ${
                        c.modo_pago === m
                          ? 'bg-sa-green text-sa-cream cursor-default'
                          : 'border border-sa-green-ink/15 text-sa-green-ink hover:bg-sa-cream-soft'
                      }`}
                    >
                      {MODO_LABEL[m]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className={`text-xs mt-4 ${cx.muted}`}>
          "Demostración" se rechaza automáticamente para cualquier sucursal marcada como producción
          (<code className="px-1 bg-sa-cream-soft rounded">sucursales.es_produccion</code>), y el kiosko
          la ignora también en cualquier build de producción, aunque alguien la fuerce en la base.
        </p>
      </Panel>

      {ultimaReconciliacion && ultimaReconciliacion.length > 0 && (
        <Panel title="Última reconciliación">
          <div className={cx.tableWrap}>
            <table className={cx.table}>
              <thead>
                <tr className={cx.thead}>
                  <th className={cx.th}>Orden</th>
                  <th className={cx.th}>Acción</th>
                  <th className={cx.th}>Detalle</th>
                </tr>
              </thead>
              <tbody className={cx.tbody}>
                {ultimaReconciliacion.map((r, i) => (
                  <tr key={i} className={cx.tr}>
                    <td className={`${cx.td} font-mono text-xs`}>{r.orden_id.slice(0, 8)}…</td>
                    <td className={cx.td}>{r.accion}</td>
                    <td className={cx.td}>{r.detalle}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  )
}


/**
 * Lo que va impreso en la cabecera y el pie del ticket y del corte.
 *
 * Antes vivía en el código (`NEGOCIO_DEFAULT`), y cambiar un teléfono
 * obligaba a recompilar y reinstalar el agente en la PC. Ahora se guarda en
 * la base y viaja dentro de cada trabajo de impresión: el siguiente ticket
 * ya sale con lo que se escriba aquí.
 *
 * Los avisos van uno por renglón porque cada uno tiene que poder leerse
 * solo en el papel: «Por higiene no se hacen cambios» metido en un párrafo
 * no lo lee nadie.
 */
function DatosDelTicketPanel() {
  const [datos, setDatos] = useState<DatosDelTicket | null>(null)
  const [avisos, setAvisos] = useState('')
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({})

  useEffect(() => {
    datosDelTicket(sb)
      .then((d) => { setDatos(d ?? {}); setAvisos((d?.avisos ?? []).join('\n')) })
      .catch((e) => setMsg({ error: mensajeDeError(e) }))
      .finally(() => setCargando(false))
  }, [])

  const campo = (k: keyof DatosDelTicket, label: string, placeholder: string, multilinea = false) => (
    <Field label={label}>
      {multilinea ? (
        <textarea
          className={`${cx.input} min-h-[72px]`}
          value={String(datos?.[k] ?? '')}
          placeholder={placeholder}
          onChange={(e) => setDatos({ ...datos, [k]: e.target.value })}
        />
      ) : (
        <input
          className={cx.input}
          value={String(datos?.[k] ?? '')}
          placeholder={placeholder}
          onChange={(e) => setDatos({ ...datos, [k]: e.target.value })}
        />
      )}
    </Field>
  )

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true); setMsg({})
    try {
      await guardarDatosDelTicket(sb, { ...datos, avisos: avisos.split('\n') })
      setMsg({ ok: 'Guardado. El siguiente ticket ya sale con esto.' })
    } catch (err) {
      setMsg({ error: mensajeDeError(err) })
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Panel title="Lo que dice el ticket" className="mb-8">
      <p className={`text-sm mb-4 ${cx.muted}`}>
        Cabecera y pie del ticket del cliente y del corte de caja. Lo que se deje vacío no se
        imprime. Cambia aquí y el <b>siguiente</b> ticket ya sale así — no hay que tocar la PC.
      </p>
      {msg.error && <ErrorMsg>{msg.error}</ErrorMsg>}
      {msg.ok && <OkMsg>{msg.ok}</OkMsg>}
      {cargando ? (
        <p className={cx.muted}>Cargando…</p>
      ) : (
        <form onSubmit={guardar} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {campo('nombre', 'Nombre', 'Hojaldras Lily')}
          {campo('sucursal', 'Sucursal', 'Miguel Alemán')}
          {campo('direccion', 'Dirección (un renglón por línea)', 'Calle 29-A #183 por Av. 22', true)}
          {campo('telefono', 'Teléfono', '999 926 71 51')}
          {campo('rfc', 'RFC (solo si van a facturar)', '')}
          {campo('leyenda', 'Agradecimiento del pie', '¡Gracias por su compra!')}
          {campo('pieSecundario', 'Segunda línea del pie', 'Encargos al 999 926 71 51')}
          {/* El horario va en su casilla y no entre los avisos: cambia con la
              temporada y los festivos, y así se edita sin tocar las políticas. */}
          {campo('horario', 'Horario (sale como «Horario: …» en el pie)', 'Lun a Dom 7:00 a.m. a 9:00 p.m.')}
          <Field label="Avisos del pie (uno por línea: facturación, políticas)">
            <textarea
              className={`${cx.input} min-h-[72px]`}
              value={avisos}
              placeholder={'Solicita tu factura el mismo día\nPor higiene no se hacen cambios de pan'}
              onChange={(e) => setAvisos(e.target.value)}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-sa-green-ink sm:col-span-2">
            <input
              type="checkbox"
              checked={datos?.mostrarCajero ?? false}
              onChange={(e) => setDatos({ ...datos, mostrarCajero: e.target.checked })}
            />
            Imprimir el nombre de quien cobró
          </label>
          <div className="sm:col-span-2">
            <button className={cx.btnPrimary} disabled={guardando} type="submit">
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      )}
    </Panel>
  )
}
