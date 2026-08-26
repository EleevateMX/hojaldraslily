import { useEffect, useState } from 'react'
import { sb } from '../lib/sb'
import {
  obtenerSaludSistema, listarConfiguracionesKiosko, actualizarConfiguracionKiosko,
  reconciliarPagos, expirarOrdenesKiosko,
  type SaludSistema, type ResultadoReconciliacion,
} from '@shake/supabase'
import type { ConfiguracionKiosko, ModoPagoKiosko } from '@shake/types'
import { PageHeader, Loading, ErrorMsg, OkMsg, Panel, cx, Chip } from '../ui'
import { BotonActualizarPantallas } from '../BotonActualizarPantallas'
import { mensajeDeError } from '@shake/utils'

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

      <Panel title="Modo de pago del kiosko" className="mb-8">
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
