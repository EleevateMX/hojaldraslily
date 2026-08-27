import { useCallback, useEffect, useState } from 'react'
import {
  listarEncargos,
  cobrarEncargo,
  partirNombreDeVenta,
  entrarConPin,
  empleadoDeLaSesion,
  salirDeSesion,
  type Encargo,
  type EmpleadoSesion,
} from '@shake/supabase'
import { mxn, mensajeDeError, urlDeFoto } from '@shake/utils'
import { sb } from './lib/sb'

/**
 * El visor de Almacén.
 *
 * Ocupa el lugar que tenían las pantallas de comandas de barra y cocina: en
 * una panadería no se despacha por comanda, se despacha por **encargo**.
 *
 * Aquí se ve lo que está apartado, **de quién es y a qué hora pasan por él**,
 * ordenado por quién llega primero. Cuando el cliente llega y se le entrega,
 * alguien toca «Entregar y cobrar» — y ESE es el momento en que se hace la
 * venta: se descuenta del inventario y el dinero entra a las ventas del día.
 *
 * Hasta entonces la mercancía sigue contada: **apartar no es vender**. Si el
 * cliente nunca llega, nunca se fue nada.
 */

const REFRESCO_MS = 15000

function Candado({ onEntra }: { onEntra: (e: EmpleadoSesion) => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [entrando, setEntrando] = useState(false)

  async function entrar(valor: string) {
    if (valor.length < 4 || entrando) return
    setEntrando(true)
    setError(null)
    const r = await entrarConPin(sb, valor)
    setPin('')
    if (!r.ok || !r.empleado) setError(r.error ?? 'PIN incorrecto')
    else onEntra(r.empleado)
    setEntrando(false)
  }

  return (
    <div className="min-h-screen bg-sa-green-deep flex flex-col items-center justify-center p-6 text-sa-cream">
      <img
        src={`${import.meta.env.BASE_URL}logo-negativo.png`}
        alt="Hojaldras Lily"
        className="w-[200px] h-auto mb-6 drop-shadow-2xl"
      />
      <p className="font-display text-3xl mb-1">Almacén</p>
      <p className="font-body text-sa-cream/70 mb-8">Marque su PIN para empezar</p>

      <div className="font-mono text-4xl tracking-[0.4em] h-12 mb-6">{'•'.repeat(pin.length)}</div>

      <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
          <button
            key={n}
            onClick={() => setPin((p) => (p + n).slice(0, 6))}
            className="h-20 rounded-sa-lg bg-sa-cream/10 hover:bg-sa-cream/20 active:scale-95 font-display text-3xl transition-all"
          >
            {n}
          </button>
        ))}
        <button
          onClick={() => setPin('')}
          className="h-20 rounded-sa-lg bg-sa-cream/5 font-mono text-sm uppercase tracking-wide active:scale-95"
        >
          Borrar
        </button>
        <button
          onClick={() => setPin((p) => (p + '0').slice(0, 6))}
          className="h-20 rounded-sa-lg bg-sa-cream/10 hover:bg-sa-cream/20 active:scale-95 font-display text-3xl transition-all"
        >
          0
        </button>
        <button
          onClick={() => void entrar(pin)}
          disabled={pin.length < 4 || entrando}
          className="h-20 rounded-sa-lg bg-sa-cream text-sa-green-deep font-display text-xl active:scale-95 disabled:opacity-40 transition-all"
        >
          Entrar
        </button>
      </div>

      {error && (
        <p className="mt-6 font-body text-sa-strawberry bg-sa-cream/10 rounded-sa px-4 py-2">
          {error}
        </p>
      )}
    </div>
  )
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

function Tarjeta({
  e,
  ocupado,
  onEntregar,
}: {
  e: Encargo
  ocupado: boolean
  onEntregar: () => void
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
          <p className="font-display text-3xl text-sa-green leading-none">{mxn(e.total)}</p>
          {e.anticipo > 0 && (
            <p className="font-body text-xs text-sa-green-ink/60 mt-1">
              Dejó {mxn(e.anticipo)} · faltan {mxn(e.total - e.anticipo)}
            </p>
          )}
        </div>
        <button
          onClick={onEntregar}
          disabled={ocupado}
          className="bg-sa-green hover:bg-sa-green-deep text-sa-cream font-display text-xl px-8 py-4 rounded-sa-lg active:scale-95 transition-all disabled:opacity-50"
        >
          {ocupado ? 'Cobrando…' : 'Entregar y cobrar'}
        </button>
      </div>
    </section>
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

  if (!empleado) return <Candado onEntra={setEmpleado} />

  const piezas = encargos.reduce((s, e) => s + e.piezas, 0)
  const dinero = encargos.reduce((s, e) => s + e.total, 0)
  const deHoy = encargos.filter((e) => cuando(e.fecha_entrega, e.hora_entrega).urgente)

  return (
    <div className="min-h-screen bg-sa-cream-paper text-sa-green-ink">
      <header className="bg-sa-green-deep text-sa-cream px-6 py-5 flex items-center gap-5">
        <img
          src={`${import.meta.env.BASE_URL}logo-negativo.png`}
          alt="Hojaldras Lily"
          className="h-16 w-auto"
        />
        <div className="flex-1 min-w-0">
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-sa-banana">Almacén</p>
          <h1 className="font-display text-4xl leading-none mt-1">
            {deHoy.length > 0
              ? `${deHoy.length} pasan hoy por su encargo`
              : encargos.length > 0
                ? `${encargos.length} encargo${encargos.length === 1 ? '' : 's'} apartado${encargos.length === 1 ? '' : 's'}`
                : 'Nada apartado'}
          </h1>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-[11px] uppercase tracking-wide text-sa-cream/50">
            {piezas} piezas separadas
          </p>
          <p className="font-display text-2xl leading-none mt-1">{mxn(dinero)}</p>
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
          encargos.map((e) => (
            <Tarjeta
              key={e.id}
              e={e}
              ocupado={ocupado === e.id}
              onEntregar={() => void entregar(e)}
            />
          ))
        )}
      </main>
    </div>
  )
}
