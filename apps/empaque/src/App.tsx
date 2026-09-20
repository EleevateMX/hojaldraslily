import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  listarEncargos,
  cobrarEncargo,
  marcarEmpacado,
  loQueHayQueEmpacar,
  minutosDeHora,
  partirNombreDeVenta,
  entrarConPin,
  empleadoDeLaSesion,
  salirDeSesion,
  type Encargo,
  type PorEmpacar,
  type EmpleadoSesion,
} from '@lily/supabase'
import { CandadoDeEstacion } from '@lily/ui'
import { mxn, mensajeDeError, urlDeFoto } from '@lily/utils'
import { sb } from './lib/sb'

/**
 * La pantalla de Empaque: la **E** del camino C → P → H → E.
 *
 * Es la última mesa. Llega el pan que salió del horno y de aquí sale metido en
 * su caja, con el nombre de quien lo encargó. Los **encargos son lo primero**
 * del negocio, y esta pantalla existe para que ninguno se quede sin empacar.
 *
 * Tiene tres partes y las tres contestan una pregunta distinta:
 *
 * 1. **Qué hay que empacar** — sumado POR PRODUCTO, no por cliente. Quien
 *    empaca va al mostrador y corta paquetes: lo que necesita es «ocho Fiesta
 *    de 24», no ocho tarjetas para sumar a mano. Es la respuesta a «¿qué tanto
 *    se necesita empacar?».
 * 2. **Por empacar** — la cola de trabajo, por hora de entrega. Ahí sí va el
 *    detalle, porque para empacar hace falta saber qué lleva cada caja.
 * 3. **Listos, esperando al cliente** — renglones compactos. Ya no son
 *    trabajo, son nombres que se buscan cuando alguien llega.
 *
 * Lo que sale de la cola cuando se marca empacado no desaparece: baja a la
 * repisa de listos. Un encargo empacado sigue apartado, y sigue contado en el
 * inventario: **apartar no es vender, y empacar tampoco**. Lo único que
 * descuenta y mete el dinero al corte es «Entregar y cobrar».
 */

const REFRESCO_MS = 15000

/** Si un encargo es de los que se empacan HOY. */
function esDeHoy(e: Encargo): boolean {
  if (!e.fecha_entrega) return true // "paso más tarde" es hoy
  const entrega = new Date(e.fecha_entrega + 'T12:00:00')
  const hoy = new Date()
  hoy.setHours(12, 0, 0, 0)
  return entrega.getTime() <= hoy.getTime()
}

/**
 * Cuándo pasan por el encargo, en palabras.
 *
 * Las dos fechas se comparan al MEDIODÍA. Comparar la entrega contra el
 * arranque del día daba medio día de diferencia y el redondeo rotulaba
 * «Mañana» un encargo de HOY — justo el que hay que tener listo.
 */
function cuando(fecha: string | null, hora: string | null): { texto: string; urgente: boolean } {
  if (!fecha) return { texto: hora ? `Sin fecha · ${hora}` : 'Sin fecha', urgente: false }
  const entrega = new Date(fecha + 'T12:00:00')
  const hoy = new Date()
  hoy.setHours(12, 0, 0, 0)
  const dias = Math.round((entrega.getTime() - hoy.getTime()) / 86400000)
  const sufijo = hora ? ` · ${hora}` : ''
  if (dias < 0) return { texto: `Se pasó ${-dias} día${dias === -1 ? '' : 's'}${sufijo}`, urgente: true }
  if (dias === 0) return { texto: `Hoy${sufijo}`, urgente: true }
  if (dias === 1) return { texto: `Mañana${sufijo}`, urgente: false }
  return {
    texto:
      entrega.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }) + sufijo,
    urgente: false,
  }
}

/**
 * Por hora de entrega, y sin hora al final.
 *
 * El que pasa a las nueve se empaca antes que el que pasa a las seis, aunque
 * lo haya apartado después. Ordenar por cuándo se apartó —que es lo que hacía
 * la lista— es ordenar por una fecha que a nadie le sirve.
 */
function porHora(a: Encargo, b: Encargo): number {
  const fa = a.fecha_entrega ?? '9999-12-31'
  const fb = b.fecha_entrega ?? '9999-12-31'
  if (fa !== fb) return fa < fb ? -1 : 1
  const ha = minutosDeHora(a.hora_entrega)
  const hb = minutosDeHora(b.hora_entrega)
  if (ha === hb) return a.created_at < b.created_at ? -1 : 1
  if (ha === null) return 1
  if (hb === null) return -1
  return ha - hb
}

/**
 * Lo que hay que empacar, en números grandes y por producto.
 *
 * Va arriba de todo y se lee de lejos a propósito: es lo que quien empaca
 * mira antes de ir por el pan. Si está vacío no se pinta — una franja que
 * siempre está ahí diciendo «0» deja de mirarse.
 */
function QueHayQueEmpacar({ lista }: { lista: PorEmpacar[] }) {
  if (lista.length === 0) return null
  const total = lista.reduce((s, p) => s + p.cantidad, 0)

  return (
    <section className="bg-sa-banana/15 border-2 border-sa-banana rounded-sa-lg p-5">
      <div className="flex items-baseline justify-between gap-4 mb-4">
        <p className="font-display text-2xl text-sa-green-ink">Hay que empacar</p>
        <p className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/50">
          {total} pieza{total === 1 ? '' : 's'} para hoy
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {lista.map((p) => {
          const { sabor, medida } = partirNombreDeVenta(p.producto)
          const foto = urlDeFoto(p.imagen_url, import.meta.env.BASE_URL)
          return (
            <div
              key={p.producto_id}
              className="bg-white rounded-sa p-3 flex items-center gap-3 border border-sa-banana/40"
            >
              {foto && <img src={foto} alt="" className="w-12 h-12 object-contain shrink-0" />}
              <div className="min-w-0 flex-1">
                <p className="font-display text-4xl leading-none text-sa-green-ink tabular-nums">
                  {p.cantidad}
                </p>
                <p className="font-body text-sm text-sa-green-ink leading-tight mt-1 truncate">
                  {sabor}
                  {medida && <span className="text-sa-green-ink/50"> · {medida}</span>}
                </p>
                {p.encargos > 1 && (
                  <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/45 mt-0.5">
                    {p.encargos} encargos
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** Un encargo por empacar: con todo su detalle, que es lo que se mete a la caja. */
function Tarjeta({
  e,
  ocupado,
  onEmpacar,
}: {
  e: Encargo
  ocupado: boolean
  onEmpacar: () => void
}) {
  const c = cuando(e.fecha_entrega, e.hora_entrega)

  return (
    <section
      className={[
        'rounded-sa-lg border-2 p-5 bg-white',
        c.urgente ? 'border-sa-green' : 'border-sa-green-ink/10',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-display text-3xl text-sa-green-ink leading-tight">{e.cliente}</p>
          <p className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/50 mt-1">
            Encargo #{e.folio}
            {e.telefono ? ` · ${e.telefono}` : ''}
          </p>
        </div>
        <div
          className={[
            'shrink-0 text-right rounded-sa px-4 py-2',
            c.urgente ? 'bg-sa-green text-sa-cream' : 'bg-sa-cream-warm text-sa-green-ink',
          ].join(' ')}
        >
          <p className="font-mono text-[10px] uppercase tracking-wide opacity-70">Pasan por él</p>
          <p className="font-display text-xl leading-tight mt-0.5">{c.texto}</p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {e.items.map((i) => {
          const { sabor, medida } = partirNombreDeVenta(i.producto)
          const foto = urlDeFoto(i.imagen_url, import.meta.env.BASE_URL)
          return (
            <div key={i.id} className="flex items-center gap-3">
              {foto && <img src={foto} alt="" className="w-12 h-12 object-contain shrink-0" />}
              <span className="font-display text-2xl text-sa-green-ink w-12 shrink-0 tabular-nums">
                {i.cantidad}
              </span>
              <span className="font-body text-lg text-sa-green-ink flex-1 min-w-0">
                {sabor}
                {medida && <span className="text-sa-green-ink/50"> · {medida}</span>}
              </span>
            </div>
          )
        })}
      </div>

      {e.nota && (
        <p className="font-body text-sm text-sa-green-ink/70 mt-3 bg-sa-cream-soft rounded-sa px-3 py-2">
          {e.nota}
        </p>
      )}

      <div className="flex items-center justify-between gap-4 mt-5 pt-4 border-t border-sa-green-ink/10">
        <div>
          <p className="font-display text-2xl text-sa-green-ink/70 leading-none">{mxn(e.total)}</p>
          {e.anticipo > 0 && (
            <p className="font-body text-xs text-sa-green-ink/60 mt-1">
              Dejó {mxn(e.anticipo)} · faltan {mxn(e.total - e.anticipo)}
            </p>
          )}
        </div>
        {/* El único botón de esta tarjeta. Cobrar NO va aquí: se cobra cuando
            el cliente llega, y para entonces el encargo ya bajó a la repisa de
            listos. Dos botones en la mesa de empaque es cobrar por error. */}
        <button
          onClick={onEmpacar}
          disabled={ocupado}
          className="bg-sa-blueberry hover:brightness-110 text-sa-cream font-display text-xl px-8 py-4 rounded-sa-lg active:scale-95 transition-all disabled:opacity-50"
        >
          {ocupado ? 'Guardando…' : 'Ya está empacado'}
        </button>
      </div>
    </section>
  )
}

/** Un encargo ya empacado: compacto, porque ya no es trabajo sino un nombre. */
function Listo({
  e,
  ocupado,
  onEntregar,
  onDesmarcar,
}: {
  e: Encargo
  ocupado: boolean
  onEntregar: () => void
  onDesmarcar: () => void
}) {
  const c = cuando(e.fecha_entrega, e.hora_entrega)
  return (
    <div className="flex items-center gap-4 bg-white rounded-sa border border-sa-mint/50 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-display text-xl text-sa-green-ink leading-tight truncate">
          {e.cliente}
          <span className="font-mono text-xs text-sa-green-ink/45"> · #{e.folio}</span>
        </p>
        <p className="font-mono text-[11px] uppercase tracking-wide text-sa-green-ink/50 mt-0.5">
          {c.texto} · {e.piezas} pieza{e.piezas === 1 ? '' : 's'}
          {e.empacado_por ? ` · empacó ${e.empacado_por}` : ''}
        </p>
      </div>
      <p className="font-display text-xl text-sa-green shrink-0">{mxn(e.total)}</p>
      {/* Desmarcar existe porque marcar de más pasa, y sin salida alguien
          "arregla" el error entregando un encargo que no está empacado. */}
      <button
        onClick={onDesmarcar}
        disabled={ocupado}
        className="shrink-0 font-mono text-[11px] uppercase tracking-wide text-sa-green-ink/45 hover:text-sa-strawberry px-2 py-2 disabled:opacity-40"
        title="No estaba empacado, devolverlo a la cola"
      >
        Devolver
      </button>
      <button
        onClick={onEntregar}
        disabled={ocupado}
        className="shrink-0 bg-sa-green hover:bg-sa-green-deep text-sa-cream font-display text-lg px-6 py-3 rounded-sa active:scale-95 transition-all disabled:opacity-50"
      >
        {ocupado ? 'Cobrando…' : 'Entregar y cobrar'}
      </button>
    </div>
  )
}

export default function App() {
  const [empleado, setEmpleado] = useState<EmpleadoSesion | null>(null)
  const [revisando, setRevisando] = useState(true)
  const [encargos, setEncargos] = useState<Encargo[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      setEmpleado(await empleadoDeLaSesion(sb))
      setRevisando(false)
    })()
  }, [])

  const cargar = useCallback(async (conSpinner = false) => {
    if (conSpinner) setCargando(true)
    try {
      setEncargos(await listarEncargos(sb))
      setError(null)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    if (!empleado) return
    void cargar(true)
    // Se relee sola: la caja aparta desde el mostrador y esto tiene que
    // aparecer aquí sin que nadie vaya a recargar la pantalla.
    const t = setInterval(() => void cargar(), REFRESCO_MS)
    return () => clearInterval(t)
  }, [empleado, cargar])

  // Las tres pilas. `porEmpacar` es la cola de trabajo de hoy; `masAdelante`
  // es lo que todavía no toca y se muestra abajo para que nadie se adelante;
  // `listos` es la repisa.
  const { porEmpacar, masAdelante, listos, queEmpacar } = useMemo(() => {
    const sinEmpacar = encargos.filter((e) => !e.empacado_at)
    const hoy = sinEmpacar.filter(esDeHoy).sort(porHora)
    return {
      porEmpacar: hoy,
      masAdelante: sinEmpacar.filter((e) => !esDeHoy(e)).sort(porHora),
      listos: encargos.filter((e) => e.empacado_at).sort(porHora),
      queEmpacar: loQueHayQueEmpacar(hoy),
    }
  }, [encargos])

  async function empacar(e: Encargo, empacado: boolean) {
    setOcupado(e.id)
    try {
      await marcarEmpacado(sb, e.id, empacado)
      await cargar()
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setOcupado(null)
    }
  }

  async function entregar(e: Encargo) {
    setOcupado(e.id)
    try {
      const total = await cobrarEncargo(sb, e.id, 'efectivo')
      setAviso(`Entregado a ${e.cliente}. Se cobraron ${mxn(total)} y ya salieron del inventario.`)
      await cargar()
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setOcupado(null)
    }
  }

  if (revisando) {
    return (
      <div className="min-h-screen grid place-items-center bg-sa-cream-paper">
        <p className="font-mono text-sm uppercase tracking-wide text-sa-green-ink/50">
          Un momento…
        </p>
      </div>
    )
  }

  if (!empleado)
    return (
      <CandadoDeEstacion
        estacion="Empaque"
        logo={`${import.meta.env.BASE_URL}logo-negativo.png`}
        onEntrar={async (pin) => {
          const r = await entrarConPin(sb, pin)
          if (!r.ok || !r.empleado) return r.error ?? 'PIN incorrecto'
          setEmpleado(r.empleado)
          return null
        }}
      />
    )

  const piezas = porEmpacar.reduce((s, e) => s + e.piezas, 0)

  return (
    <div className="min-h-screen bg-sa-cream-paper text-sa-green-ink">
      <header className="bg-sa-green-deep text-sa-cream px-6 py-5 flex items-center gap-5">
        <img
          src={`${import.meta.env.BASE_URL}logo-negativo.png`}
          alt="Hojaldras Lily"
          className="h-16 w-auto"
        />
        <div className="flex-1 min-w-0">
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-sa-banana">Empaque</p>
          {/* El titular es la cola, no el total. «12 encargos apartados» no
              dice si hay algo que hacer; «faltan 3 por empacar» sí. */}
          <h1 className="font-display text-4xl leading-none mt-1">
            {porEmpacar.length > 0
              ? `Faltan ${porEmpacar.length} por empacar`
              : listos.length > 0
                ? 'Todo empacado'
                : 'Nada apartado'}
          </h1>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-[11px] uppercase tracking-wide text-sa-cream/50">
            {piezas} pieza{piezas === 1 ? '' : 's'} por empacar
          </p>
          <p className="font-display text-2xl leading-none mt-1">
            {listos.length} listo{listos.length === 1 ? '' : 's'}
          </p>
        </div>
        <button
          onClick={() => void salirDeSesion(sb).then(() => setEmpleado(null))}
          className="shrink-0 font-mono text-xs uppercase tracking-wide bg-sa-cream/10 hover:bg-sa-cream/20 rounded-full px-4 py-2 transition-colors"
        >
          {empleado.nombre} · Salir
        </button>
      </header>

      <main className="p-6 space-y-5 max-w-5xl mx-auto">
        {error && (
          <p className="font-body bg-sa-strawberry/15 border-l-4 border-sa-strawberry rounded-sa px-4 py-3">
            {error}
          </p>
        )}
        {aviso && (
          <div className="flex items-start gap-3 bg-sa-mint/15 border-l-4 border-sa-mint rounded-sa px-4 py-3">
            <p className="font-body flex-1">{aviso}</p>
            <button
              onClick={() => setAviso(null)}
              className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/50"
            >
              Cerrar
            </button>
          </div>
        )}

        {cargando ? (
          <p className="font-mono text-sm uppercase tracking-wide text-sa-green-ink/45 text-center py-16">
            Cargando…
          </p>
        ) : encargos.length === 0 ? (
          <div className="text-center py-20">
            <img
              src={`${import.meta.env.BASE_URL}hojaldra.png`}
              alt=""
              className="h-32 mx-auto opacity-70 mb-5"
            />
            <p className="font-display text-3xl">No hay nada apartado</p>
            <p className="font-body text-sa-green-ink/60 mt-2 max-w-sm mx-auto">
              Cuando la caja aparte un encargo, aparece aquí solo con la hora
              en que pasan por él.
            </p>
          </div>
        ) : (
          <>
            <QueHayQueEmpacar lista={queEmpacar} />

            {porEmpacar.map((e) => (
              <Tarjeta
                key={e.id}
                e={e}
                ocupado={ocupado === e.id}
                onEmpacar={() => void empacar(e, true)}
              />
            ))}

            {listos.length > 0 && (
              <section className="pt-2">
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-sa-green-ink/45 mb-3">
                  Listos, esperando al cliente
                </p>
                <div className="space-y-2">
                  {listos.map((e) => (
                    <Listo
                      key={e.id}
                      e={e}
                      ocupado={ocupado === e.id}
                      onEntregar={() => void entregar(e)}
                      onDesmarcar={() => void empacar(e, false)}
                    />
                  ))}
                </div>
              </section>
            )}

            {masAdelante.length > 0 && (
              <section className="pt-2">
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-sa-green-ink/45 mb-3">
                  Más adelante
                </p>
                <div className="space-y-5">
                  {masAdelante.map((e) => (
                    <Tarjeta
                      key={e.id}
                      e={e}
                      ocupado={ocupado === e.id}
                      onEmpacar={() => void empacar(e, true)}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}
