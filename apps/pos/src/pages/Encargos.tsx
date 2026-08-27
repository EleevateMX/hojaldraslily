import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  listarEncargos,
  crearEncargo,
  cobrarEncargo,
  cancelarEncargo,
  listarExistenciasDelDia,
  mandarAProducir,
  listarOrdenesConTiempo,
  faltaPara,
  horaDeSalida,
  partirNombreDeVenta,
  type Encargo,
  type ExistenciaDelDia,
  type OrdenConTiempo,
} from '@shake/supabase'
import { mxn, mensajeDeError, urlDeFoto } from '@shake/utils'
import { usePosStore } from '@/store/posStore'
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

function diasHasta(fecha: string): number {
  // Las dos fechas al mediodía: comparar contra la medianoche daba medio día
  // de diferencia y `Math.round` rotulaba «Mañana» un encargo de HOY.
  const entrega = new Date(fecha + 'T12:00:00')
  const hoy = new Date()
  hoy.setHours(12, 0, 0, 0)
  return Math.round((entrega.getTime() - hoy.getTime()) / 86400000)
}

function diaLegible(fecha: string | null): string {
  if (!fecha) return 'Sin fecha'
  const d = diasHasta(fecha)
  if (d === 0) return 'Hoy'
  if (d === 1) return 'Mañana'
  if (d < 0) return `Se pasó ${-d} día${d === -1 ? '' : 's'}`
  return new Date(fecha + 'T12:00:00').toLocaleDateString('es-MX', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

const btn =
  'font-mono text-xs uppercase tracking-wide px-4 py-2 rounded-full transition-colors'

export function Encargos() {
  const navigate = useNavigate()
  const [encargos, setEncargos] = useState<Encargo[]>([])
  const [existencias, setExistencias] = useState<ExistenciaDelDia[]>([])
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

  // Mandar a producir, desde la caja.
  //
  // La duena atiende la caja: cuando ve que se estan acabando las bolitas de
  // queso no tiene por que irse a Admin a pedirlas. Solo gerencia: un cajero
  // no decide que se hornea.
  const empleado = usePosStore((s) => s.empleado)
  const esGerencia = ['administrador', 'gerente'].includes(empleado?.rol ?? '')
  const [modoProducir, setModoProducir] = useState(false)
  const [aProducir, setAProducir] = useState<Record<string, number>>({})
  const [mandando, setMandando] = useState(false)
  const [horno, setHorno] = useState<OrdenConTiempo[]>([])

  const base = import.meta.env.BASE_URL

  const cargar = useCallback(async (conSpinner = true) => {
    if (conSpinner) setCargando(true)
    try {
      const [e, x] = await Promise.all([listarEncargos(sb), listarExistenciasDelDia(sb)])
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

  async function mandarAlHorno() {
    const items = Object.entries(aProducir)
      .filter(([, n]) => n > 0)
      .map(([producto_id, cantidad]) => ({ producto_id, cantidad }))
    if (items.length === 0) return
    setMandando(true)
    try {
      await mandarAProducir(sb, items)
      const piezas = items.reduce((s, i) => s + i.cantidad, 0)
      setAviso(`Mandadas a hacer ${piezas} pieza${piezas === 1 ? '' : 's'}. Ya salió en la pantalla del horno.`)
      setAProducir({})
      setModoProducir(false)
      setError(null)
      setHorno(await listarOrdenesConTiempo(sb))
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setMandando(false)
    }
  }

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

  const aHornear = Object.values(aProducir).reduce((s, n) => s + n, 0)
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
            onClick={() => { setNuevo((v) => !v); setModoProducir(false) }}
            className={`${btn} bg-sa-cream text-sa-green-deep`}
          >
            {nuevo ? 'Cerrar' : 'Apartar uno nuevo'}
          </button>
          {/* Solo gerencia: un cajero no decide que se hornea. */}
          {esGerencia && (
            <button
              onClick={() => { setModoProducir((v) => !v); setNuevo(false) }}
              className={`${btn} bg-sa-banana/25 text-sa-cream border border-sa-banana/50`}
            >
              {modoProducir ? 'Cerrar' : 'Mandar a producir'}
            </button>
          )}
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

        {modoProducir && (
          <section className="bg-white rounded-sa shadow-sa-sm p-5 space-y-4">
            <div>
              <p className="font-display text-xl text-sa-green-ink">Mandar a producir</p>
              <p className="font-body text-sm text-sa-green-ink/60 mt-0.5">
                Sale en la pantalla del horno. Cuando lo marquen hecho, entra
                solo al inventario.
              </p>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 max-h-72 overflow-y-auto">
              {existencias.map((f) => {
                const { sabor, medida } = partirNombreDeVenta(f.nombre)
                const n = aProducir[f.producto_id] ?? 0
                const foto = urlDeFoto(f.imagen_url, base)
                return (
                  <div
                    key={f.producto_id}
                    className={[
                      'flex items-center gap-2 rounded-sa border p-2',
                      n > 0 ? 'border-sa-banana bg-sa-banana/10' : 'border-sa-green-ink/10',
                    ].join(' ')}
                  >
                    {foto && <img src={foto} alt="" className="w-10 h-10 object-contain shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <p className="font-body text-sm text-sa-green-ink leading-tight truncate">
                        {sabor}
                      </p>
                      <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/45">
                        {medida ? medida + ' · ' : ''}quedan {Math.max(0, f.libres)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() =>
                          setAProducir((p) => ({ ...p, [f.producto_id]: Math.max(0, n - 5) }))
                        }
                        disabled={n === 0}
                        className="w-8 h-8 rounded-full border border-sa-green-ink/15 text-sa-green-ink/60 disabled:opacity-25"
                      >
                        −
                      </button>
                      <span className="font-mono text-sm w-7 text-center tabular-nums">{n}</span>
                      <button
                        onClick={() => setAProducir((p) => ({ ...p, [f.producto_id]: n + 5 }))}
                        className="w-8 h-8 rounded-full bg-sa-green text-sa-cream"
                      >
                        +
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="flex items-center justify-between gap-4">
              <p className="font-body text-sm text-sa-green-ink/70">
                {aHornear > 0
                  ? `${aHornear} pieza${aHornear === 1 ? '' : 's'} en la orden`
                  : 'Todavía no ha puesto nada'}
              </p>
              <button
                onClick={() => void mandarAlHorno()}
                disabled={aHornear === 0 || mandando}
                className="bg-sa-green hover:bg-sa-green-deep text-sa-cream px-6 py-2.5 rounded-sa font-medium text-sm disabled:opacity-40 transition-colors"
              >
                {mandando ? 'Mandando…' : 'Mandar al horno'}
              </button>
            </div>
          </section>
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
                        {medida ? medida + ' · ' : ''}
                        {Math.max(0, f.libres)} libre{f.libres === 1 ? '' : 's'}
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

        {cargando ? (
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {encargos.map((e) => {
              const vencido = e.fecha_entrega != null && diasHasta(e.fecha_entrega) < 0
              return (
                <div
                  key={e.id}
                  className={[
                    'rounded-sa border p-4 bg-white',
                    vencido ? 'border-sa-strawberry/50' : 'border-sa-green-ink/10',
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
                    </div>
                    <p
                      className={[
                        'font-display text-base shrink-0',
                        vencido ? 'text-sa-strawberry' : 'text-sa-green-ink/70',
                      ].join(' ')}
                    >
                      {diaLegible(e.fecha_entrega)}
                      {e.hora_entrega ? ` · ${e.hora_entrega}` : ''}
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
                    <div className="flex items-center gap-1.5">
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
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
