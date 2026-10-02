import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  listarEncargos,
  historialDeEncargos,
  encargosPorDia,
  diasHasta,
  crearEncargo,
  cobrarEncargo,
  cancelarEncargo,
  listarProductosDelDia,
  listarOrdenesConTiempo,
  faltaPara,
  horaDeSalida,
  partirNombreDeVenta,
  type Encargo,
  type ProductoDelDia,
  type OrdenConTiempo,
} from '@lily/supabase'
import { mxn, mensajeDeError, urlDeFoto, medidaDeVenta } from '@lily/utils'
import { sb } from '@/lib/sb'

/**
 * Encargos, desde la caja.
 *
 * Es el otro rubro de la caja, aparte de lo que se cobra de mostrador: alguien
 * llega o llama y aparta piezas para después.
 *
 * La regla que manda aquí: **apartar no es vender**. Las piezas que se apartan
 * se separan en almacén —dejan de estar libres para el mostrador— pero
 * **siguen en el inventario hasta que se pagan**. Cobrar es lo único que
 * descuenta, y cobra por el mismo camino que una venta normal, así que cae en
 * el corte del turno.
 */

const btn =
  'font-mono text-xs uppercase tracking-wide px-4 py-2 rounded-full transition-colors'

/**
 * Un encargo, igual en la cola de pendientes y en el historial.
 *
 * Los botones llegan por `acciones` en vez de estar aquí dentro: lo que se
 * puede hacer con un encargo cambia según dónde se mire —cobrarlo si está
 * apartado, nada más leerlo si ya se entregó— pero lo que DICE es lo mismo, y
 * escrito dos veces se separa en cuanto alguien toque una de las dos.
 */
function Tarjeta({
  e,
  acciones,
  conFecha = false,
}: {
  e: Encargo
  acciones: React.ReactNode
  /**
   * ¿Escribir la fecha completa en la tarjeta?
   *
   * En la cola de pendientes **no**: ya la dice el separador del día, y
   * repetirla en cada tarjeta es ruido. En el historial **sí**, porque ahí no
   * hay separador y la fecha es justo lo que se viene a buscar.
   */
  conFecha?: boolean
}) {
  const vencido = e.fecha_entrega != null && diasHasta(e.fecha_entrega) < 0
  return (
    <div
      key={e.id}
      className={[
        'rounded-sa border p-4 bg-white',
        vencido ? 'border-sa-green-deep/40' : 'border-sa-green-ink/10',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-lg text-sa-green-ink leading-tight">
            {e.cliente}
          </p>
          <p className="font-mono text-[11px] uppercase tracking-wide text-sa-green-ink/50 mt-0.5">
            #{e.folio}
            {e.telefono ? ` · ${e.telefono}` : ''}
          </p>
          {/* Lo que Empaque le contesta a la caja: si ya esta en
              su caja o todavia no. Sin esto, la cajera tiene que
              ir a preguntar cada vez que alguien llega. */}
          {e.empacado_at && (
            <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink bg-sa-mint/25 rounded-full px-2 py-0.5 inline-block mt-1">
              Empacado{e.empacado_por ? ` · ${e.empacado_por}` : ''}
            </p>
          )}
        </div>
        <p
          className={[
            'font-display text-base shrink-0',
            vencido ? 'text-sa-strawberry' : 'text-sa-green-ink/70',
          ].join(' ')}
        >
          {conFecha
            ? e.fecha_entrega
              ? new Date(e.fecha_entrega + 'T12:00:00').toLocaleDateString('es-MX', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                })
              : 'Sin fecha'
            : null}
          {conFecha && e.hora_entrega ? ' · ' : ''}
          {e.hora_entrega || (conFecha ? '' : 'sin hora')}
        </p>
      </div>

      <div className="mt-3 space-y-1">
        {e.items.map((i) => {
          const { sabor, medida } = partirNombreDeVenta(i.producto)
          return (
            <p key={i.id} className="font-body text-sm text-sa-green-ink">
              <span className="font-display text-base">{i.cantidad}</span>{' '}
              {sabor}
              {medida && <span className="text-sa-green-ink/50"> · {medida}</span>}
            </p>
          )
        })}
      </div>

      {e.nota && (
        <p className="font-body text-xs text-sa-green-ink/60 mt-2 bg-sa-cream-soft rounded-sa px-2 py-1.5">
          {e.nota}
        </p>
      )}

      <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-sa-green-ink/8">
        <div>
          <p className="font-display text-xl text-sa-green leading-none">
            {mxn(e.total)}
          </p>
          {e.anticipo > 0 && (
            <p className="font-body text-[11px] text-sa-green-ink/60 mt-0.5">
              anticipo {mxn(e.anticipo)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5">{acciones}</div>
      </div>
    </div>
  )
}

export function Encargos() {
  const navigate = useNavigate()
  const [encargos, setEncargos] = useState<Encargo[]>([])
  /**
   * Pendientes o historial.
   *
   * Hasta hoy un encargo recogido desaparecía de la pantalla, y cuando el
   * cliente volvía con un reclamo no había dónde mirarlo. El historial se pide
   * aparte y solo al abrirlo: son cien tarjetas que nadie necesita mientras
   * atiende el mostrador.
   */
  const [vista, setVista] = useState<'pendientes' | 'historial'>('pendientes')
  const [historial, setHistorial] = useState<Encargo[] | null>(null)
  const [cargandoHistorial, setCargandoHistorial] = useState(false)
  const [existencias, setExistencias] = useState<ProductoDelDia[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

  // Formulario de apartar
  const [nuevo, setNuevo] = useState(false)
  const [cliente, setCliente] = useState('')
  const [telefono, setTelefono] = useState('')
  const [fecha, setFecha] = useState('')
  const [hora, setHora] = useState('')
  const [nota, setNota] = useState('')
  const [piezas, setPiezas] = useState<Record<string, number>>({})
  const [busca, setBusca] = useState('')
  const [guardando, setGuardando] = useState(false)

  // Mandar a producir ya NO vive aqui: vive en el panel de Produccion de la
  // caja, junto a lo que hay en el horno y a lo que queda. Tenerlo en dos
  // lugares era pedirle a quien atiende que recordara en cual de los dos
  // estaba -- y esta pantalla es de ENCARGOS.
  const [horno, setHorno] = useState<OrdenConTiempo[]>([])

  const base = import.meta.env.BASE_URL

  const cargar = useCallback(async (conSpinner = true) => {
    if (conSpinner) setCargando(true)
    try {
      // Las existencias por sabor se dejaron de pedir aqui: eran para
      // "mandar a producir", que ahora vive en el panel de Produccion de la
      // caja. Una consulta menos en una pantalla que se relee sola.
      const [e, x] = await Promise.all([listarEncargos(sb), listarProductosDelDia(sb)])
      setEncargos(e)
      setExistencias(x)
      setError(null)
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    void cargar()
    void listarOrdenesConTiempo(sb).then(setHorno).catch(() => {})
  }, [cargar])

  useEffect(() => {
    if (vista !== 'historial' || historial !== null) return
    setCargandoHistorial(true)
    historialDeEncargos(sb)
      .then(setHistorial)
      .catch((e) => setError(mensajeDeError(e)))
      .finally(() => setCargandoHistorial(false))
  }, [vista, historial])

  // Partidos por día de entrega, que es como los lee el mostrador: una lista
  // corrida de treinta tarjetas no deja ver de cuáles hay que preocuparse hoy.
  const porDia = useMemo(() => encargosPorDia(encargos), [encargos])

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return existencias
    return existencias.filter((f) => f.nombre.toLowerCase().includes(q))
  }, [existencias, busca])

  const cuantas = Object.values(piezas).reduce((s, n) => s + n, 0)
  const totalNuevo = existencias.reduce(
    (s, f) => s + (piezas[f.producto_id] ?? 0) * Number(f.precio),
    0,
  )

  function limpiar() {
    setCliente(''); setTelefono(''); setFecha(''); setHora(''); setNota('')
    setPiezas({}); setBusca(''); setNuevo(false)
  }

  async function apartar() {
    const items = Object.entries(piezas)
      .filter(([, n]) => n > 0)
      .map(([producto_id, cantidad]) => ({ producto_id, cantidad }))
    if (items.length === 0 || cliente.trim().length < 2) return
    setGuardando(true)
    try {
      await crearEncargo(sb, {
        cliente: cliente.trim(),
        items,
        telefono: telefono.trim() || undefined,
        fecha_entrega: fecha || undefined,
        hora_entrega: hora.trim() || undefined,
        nota: nota.trim() || undefined,
      })
      setAviso(`Apartado para ${cliente.trim()}: ${cuantas} pieza${cuantas === 1 ? '' : 's'}.`)
      limpiar()
      await cargar(false)
      setError(null)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setGuardando(false)
    }
  }

  async function cobrar(e: Encargo, metodo: 'efectivo' | 'tarjeta') {
    setOcupado(e.id)
    try {
      const total = await cobrarEncargo(sb, e.id, metodo)
      setAviso(`Cobrado ${mxn(total)} de ${e.cliente}. Ya entró al corte del turno.`)
      await cargar(false)
      setError(null)
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setOcupado(null)
    }
  }

  async function cancelar(e: Encargo) {
    if (!window.confirm(`¿Cancelar el encargo de ${e.cliente}? Sus ${e.piezas} piezas vuelven a quedar libres.`)) return
    setOcupado(e.id)
    try {
      await cancelarEncargo(sb, e.id)
      setAviso(`Encargo de ${e.cliente} cancelado.`)
      await cargar(false)
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setOcupado(null)
    }
  }

  const piezasApartadas = encargos.reduce((s, e) => s + e.piezas, 0)
  const dinero = encargos.reduce((s, e) => s + e.total, 0)

  return (
    <div className="h-screen flex flex-col bg-sa-cream-paper overflow-hidden">
      <header className="flex items-center justify-between px-5 py-3 bg-sa-green-deep text-sa-cream flex-shrink-0">
        <div className="flex items-baseline gap-4 min-w-0">
          <h1 className="font-display text-2xl">Encargos</h1>
          <p className="font-mono text-xs uppercase tracking-wide text-sa-cream/60 truncate">
            {encargos.length} apartados · {piezasApartadas} piezas · {mxn(dinero)}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setNuevo((v) => !v)}
            className={`${btn} bg-sa-cream text-sa-green-deep`}
          >
            {nuevo ? 'Cerrar' : 'Apartar uno nuevo'}
          </button>
          <button
            onClick={() => navigate('/')}
            className={`${btn} bg-sa-cream-warm/10 hover:bg-sa-cream-warm/20 border border-sa-cream/20`}
          >
            Volver a la caja
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {error && (
          <p className="font-body bg-sa-strawberry/15 border-l-4 border-sa-strawberry rounded-sa px-4 py-3 text-sa-green-ink">
            {error}
          </p>
        )}
        {aviso && (
          <div className="flex items-start gap-3 bg-sa-mint/10 border-l-4 border-sa-mint rounded-sa px-4 py-3">
            <p className="font-body text-sm text-sa-green-ink flex-1">{aviso}</p>
            <button
              onClick={() => setAviso(null)}
              className="font-mono text-xs uppercase text-sa-green-ink/50"
            >
              Cerrar
            </button>
          </div>
        )}

        {/* Lo que ya esta en el horno, con su hora estimada. */}
        {horno.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap bg-sa-cream-warm/60 rounded-sa px-4 py-3">
            <span className="font-mono text-[11px] uppercase tracking-wide text-sa-green-ink/60">
              En el horno
            </span>
            {horno.map((o) => {
              const f = faltaPara(o.listo_estimado)
              return (
                <span
                  key={o.id}
                  className={[
                    'rounded-full px-3 py-1 font-body text-sm',
                    f.tarde ? 'bg-sa-strawberry/20' : 'bg-white',
                  ].join(' ')}
                >
                  <b>{o.piezas_pedidas - o.piezas_hechas}</b> piezas · {f.texto}
                  <span className="text-sa-green-ink/45"> ({horaDeSalida(o.listo_estimado)})</span>
                </span>
              )
            })}
          </div>
        )}

        {nuevo && (
          <section className="bg-white rounded-sa shadow-sa-sm p-5 space-y-4">
            <p className="font-display text-xl text-sa-green-ink">Apartar un encargo</p>
            <p className="font-body text-sm text-sa-green-ink/60 -mt-2">
              Se separa en almacén. No se descuenta del inventario hasta que se
              cobre.
            </p>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <input
                className="px-3 py-2.5 border border-sa-green-ink/15 rounded-sa text-sm"
                placeholder="¿Quién encarga?"
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
              />
              <input
                className="px-3 py-2.5 border border-sa-green-ink/15 rounded-sa text-sm"
                placeholder="Teléfono"
                inputMode="tel"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
              />
              <input
                type="date"
                className="px-3 py-2.5 border border-sa-green-ink/15 rounded-sa text-sm"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
              />
              <input
                className="px-3 py-2.5 border border-sa-green-ink/15 rounded-sa text-sm"
                placeholder="Hora (10:00)"
                value={hora}
                onChange={(e) => setHora(e.target.value)}
              />
            </div>

            <input
              className="w-full px-3 py-2.5 border border-sa-green-ink/15 rounded-sa text-sm"
              placeholder="Buscar sabor…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 max-h-72 overflow-y-auto">
              {filtradas.map((f) => {
                const { sabor, medida } = partirNombreDeVenta(f.nombre)
                const n = piezas[f.producto_id] ?? 0
                const foto = urlDeFoto(f.imagen_url, base)
                return (
                  <div
                    key={f.producto_id}
                    className={[
                      'flex items-center gap-2 rounded-sa border p-2',
                      n > 0 ? 'border-sa-green bg-sa-green/5' : 'border-sa-green-ink/10',
                    ].join(' ')}
                  >
                    {foto && <img src={foto} alt="" className="w-10 h-10 object-contain shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <p className="font-body text-sm text-sa-green-ink leading-tight truncate">
                        {sabor}
                      </p>
                      <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/45">
                        {[
                          medida || medidaDeVenta(f).texto,
                          // `null` no es cero: las roscas, las trenzas, la
                          // Hojaldra de Corazon y los panes se hornean para el
                          // pedido, asi que no hay existencia que agotar. Leer
                          // ese null como «0 libres» escondia del mostrador
                          // justo lo que siempre se puede encargar.
                          f.paquetes_posibles === null
                            ? 'se hornea al pedido'
                            : `${f.paquetes_posibles} libre${f.paquetes_posibles === 1 ? '' : 's'}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() =>
                          setPiezas((p) => ({ ...p, [f.producto_id]: Math.max(0, n - 1) }))
                        }
                        disabled={n === 0}
                        className="w-8 h-8 rounded-full border border-sa-green-ink/15 text-sa-green-ink/60 disabled:opacity-25"
                      >
                        −
                      </button>
                      <span className="font-mono text-sm w-6 text-center tabular-nums">{n}</span>
                      <button
                        onClick={() => setPiezas((p) => ({ ...p, [f.producto_id]: n + 1 }))}
                        className="w-8 h-8 rounded-full bg-sa-green text-sa-cream"
                      >
                        +
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            <input
              className="w-full px-3 py-2.5 border border-sa-green-ink/15 rounded-sa text-sm"
              placeholder="Nota (para un bautizo, sin azúcar glass…)"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
            />

            <div className="flex items-center justify-between gap-4">
              <p className="font-body text-sm text-sa-green-ink/70">
                {cuantas > 0
                  ? `${cuantas} pieza${cuantas === 1 ? '' : 's'} · ${mxn(totalNuevo)}`
                  : 'Todavía no ha puesto nada'}
              </p>
              <div className="flex items-center gap-2">
                <button onClick={limpiar} className={`${btn} border border-sa-green-ink/15 text-sa-green-ink`}>
                  Cancelar
                </button>
                <button
                  onClick={() => void apartar()}
                  disabled={cuantas === 0 || cliente.trim().length < 2 || guardando}
                  className="bg-sa-green hover:bg-sa-green-deep text-sa-cream px-6 py-2.5 rounded-sa font-medium text-sm disabled:opacity-40 transition-colors"
                >
                  {guardando ? 'Apartando…' : 'Apartar'}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Dos listas: la cola de lo que viene, y lo que ya pasó. */}
        <div className="flex gap-2">
          {(['pendientes', 'historial'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setVista(v)}
              className={[
                btn,
                vista === v
                  ? 'bg-sa-green text-sa-cream'
                  : 'border border-sa-green-ink/15 text-sa-green-ink/60',
              ].join(' ')}
            >
              {v === 'pendientes'
                ? `Pendientes${encargos.length ? ` · ${encargos.length}` : ''}`
                : 'Historial'}
            </button>
          ))}
        </div>

        {vista === 'historial' ? (
          cargandoHistorial ? (
            <p className="font-mono text-sm text-sa-green-ink/50 text-center py-12">Cargando…</p>
          ) : (historial ?? []).length === 0 ? (
            <div className="bg-white rounded-sa shadow-sa-sm p-8 text-center">
              <p className="font-display text-2xl text-sa-green-ink">Todavía no hay historial</p>
              <p className="font-body text-sa-green-ink/60 mt-2">
                Aquí van quedando los encargos que ya se cobraron, se entregaron
                o se cancelaron, para cuando alguien vuelva a preguntar.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {(historial ?? []).map((e) => (
                <Tarjeta
                  key={e.id}
                  e={e}
                  conFecha
                  acciones={
                    <span className="font-mono text-[11px] uppercase tracking-wide text-sa-green-ink/60 bg-sa-cream-soft rounded-full px-3 py-1.5">
                      {e.estado}
                    </span>
                  }
                />
              ))}
            </div>
          )
        ) : cargando ? (
          <p className="font-mono text-sm text-sa-green-ink/50 text-center py-12">Cargando…</p>
        ) : encargos.length === 0 ? (
          <div className="bg-white rounded-sa shadow-sa-sm p-8 text-center">
            <p className="font-display text-2xl text-sa-green-ink">No hay nada apartado</p>
            <p className="font-body text-sa-green-ink/60 mt-2">
              Cuando alguien encargue piezas, se separan aquí hasta que las
              pague.
            </p>
          </div>
        ) : (
          /* Partidos por día de entrega, con su separador. Así se lee de un
             vistazo cuáles son de HOY, que es la única pregunta urgente. */
          <div className="space-y-5">
            {porDia.map((d) => (
              <div key={d.fecha ?? 'sin-fecha'} className="space-y-3">
                <div className="flex items-baseline gap-3">
                  <p
                    className={[
                      'font-display text-xl leading-none',
                      // Lo que se pasó de su día va en carmín profundo, no en
                      // el rosa salmón: ese rosa es un acento de la marca y a
                      // un metro de distancia se ve despintado -- justo lo
                      // que no puede pasarle a lo único urgente de la lista.
                      d.vencido
                        ? 'text-sa-green-deep bg-sa-strawberry/25 rounded-full px-3 py-1'
                        : 'text-sa-green-ink',
                    ].join(' ')}
                  >
                    {d.titulo}
                  </p>
                  <span className="font-mono text-[11px] uppercase tracking-wide text-sa-green-ink/45">
                    {d.encargos.length} encargo{d.encargos.length === 1 ? '' : 's'}
                  </span>
                  <span className="flex-1 border-b border-sa-green-ink/10" />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {d.encargos.map((e) => (
                    <Tarjeta
                      key={e.id}
                      e={e}
                      acciones={
                        <>
                          <button
                            onClick={() => void cancelar(e)}
                            disabled={ocupado === e.id}
                            className={`${btn} border border-sa-green-ink/15 text-sa-green-ink/70`}
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={() => void cobrar(e, 'efectivo')}
                            disabled={ocupado === e.id}
                            className="bg-sa-green hover:bg-sa-green-deep text-sa-cream px-4 py-2 rounded-full font-mono text-xs uppercase tracking-wide disabled:opacity-40 transition-colors"
                          >
                            {ocupado === e.id ? '…' : 'Efectivo'}
                          </button>
                          <button
                            onClick={() => void cobrar(e, 'tarjeta')}
                            disabled={ocupado === e.id}
                            className="bg-sa-green-ink hover:bg-sa-green-ink/85 text-sa-cream px-4 py-2 rounded-full font-mono text-xs uppercase tracking-wide disabled:opacity-40 transition-colors"
                          >
                            Terminal
                          </button>
                        </>
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
