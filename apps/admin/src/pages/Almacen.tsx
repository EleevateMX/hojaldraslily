import { useCallback, useEffect, useMemo, useState } from 'react'
import { sb } from '../lib/sb'
import {
  listarEncargos,
  cobrarEncargo,
  cancelarEncargo,
  crearEncargo,
  listarExistenciasDelDia,
  partirNombreDeVenta,
  type Encargo,
  type ExistenciaDelDia,
} from '@shake/supabase'
import { mxn, mensajeDeError, urlDeFoto } from '@shake/utils'
import { PageHeader, Loading, ErrorMsg, cx } from '../ui'

/**
 * Almacén: lo que está apartado y para quién.
 *
 * La regla del negocio, y es la que manda en toda esta pantalla: **apartar no
 * es vender**. Cuando alguien encarga 20 piezas, esas 20 se separan aquí —
 * dejan de estar libres para el mostrador — pero **siguen en el inventario
 * hasta que se pagan**. Si el cliente no llega, la mercancía nunca se fue.
 *
 * Por eso hay tres números distintos y no uno:
 *   · lo que hay          (disponible)
 *   · lo apartado         (comprometido, sin pagar)
 *   · lo libre            (lo que sí se puede vender hoy)
 *
 * Cobrar es lo único que descuenta. Y cobra por el mismo camino que una venta
 * de mostrador, así que cae en el corte de caja y saca su comanda.
 */

/**
 * Cuántos días faltan para una fecha de entrega.
 *
 * Las DOS fechas se comparan al mediodía. Comparar la entrega (mediodía)
 * contra el arranque del día (medianoche) daba medio día de diferencia, y
 * `Math.round` lo subía a 1: un encargo de HOY salía rotulado «Mañana», que
 * es exactamente el error que hace que nadie lo prepare a tiempo.
 */
function diasHasta(fecha: string): number {
  const entrega = new Date(fecha + 'T12:00:00')
  const hoy = new Date()
  hoy.setHours(12, 0, 0, 0)
  return Math.round((entrega.getTime() - hoy.getTime()) / 86400000)
}

function diaLegible(fecha: string | null): string {
  if (!fecha) return 'Sin fecha'
  const dias = diasHasta(fecha)
  if (dias === 0) return 'Hoy'
  if (dias === 1) return 'Mañana'
  if (dias < 0) return `Se pasó ${-dias} día${dias === -1 ? '' : 's'}`
  return new Date(fecha + 'T12:00:00').toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

function TarjetaEncargo({
  e,
  base,
  ocupado,
  onCobrar,
  onCancelar,
}: {
  e: Encargo
  base: string
  ocupado: boolean
  onCobrar: () => void
  onCancelar: () => void
}) {
  // Un encargo cuya fecha ya pasó no se esconde: se marca. Es justo el que
  // hay que llamar por teléfono.
  const vencido = e.fecha_entrega != null && diasHasta(e.fecha_entrega) < 0

  return (
    <div
      className={[
        'rounded-sa border p-5',
        vencido ? 'bg-sa-strawberry/8 border-sa-strawberry/40' : 'bg-white border-sa-green-ink/10',
      ].join(' ')}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-xl text-sa-green-ink leading-tight">{e.cliente}</p>
          <p className="font-mono text-[11px] uppercase tracking-wide text-sa-green-ink/50 mt-1">
            Encargo #{e.folio}
            {e.telefono ? ` · ${e.telefono}` : ''}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p
            className={[
              'font-display text-lg leading-none',
              vencido ? 'text-sa-strawberry' : 'text-sa-green-ink',
            ].join(' ')}
          >
            {diaLegible(e.fecha_entrega)}
          </p>
          {e.hora_entrega && (
            <p className="font-mono text-[11px] text-sa-green-ink/50 mt-1">{e.hora_entrega}</p>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {e.items.map((i) => {
          const { sabor, medida } = partirNombreDeVenta(i.producto)
          const foto = urlDeFoto(i.imagen_url, base)
          return (
            <div key={i.id} className="flex items-center gap-3">
              {foto && <img src={foto} alt="" className="w-9 h-9 object-contain shrink-0" />}
              <span className="font-display text-lg text-sa-green-ink w-10 shrink-0 tabular-nums">
                {i.cantidad}
              </span>
              <span className="font-body text-sm text-sa-green-ink flex-1 min-w-0">
                {sabor}
                {medida && (
                  <span className="text-sa-green-ink/50"> · {medida}</span>
                )}
              </span>
              <span className="font-mono text-sm text-sa-green-ink/60 shrink-0">
                {mxn(i.cantidad * i.precio_unitario)}
              </span>
            </div>
          )
        })}
      </div>

      {e.nota && (
        <p className="font-body text-sm text-sa-green-ink/65 mt-3 bg-sa-cream-soft rounded-sa px-3 py-2">
          {e.nota}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-4 border-t border-sa-green-ink/8">
        <div>
          <p className="font-display text-2xl text-sa-green leading-none">{mxn(e.total)}</p>
          {e.anticipo > 0 && (
            <p className="font-body text-xs text-sa-green-ink/60 mt-1">
              Dejó {mxn(e.anticipo)} de anticipo · faltan {mxn(e.total - e.anticipo)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onCancelar} disabled={ocupado} className={cx.btnSec}>
            Cancelar
          </button>
          <button onClick={onCobrar} disabled={ocupado} className={cx.btnPrimary}>
            {ocupado ? 'Cobrando…' : 'Cobrar y entregar'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** El formulario de apartar. Corto a propósito: nombre, piezas y cuándo. */
function Apartar({
  existencias,
  base,
  onListo,
}: {
  existencias: ExistenciaDelDia[]
  base: string
  onListo: (mensaje: string) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [cliente, setCliente] = useState('')
  const [telefono, setTelefono] = useState('')
  const [fecha, setFecha] = useState('')
  const [hora, setHora] = useState('')
  const [nota, setNota] = useState('')
  const [piezas, setPiezas] = useState<Record<string, number>>({})
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const total = useMemo(
    () =>
      existencias.reduce((s, f) => s + (piezas[f.producto_id] ?? 0) * Number(f.precio), 0),
    [existencias, piezas],
  )
  const cuantas = Object.values(piezas).reduce((s, n) => s + n, 0)

  async function guardar() {
    const items = Object.entries(piezas)
      .filter(([, n]) => n > 0)
      .map(([producto_id, cantidad]) => ({ producto_id, cantidad }))
    if (items.length === 0 || cliente.trim().length < 2) return
    setGuardando(true)
    setError(null)
    try {
      await crearEncargo(sb, {
        cliente: cliente.trim(),
        items,
        telefono: telefono.trim() || undefined,
        fecha_entrega: fecha || undefined,
        hora_entrega: hora.trim() || undefined,
        nota: nota.trim() || undefined,
      })
      onListo(`Apartado para ${cliente.trim()}: ${cuantas} pieza${cuantas === 1 ? '' : 's'}.`)
      setCliente(''); setTelefono(''); setFecha(''); setHora(''); setNota(''); setPiezas({})
      setAbierto(false)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className={cx.panel}>
      <button
        onClick={() => setAbierto((v) => !v)}
        className="w-full flex items-center justify-between gap-4 text-left"
      >
        <div>
          <p className="font-display text-xl text-sa-green-ink">Apartar un encargo</p>
          <p className="font-body text-sm text-sa-green-ink/60 mt-0.5">
            Se separa en almacén. No se descuenta del inventario hasta que se
            cobre.
          </p>
        </div>
        <span className="font-mono text-xs uppercase tracking-wide text-sa-green shrink-0">
          {abierto ? 'Cerrar' : 'Abrir'}
        </span>
      </button>

      {abierto && (
        <div className="mt-5 space-y-4">
          {error && <ErrorMsg>{error}</ErrorMsg>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={cx.label}>¿Quién encarga?</label>
              <input
                className={cx.input}
                value={cliente}
                onChange={(ev) => setCliente(ev.target.value)}
                placeholder="Nombre"
              />
            </div>
            <div>
              <label className={cx.label}>Teléfono (opcional)</label>
              <input
                className={cx.input}
                value={telefono}
                onChange={(ev) => setTelefono(ev.target.value)}
                inputMode="tel"
                placeholder="999…"
              />
            </div>
            <div>
              <label className={cx.label}>¿Para cuándo?</label>
              <input
                type="date"
                className={cx.input}
                value={fecha}
                onChange={(ev) => setFecha(ev.target.value)}
              />
            </div>
            <div>
              <label className={cx.label}>¿A qué hora? (opcional)</label>
              <input
                className={cx.input}
                value={hora}
                onChange={(ev) => setHora(ev.target.value)}
                placeholder="10:00"
              />
            </div>
          </div>

          <div>
            <label className={cx.label}>¿Qué lleva?</label>
            <div className="mt-2 space-y-1 max-h-80 overflow-y-auto pr-1">
              {existencias.map((f) => {
                const { sabor, medida } = partirNombreDeVenta(f.nombre)
                const n = piezas[f.producto_id] ?? 0
                const foto = urlDeFoto(f.imagen_url, base)
                // Se avisa, no se prohibe: se puede apartar mas de lo que hay
                // hoy porque para eso esta la orden de produccion.
                const pasado = n > f.libres
                return (
                  <div
                    key={f.producto_id}
                    className="flex items-center gap-3 py-2 border-b border-sa-green-ink/5 last:border-0"
                  >
                    {foto && <img src={foto} alt="" className="w-9 h-9 object-contain shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <p className="font-body text-sm text-sa-green-ink leading-tight">{sabor}</p>
                      <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/45">
                        {medida ? medida + ' · ' : ''}
                        {Math.max(0, f.libres)} libre{f.libres === 1 ? '' : 's'}
                      </p>
                      {pasado && (
                        <p className="font-body text-[11px] text-sa-banana mt-0.5">
                          Hay que hornear {n - Math.max(0, f.libres)} más
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() =>
                          setPiezas((p) => ({ ...p, [f.producto_id]: Math.max(0, n - 1) }))
                        }
                        disabled={n === 0}
                        className="w-9 h-9 rounded-full border border-sa-green-ink/15 text-sa-green-ink/60 disabled:opacity-25"
                        aria-label={`Quitar uno de ${sabor}`}
                      >
                        −
                      </button>
                      <span className="font-mono text-base w-8 text-center tabular-nums">{n}</span>
                      <button
                        onClick={() => setPiezas((p) => ({ ...p, [f.producto_id]: n + 1 }))}
                        className="w-9 h-9 rounded-full bg-sa-green text-sa-cream font-display"
                        aria-label={`Agregar uno de ${sabor}`}
                      >
                        +
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div>
            <label className={cx.label}>Nota (opcional)</label>
            <input
              className={cx.input}
              value={nota}
              onChange={(ev) => setNota(ev.target.value)}
              placeholder="Para un bautizo, sin azúcar glass…"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <p className="font-body text-sm text-sa-green-ink/70">
              {cuantas > 0
                ? `${cuantas} pieza${cuantas === 1 ? '' : 's'} · ${mxn(total)}`
                : 'Todavía no ha puesto nada'}
            </p>
            <button
              onClick={() => void guardar()}
              disabled={cuantas === 0 || cliente.trim().length < 2 || guardando}
              className={cx.btnPrimary}
            >
              {guardando ? 'Apartando…' : 'Apartar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Almacen() {
  const [encargos, setEncargos] = useState<Encargo[]>([])
  const [existencias, setExistencias] = useState<ExistenciaDelDia[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

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
  }, [cargar])

  async function cobrar(e: Encargo) {
    setOcupado(e.id)
    try {
      const total = await cobrarEncargo(sb, e.id, 'efectivo')
      setAviso(
        `Cobrado ${mxn(total)} de ${e.cliente}. Ya salió del inventario y entró al corte de caja.`,
      )
      await cargar(false)
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setOcupado(null)
    }
  }

  async function cancelar(e: Encargo) {
    // Cancelar devuelve piezas al mostrador: se pregunta, porque deshacerlo
    // implica volver a capturar el encargo entero.
    if (!window.confirm(`¿Cancelar el encargo de ${e.cliente}? Las ${e.piezas} piezas vuelven a quedar libres.`)) return
    setOcupado(e.id)
    try {
      await cancelarEncargo(sb, e.id)
      setAviso(`Encargo de ${e.cliente} cancelado. Sus piezas volvieron a quedar libres.`)
      await cargar(false)
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setOcupado(null)
    }
  }

  if (cargando) return <Loading>Cargando el almacén…</Loading>

  const piezasApartadas = encargos.reduce((s, e) => s + e.piezas, 0)
  const dineroApartado = encargos.reduce((s, e) => s + e.total, 0)
  // Lo de hoy y lo atrasado: las dos cosas hay que atenderlas ya.
  const paraHoy = encargos.filter((e) => e.fecha_entrega != null && diasHasta(e.fecha_entrega) <= 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Almacén"
        subtitle="Lo que está apartado y para quién. Apartar separa la mercancía, pero no la descuenta: eso pasa al cobrar."
      />

      {error && <ErrorMsg>{error}</ErrorMsg>}
      {aviso && (
        <div className="rounded-sa bg-sa-mint/10 border-l-4 border-sa-mint px-5 py-4 flex items-start gap-3">
          <p className="font-body text-sm text-sa-green-ink flex-1">{aviso}</p>
          <button
            onClick={() => setAviso(null)}
            className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/50"
          >
            Cerrar
          </button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <div className={cx.panelChico}>
          <p className={cx.label}>Encargos apartados</p>
          <p className="font-display text-2xl sm:text-3xl text-sa-green-ink mt-1">{encargos.length}</p>
        </div>
        <div className={cx.panelChico}>
          <p className={cx.label}>Piezas separadas</p>
          <p className="font-display text-2xl sm:text-3xl text-sa-green-ink mt-1">{piezasApartadas}</p>
        </div>
        <div className={cx.panelChico}>
          <p className={cx.label}>Dinero comprometido</p>
          <p className="font-display text-2xl sm:text-3xl text-sa-green mt-1">{mxn(dineroApartado)}</p>
        </div>
      </div>

      {/* Lo de hoy (y lo atrasado) primero: es lo unico accionable ahora. */}
      {paraHoy.length > 0 && (
        <div className="rounded-sa bg-sa-cream-warm/50 border-l-4 border-sa-banana px-5 py-4">
          <p className="font-display text-lg text-sa-green-ink">
            {paraHoy.length === 1 ? 'Un encargo se entrega hoy' : `${paraHoy.length} encargos se entregan hoy`}
          </p>
          <p className="font-body text-sm text-sa-green-ink/70 mt-1">
            {paraHoy.map((e) => e.cliente).join(' · ')}
          </p>
        </div>
      )}

      <Apartar
        existencias={existencias}
        base={base}
        onListo={(m) => {
          setAviso(m)
          void cargar(false)
        }}
      />

      {encargos.length === 0 ? (
        <div className={cx.panel}>
          <p className="font-display text-xl text-sa-green-ink">No hay nada apartado</p>
          <p className={`font-body text-sm mt-1 ${cx.muted}`}>
            Cuando alguien encargue piezas, aparecen aquí separadas del
            mostrador hasta que las pague.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {encargos.map((e) => (
            <TarjetaEncargo
              key={e.id}
              e={e}
              base={base}
              ocupado={ocupado === e.id}
              onCobrar={() => void cobrar(e)}
              onCancelar={() => void cancelar(e)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
