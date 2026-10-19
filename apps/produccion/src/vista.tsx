import { useState } from 'react'
import {
  diasHasta,
  horaEn12h,
  minutosDeHora,
  type OrdenDeProduccion,
  type ItemDeProduccion,
} from '@lily/supabase'
import { urlDeFoto } from '@lily/utils'

/**
 * Lo que se PINTA en la mesa de producción: los renglones, las tarjetas y el
 * corte por día.
 *
 * Vive aparte de `App.tsx` por una razón práctica: `App` abre el cliente de
 * Supabase al cargarse, así que no se puede montar sin llaves y la pantalla
 * solo se podía revisar en la tienda. Esto se monta con datos de mentira y se
 * mira en un navegador (`mirar/produccion.html`) — que es como salieron los
 * tres defectos que nadie vio leyendo el código (§4).
 */

/**
 * Cuántas masas le quedan a la mesa, debajo del molde.
 *
 * Lo **teclea producción**, no lo calcula el sistema: una masa no rinde
 * siempre los mismos moldes y quien la está amasando lo sabe mejor que
 * cualquier cuenta. Sirve para contestar lo único que se pregunta a media
 * mañana en esa mesa — «¿alcanza para lo que falta?».
 *
 * Sin apuntar se lee **«—»** y no «0», que es la misma regla de
 * `paquetes_posibles = null` (§4): la ausencia de un dato no es un cero. Un
 * «0 masas» que nadie escribió manda a alguien a amasar sin necesidad.
 *
 * Los botones son −/+ y el número se **toca para teclearlo**: ajustar de uno
 * en uno es el gesto de la mesa, pero al empezar el día se escribe «8» de
 * golpe y no se toca «+» ocho veces.
 */
export function Masas({
  item,
  ocupado,
  onApuntar,
}: {
  item: ItemDeProduccion
  ocupado: boolean
  onApuntar: (masas: number | null) => void
}) {
  function teclear() {
    const r = window.prompt(
      `¿Cuántas masas quedan de ${item.sabor}?\n(vacío = borrar la cuenta)`,
      item.masas === null ? '' : String(item.masas),
    )
    if (r === null) return
    const limpio = r.trim()
    if (limpio === '') return onApuntar(null)
    const n = Number(limpio)
    if (!Number.isFinite(n) || n < 0) return
    onApuntar(Math.floor(n))
  }

  if (item.masas === null) {
    return (
      <button
        disabled={ocupado}
        onClick={teclear}
        className="font-mono text-[11px] uppercase tracking-wide text-sa-green-ink/40 underline decoration-dotted mt-1 disabled:opacity-50"
      >
        Apuntar masas
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1.5 mt-1.5">
      <button
        disabled={ocupado || item.masas <= 0}
        onClick={() => onApuntar(item.masas! - 1)}
        className="w-8 h-8 rounded-sa border border-sa-green-ink/15 text-sa-green-ink/60 font-display leading-none active:scale-95 transition-transform disabled:opacity-25"
        title="Se gastó una masa"
      >
        −
      </button>
      <button
        disabled={ocupado}
        onClick={teclear}
        className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/70 px-2 py-1 rounded-sa bg-sa-green-ink/[0.06] disabled:opacity-50"
      >
        {item.masas} masa{item.masas === 1 ? '' : 's'}
      </button>
      <button
        disabled={ocupado}
        onClick={() => onApuntar(item.masas! + 1)}
        className="w-8 h-8 rounded-sa border border-sa-green-ink/15 text-sa-green-ink/60 font-display leading-none active:scale-95 transition-transform disabled:opacity-50"
        title="Llegó otra masa"
      >
        +
      </button>
    </div>
  )
}

/** Un renglón: un sabor y cuántos moldes van armados de los que se pidieron. */
export function Renglon({
  item,
  ocupado,
  onMarcar,
  onApuntarMasas,
}: {
  item: ItemDeProduccion
  ocupado: boolean
  onMarcar: (armados: number) => void
  onApuntarMasas: (masas: number | null) => void
}) {
  const foto = urlDeFoto(item.imagen_url, import.meta.env.BASE_URL)
  const falta = Math.max(0, item.moldes - item.armados)
  const listo = falta === 0
  // No se puede desarmar lo que ya se fue al horno o ya salió de él.
  const piso = item.enHorno + item.horneados
  // La palabra de este renglón: un molde de guayaba y una rosca se cuentan
  // distinto, y los botones tienen que decirlo.
  const unidad = item.unidad === 'pieza' ? 'pieza' : 'molde'

  return (
    <div
      className={[
        'rounded-sa-lg border-2 p-5 transition-colors',
        listo ? 'bg-sa-mint/10 border-sa-mint/50' : 'bg-white border-sa-green-ink/10',
      ].join(' ')}
    >
      <div className="flex items-center gap-4">
        {foto && <img src={foto} alt="" className="w-16 h-16 object-contain shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className="font-display text-2xl leading-tight text-sa-green-ink">{item.sabor}</p>
          <p className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/50 mt-1">
            {/* En piezas no se escribe «moldes de 48»: las roscas y los panes
                no salen de un molde, y anunciarles uno es anunciar cuadros que
                no existen. */}
            {item.unidad === 'pieza'
              ? 'se cuenta por piezas'
              : `moldes de ${item.molde} cuadros`}
          </p>
          <Masas item={item} ocupado={ocupado} onApuntar={onApuntarMasas} />
          {(item.enHorno > 0 || item.horneados > 0) && (
            <p className="font-body text-xs text-sa-green-ink/55 mt-1">
              {item.enHorno > 0 && `${item.enHorno} en el horno`}
              {item.enHorno > 0 && item.horneados > 0 && ' · '}
              {item.horneados > 0 &&
                `${item.horneados} ya ${item.horneados === 1 ? 'salió' : 'salieron'}`}
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="font-display text-4xl leading-none text-sa-green-ink">
            {item.armados}
            <span className="text-2xl text-sa-green-ink/35"> / {item.moldes}</span>
          </p>
          <p className="font-mono text-[11px] uppercase tracking-wide text-sa-green-ink/45 mt-1">
            {listo ? 'todo armado' : `faltan ${falta} ${unidad}${falta === 1 ? '' : 's'}`}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-4">
        {[1, 2].map((n) => (
          <button
            key={n}
            disabled={ocupado}
            onClick={() => onMarcar(item.armados + n)}
            className="flex-1 h-14 rounded-sa bg-sa-green text-sa-cream font-display text-lg active:scale-95 transition-transform disabled:opacity-50"
          >
            +{n} {unidad}
            {n === 1 ? '' : 's'}
          </button>
        ))}
        {/* "Ya está" evita tener que sumar a mano hasta llegar al numero
            pedido, que es lo que se hace 9 de cada 10 veces. */}
        <button
          disabled={ocupado || listo}
          onClick={() => onMarcar(item.moldes)}
          className="flex-[1.4] h-14 rounded-sa bg-sa-green-deep text-sa-cream font-display text-lg active:scale-95 transition-transform disabled:opacity-30"
        >
          Ya está
        </button>
        <button
          disabled={ocupado || item.armados <= piso}
          onClick={() => onMarcar(Math.max(piso, item.armados - 1))}
          className="w-14 h-14 rounded-sa border-2 border-sa-green-ink/15 text-sa-green-ink/60 font-display text-2xl active:scale-95 transition-transform disabled:opacity-25"
          title="Me pasé, quitar uno"
        >
          −
        </button>
      </div>
    </div>
  )
}

export function Tarjeta({
  orden,
  ocupado,
  ahora = new Date(),
  onMarcar,
  onApuntarMasas,
}: {
  orden: OrdenDeProduccion
  ocupado: string | null
  /** Contra qué reloj se mide la hora objetivo. Inyectable para poder mirarla. */
  ahora?: Date
  onMarcar: (item: ItemDeProduccion, armados: number) => void
  onApuntarMasas: (item: ItemDeProduccion, masas: number | null) => void
}) {
  const total = orden.items.reduce((s, i) => s + i.moldes, 0)
  const hecho = orden.items.reduce((s, i) => s + Math.min(i.armados, i.moldes), 0)
  /**
   * El resumen se dice por unidad, nunca sumado.
   *
   * Una orden con seis moldes de guayaba y veinte roscas decía «32 moldes», o
   * sea contaba roscas en una unidad que no es la suya — el mismo defecto que
   * ya había tenido el Horno con «3 moldes de 48 · 3 moldes» (§4). Son dos
   * cuentas distintas y se escriben como dos cuentas distintas.
   */
  const resumen = (['molde', 'pieza'] as const)
    .map((u) => {
      const suyos = orden.items.filter((i) => i.unidad === u)
      if (suyos.length === 0) return ''
      const t = suyos.reduce((s, i) => s + i.moldes, 0)
      const h = suyos.reduce((s, i) => s + Math.min(i.armados, i.moldes), 0)
      return `${h} de ${t} ${u}${t === 1 ? '' : 's'}`
    })
    .filter(Boolean)
    .join(' · ')
  const pct = total > 0 ? Math.round((hecho / total) * 100) : 0

  /**
   * La hora a la que tiene que estar lista, y si ya se pasó.
   *
   * Solo se pasa lo que **falta**: una orden terminada a las 12:05 ya no es
   * un problema, y pintarla en rojo el resto del día enseña a ignorar el
   * rojo. Es la misma razón por la que las métricas de salud llevan ventana
   * de tiempo (§4).
   */
  const minutos = minutosDeHora(orden.hora_objetivo)
  const ahoraMin = ahora.getHours() * 60 + ahora.getMinutes()
  const falta = total - hecho
  const tarde = minutos !== null && falta > 0 && ahoraMin > minutos && diasHasta(orden.fecha, ahora) <= 0

  return (
    <section className="bg-sa-cream-soft rounded-sa-lg p-5 shadow-sa">
      <div className="flex items-baseline justify-between gap-4 mb-1">
        <p className="font-display text-2xl text-sa-green-ink">Orden #{orden.folio}</p>
        {/* La hora manda sobre el folio: es lo que decide qué se hace
            primero. Lo que se pasó va en carmín profundo, que es el color de
            la alarma de la casa — el acento rosa se ve despintado a un metro
            (§4). */}
        {orden.hora_objetivo && (
          <p
            className={[
              'font-display text-xl leading-none shrink-0',
              tarde
                ? 'text-sa-cream bg-sa-green-deep rounded-full px-3 py-1'
                : 'text-sa-green-ink',
            ].join(' ')}
          >
            {tarde ? 'Se pasó de las ' : 'Para las '}
            {horaEn12h(orden.hora_objetivo)}
          </p>
        )}
        <p className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/50">
          {resumen}
        </p>
      </div>
      {orden.nota && (
        <p className="font-body text-sm text-sa-green-ink/70 mb-2">{orden.nota}</p>
      )}

      {/* Una barra, no un porcentaje suelto: de lejos se ve cuanto falta. */}
      <div className="h-2 rounded-full bg-sa-green-ink/10 overflow-hidden mb-4">
        <div className="h-full bg-sa-green transition-all" style={{ width: `${pct}%` }} />
      </div>

      <div className="space-y-3">
        {orden.items.map((i) => (
          <Renglon
            key={i.id}
            item={i}
            ocupado={ocupado === i.id}
            onMarcar={(h) => onMarcar(i, h)}
            onApuntarMasas={(m) => onApuntarMasas(i, m)}
          />
        ))}
      </div>
    </section>
  )
}

/** Un día de la tabla de producción, con su rótulo ya escrito. */
interface DiaDeOrdenes {
  fecha: string
  titulo: string
  /** Se quedó en un día que ya pasó: es lo primero que duele. */
  vencido: boolean
  /** Es para hoy. Lo que la mesa tiene que hacer en este turno. */
  hoy: boolean
  ordenes: OrdenDeProduccion[]
  /** Moldes que faltan por armar en todo el día. */
  faltan: number
}

/**
 * Las órdenes partidas por día, lo que se hace HOY primero.
 *
 * La casa lo pidió así: la mesa de producción trabaja **el día**, no una lista
 * corrida de todo lo que haya abierto. Una tabla de quince órdenes sin
 * separadores obliga a leer cada folio para saber cuáles son de hoy, que es
 * justo la pregunta que se hace al llegar.
 *
 * El orden es el del dolor, igual que en la cola de encargos: lo que se quedó
 * de días pasados va **arriba** —lleva esperando— , luego hoy, y después lo
 * que viene. No se ordena por folio ni por hora de captura: una orden del
 * viernes capturada el lunes sigue siendo del viernes.
 */
export function ordenesPorDia(ordenes: OrdenDeProduccion[], hoy = new Date()): DiaDeOrdenes[] {
  const dias = new Map<string, OrdenDeProduccion[]>()
  for (const o of ordenes) {
    const l = dias.get(o.fecha) ?? []
    l.push(o)
    dias.set(o.fecha, l)
  }
  return [...dias.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([fecha, lista]) => {
      const d = diasHasta(fecha, hoy)
      return {
        fecha,
        titulo: tituloDeFecha(fecha, hoy),
        vencido: d < 0,
        hoy: d === 0,
        // Dentro del día, **por hora**, que es lo que decide qué se hace
        // primero. Lo que no trae hora se va al final y ahí sí manda el
        // folio: a un dato que no está dicho no se le inventa una hora.
        ordenes: [...lista].sort((x, y) => {
          const hx = minutosDeHora(x.hora_objetivo)
          const hy = minutosDeHora(y.hora_objetivo)
          if (hx === hy) return x.folio - y.folio
          if (hx === null) return 1
          if (hy === null) return -1
          return hx - hy
        }),
        faltan: lista.reduce(
          (s, o) => s + o.items.reduce((x, i) => x + Math.max(0, i.moldes - i.armados), 0),
          0,
        ),
      }
    })
}

/**
 * El rótulo del separador.
 *
 * «Hoy» y «Mañana» van delante porque es lo que se pregunta, pero el día y el
 * número van **siempre detrás**: a media mañana del día siguiente, un «Hoy» a
 * secas ya no dice de qué día hablaba la pantalla. Es la misma regla que
 * `tituloDelDia` en los encargos.
 */
function tituloDeFecha(fecha: string, hoy: Date): string {
  const dia = new Date(fecha + 'T12:00:00')
  const largo = dia.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric' })
  const conMayuscula = largo.charAt(0).toUpperCase() + largo.slice(1)
  const d = diasHasta(fecha, hoy)
  if (d === 0) return `Hoy · ${largo}`
  if (d === 1) return `Mañana · ${largo}`
  if (d < 0) return `Se quedó · ${largo}`
  return conMayuscula
}
