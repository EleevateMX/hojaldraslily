import { useEffect, useMemo, useState } from 'react'
import { sb } from '../lib/sb'
import { cortesDeCaja, imprimirCorteEnCaja, datosDelTicket, type CorteDeCaja } from '@lily/supabase'
import { imprimirCorte, NEGOCIO_DEFAULT, type CorteData, type TicketNegocio } from '@lily/ui'
import { mxn, mensajeDeError, leerConteo, renglonesDelConteo, hayConteo } from '@lily/utils'
import { PageHeader, Loading, ErrorMsg, OkMsg, Panel, Field, Chip, cx } from '../ui'

/**
 * Los cortes de caja, para revisarlos después.
 *
 * Hasta hoy el turno se cerraba y no había dónde mirarlo: el arqueo existía
 * en la pantalla de la caja y desaparecía al dar «Seguir». Aquí queda el
 * historial con lo que de verdad sirve para reclamar: no «faltan $340» sino
 * **un billete de $200 y tres de $50**, que es una frase con la que alguien
 * puede acordarse de algo.
 *
 * El comprobante sale por dos caminos y los dos dibujan el MISMO
 * `CorteData` que escribe `fn_corte_payload`:
 *
 * - **La térmica del mostrador**, por la cola (`fn_corte_imprimir_caja`):
 *   es el mismo papel que salió al cerrar, pedido desde el teléfono.
 * - **El navegador** (`imprimirCorte`): para guardarlo en PDF o mandarlo
 *   por WhatsApp desde donde sea.
 */

const ZONA = 'America/Merida'

/** Hoy en Mérida como `YYYY-MM-DD`, que es lo que entiende `<input type="date">`. */
function hoyMerida(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: ZONA })
}
function diasAtras(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('en-CA', { timeZone: ZONA })
}
function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-MX', {
    timeZone: ZONA, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}
function soloHora(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('es-MX', { timeZone: ZONA, hour: '2-digit', minute: '2-digit' })
}
function fechaLarga(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-MX', {
    timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

/**
 * La diferencia, dicha como se dice en el mostrador.
 *
 * El faltante va en carmín profundo sobre la pastilla del acento, NO en rosa
 * salmón: a un metro el rosa se ve despintado, y lo único urgente de esta
 * pantalla sería lo más pálido (ya pasó con «Hay que empacar» y con «Se pasó»).
 */
function Diferencia({ c }: { c: CorteDeCaja }) {
  if (c.estado === 'abierta') return <Chip tone="neutral">Abierta</Chip>
  const d = Number(c.diferencia ?? 0)
  if (Math.abs(d) < 0.005) return <Chip tone="si">Cuadra</Chip>
  if (d < 0) {
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-sa-strawberry/30 text-sa-green-deep">
        Faltan {mxn(-d)}
      </span>
    )
  }
  return <Chip tone="neutral">Sobran {mxn(d)}</Chip>
}

function Desglose({ raw, titulo }: { raw: unknown; titulo: string }) {
  const conteo = leerConteo(raw)
  const renglones = renglonesDelConteo(conteo)
  return (
    <div>
      <p className={`${cx.label} mb-2`}>{titulo}</p>
      {!hayConteo(conteo) ? (
        <p className={`text-sm ${cx.muted}`}>No se contó por denominación.</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {renglones.map((r) => (
              <tr key={`${r.especie}-${r.denominacion}`} className="border-b border-sa-green-ink/5 last:border-0">
                <td className="py-1 text-sa-green-ink">
                  {r.especie === 'billetes' ? 'Billete' : 'Moneda'} de {mxn(r.denominacion)}
                </td>
                <td className="py-1 text-right font-mono tabular-nums text-sa-green-ink/70">× {r.piezas}</td>
                <td className="py-1 text-right font-mono tabular-nums text-sa-green-ink">{mxn(r.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

/** De la fila del historial al papel: es la misma forma, solo lleva `tipo`. */
function aCorteData(c: CorteDeCaja): CorteData {
  return { tipo: 'corte', ...c }
}

/**
 * `fuente` existe para el arnés de `mirar/cortes.html`: la pantalla se revisa
 * con cortes de una tienda ocupada —uno que cuadra, uno con faltante, uno
 * abierto— y sin red a Supabase desde el navegador no hay otra forma de
 * darle de comer. En la app nadie lo pasa.
 */
export default function Cortes({
  fuente = (desde, hasta) => cortesDeCaja(sb, desde, hasta),
}: {
  fuente?: (desde: string, hasta: string) => Promise<CorteDeCaja[]>
} = {}) {
  const [desde, setDesde] = useState(() => diasAtras(30))
  const [hasta, setHasta] = useState(() => hoyMerida())
  const [cortes, setCortes] = useState<CorteDeCaja[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [abiertoId, setAbiertoId] = useState<string | null>(null)
  // Los datos del negocio de Admin → Sistema, para que el PDF diga lo mismo
  // que la térmica. Si no están puestos, van los del código.
  const [negocio, setNegocio] = useState<TicketNegocio>(NEGOCIO_DEFAULT)

  async function cargar() {
    setCargando(true)
    try {
      setCortes(await fuente(desde, hasta))
      setError(null)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => { void cargar() }, [desde, hasta]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    datosDelTicket(sb)
      .then((d) => {
        if (!d) return
        const limpio = Object.fromEntries(Object.entries(d).filter(([, v]) => v !== null && v !== undefined))
        setNegocio({ ...NEGOCIO_DEFAULT, ...limpio } as TicketNegocio)
      })
      .catch(() => { /* con los del código basta para un PDF */ })
  }, [])

  const abierto = useMemo(() => cortes.find((c) => c.corte_id === abiertoId) ?? null, [cortes, abiertoId])

  const resumen = useMemo(() => {
    const cerrados = cortes.filter((c) => c.estado === 'cerrada')
    return {
      turnos: cortes.length,
      vendido: cortes.reduce((t, c) => t + Number(c.total_pagado ?? 0), 0),
      diferencia: cerrados.reduce((t, c) => t + Number(c.diferencia ?? 0), 0),
      descuadrados: cerrados.filter((c) => Math.abs(Number(c.diferencia ?? 0)) >= 0.005).length,
    }
  }, [cortes])

  async function reimprimir(c: CorteDeCaja) {
    setError(null); setOk(null)
    try {
      const trabajo = await imprimirCorteEnCaja(sb, c.corte_id)
      if (!trabajo) {
        setError('La tienda no tiene térmica de tickets dada de alta: se puede imprimir desde el navegador, con el otro botón.')
        return
      }
      setOk(`Corte #${c.folio} encolado en la térmica del mostrador. Si no sale papel, revisa que el agente de caja esté abierto en la PC.`)
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }

  function imprimirAqui(c: CorteDeCaja) {
    setError(null); setOk(null)
    if (!imprimirCorte(aCorteData(c), negocio)) {
      setError('El navegador no dejó abrir la impresión. Prueba desde Chrome.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Cortes de caja"
        subtitle="Cada turno con lo que se vendió, lo que debía haber en el cajón y lo que se contó, billete por billete"
      />

      {error && <ErrorMsg>{error}</ErrorMsg>}
      {ok && <OkMsg>{ok}</OkMsg>}

      <Panel className="mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
          <Field label="Desde">
            <input type="date" className={cx.input} value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} />
          </Field>
          <Field label="Hasta">
            <input type="date" className={cx.input} value={hasta} min={desde} max={hoyMerida()} onChange={(e) => setHasta(e.target.value)} />
          </Field>
          <div className="col-span-2 sm:col-span-2 flex gap-2 flex-wrap">
            <button className={cx.btnSec} onClick={() => { setDesde(hoyMerida()); setHasta(hoyMerida()) }}>Hoy</button>
            <button className={cx.btnSec} onClick={() => { setDesde(diasAtras(7)); setHasta(hoyMerida()) }}>7 días</button>
            <button className={cx.btnSec} onClick={() => { setDesde(diasAtras(30)); setHasta(hoyMerida()) }}>30 días</button>
          </div>
        </div>
      </Panel>

      {/* Las cifras del periodo. En un teléfono van de dos en dos. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className={cx.panelChico}>
          <p className={cx.label}>Turnos</p>
          <p className="text-2xl font-display text-sa-green-ink mt-1">{resumen.turnos}</p>
        </div>
        <div className={cx.panelChico}>
          <p className={cx.label}>Vendido</p>
          <p className="text-2xl font-display text-sa-green-ink mt-1 tabular-nums">{mxn(resumen.vendido)}</p>
        </div>
        <div className={cx.panelChico}>
          <p className={cx.label}>Diferencia</p>
          <p className={`text-2xl font-display mt-1 tabular-nums ${resumen.diferencia < -0.005 ? 'text-sa-green-deep' : 'text-sa-green-ink'}`}>
            {resumen.diferencia > 0 ? '+' : ''}{mxn(resumen.diferencia)}
          </p>
        </div>
        <div className={cx.panelChico}>
          <p className={cx.label}>Descuadrados</p>
          <p className={`text-2xl font-display mt-1 ${resumen.descuadrados > 0 ? 'text-sa-green-deep' : 'text-sa-green-ink'}`}>
            {resumen.descuadrados}
          </p>
        </div>
      </div>

      {cargando ? (
        <Loading>Cargando cortes…</Loading>
      ) : cortes.length === 0 ? (
        <Panel><p className={cx.muted}>No hubo turnos entre esas fechas.</p></Panel>
      ) : (
        <div className={`${cx.tableWrap} mb-6`}>
          <table className={cx.table}>
            <thead>
              <tr className={cx.thead}>
                <th className={cx.th}>Corte</th>
                <th className={cx.th}>Turno</th>
                <th className={cx.th}>Quién</th>
                <th className={cx.thNum}>Vendido</th>
                <th className={cx.thNum}>Esperado</th>
                <th className={cx.thNum}>Contado</th>
                <th className={cx.thAcciones}>Diferencia</th>
              </tr>
            </thead>
            <tbody className={cx.tbody}>
              {cortes.map((c) => (
                <tr
                  key={c.corte_id}
                  className={`${cx.tr} cursor-pointer ${abiertoId === c.corte_id ? 'bg-sa-cream-soft' : ''}`}
                  onClick={() => setAbiertoId(abiertoId === c.corte_id ? null : c.corte_id)}
                >
                  <td className={cx.td}>
                    <span className="font-mono font-semibold">#{c.folio}</span>
                    <div className="text-xs text-sa-green-ink/40">{c.caja ?? '—'}</div>
                  </td>
                  <td className={cx.td}>
                    <span className="whitespace-nowrap">{fechaCorta(c.abierto_en)}</span>
                    <span className="text-sa-green-ink/40"> → </span>
                    <span className="whitespace-nowrap">{c.cerrado_en ? soloHora(c.cerrado_en) : 'sigue abierta'}</span>
                  </td>
                  <td className={cx.td}>
                    <span className="whitespace-nowrap">{c.abrio ?? '—'}</span>
                    {c.cerro && c.cerro !== c.abrio && (
                      <div className="text-xs text-sa-green-ink/50 whitespace-nowrap">cerró {c.cerro}</div>
                    )}
                  </td>
                  <td className={cx.tdNum}>{mxn(c.total_pagado)}</td>
                  <td className={cx.tdNum}>{mxn(c.efectivo_esperado)}</td>
                  <td className={cx.tdNum}>{c.efectivo_contado == null ? '—' : mxn(c.efectivo_contado)}</td>
                  <td className={cx.tdAcciones}><Diferencia c={c} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {abierto && (
        <Panel className="border-sa-green/30">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
            <div>
              <h3 className={cx.h3}>Corte #{abierto.folio} · {abierto.caja ?? 'Caja'}</h3>
              <p className={`text-sm mt-1 ${cx.muted}`}>
                {fechaLarga(abierto.abierto_en)} · abrió {abierto.abrio ?? '—'} a las {soloHora(abierto.abierto_en)}
                {abierto.cerrado_en
                  ? <> · cerró {abierto.cerro ?? '—'} a las {soloHora(abierto.cerrado_en)}</>
                  : <> · <b>todavía abierta</b></>}
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button className={cx.btnPrimary} onClick={() => void reimprimir(abierto)} disabled={abierto.estado !== 'cerrada'}
                title={abierto.estado !== 'cerrada' ? 'Se imprime cuando el turno cierre' : 'Sale en la térmica del mostrador'}>
                Reimprimir en la térmica
              </button>
              <button className={cx.btnSec} onClick={() => imprimirAqui(abierto)}>Imprimir / guardar PDF</button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className={`${cx.label} mb-2`}>Ventas ({abierto.num_ordenes} ticket{abierto.num_ordenes === 1 ? '' : 's'})</p>
              <table className="w-full text-sm">
                <tbody>
                  {([
                    ['Efectivo', abierto.total_efectivo],
                    ['Terminal', abierto.total_tarjeta],
                    ['Inbursa', abierto.total_inbursa],
                    ['Transferencia', abierto.total_transferencia],
                    ['Rappi', abierto.total_rappi],
                    ['Clip', abierto.total_clip],
                    ['Cortesía', abierto.total_cortesia],
                    ['Otro', abierto.total_otro],
                  ] as [string, number][]).filter(([, v]) => Number(v) > 0).map(([k, v]) => (
                    <tr key={k} className="border-b border-sa-green-ink/5">
                      <td className="py-1 text-sa-green-ink">{k}</td>
                      <td className="py-1 text-right font-mono tabular-nums text-sa-green-ink">{mxn(v)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="py-1.5 font-semibold text-sa-green-ink">Total</td>
                    <td className="py-1.5 text-right font-mono tabular-nums font-semibold text-sa-green-ink">{mxn(abierto.total_pagado)}</td>
                  </tr>
                </tbody>
              </table>

              <div className="mt-5 rounded-sa bg-sa-cream-soft p-4">
                <div className="flex justify-between text-sm"><span>Fondo inicial</span><span className="font-mono tabular-nums">{mxn(abierto.fondo_inicial)}</span></div>
                <div className="flex justify-between text-sm mt-1"><span>+ Efectivo vendido</span><span className="font-mono tabular-nums">{mxn(abierto.total_efectivo)}</span></div>
                <div className="flex justify-between text-sm mt-1 font-semibold"><span>Debía haber</span><span className="font-mono tabular-nums">{mxn(abierto.efectivo_esperado)}</span></div>
                <div className="flex justify-between text-sm mt-1"><span>Se contó</span><span className="font-mono tabular-nums">{abierto.efectivo_contado == null ? '—' : mxn(abierto.efectivo_contado)}</span></div>
                <div className="mt-3 pt-3 border-t border-sa-green-ink/10 flex items-center justify-between">
                  <span className="font-display text-lg text-sa-green-ink">
                    {abierto.estado !== 'cerrada' ? 'Sin cerrar' : Math.abs(Number(abierto.diferencia ?? 0)) < 0.005 ? 'Cuadra' : Number(abierto.diferencia) < 0 ? 'Faltante' : 'Sobrante'}
                  </span>
                  <span className={`font-display text-2xl tabular-nums ${Number(abierto.diferencia ?? 0) < -0.005 ? 'text-sa-green-deep' : 'text-sa-green-ink'}`}>
                    {abierto.estado !== 'cerrada' ? '—' : mxn(Math.abs(Number(abierto.diferencia ?? 0)))}
                  </span>
                </div>
              </div>
            </div>

            <Desglose raw={abierto.conteo_apertura} titulo="El cajón al abrir" />
            <Desglose raw={abierto.conteo_cierre} titulo="El cajón al cerrar" />
          </div>

          {abierto.notas && (
            <div className="mt-5">
              <p className={`${cx.label} mb-1`}>Notas del cierre</p>
              <p className="text-sm text-sa-green-ink whitespace-pre-wrap">{abierto.notas}</p>
            </div>
          )}
        </Panel>
      )}
    </div>
  )
}
