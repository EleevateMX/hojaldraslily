import { useEffect, useRef, useState } from 'react'
import { sb } from '../lib/sb'
import { panelEnVivo, type PanelEnVivo } from '@shake/supabase'
import { mxn, mensajeDeError } from '@shake/utils'
import { PageHeader, Loading, ErrorMsg } from '../ui'
import { BotonActualizarPantallas } from '../BotonActualizarPantallas'

/**
 * Respaldo por si un evento de Realtime se pierde: una foto de cortesía
 * cada 30 s. El motor principal ya no es este reloj, son los eventos.
 */
const RESPALDO_MS = 30_000

/**
 * Version del agente de impresion que debe correr la tienda. Si una
 * impresora reporta otra, es que falta correr el instalador en la PC.
 * Subela junto con VERSION_AGENTE del agente.
 */
const AGENTE_ESPERADO = '1.1.0'

const METODOS: Record<string, { etiqueta: string; icono: string }> = {
  efectivo: { etiqueta: 'Efectivo', icono: '💵' },
  clip: { etiqueta: 'Clip', icono: '📟' },
  tarjeta: { etiqueta: 'Tarjeta', icono: '💳' },
  cortesia: { etiqueta: 'Cortesía', icono: '🎁' },
  otro: { etiqueta: 'Otro', icono: '•' },
}

const ESTADOS_COCINA: Record<string, string> = {
  pendiente: 'bg-sa-banana/20 text-sa-coffee border-sa-banana/40',
  en_preparacion: 'bg-sa-blueberry/15 text-sa-blueberry border-sa-blueberry/30',
  listo: 'bg-sa-mint/25 text-sa-green-ink border-sa-mint/50',
}

const ICONO_EVENTO: Record<string, string> = {
  cobro: '💰',
  comanda: '🧾',
  cocina: '👨‍🍳',
  impresion: '🖨️',
  falla: '🚨',
  caja: '🔐',
}

/**
 * On Duty: la tienda en tiempo real de verdad.
 *
 * Ya no es un reloj que pide fotos: el panel está SUSCRITO a la base
 * (Realtime). Cada venta, comanda, impresión o movimiento de caja dispara
 * un evento y el panel se refresca en ese instante — con una foto de
 * respaldo cada 30 s por si un evento se pierde. La bitácora de abajo es
 * el registro del día, y si la impresión se atora, grita en rojo.
 */
export default function EnVivo() {
  const [panel, setPanel] = useState<PanelEnVivo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [vista, setVista] = useState<'ultimos' | 'turno'>('ultimos')
  const [conectado, setConectado] = useState(false)
  const [, setTic] = useState(0)
  const vivo = useRef(true)
  const vistaRef = useRef(vista)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  vistaRef.current = vista

  useEffect(() => {
    vivo.current = true
    const cargar = () =>
      panelEnVivo(sb, vistaRef.current === 'turno')
        .then((p) => { if (vivo.current) { setPanel(p); setError(null) } })
        .catch((e) => { if (vivo.current) setError(mensajeDeError(e)) })
    void cargar()

    // El corazón: cualquier movimiento en las tablas que laten dispara una
    // recarga. El debounce junta la ráfaga de una venta (orden + pago +
    // comanda + impresión) en una sola consulta.
    const alEvento = () => {
      if (debounce.current) clearTimeout(debounce.current)
      debounce.current = setTimeout(() => void cargar(), 350)
    }
    let canal = sb.channel('panel-en-vivo')
    for (const tabla of ['ordenes', 'pagos', 'pedidos_cocina', 'trabajos_impresion', 'caja_cortes']) {
      canal = canal.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: tabla },
        alEvento,
      )
    }
    canal.subscribe((estado) => {
      if (!vivo.current) return
      setConectado(estado === 'SUBSCRIBED')
      if (estado === 'SUBSCRIBED') void cargar()
    })

    const respaldo = setInterval(cargar, RESPALDO_MS)
    // Un tic por segundo re-pinta los minutos de espera y los relativos.
    const reloj = setInterval(() => setTic((t) => t + 1), 1_000)
    return () => {
      vivo.current = false
      if (debounce.current) clearTimeout(debounce.current)
      void sb.removeChannel(canal)
      clearInterval(respaldo)
      clearInterval(reloj)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista])

  if (!panel && !error) return <Loading>Conectando con la tienda…</Loading>

  const maxTop = Math.max(1, ...(panel?.top_productos ?? []).map((p) => p.cantidad))
  const ultimoEvento = panel?.registro?.[0] ?? null

  return (
    <div>
      <PageHeader
        title="En vivo"
        subtitle="La tienda, movimiento por movimiento"
        action={
          <div className="flex items-center gap-3 flex-wrap justify-end">
          <BotonActualizarPantallas compacto />
          <div
            className={`flex items-center gap-2.5 rounded-full px-4 py-2 shadow-sa-sm border ${
              conectado ? 'bg-white border-sa-green-ink/10' : 'bg-sa-strawberry/10 border-sa-strawberry/30'
            }`}
          >
            <span className={`w-2 h-2 rounded-full bg-sa-strawberry ${conectado ? 'animate-pulse' : ''}`} />
            <span className="font-mono text-xs uppercase tracking-wider text-sa-green-ink">
              {conectado ? 'EN VIVO' : 'RECONECTANDO…'}
            </span>
            {panel && <span className="font-mono text-sm text-sa-green-ink/70">{panel.ahora}</span>}
          </div>
          </div>
        }
      />

      {error && <ErrorMsg>{error}</ErrorMsg>}

      {panel && (
        <>
          {/* Alerta: el papel no está saliendo */}
          {panel.impresion_atorada > 0 && (
            <div className="mb-6 bg-sa-strawberry text-white rounded-sa-lg px-5 py-4 flex items-center gap-3 shadow-sa">
              <span className="text-2xl">🚨</span>
              <div>
                <p className="font-display text-lg leading-tight">La impresión está atorada</p>
                <p className="text-sm text-white/85">
                  {panel.impresion_atorada} {panel.impresion_atorada === 1 ? 'comanda espera' : 'comandas esperan'} más
                  de 90 segundos sin imprimirse. Revisa la ventana del agente en la PC y el papel de las etiquetadoras.
                </p>
              </div>
            </div>
          )}

          {/* KPIs del turno */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Kpi lbl="Órdenes de hoy" val={String(panel.dia.ordenes)} accent="text-sa-banana" />
            <Kpi lbl="Cobrado hoy" val={mxn(panel.dia.total)} accent="text-sa-green" />
            <Kpi lbl="Ticket promedio" val={mxn(panel.dia.ticket)} accent="text-sa-blueberry" />
            <Kpi
              lbl="Caja"
              val={panel.corte ? `Abierta ${panel.corte.desde}` : 'CERRADA'}
              sub={panel.corte
                ? `${panel.corte.abrio ?? 'sin registro'} · fondo ${mxn(panel.corte.fondo)} · lleva ${panel.turno.ordenes} órdenes (${mxn(panel.turno.total)})`
                : 'Nadie ha abierto turno'}
              accent={panel.corte ? 'text-sa-mint' : 'text-sa-strawberry'}
            />
          </div>

          {/* Por método + impresoras */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            {Object.entries(panel.por_metodo).map(([m, monto]) => (
              <span key={m} className="inline-flex items-center gap-2 bg-white border border-sa-green-ink/10 rounded-full px-4 py-2 shadow-sa-sm text-sm text-sa-green-ink">
                <span>{METODOS[m]?.icono ?? '•'}</span>
                {METODOS[m]?.etiqueta ?? m}: <b className="font-mono">{mxn(monto)}</b>
              </span>
            ))}
            <span className="flex-1" />
            {panel.impresoras.map((i) => (
              <span
                key={i.nombre}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm border ${
                  i.en_linea
                    ? 'bg-sa-mint/15 border-sa-mint/40 text-sa-green-ink'
                    : 'bg-sa-strawberry/10 border-sa-strawberry/30 text-sa-strawberry'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${i.en_linea ? 'bg-sa-mint animate-pulse' : 'bg-sa-strawberry'}`} />
                {i.nombre.replace(' — ', ' ')} {i.en_linea ? '· en línea' : '· SIN SEÑAL'}
                {i.ultima_impresion && <span className="font-mono text-xs opacity-60">últ. {i.ultima_impresion}</span>}
                {/* La version del agente: sin esto no se distingue "no lo
                    actualizaron" de "lo actualizaron y falla otra cosa". */}
                <span
                  className={`font-mono text-[10px] px-1.5 py-0.5 rounded-full ${
                    i.version === AGENTE_ESPERADO
                      ? 'bg-sa-mint/40 text-sa-green-ink'
                      : 'bg-sa-banana/40 text-sa-coffee'
                  }`}
                  title={i.version === AGENTE_ESPERADO
                    ? 'Agente al día'
                    : `Agente viejo — corre instalar-agente-impresion.bat (esperado ${AGENTE_ESPERADO})`}
                >
                  {i.version ? `v${i.version}` : 'v?'}
                </span>
              </span>
            ))}
          </div>

          {/* Último movimiento, siempre a la vista */}
          {ultimoEvento && (
            <div className="mb-6 flex items-center gap-3 bg-sa-green-deep text-sa-cream rounded-sa-lg px-5 py-3">
              <span className="text-xl">{ICONO_EVENTO[ultimoEvento.tipo] ?? '•'}</span>
              <p className="text-sm flex-1 min-w-0 truncate">{ultimoEvento.texto}</p>
              <span className="font-mono text-xs text-sa-cream/60 shrink-0">{ultimoEvento.hora}</span>
            </div>
          )}

          <div className="grid lg:grid-cols-3 gap-6 mb-6">
            {/* En cocina ahora */}
            <div className="bg-white rounded-sa p-5 shadow-sa-sm border border-sa-green-ink/5">
              <h3 className="font-display text-xl text-sa-green-ink mb-4">En cocina ahora</h3>
              {panel.en_cocina.length === 0 ? (
                <p className="text-sm text-sa-green-ink/50 py-6 text-center">
                  Nada pendiente — todo entregado 💪
                </p>
              ) : (
                <div className="space-y-2">
                  {panel.en_cocina.map((c, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 bg-sa-cream-soft rounded-sa px-4 py-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-sa-green-ink truncate">
                          #{c.folio}{c.nombre ? ` · ${c.nombre}` : ''}
                        </p>
                        <p className="font-mono text-[11px] text-sa-green-ink/50 uppercase">{c.estacion}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[11px] font-mono uppercase px-2.5 py-1 rounded-full border ${ESTADOS_COCINA[c.estado] ?? 'bg-sa-cream-soft text-sa-green-ink/60 border-sa-green-ink/10'}`}>
                          {c.estado.replace('_', ' ')}
                        </span>
                        <span className={`font-mono text-sm ${c.minutos >= 10 ? 'text-sa-strawberry font-bold' : 'text-sa-green-ink/60'}`}>
                          {c.minutos}m
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pedidos: últimos / todo el turno */}
            <div className="bg-white rounded-sa p-5 shadow-sa-sm border border-sa-green-ink/5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h3 className="font-display text-xl text-sa-green-ink">Pedidos</h3>
                <div className="flex rounded-full bg-sa-cream-soft p-1">
                  {([['ultimos', 'Últimos'], ['turno', 'Todo el turno']] as const).map(([id, lbl]) => (
                    <button
                      key={id}
                      onClick={() => setVista(id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-mono uppercase tracking-wide transition-colors ${
                        vista === id
                          ? 'bg-sa-green-deep text-sa-cream shadow-sa-sm'
                          : 'text-sa-green-ink/60 hover:text-sa-green-ink'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
              {vista === 'turno' && (
                <p className="font-mono text-[11px] uppercase tracking-wide text-sa-green-ink/50 mb-3">
                  Desde que abrió la caja: {panel.turno.ordenes} pedidos · {mxn(panel.turno.total)}
                </p>
              )}
              <div className={`space-y-2.5 ${vista === 'turno' ? 'max-h-[26rem] overflow-y-auto pr-1' : ''}`}>
                {panel.pedidos_recientes.map((p) => (
                  <div key={p.folio} className="border-b border-dotted border-sa-green-ink/15 pb-2.5 last:border-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="font-semibold text-sm text-sa-green-ink">
                        #{p.folio} · {p.nombre ?? 'Sin nombre'}
                        <span className="ml-2 font-mono text-[10px] uppercase text-sa-green-ink/40">{p.canal}</span>
                      </p>
                      <p className="font-mono text-xs text-sa-green-ink/60 shrink-0">{p.hora} · {mxn(p.total)}</p>
                    </div>
                    <p className="text-xs text-sa-green-ink/60 mt-0.5 leading-snug">{p.items}</p>
                  </div>
                ))}
                {panel.pedidos_recientes.length === 0 && (
                  <p className="text-sm text-sa-green-ink/50 py-6 text-center">Aún no hay pedidos.</p>
                )}
              </div>
            </div>

            {/* Los más pedidos hoy */}
            <div className="bg-white rounded-sa p-5 shadow-sa-sm border border-sa-green-ink/5">
              <h3 className="font-display text-xl text-sa-green-ink mb-4">Los más pedidos hoy</h3>
              <div className="space-y-2.5">
                {panel.top_productos.map((t, i) => (
                  <div key={t.nombre}>
                    <div className="flex items-baseline justify-between gap-3 mb-1">
                      <p className="text-sm text-sa-green-ink truncate">
                        <span className="font-mono text-xs text-sa-green-ink/40 mr-1.5">{i + 1}.</span>
                        {t.nombre}
                      </p>
                      <p className="font-mono text-sm font-bold text-sa-green-ink shrink-0">{t.cantidad}</p>
                    </div>
                    <div className="h-1.5 bg-sa-cream-soft rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${i === 0 ? 'bg-sa-banana' : i < 3 ? 'bg-sa-green' : 'bg-sa-green/40'}`}
                        style={{ width: `${(t.cantidad / maxTop) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
                {panel.top_productos.length === 0 && (
                  <p className="text-sm text-sa-green-ink/50 py-6 text-center">Aún no hay ventas hoy.</p>
                )}
              </div>
            </div>
          </div>

          {/* Registro del día: la bitácora, movimiento por movimiento */}
          <div className="bg-white rounded-sa p-5 shadow-sa-sm border border-sa-green-ink/5">
            <h3 className="font-display text-xl text-sa-green-ink mb-4">Registro del día</h3>
            {panel.registro.length === 0 ? (
              <p className="text-sm text-sa-green-ink/50 py-6 text-center">Sin movimientos todavía.</p>
            ) : (
              <div className="max-h-[22rem] overflow-y-auto pr-1">
                {panel.registro.map((ev, i) => (
                  <div
                    key={`${ev.ts}-${i}`}
                    className={`flex items-center gap-3 py-2 border-b border-dotted border-sa-green-ink/10 last:border-0 ${
                      ev.tipo === 'falla' ? 'text-sa-strawberry' : 'text-sa-green-ink'
                    }`}
                  >
                    <span className="text-base shrink-0">{ICONO_EVENTO[ev.tipo] ?? '•'}</span>
                    <span className="font-mono text-xs text-sa-green-ink/45 shrink-0">{ev.hora}</span>
                    <span className="text-sm min-w-0 flex-1">{ev.texto}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Kpi({ lbl, val, sub, accent }: { lbl: string; val: string; sub?: string; accent: string }) {
  return (
    <div className="bg-white rounded-sa p-5 shadow-sa-sm border border-sa-green-ink/5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-sa-green-ink/60 font-mono uppercase tracking-wide">{lbl}</span>
        <span className={`w-2.5 h-2.5 rounded-full bg-current ${accent}`} />
      </div>
      <p className="font-display text-2xl text-sa-green-ink leading-none">{val}</p>
      {sub && <p className="text-xs text-sa-green-ink/50 mt-1.5">{sub}</p>}
    </div>
  )
}
