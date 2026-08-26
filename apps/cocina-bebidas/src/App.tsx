import milo from '@shake/brand/milo.png'
import { useEffect, useState } from 'react'
import { sb } from './lib/sb'
import {
  listarPedidosCocina, suscribirPedidosCocina, cambiarEstadoPedido,
  trabajosDeVariosPedidos, suscribirTrabajosImpresion, reimprimirTrabajo,
  etiquetaItem,
} from '@shake/supabase'
import type { PedidoConItems } from '@shake/supabase'
import type { EstadoCocina, TrabajoImpresion } from '@shake/types'
import { mensajeDeError } from '@shake/utils'

// Indicador de estado de impresión de la comanda de este pedido.
function EstadoImpresion({ trabajo, onReimprimir }: { trabajo: TrabajoImpresion | undefined; onReimprimir: () => void }) {
  if (!trabajo) {
    return <span className="font-mono text-[10px] text-sa-green-ink/30 uppercase tracking-wide">Sin impresora asignada</span>
  }
  if (trabajo.estado === 'printed') {
    return <span className="font-mono text-[10px] text-sa-mint uppercase tracking-wide">🖨️ Impreso</span>
  }
  if (trabajo.estado === 'failed') {
    return (
      <button
        onClick={onReimprimir}
        className="font-mono text-[10px] text-sa-strawberry uppercase tracking-wide underline underline-offset-2"
      >
        ⚠ No se imprimió — Reimprimir
      </button>
    )
  }
  if (trabajo.estado === 'retry') {
    return <span className="font-mono text-[10px] text-sa-banana uppercase tracking-wide animate-pulse">🔄 Reintentando impresión…</span>
  }
  return <span className="font-mono text-[10px] text-sa-green-ink/40 uppercase tracking-wide">🖨️ Imprimiendo…</span>
}

const ESTACION = 'bebidas'
const TITULO = 'Cocina · Bebidas'

// Estado siguiente y etiqueta del botón por estado actual.
const AVANCE: Partial<Record<EstadoCocina, { siguiente: EstadoCocina; etiqueta: string }>> = {
  pendiente: { siguiente: 'en_preparacion', etiqueta: '▶ Preparar' },
  en_preparacion: { siguiente: 'listo', etiqueta: '✓ Listo' },
  listo: { siguiente: 'entregado', etiqueta: '➜ Entregar' },
}

const ETIQUETA_ESTADO: Record<string, string> = {
  pendiente: 'Pendiente',
  en_preparacion: 'Preparando',
  listo: 'Listo',
}

// Franja de acento superior de la tarjeta según estado.
const ACENTO_ESTADO: Record<string, string> = {
  pendiente: 'bg-sa-strawberry animate-pulse',
  en_preparacion: 'bg-sa-banana',
  listo: 'bg-sa-mint',
}

// Badge de estado (fondo + texto).
const BADGE_ESTADO: Record<string, string> = {
  pendiente: 'bg-sa-strawberry text-white',
  en_preparacion: 'bg-sa-banana text-sa-coffee',
  listo: 'bg-sa-mint text-sa-green-ink',
}

// Botón de avance según estado.
const BOTON_ESTADO: Record<string, string> = {
  pendiente: 'bg-sa-green hover:bg-sa-green-deep text-sa-cream',
  en_preparacion: 'bg-sa-mint hover:bg-sa-mint/80 text-sa-green-ink',
  listo: 'bg-sa-blueberry hover:bg-sa-blueberry/80 text-white',
}

function minutosDesde(iso: string, ahora: number): number {
  return Math.floor((ahora - new Date(iso).getTime()) / 60000)
}

function claseAntiguedad(min: number): string {
  if (min < 5) return 'nuevo'
  if (min < 10) return 'medio'
  return 'tarde'
}

// Color del contador de minutos según antigüedad.
function colorAntiguedad(min: number): string {
  const c = claseAntiguedad(min)
  if (c === 'nuevo') return 'text-sa-mint'
  if (c === 'medio') return 'text-sa-banana'
  return 'text-sa-strawberry'
}

function formatReloj(ms: number): string {
  const d = new Date(ms)
  const hh = d.getHours().toString().padStart(2, '0')
  const mm = d.getMinutes().toString().padStart(2, '0')
  return `${hh}:${mm}`
}

export default function App() {
  const [pedidos, setPedidos] = useState<PedidoConItems[]>([])
  const [impresion, setImpresion] = useState<Record<string, TrabajoImpresion>>({})
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ahora, setAhora] = useState(Date.now())

  async function recargar() {
    try {
      const data = await listarPedidosCocina(sb, ESTACION)
      setPedidos(data)
      setError(null)
      const estados = await trabajosDeVariosPedidos(sb, data.map((p) => p.id))
      setImpresion(estados)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    void recargar()
    const offPedidos = suscribirPedidosCocina(sb, () => { void recargar() })
    const offImpresion = suscribirTrabajosImpresion(sb, () => { void recargar() })
    // Red de seguridad del canal en vivo: si muere sin avisar, lo más que
    // espera una comanda en aparecer son estos 20 segundos. El display de
    // clientes ya sondeaba así; las cocinas no, y un día se congelaron.
    const sondeo = setInterval(() => { void recargar() }, 20_000)
    const alRecuperar = () => { void recargar() }
    window.addEventListener('online', alRecuperar)
    document.addEventListener('visibilitychange', alRecuperar)
    return () => {
      offPedidos()
      offImpresion()
      clearInterval(sondeo)
      window.removeEventListener('online', alRecuperar)
      document.removeEventListener('visibilitychange', alRecuperar)
    }
  }, [])

  async function reimprimirComanda(pedidoId: string) {
    const trabajo = impresion[pedidoId]
    if (!trabajo) return
    try {
      await reimprimirTrabajo(sb, trabajo.id, { motivo: 'Reimpresión desde KDS (falló la automática)' })
      await recargar()
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }

  // Refresca los contadores de minutos cada 30 s.
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 30000)
    return () => clearInterval(id)
  }, [])

  async function avanzar(pedido: PedidoConItems) {
    const paso = AVANCE[pedido.estado]
    if (!paso) return
    try {
      await cambiarEstadoPedido(sb, pedido.id, paso.siguiente)
      await recargar()
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }

  // Barra: entregar directo (sin esperar a "listo") conforme se preparan.
  async function entregar(pedido: PedidoConItems) {
    try {
      await cambiarEstadoPedido(sb, pedido.id, 'entregado')
      await recargar()
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }

  if (cargando) {
    return (
      <div className="min-h-screen bg-sa-green-ink flex items-center justify-center">
        <p className="font-display text-sa-cream/70 text-2xl tracking-wide">Cargando comandas…</p>
      </div>
    )
  }

  const pendientes = pedidos.filter((p) => p.estado === 'pendiente').length
  const preparando = pedidos.filter((p) => p.estado === 'en_preparacion').length
  const listos = pedidos.filter((p) => p.estado === 'listo').length

  return (
    <div className="min-h-screen bg-sa-green-ink flex flex-col font-body">
      {/* ── Header ── */}
      <header className="px-6 py-4 bg-sa-green-deep border-b border-sa-cream/10">
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-4 shrink-0">
            <img
              src={milo}
              alt="Hojaldras Lily"
              className="h-14 w-auto drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)]"
            />
          </div>

          <div className="flex-1 text-center">
            <h1 className="font-display text-sa-cream text-3xl md:text-4xl tracking-wide leading-none">
              {TITULO}
            </h1>
            <p className="font-mono text-sa-cream/50 text-xs mt-1 uppercase tracking-widest">
              Kitchen Display · En vivo
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-sa-mint animate-pulse" />
              <span className="font-mono text-sa-cream/70 text-xl tabular-nums">{formatReloj(ahora)}</span>
            </span>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex flex-wrap gap-3 mt-4 justify-center md:justify-end">
          <StatPill count={pedidos.length} label="Activos" bg="bg-sa-blueberry" text="text-white" />
          <StatPill count={pendientes} label="Pendientes" bg="bg-sa-strawberry" text="text-white" pulse />
          <StatPill count={preparando} label="Preparando" bg="bg-sa-banana" text="text-sa-coffee" />
          <StatPill count={listos} label="Listos" bg="bg-sa-mint" text="text-sa-green-ink" />
        </div>
      </header>

      {/* ── Main ── */}
      <main className="flex-1 p-6">
        {error && (
          <div className="mb-6 rounded-sa border border-sa-strawberry bg-sa-strawberry/10 px-5 py-3 font-mono text-sm text-sa-strawberry">
            {error}
          </div>
        )}

        {pedidos.length === 0 && !error ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
            <img
              src={milo}
              alt="Hojaldra de la casa"
              className="w-[240px] h-auto opacity-90 drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
            />
            <p className="font-display text-sa-cream text-4xl md:text-5xl tracking-wide">
              Todo limpio. A descansar.
            </p>
            <p className="font-mono text-sa-cream/50 text-sm uppercase tracking-widest">
              Las comandas nuevas aparecerán aquí
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {pedidos.map((pedido) => {
              const min = minutosDesde(pedido.created_at, ahora)
              const paso = AVANCE[pedido.estado]
              return (
                <div
                  key={pedido.id}
                  className="bg-sa-cream rounded-sa-lg shadow-sa overflow-hidden flex flex-col"
                >
                  {/* Franja de acento por estado */}
                  <div className={`h-1.5 w-full ${ACENTO_ESTADO[pedido.estado] ?? 'bg-sa-mint'}`} />

                  {/* Cabecera: folio + canal */}
                  <div className="flex items-start justify-between px-5 pt-4">
                    <div className="flex flex-col">
                      <span className="font-mono text-[10px] uppercase tracking-widest text-sa-green-ink/50">
                        Folio
                      </span>
                      <span className="font-display text-sa-green-ink text-3xl leading-none mt-0.5">
                        #{pedido.ordenes?.folio ?? '—'}
                      </span>
                      {/* El nombre es con lo que se entrega: mas grande que
                          el canal, debajo del folio. */}
                      {pedido.ordenes?.nombre_cliente && (
                        <span className="font-display text-sa-strawberry text-xl leading-tight mt-1 max-w-[11rem] truncate">
                          {pedido.ordenes.nombre_cliente}
                        </span>
                      )}
                    </div>
                    {pedido.ordenes?.canal && (
                      <span className="inline-flex items-center px-3 py-1 rounded-sa font-mono text-[11px] uppercase tracking-wider bg-sa-green text-sa-cream">
                        {pedido.ordenes.canal}
                      </span>
                    )}
                  </div>

                  {/* Tiempo + estado */}
                  <div className="px-5 pt-3 pb-2 flex items-end justify-between">
                    <div className="flex items-baseline gap-2">
                      <span className={`font-display text-4xl leading-none ${colorAntiguedad(min)}`}>
                        {min}
                      </span>
                      <span className="font-mono text-xs uppercase tracking-widest text-sa-green-ink/50">
                        {min < 1 ? 'recién' : 'min'}
                      </span>
                    </div>
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-sa font-mono text-[10px] uppercase tracking-widest ${BADGE_ESTADO[pedido.estado] ?? 'bg-sa-mint text-sa-green-ink'}`}
                    >
                      {ETIQUETA_ESTADO[pedido.estado] ?? pedido.estado}
                    </span>
                  </div>

                  <div className="px-5 pb-1">
                    <EstadoImpresion trabajo={impresion[pedido.id]} onReimprimir={() => void reimprimirComanda(pedido.id)} />
                  </div>

                  <div className="mx-5 my-1 h-px bg-sa-green-ink/10" />

                  {/* Items */}
                  <div className="px-3 py-2 flex-1">
                    {pedido.cocina_items.map((item) => (
                      <div
                        key={item.id}
                        className="flex gap-3 items-start px-2 py-2 rounded-sa hover:bg-sa-cream-soft transition-colors"
                      >
                        <span className="font-mono font-medium text-sm bg-sa-green-ink text-sa-cream px-2.5 py-1 rounded-sa min-w-[2.75rem] text-center shrink-0 tabular-nums">
                          {item.cantidad}×
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-body font-medium text-sa-green-ink leading-tight">
                            {etiquetaItem(item)}
                            {/* Que vaso agarrar, antes de leer la receta. Solo
                                aqui: la etiqueta impresa no lo lleva (pedido
                                explicito de la sucursal). */}
                            {item.productos?.onzas != null && (
                              <span className="ml-2 align-middle inline-flex px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold tracking-wide bg-sa-banana/30 text-sa-coffee">
                                {item.productos.onzas} OZ
                              </span>
                            )}
                          </p>
                          {item.personalizacion && (
                            <p className="font-mono text-[11px] mt-1 text-sa-strawberry uppercase tracking-wide">
                              ↳ {item.personalizacion}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Botón de avance */}
                  {paso && (
                    <div className="px-5 pb-5 pt-2">
                      <button
                        onClick={() => void avanzar(pedido)}
                        className={`w-full font-display text-xl tracking-wide py-3 rounded-sa transition-colors shadow-sa-sm ${BOTON_ESTADO[pedido.estado] ?? 'bg-sa-green text-sa-cream'}`}
                      >
                        {paso.etiqueta}
                      </button>
                      {/* Barra: entregar directo mientras se prepara */}
                      {(pedido.estado === 'pendiente' || pedido.estado === 'en_preparacion') && (
                        <button
                          onClick={() => void entregar(pedido)}
                          className="w-full mt-2 font-body text-sm text-sa-green-ink/60 hover:text-sa-green underline underline-offset-2 transition-colors"
                        >
                          Entregar ya ➜
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}

function StatPill({
  count,
  label,
  bg,
  text,
  pulse = false,
}: {
  count: number
  label: string
  bg: string
  text: string
  pulse?: boolean
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 pl-2 pr-4 py-1.5 rounded-sa ${bg} ${text} shadow-sa-sm`}>
      <span className={`font-display text-2xl leading-none min-w-[2rem] text-center px-2 ${pulse ? 'animate-pulse' : ''}`}>
        {count}
      </span>
      <span className="font-mono text-xs uppercase tracking-widest">{label}</span>
    </span>
  )
}
