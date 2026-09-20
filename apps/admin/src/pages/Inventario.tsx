import { useCallback, useEffect, useMemo, useState } from 'react'
import { sb } from '../lib/sb'
import {
  resumenDeInventario,
  contarInventario,
  recibirMercancia,
  registrarMerma,
  fijarMinimo,
  listaDeCompra,
  diasSinContar,
  type ResumenDeInventario,
  type GrupoDeInventario,
  type InsumoEnAlmacen,
  type ListaDeCompra,
  type ResultadoDeConteo,
} from '@lily/supabase'
import { PageHeader, Loading, ErrorMsg, OkMsg, Panel, cx } from '../ui'
import { mensajeDeError } from '@lily/utils'

/**
 * Inventario.
 *
 * Esta pantalla la usa quien cuenta el almacén, parada frente al anaquel y
 * probablemente con el teléfono en una mano. De ahí casi todas las
 * decisiones de aquí:
 *
 * - Se cuenta en la **presentación** («8 sacos»), no en gramos. La línea
 *   grande dice el número y debajo, chiquito, en qué viene.
 * - Se escribe **lo que hay**, no la diferencia. La resta la hace el
 *   servidor; ver `fn_inventario_contar`.
 * - Los grupos son los de la **hoja de papel** del negocio (Materia prima,
 *   Limpieza, Bolsas…). Una pantalla que no se parece al papel obliga a
 *   traducir cada renglón.
 * - Nada se guarda renglón por renglón: se cuenta todo y se guarda una vez.
 *   Guardar a cada tecla convierte un error de dedo en un movimiento de
 *   inventario que alguien va a tener que ir a buscar después.
 */

type Modo = 'ver' | 'contar' | 'recibir' | 'comprar'

const ESTADOS = {
  agotado: { texto: 'Se acabó', clase: 'bg-sa-green/12 text-sa-green-deep' },
  bajo:    { texto: 'Ya casi',  clase: 'bg-sa-banana/20 text-sa-chocolate' },
  ok:      { texto: 'Hay',      clase: 'bg-sa-mint/15 text-sa-mint' },
} as const

/** «hace 3 días», «hoy», o el aviso de que nunca se ha contado. */
function cuandoSeContó(item: InsumoEnAlmacen): { texto: string; alerta: boolean } {
  const dias = diasSinContar(item.contado_at)
  if (dias === null) return { texto: 'nunca se ha contado', alerta: true }
  if (dias === 0) return { texto: 'contado hoy', alerta: false }
  if (dias === 1) return { texto: 'contado ayer', alerta: false }
  return { texto: `contado hace ${dias} días`, alerta: dias > 30 }
}

function Cifra({ n, pie, tono = 'normal' }: { n: number; pie: string; tono?: 'normal' | 'alerta' | 'aviso' }) {
  const color =
    tono === 'alerta' ? 'text-sa-green' : tono === 'aviso' ? 'text-sa-banana' : 'text-sa-green-ink'
  return (
    <div className={cx.panelChico}>
      <div className={`font-display text-3xl sm:text-4xl ${color}`}>{n}</div>
      <div className="text-xs text-sa-green-ink/60 mt-1">{pie}</div>
    </div>
  )
}

export default function Inventario() {
  const [resumen, setResumen] = useState<ResumenDeInventario | null>(null)
  const [lista, setLista] = useState<ListaDeCompra | null>(null)
  const [modo, setModo] = useState<Modo>('ver')
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [conteo, setConteo] = useState<ResultadoDeConteo | null>(null)

  /** Lo que se lleva tecleado, sin guardar. Clave: insumo_id. */
  const [borrador, setBorrador] = useState<Record<string, string>>({})
  const [abierto, setAbierto] = useState<Record<string, boolean>>({})
  const [detalle, setDetalle] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setError(null)
    try {
      const [r, l] = await Promise.all([resumenDeInventario(sb), listaDeCompra(sb)])
      setResumen(r)
      setLista(l)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  // Los grupos que traen algo que atender arrancan abiertos; los demás,
  // cerrados. Con 112 renglones, abrir todo es una pared de texto donde lo
  // urgente no se distingue de lo que está bien.
  useEffect(() => {
    if (!resumen) return
    setAbierto((previo) => {
      if (Object.keys(previo).length > 0) return previo
      return Object.fromEntries(
        resumen.grupos.map((g) => [g.grupo, g.agotados + g.bajos > 0]),
      )
    })
  }, [resumen])

  const enBorrador = useMemo(
    () => Object.values(borrador).filter((v) => v.trim() !== '').length,
    [borrador],
  )

  function cambiarModo(nuevo: Modo) {
    setModo(nuevo)
    setBorrador({})
    setConteo(null)
    setAviso(null)
    setError(null)
  }

  function escribir(insumoId: string, valor: string) {
    // Solo dígitos y un punto: un teclado de teléfono deja meter comas y
    // signos que después revientan al convertir a número.
    if (valor !== '' && !/^\d*\.?\d*$/.test(valor)) return
    setBorrador((b) => ({ ...b, [insumoId]: valor }))
  }

  function sumar(insumoId: string, delta: number, base: number) {
    const actual = borrador[insumoId]
    const desde = actual === undefined || actual === '' ? base : Number(actual)
    const nuevo = Math.max(0, desde + delta)
    setBorrador((b) => ({ ...b, [insumoId]: String(nuevo) }))
  }

  async function guardar() {
    const lineas = Object.entries(borrador)
      .filter(([, v]) => v.trim() !== '')
      .map(([insumoId, v]) => ({ insumoId, valor: Number(v) }))
      .filter((l) => Number.isFinite(l.valor))

    if (lineas.length === 0) {
      setError('No hay nada capturado todavía.')
      return
    }

    setGuardando(true)
    setError(null)
    setAviso(null)
    try {
      if (modo === 'contar') {
        const r = await contarInventario(
          sb,
          lineas.map((l) => ({ insumoId: l.insumoId, contado: l.valor })),
        )
        setConteo(r)
        setAviso(
          r.ajustados === 0
            ? `Contaste ${r.contados} y todo cuadró.`
            : `Contaste ${r.contados}: ${r.cuadraron} cuadraron y ${r.ajustados} no.`,
        )
      } else {
        const r = await recibirMercancia(
          sb,
          lineas.filter((l) => l.valor > 0).map((l) => ({ insumoId: l.insumoId, piezas: l.valor })),
        )
        setAviso(`Entraron ${r.piezas} en ${r.lineas} renglones.`)
      }
      setBorrador({})
      await cargar()
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setGuardando(false)
    }
  }

  if (cargando) return <Loading>Cargando inventario…</Loading>

  return (
    <div>
      <PageHeader
        title="Inventario"
        subtitle={
          resumen
            ? `${resumen.total} cosas en ${resumen.almacen}. Se cuenta como se compra: sacos, cubetas, cartones.`
            : 'Lo que hay en el almacén'
        }
      />

      {error && <ErrorMsg>{error}</ErrorMsg>}
      {aviso && <OkMsg>{aviso}</OkMsg>}

      {resumen && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Cifra n={resumen.total} pie="cosas en el almacén" />
          <Cifra n={resumen.agotados} pie="se acabaron" tono={resumen.agotados > 0 ? 'alerta' : 'normal'} />
          <Cifra n={resumen.bajos} pie="ya casi se acaban" tono={resumen.bajos > 0 ? 'aviso' : 'normal'} />
          <Cifra n={resumen.sin_contar} pie="nunca se han contado" tono={resumen.sin_contar > 0 ? 'aviso' : 'normal'} />
        </div>
      )}

      {/* Los cuatro modos. Botones grandes y con el verbo por delante: la
          pregunta que trae quien llega a esta pantalla es «¿qué vengo a
          hacer?», no «¿en qué pestaña estoy?». */}
      <div className="flex flex-wrap gap-2 mb-6">
        {([
          ['ver', 'Qué hay'],
          ['contar', 'Contar'],
          ['recibir', 'Llegó mercancía'],
          ['comprar', 'Qué hay que comprar'],
        ] as [Modo, string][]).map(([m, texto]) => (
          <button
            key={m}
            onClick={() => cambiarModo(m)}
            className={
              modo === m
                ? 'bg-sa-green text-sa-cream px-5 py-3 rounded-sa font-medium text-sm'
                : 'border border-sa-green-ink/15 text-sa-green-ink px-5 py-3 rounded-sa font-medium text-sm hover:bg-sa-cream-soft transition-colors'
            }
          >
            {texto}
            {m === 'comprar' && lista && lista.items > 0 && (
              <span className="ml-2 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-sa-green/15 text-sa-green-deep text-xs font-mono">
                {lista.items}
              </span>
            )}
          </button>
        ))}
      </div>

      {modo === 'comprar' ? (
        <ListaParaComprar lista={lista} />
      ) : (
        <>
          {modo === 'contar' && (
            <Panel className="mb-4">
              <p className="text-sm text-sa-green-ink/70">
                Escribe <strong>cuántos hay</strong>, no la diferencia. Si crees que hay 10 y
                cuentas 8, escribe 8: el sistema apunta solo que faltaron 2 y por qué.
              </p>
            </Panel>
          )}
          {modo === 'recibir' && (
            <Panel className="mb-4">
              <p className="text-sm text-sa-green-ink/70">
                Escribe <strong>cuánto llegó</strong>. Se suma a lo que ya había.
              </p>
            </Panel>
          )}

          {conteo && conteo.diferencias.length > 0 && (
            <Panel title="Lo que no cuadró" className="mb-4">
              <ul className="divide-y divide-sa-green-ink/5">
                {conteo.diferencias.map((d) => (
                  <li key={d.insumo} className="py-2.5 flex items-center justify-between gap-4">
                    <span className="text-sa-green-ink">{d.insumo}</span>
                    <span className="font-mono text-sm text-sa-green-ink/60">
                      creíamos {d.habia} · contaste {d.conte}{' '}
                      <strong className={d.diferencia < 0 ? 'text-sa-green' : 'text-sa-mint'}>
                        ({d.diferencia > 0 ? '+' : ''}
                        {d.diferencia})
                      </strong>
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <div className="space-y-3">
            {resumen?.grupos.map((g) => (
              <Grupo
                key={g.grupo}
                grupo={g}
                modo={modo}
                abierto={abierto[g.grupo] ?? false}
                alternar={() => setAbierto((a) => ({ ...a, [g.grupo]: !a[g.grupo] }))}
                borrador={borrador}
                escribir={escribir}
                sumar={sumar}
                detalle={detalle}
                verDetalle={setDetalle}
                recargar={cargar}
                avisar={setAviso}
                fallar={setError}
              />
            ))}
          </div>

          {/* La barra de guardar se queda pegada abajo: con 112 renglones, un
              botón al final de la página es un botón que hay que ir a buscar
              después de contar todo. */}
          {modo !== 'ver' && enBorrador > 0 && (
            <div className="sticky bottom-0 mt-4 -mx-4 px-4 py-3 bg-sa-cream-paper/95 backdrop-blur border-t border-sa-green-ink/10 flex items-center justify-between gap-4">
              <span className="text-sm text-sa-green-ink/70">
                {enBorrador} {enBorrador === 1 ? 'renglón capturado' : 'renglones capturados'}
              </span>
              <div className="flex gap-2">
                <button className={cx.btnSec} onClick={() => setBorrador({})} disabled={guardando}>
                  Borrar
                </button>
                <button className={cx.btnPrimary} onClick={guardar} disabled={guardando}>
                  {guardando
                    ? 'Guardando…'
                    : modo === 'contar'
                      ? 'Guardar el conteo'
                      : 'Guardar la entrada'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Grupo({
  grupo, modo, abierto, alternar, borrador, escribir, sumar,
  detalle, verDetalle, recargar, avisar, fallar,
}: {
  grupo: GrupoDeInventario
  modo: Modo
  abierto: boolean
  alternar: () => void
  borrador: Record<string, string>
  escribir: (id: string, v: string) => void
  sumar: (id: string, delta: number, base: number) => void
  detalle: string | null
  verDetalle: (id: string | null) => void
  recargar: () => Promise<void>
  avisar: (t: string) => void
  fallar: (t: string) => void
}) {
  const pendientes = grupo.agotados + grupo.bajos
  return (
    <div className="bg-white rounded-sa shadow-sa-sm border border-sa-green-ink/5 overflow-hidden">
      <button
        onClick={alternar}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-sa-cream-soft/60 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-display text-xl text-sa-green-ink truncate">{grupo.grupo}</span>
          <span className="font-mono text-xs text-sa-green-ink/45">{grupo.total}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {grupo.agotados > 0 && (
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-sa-green/12 text-sa-green-deep">
              {grupo.agotados} se acabaron
            </span>
          )}
          {grupo.bajos > 0 && (
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-sa-banana/20 text-sa-chocolate">
              {grupo.bajos} ya casi
            </span>
          )}
          {pendientes === 0 && <span className="text-xs text-sa-mint font-semibold">al día</span>}
          <span className="text-sa-green-ink/40 font-mono text-sm">{abierto ? '−' : '+'}</span>
        </div>
      </button>

      {abierto && (
        <ul className="divide-y divide-sa-green-ink/5 border-t border-sa-green-ink/5">
          {grupo.items.map((item) => (
            <Renglon
              key={item.insumo_id}
              item={item}
              modo={modo}
              valor={borrador[item.insumo_id] ?? ''}
              escribir={escribir}
              sumar={sumar}
              abierto={detalle === item.insumo_id}
              alternar={() => verDetalle(detalle === item.insumo_id ? null : item.insumo_id)}
              recargar={recargar}
              avisar={avisar}
              fallar={fallar}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function Renglon({
  item, modo, valor, escribir, sumar, abierto, alternar, recargar, avisar, fallar,
}: {
  item: InsumoEnAlmacen
  modo: Modo
  valor: string
  escribir: (id: string, v: string) => void
  sumar: (id: string, delta: number, base: number) => void
  abierto: boolean
  alternar: () => void
  recargar: () => Promise<void>
  avisar: (t: string) => void
  fallar: (t: string) => void
}) {
  const estado = ESTADOS[item.estado]
  const contado = cuandoSeContó(item)
  // Al contar se parte de lo que el sistema cree que hay; al recibir, de cero.
  // Son dos preguntas distintas: «¿cuántos hay?» y «¿cuántos llegaron?».
  const base = modo === 'contar' ? item.stock : 0

  return (
    <li className="px-5 py-3">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="text-sa-green-ink font-medium truncate">{item.nombre}</div>
          <div className="text-xs text-sa-green-ink/50 mt-0.5">
            {item.presentacion ?? item.unidad}
            <span className={contado.alerta ? 'text-sa-banana' : ''}> · {contado.texto}</span>
          </div>
        </div>

        {modo === 'ver' ? (
          <div className="flex items-center gap-3 shrink-0">
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${estado.clase}`}>
              {estado.texto}
            </span>
            <div className="text-right">
              <div className="font-mono tabular-nums text-lg text-sa-green-ink">{item.stock}</div>
              <div className="text-[11px] text-sa-green-ink/45">
                {item.minimo > 0 ? `mín. ${item.minimo}` : 'sin mínimo'}
              </div>
            </div>
            <button
              onClick={alternar}
              className="text-sa-green-ink/40 hover:text-sa-green px-2 py-1 text-lg leading-none"
              aria-label={`Ajustes de ${item.nombre}`}
            >
              ⋯
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 shrink-0">
            {modo === 'contar' && (
              <span className="font-mono text-xs text-sa-green-ink/45 hidden sm:inline">
                había {item.stock}
              </span>
            )}
            {/* Botones de −1 / +1 además del teclado: contando de a uno frente
                al anaquel es más rápido tocar que teclear, y con guantes de
                horno un campo de texto chico no se acierta. */}
            <button
              className="w-11 h-11 rounded-sa border border-sa-green-ink/15 text-lg text-sa-green-ink hover:bg-sa-cream-soft"
              onClick={() => sumar(item.insumo_id, -1, base)}
              aria-label={`Uno menos de ${item.nombre}`}
            >
              −
            </button>
            <input
              inputMode="decimal"
              value={valor}
              placeholder={String(base)}
              onChange={(e) => escribir(item.insumo_id, e.target.value)}
              className="w-20 h-11 text-center px-2 border border-sa-green-ink/15 rounded-sa font-mono tabular-nums bg-white focus:outline-none focus:ring-2 focus:ring-sa-green/40"
            />
            <button
              className="w-11 h-11 rounded-sa border border-sa-green-ink/15 text-lg text-sa-green-ink hover:bg-sa-cream-soft"
              onClick={() => sumar(item.insumo_id, 1, base)}
              aria-label={`Uno más de ${item.nombre}`}
            >
              +
            </button>
          </div>
        )}
      </div>

      {abierto && modo === 'ver' && (
        <Ajustes item={item} recargar={recargar} avisar={avisar} fallar={fallar} cerrar={alternar} />
      )}
    </li>
  )
}

/** Mínimo y merma. Se esconden porque no son de todos los días. */
function Ajustes({
  item, recargar, avisar, fallar, cerrar,
}: {
  item: InsumoEnAlmacen
  recargar: () => Promise<void>
  avisar: (t: string) => void
  fallar: (t: string) => void
  cerrar: () => void
}) {
  const [minimo, setMinimo] = useState(String(item.minimo))
  const [merma, setMerma] = useState('')
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function guardarMinimo() {
    setOcupado(true)
    try {
      await fijarMinimo(sb, { insumoId: item.insumo_id, minimo: Number(minimo) || 0 })
      avisar(`El mínimo de ${item.nombre} quedó en ${Number(minimo) || 0}.`)
      await recargar()
      cerrar()
    } catch (e) {
      fallar(mensajeDeError(e))
    } finally {
      setOcupado(false)
    }
  }

  async function guardarMerma() {
    const cantidad = Number(merma)
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      fallar('¿Cuánto se tiró? Tiene que ser más que cero.')
      return
    }
    setOcupado(true)
    try {
      await registrarMerma(sb, { insumoId: item.insumo_id, cantidad, motivo })
      avisar(`Se apuntó la merma de ${cantidad} en ${item.nombre}.`)
      await recargar()
      cerrar()
    } catch (e) {
      fallar(mensajeDeError(e))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="mt-3 pt-3 border-t border-sa-green-ink/5 grid gap-4 sm:grid-cols-2">
      <div>
        <div className={cx.label}>Avisarme cuando baje de</div>
        <div className="flex gap-2 mt-1.5">
          <input
            inputMode="decimal"
            value={minimo}
            onChange={(e) => setMinimo(e.target.value.replace(/[^\d.]/g, ''))}
            className={cx.input}
          />
          <button className={cx.btnSec} onClick={guardarMinimo} disabled={ocupado}>
            Guardar
          </button>
        </div>
        <p className="text-xs text-sa-green-ink/50 mt-1.5">
          Debajo de ese número sale en «qué hay que comprar».
        </p>
      </div>

      <div>
        <div className={cx.label}>Se tiró</div>
        <div className="flex gap-2 mt-1.5">
          <input
            inputMode="decimal"
            value={merma}
            placeholder="cuánto"
            onChange={(e) => setMerma(e.target.value.replace(/[^\d.]/g, ''))}
            className={`${cx.input} w-24`}
          />
          <input
            value={motivo}
            placeholder="por qué"
            onChange={(e) => setMotivo(e.target.value)}
            className={cx.input}
          />
          <button className={cx.btnSec} onClick={guardarMerma} disabled={ocupado}>
            Apuntar
          </button>
        </div>
        <p className="text-xs text-sa-green-ink/50 mt-1.5">
          Apuntarlo evita que aparezca como faltante en el próximo conteo.
        </p>
      </div>
    </div>
  )
}

function ListaParaComprar({ lista }: { lista: ListaDeCompra | null }) {
  if (!lista || lista.items === 0) {
    return (
      <Panel>
        <p className="text-sa-green-ink/60">
          No hay nada por comprar. Aparece aquí lo que baja de su mínimo — y para eso hay que
          ponerle mínimo a las cosas, en <strong>Qué hay</strong> → <span className="font-mono">⋯</span>.
        </p>
      </Panel>
    )
  }

  return (
    <div className="space-y-3">
      <Panel>
        <p className="text-sm text-sa-green-ink/70">
          {lista.items} {lista.items === 1 ? 'cosa' : 'cosas'} por comprar
          {lista.agotados > 0 && (
            <>
              , y <strong className="text-sa-green">{lista.agotados}</strong> ya se
              {lista.agotados === 1 ? ' acabó' : ' acabaron'}
            </>
          )}
          .
        </p>
      </Panel>

      {lista.grupos.map((g) => (
        <div key={g.grupo} className="bg-white rounded-sa shadow-sa-sm border border-sa-green-ink/5 overflow-hidden">
          <div className="px-5 py-3 border-b border-sa-green-ink/5 font-display text-lg text-sa-green-ink">
            {g.grupo}
          </div>
          <ul className="divide-y divide-sa-green-ink/5">
            {g.items.map((i) => (
              <li key={i.insumo_id} className="px-5 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sa-green-ink font-medium truncate">{i.nombre}</div>
                  <div className="text-xs text-sa-green-ink/50 mt-0.5">
                    {i.presentacion ?? i.unidad}
                    {i.proveedor && ` · ${i.proveedor}`}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-display text-2xl text-sa-green">
                    {i.faltan}
                    <span className="text-sm text-sa-green-ink/50 ml-1 font-body">
                      {i.unidad}
                    </span>
                  </div>
                  <div className="text-[11px] text-sa-green-ink/45">
                    {i.agotado ? 'no queda nada' : `hay ${i.hay}, mín. ${i.minimo}`}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
