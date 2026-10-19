import { useCallback, useEffect, useMemo, useState } from 'react'
import { sb } from '../lib/sb'
import {
  listarExistenciasPorMolde,
  MOLDES,
  type Molde,
  listarProductosDelDia,
  registrarHorneada,
  mandarAProducir,
  fijarHoraDeProduccion,
  hornoEnVivo,
  suscribirProduccion,
  relojDelHorno,
  type ExistenciaPorMolde,
  type ProductoDelDia,
  type HornoEnVivo,
} from '@lily/supabase'
import { mensajeDeError, urlDeFoto, enMoldes, nombreDeTamano, medidaDeVenta } from '@lily/utils'
import { PageHeader, Loading, ErrorMsg, cx } from '../ui'

/**
 * Producción: cuánto se horneó y cuánto queda, en cuadros.
 *
 * La unidad del inventario es el **cuadro**, no el paquete, porque así se
 * hornea: sale un molde —de 48 o de 24 cuadros— y de ahí se van cortando los
 * paquetes conforme se venden: cuatro de 12, dos de 24, uno de 48, o una
 * mezcla. Por eso pueden vender pan del día: no se comprometen a un tamaño
 * hasta que alguien lo pide.
 *
 * Contarlo por paquete obligaba a decidir en el horno algo que se decide en
 * el mostrador, y hacía que «quedan 3 chicas» y «quedan 6 minis» parecieran
 * existencias distintas cuando son **el mismo pan**.
 */

export function Fila({
  e,
  paquetes,
  base,
  ocupado,
  onHornear,
  onMerma,
}: {
  e: ExistenciaPorMolde
  paquetes: ProductoDelDia[]
  base: string
  ocupado: boolean
  /** Apuntar una horneada a mano: cuántos moldes y **de cuál**. */
  onHornear: (moldes: number, molde: Molde) => void
  onMerma: (molde: Molde) => void
}) {
  // El molde vive EN LA FILA, no en un interruptor global de la pantalla.
  //
  // Era el reclamo de la casa: en la misma hornada caben tres moldes de 48 de
  // guayaba y dos de 24 de queso, y con un solo interruptor arriba había que
  // apuntar una tanda, cambiar el interruptor y apuntar la otra — o mentir en
  // una de las dos. Cada sabor arranca en el molde del que ya tiene pan, que
  // es el que se está usando ese día.
  const [molde, setMolde] = useState<Molde>(e.horneados_24 > 0 && e.horneados_48 === 0 ? 24 : 48)
  const foto = urlDeFoto(e.imagen_url, base)
  const agotado = e.cuadros_libres <= 0 && e.cuadros_horneados > 0
  const sinHornear = e.cuadros_horneados === 0
  /**
   * Los dos moldes, por separado y sin convertir uno en otro.
   *
   * Esto es lo que reportó la casa: diez moldes de 24 salían como «5 de 48»
   * porque todo se dividía entre un molde global. Son dos cuentas distintas y
   * se pintan como dos cuentas distintas; el que esté en cero no se pinta,
   * para que una panadería que ese día solo usó moldes de 48 no lea un «0 de
   * 24» que no significa nada.
   */
  const bolsas = ([48, 24] as const)
    .map((m) => ({
      molde: m,
      cuadros: m === 48 ? e.libres_48 : e.libres_24,
      horneados: m === 48 ? e.horneados_48 : e.horneados_24,
    }))
    .filter((b) => b.cuadros > 0 || b.horneados > 0)

  return (
    <div
      className={[
        'flex flex-wrap sm:flex-nowrap items-center gap-3 sm:gap-4 rounded-sa border p-4 transition-colors',
        agotado ? 'bg-sa-strawberry/10 border-sa-strawberry/40' : 'bg-white border-sa-green-ink/10',
      ].join(' ')}
    >
      {foto && <img src={foto} alt="" className="w-14 h-14 shrink-0 object-contain" draggable={false} />}

      <div className="min-w-0 flex-1 basis-0 min-w-[11rem]">
        <p className="font-display text-lg leading-tight text-sa-green-ink">{e.sabor}</p>
        <p className="font-body text-xs text-sa-green-ink/55 mt-1">
          {sinHornear
            ? 'Todavía no se hornea nada hoy'
            : 'Se hornearon ' +
              bolsas
                .filter((b) => b.horneados > 0)
                .map((b) => `${b.horneados / b.molde} de ${b.molde}`)
                .join(' y ') +
              ` · se vendieron ${e.cuadros_vendidos} cuadros` +
              (e.cuadros_mermados > 0 ? ` · se perdieron ${e.cuadros_mermados}` : '')}
        </p>
        {e.cuadros_apartados > 0 && (
          <p className="font-body text-xs text-sa-banana mt-1">
            {e.cuadros_apartados} cuadro{e.cuadros_apartados === 1 ? '' : 's'} apartado
            {e.cuadros_apartados === 1 ? '' : 's'} para encargos
          </p>
        )}
        {/* Los tamaños, uno por pastilla y con el nombre del cartel.

            Iba en un renglón de letra chica —«14 de 6 · o · 7 de 12 · o · 3 de
            24»— y la casa pidió verlos apartados y rotulados: Mini 12, Chica
            24, Grande 48. Son el MISMO pan contado distinto, y por eso la «o»
            sigue escrita abajo: vender una Chica baja también las Minis. */}
        {paquetes.length > 0 && e.cuadros_libres > 0 && (
          <div className="mt-2">
            <div className="flex flex-wrap gap-1.5">
              {paquetes.map((p) => (
                <span
                  key={p.producto_id}
                  className={[
                    'inline-flex items-baseline gap-1.5 rounded-full px-2.5 py-1',
                    (p.paquetes_posibles ?? 0) > 0
                      ? 'bg-sa-mint/20'
                      : 'bg-sa-green-ink/[0.06]',
                  ].join(' ')}
                >
                  <span className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/60">
                    {nombreDeTamano(p.cuadros ?? 0)}
                  </span>
                  <span className="font-display text-base leading-none text-sa-green-ink">
                    {p.paquetes_posibles ?? 0}
                  </span>
                </span>
              ))}
            </div>
            <p className="font-body text-[10px] text-sa-green-ink/45 mt-1">
              es el mismo pan: una de estas, no todas
            </p>
          </div>
        )}
      </div>

      {/* En MOLDES Y CUARTOS, que es como cuenta la casa: «1,423 cuadros» no
          le dice nada a nadie, «29 moldes y ½» sí. Y uno por cada tamaño de
          molde, nunca sumados: ese era el reclamo. */}
      <div className="shrink-0 w-44 text-right">
        {/* «Todavía no se hornea» NO es «se acabó», y el renglón decía las dos
            cosas a la vez: a la izquierda «Todavía no se hornea nada hoy» y
            aquí, en rojo, «se acabó · no queda nada». Es la misma lección que
            `paquetes_posibles = null` (§4): la ausencia de un dato no es un
            cero. Un sabor que nunca entró al horno no se agotó — nadie lo ha
            hecho todavía, que es lo contrario de una urgencia.

            Y lo que SÍ se acabó va en carmín profundo, no en el rosa salmón:
            ese rosa es un acento de la marca y a un metro se ve despintado. */}
        {sinHornear ? (
          <>
            <p className="font-display text-2xl leading-none text-sa-green-ink/35">
              sin hornear
            </p>
            <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/45 mt-1">
              nadie lo ha hecho hoy
            </p>
          </>
        ) : agotado || bolsas.length === 0 ? (
          <>
            <p className="font-display text-2xl leading-none text-sa-green-deep">se acabó</p>
            <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/45 mt-1">
              no queda nada
            </p>
          </>
        ) : (
          <div className="space-y-1.5">
            {bolsas.map((b) => (
              <div key={b.molde}>
                <p
                  className={[
                    'font-display text-2xl leading-none',
                    b.cuadros > 0 ? 'text-sa-green-ink' : 'text-sa-green-deep',
                  ].join(' ')}
                >
                  {b.cuadros > 0 ? enMoldes(b.cuadros, b.molde).texto : 'se acabó'}
                </p>
                <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/45">
                  de {b.molde} cuadros{b.cuadros > 0 ? ` · ${b.cuadros} libres` : ''}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
        {/* El molde de ESTA fila. Va junto a sus botones y no arriba, porque
            es con el que van a apuntar aquí mismo. */}
        <div
          className="flex rounded-full border border-sa-green-ink/15 overflow-hidden"
          role="group"
          aria-label={`Molde de ${e.sabor}`}
        >
          {MOLDES.map((m) => (
            <button
              key={m}
              onClick={() => setMolde(m)}
              aria-pressed={molde === m}
              className={[
                'h-12 px-3 font-mono text-xs uppercase tracking-wide transition-colors',
                molde === m
                  ? 'bg-sa-green-ink text-sa-cream'
                  : 'text-sa-green-ink/55 hover:bg-sa-cream-soft',
              ].join(' ')}
            >
              {m}
            </button>
          ))}
        </div>
        {[1, 2].map((m) => (
          <button
            key={m}
            disabled={ocupado}
            onClick={() => onHornear(m, molde)}
            className="h-12 px-4 rounded-full bg-sa-green text-sa-cream font-display text-sm flex items-center justify-center shadow-sa-sm active:scale-95 transition-transform disabled:opacity-50"
            aria-label={`Agregar ${m} molde de ${molde} de ${e.sabor}`}
          >
            +{m} de {molde}
          </button>
        ))}
        <button
          disabled={ocupado || e.cuadros_libres <= 0}
          onClick={() => onMerma(molde)}
          className="w-12 h-12 rounded-full border border-sa-green-ink/15 text-sa-green-ink/70 font-display text-xl flex items-center justify-center hover:bg-sa-cream-soft active:scale-95 transition-all disabled:opacity-30"
          title="Se perdió un cuadro (se quemó, se cayó)"
          aria-label={`Restar una merma de ${e.sabor}`}
        >
          −
        </button>
      </div>
    </div>
  )
}

/**
 * Lo que está pasando en el horno ahora mismo, para gerencia.
 *
 * Gerencia manda a hacer desde el teléfono y la pregunta que sigue es «¿y
 * cómo va?». Sin esto hay que llamar a la tienda. Es la misma consulta
 * (`fn_horno_en_vivo`) que leen la pantalla del Horno y la Caja: si cada una
 * calculara lo suyo, terminarían diciendo cosas distintas del mismo horno.
 *
 * Si no hay nada en ninguna de las tres pilas no se pinta: una franja que
 * siempre dice «0» deja de mirarse.
 */
function ElHorno() {
  const [datos, setDatos] = useState<HornoEnVivo | null>(null)

  useEffect(() => {
    const traer = () => void hornoEnVivo(sb).then(setDatos).catch(() => {})
    traer()
    // Cada minuto, no cada segundo: nadie hornea con esa precisión y un
    // contador corriendo solo distrae.
    const t = setInterval(traer, 60000)
    // Y en vivo cuando el horno mete o saca algo: el minuto es la red.
    const off = suscribirProduccion(sb, traer)
    return () => {
      clearInterval(t)
      off()
    }
  }, [])

  const r = datos?.resumen
  if (!r || r.en_horno + r.esperando + r.sin_armar === 0) return null

  return (
    <div className={cx.panel}>
      <div className="flex items-baseline justify-between gap-4">
        <p className="font-display text-xl text-sa-green-ink">El horno, ahora</p>
        <p className="font-mono text-[11px] uppercase tracking-wide text-sa-green-ink/45">
          {r.en_horno} dentro · {r.esperando} esperando · {r.sin_armar} sin armar
        </p>
      </div>

      {datos.adentro.length > 0 ? (
        <div className="mt-3 space-y-2">
          {datos.adentro.map((h) => {
            const f = relojDelHorno(h.listo_en, new Date(datos.ahora))
            return (
              <div key={h.item_id} className="flex items-center gap-3">
                <span className="font-display text-xl text-sa-green-ink w-12 shrink-0 tabular-nums">
                  {h.moldes}
                </span>
                <span className="font-body text-sm text-sa-green-ink flex-1 min-w-0">
                  {h.sabor}
                  <span className="text-sa-green-ink/45"> · moldes de {h.molde}</span>
                </span>
                <span
                  className={[
                    'shrink-0 rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-wide text-sa-green-ink',
                    f.tarde ? 'bg-sa-strawberry/25' : 'bg-sa-mint/20',
                  ].join(' ')}
                >
                  {f.texto}
                </span>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="font-body text-sm text-sa-green-ink/60 mt-2">
          {/* "Nada en el horno" significa cosas muy distintas segun por que. */}
          El horno está vacío
          {r.esperando > 0
            ? `: hay ${r.esperando} molde${r.esperando === 1 ? '' : 's'} armado${r.esperando === 1 ? '' : 's'} esperando turno.`
            : r.sin_armar > 0
              ? `: faltan ${r.sin_armar} molde${r.sin_armar === 1 ? '' : 's'} por armar en producción.`
              : '.'}
        </p>
      )}
    </div>
  )
}

/**
 * Un renglón de lo que se va a mandar a hacer.
 *
 * `sabor` es lo que viaja a la base: para las hojaldras es el sabor («Pasta de
 * Guayaba») y para lo que se hornea al pedido es el **nombre del producto**
 * («Rosca de Queso Philadelphia · Grande»), porque eso es lo que la mesa tiene
 * que leer en su pantalla. `molde` solo tiene sentido con `unidad: 'molde'`.
 */
interface RenglonPedido {
  sabor: string
  cantidad: number
  unidad: 'molde' | 'pieza'
  molde: Molde
}

/**
 * Un renglón del pedido, con su cantidad y —si va en moldes— su molde.
 *
 * La cantidad **se teclea** además de los botones: para treinta roscas se
 * escribe 30, no se toca «+» treinta veces. Es la misma razón por la que la
 * cantidad de un encargo se teclea.
 */
export function RenglonDePedido({
  clave,
  nombre,
  detalle,
  imagen,
  base,
  unidad,
  valor,
  onCambiar,
}: {
  clave: string
  nombre: string
  detalle: string
  imagen: string | null
  base: string
  unidad: 'molde' | 'pieza'
  valor: RenglonPedido | undefined
  onCambiar: (r: RenglonPedido | null) => void
}) {
  const n = valor?.cantidad ?? 0
  const foto = urlDeFoto(imagen, base)
  const corto = unidad === 'molde' ? 'm' : 'pz'

  /**
   * El molde elegido vive AQUÍ, no en el renglón del pedido.
   *
   * Iba leído de `valor?.molde ?? 48`, y un renglón en cero no tiene `valor`:
   * tocar «24» antes de poner la cantidad llamaba a `poner(0)`, que borra el
   * renglón, así que el botón **no hacía nada**. Se veía elegido y al poner
   * la cantidad salía en 48. Un botón que se toca y no pasa nada es peor que
   * un botón que no está.
   *
   * Con el molde en el componente se puede elegir primero y teclear después,
   * que es el orden en que lo hace quien está mirando la lista.
   */
  const [molde, setMolde] = useState<Molde>(valor?.molde ?? 48)

  function poner(cantidad: number, conMolde = molde) {
    if (cantidad <= 0) return onCambiar(null)
    onCambiar({ sabor: clave, cantidad, unidad, molde: conMolde })
  }

  function elegirMolde(m: Molde) {
    setMolde(m)
    // Si ya había cantidad, el cambio de molde se aplica de una vez.
    if (n > 0) poner(n, m)
  }

  function teclear() {
    const r = window.prompt(`¿Cuántas ${unidad === 'molde' ? 'moldes' : 'piezas'} de ${nombre}?`, n > 0 ? String(n) : '')
    if (r === null) return
    const v = Number(r.trim())
    if (!Number.isFinite(v) || v < 0) return
    poner(Math.floor(v))
  }

  return (
    <div className="flex items-center gap-3 py-2 border-b border-sa-green-ink/5 last:border-0">
      {foto && <img src={foto} alt="" className="w-9 h-9 object-contain shrink-0" />}
      <div className="min-w-0 flex-1">
        <p className="font-body text-sm text-sa-green-ink leading-tight">{nombre}</p>
        <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/45">
          {detalle}
        </p>
      </div>

      {/* El molde de ESTE renglón. Solo donde significa algo: una rosca no
          tiene molde, y ofrecerle uno es ofrecerle una mentira.

          El hueco se reserva igual en los de pieza (`w-[5.5rem]`), porque si
          no, los −/+ de las roscas quedaban en otra columna que los de las
          hojaldras y la lista se leía como dos listas pegadas. */}
      <div className="hidden sm:flex w-[5.5rem] shrink-0 justify-end">
        {unidad === 'molde' && (
          <div
            className="flex rounded-full border border-sa-green-ink/15 overflow-hidden"
            role="group"
            aria-label={`Molde de ${nombre}`}
          >
            {MOLDES.map((m) => (
              <button
                key={m}
                onClick={() => elegirMolde(m)}
                aria-pressed={molde === m}
                className={[
                  'h-9 px-2.5 font-mono text-[11px] uppercase tracking-wide transition-colors',
                  molde === m
                    ? 'bg-sa-green-ink text-sa-cream'
                    : 'text-sa-green-ink/55 hover:bg-sa-cream-soft',
                ].join(' ')}
              >
                {m}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => poner(Math.max(0, n - 1))}
          disabled={n === 0}
          className="w-9 h-9 rounded-full border border-sa-green-ink/15 text-sa-green-ink/60 disabled:opacity-25"
          aria-label={`Quitar uno de ${nombre}`}
        >
          −
        </button>
        <button
          onClick={teclear}
          className="font-mono text-base w-14 text-center tabular-nums rounded-sa py-1 hover:bg-sa-cream-soft"
          title="Escribir la cantidad"
        >
          {n > 0 ? `${n} ${corto}` : '—'}
        </button>
        <button
          onClick={() => poner(n + 1)}
          className="w-9 h-9 rounded-full bg-sa-green text-sa-cream font-display"
          aria-label={`Agregar uno de ${nombre}`}
        >
          +
        </button>
      </div>
    </div>
  )
}

export default function Produccion() {
  const [sabores, setSabores] = useState<ExistenciaPorMolde[]>([])
  const [paquetes, setPaquetes] = useState<ProductoDelDia[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  /**
   * Lo que se va a mandar a hacer. La llave es el renglón de pantalla, y cada
   * uno lleva **su propio molde**.
   *
   * Antes el molde era UNA decisión para todo el envío. La casa lo reclamó: en
   * la misma hornada caben tres moldes de 48 de guayaba y dos de 24 de queso,
   * y con un solo interruptor había que mandar dos órdenes o mentir en uno de
   * los dos renglones. La base ya lo guardaba por renglón
   * (`orden_produccion_items.cuadros_por_molde`); lo que faltaba era poder
   * pedirlo así.
   *
   * Y la unidad también va por renglón: las hojaldras se piden en moldes, y lo
   * que se hornea al pedido —roscas, trenzas, panes, galletas, anís, Pan de
   * Muerto, Hojaldra de Corazón, bocadillos— se pide en **piezas**, porque no
   * sale de ningún molde.
   */
  const [pedido, setPedido] = useState<Record<string, RenglonPedido>>({})
  /**
   * A qué hora tiene que estar lista la tanda: «antes de las 12».
   *
   * Es una decisión POR ENVÍO y no por renglón, al revés que el molde: la
   * casa lo dijo junto —«diez jamón y queso y cinco fiestas antes de las
   * 12»—, que es una sola entrega con varias cosas adentro. Lo que necesita
   * otra hora es otra tanda.
   *
   * Vacío es «sin hora» y es válido: no toda tanda lleva una.
   */
  const [horaObjetivo, setHoraObjetivo] = useState('')
  const [abrirPedido, setAbrirPedido] = useState(false)
  const [mandando, setMandando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  const base = import.meta.env.BASE_URL

  const cargar = useCallback(async (conSpinner = true) => {
    if (conSpinner) setCargando(true)
    try {
      const [s, p] = await Promise.all([
        listarExistenciasPorMolde(sb),
        listarProductosDelDia(sb),
      ])
      setSabores(s)
      setPaquetes(p)
      setError(null)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  // Con el molde de SU fila, no con uno global: es la diferencia entre
  // apuntar diez moldes de 24 y apuntar lo que el sistema creyó que eran.
  async function hornear(e: ExistenciaPorMolde, moldes: number, molde: Molde) {
    setOcupado(e.sabor)
    try {
      await registrarHorneada(sb, e.sabor, moldes * molde, molde, 'horneado')
      await cargar(false)
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setOcupado(null)
    }
  }

  async function merma(e: ExistenciaPorMolde, molde: Molde) {
    setOcupado(e.sabor)
    try {
      await registrarHorneada(sb, e.sabor, 1, molde, 'merma')
      await cargar(false)
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setOcupado(null)
    }
  }

  async function mandar() {
    const items = Object.values(pedido)
      .filter((r) => r.cantidad > 0)
      .map((r) =>
        r.unidad === 'pieza'
          ? { sabor: r.sabor, moldes: r.cantidad, unidad: 'pieza' as const }
          : { sabor: r.sabor, moldes: r.cantidad, molde: r.molde, unidad: 'molde' as const },
      )
    if (items.length === 0) return
    setMandando(true)
    try {
      const orden = await mandarAProducir(sb, items)
      // La hora va en una segunda llamada porque cambiarle la firma a
      // `fn_produccion_mandar_a_hacer` la duplicaría (§4). Si esta falla, la
      // orden ya existe y lo que falta es una etiqueta: se avisa y se sigue,
      // en vez de hacer creer que no se mandó nada.
      if (horaObjetivo.trim()) {
        await fijarHoraDeProduccion(sb, orden, horaObjetivo.trim())
      }
      // El resumen se dice por unidad, no sumado: «5 moldes y 12 piezas» es
      // lo que de verdad se mandó. Un «17» a secas no es de nada.
      const moldes = items.filter((i) => i.unidad === 'molde').reduce((s, i) => s + i.moldes, 0)
      const piezas = items.filter((i) => i.unidad === 'pieza').reduce((s, i) => s + i.moldes, 0)
      const partes = [
        moldes > 0 ? `${moldes} molde${moldes === 1 ? '' : 's'}` : '',
        piezas > 0 ? `${piezas} pieza${piezas === 1 ? '' : 's'}` : '',
      ].filter(Boolean)
      setAviso(
        `Mandado a hacer: ${partes.join(' y ')}` +
          (horaObjetivo.trim() ? ` para las ${horaObjetivo.trim()}` : '') +
          '. Ya salió en la pantalla de Producción.',
      )
      setPedido({})
      setHoraObjetivo('')
      setAbrirPedido(false)
      setError(null)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setMandando(false)
    }
  }

  const porSabor = useMemo(() => {
    const m = new Map<string, ProductoDelDia[]>()
    // Solo lo que se corta de un molde. Lo que se hornea al pedido (las
    // roscas, los panes) viene con `sabor` y `paquetes_posibles` en null: no
    // tiene existencia que repartir y no va en este renglon.
    paquetes.forEach((p) => {
      if (!p.sabor || p.paquetes_posibles === null) return
      const l = m.get(p.sabor) ?? []
      l.push(p)
      m.set(p.sabor, l)
    })
    // Del mas chico al mas grande, que es el orden del cartel: 6, Mini, Chica,
    // Grande. Venia en el orden en que la base los devolvio, o sea en ninguno.
    for (const l of m.values()) l.sort((a, b) => (a.cuadros ?? 0) - (b.cuadros ?? 0))
    return m
  }, [paquetes])

  /**
   * Lo que **no sale de un molde**, para poder mandarlo a hacer también.
   *
   * Era lo que faltaba, y la casa lo dijo corto: «en producción falta que hagan
   * todos los panes». Media panadería no es hojaldra —las roscas, la Trenza
   * Suiza, las Patas, los Tutis, las galletas, lo de anís, el Pan de Muerto, la
   * Hojaldra de Corazón, los bocadillos— y la pantalla solo sabía pedir
   * sabores que se cuentan en cuadros.
   *
   * Se reconocen por `sabor` en null: eso deja fuera el café y las bebidas
   * (que sí traen sabor y tampoco se hornean) sin tener que escribir una lista
   * de categorías a mano, que es la clase de lista que se queda vieja.
   */
  const alPedido = useMemo(() => {
    const m = new Map<string, ProductoDelDia[]>()
    paquetes.forEach((p) => {
      if (p.sabor !== null) return
      const l = m.get(p.categoria) ?? []
      l.push(p)
      m.set(p.categoria, l)
    })
    for (const l of m.values()) l.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    return [...m.entries()]
  }, [paquetes])

  const porCategoria = useMemo(() => {
    const m = new Map<string, ExistenciaPorMolde[]>()
    sabores.forEach((f) => {
      const l = m.get(f.categoria) ?? []
      l.push(f)
      m.set(f.categoria, l)
    })
    return [...m.entries()]
  }, [sabores])

  const cuadrosHorneados = sabores.reduce((s, f) => s + f.cuadros_horneados, 0)
  const cuadrosLibres = sabores.reduce((s, f) => s + Math.max(0, f.cuadros_libres), 0)
  const cuadrosVendidos = sabores.reduce((s, f) => s + f.cuadros_vendidos, 0)
  const cuadrosApartados = sabores.reduce((s, f) => s + f.cuadros_apartados, 0)
  const agotados = sabores.filter((f) => f.cuadros_horneados > 0 && f.cuadros_libres <= 0)
  const renglones = Object.values(pedido).filter((r) => r.cantidad > 0)
  const aMandarMoldes = renglones
    .filter((r) => r.unidad === 'molde')
    .reduce((s, r) => s + r.cantidad, 0)
  const aMandarPiezas = renglones
    .filter((r) => r.unidad === 'pieza')
    .reduce((s, r) => s + r.cantidad, 0)
  // Los cuadros se suman con el molde de CADA renglón: dos de 48 y dos de 24
  // no son cuatro de nada, son 144 cuadros.
  const aMandarCuadros = renglones
    .filter((r) => r.unidad === 'molde')
    .reduce((s, r) => s + r.cantidad * r.molde, 0)
  const aMandar = renglones.length

  if (cargando) return <Loading>Cargando la producción de hoy…</Loading>

  return (
    <div className="space-y-6">
      <PageHeader
        title="Producción de hoy"
        subtitle="Se hornea por moldes de 48 o de 24 y se vende por paquete. Cada sabor se cuenta con SU molde; los tres totales de abajo, en moldes de 48, que es el de la casa."
      />

      <ElHorno />

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

      <div className={cx.panel}>
        <button
          onClick={() => setAbrirPedido((v) => !v)}
          className="w-full flex items-center justify-between gap-4 text-left"
        >
          <div>
            <p className="font-display text-xl text-sa-green-ink">Mandar a producir</p>
            <p className="font-body text-sm text-sa-green-ink/60 mt-0.5">
              Las hojaldras se piden en moldes, y cada renglón elige si son de
              48 o de 24; los tamaños se cortan después, conforme se vendan. Lo
              demás —roscas, trenzas, panes, galletas, anís, bocadillos— se
              pide en piezas.
            </p>
          </div>
          <span className="font-mono text-xs uppercase tracking-wide text-sa-green shrink-0">
            {abrirPedido ? 'Cerrar' : 'Abrir'}
          </span>
        </button>

        {abrirPedido && (
          <div className="mt-5 space-y-2">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-sa-green">
              Hojaldras · se piden en moldes
            </p>
            {sabores.map((f) => (
              <RenglonDePedido
                key={f.sabor}
                clave={f.sabor}
                nombre={f.sabor}
                detalle={
                  'quedan ' +
                  (([48, 24] as const)
                    .map((m) => ({ m, c: m === 48 ? f.libres_48 : f.libres_24 }))
                    .filter((b) => b.c > 0)
                    .map((b) => `${enMoldes(b.c, b.m).texto} de ${b.m}`)
                    .join(' y ') || 'nada')
                }
                imagen={f.imagen_url}
                base={base}
                unidad="molde"
                valor={pedido[f.sabor]}
                onCambiar={(r) =>
                  setPedido((p) => {
                    const { [f.sabor]: _fuera, ...resto } = p
                    return r ? { ...resto, [f.sabor]: r } : resto
                  })
                }
              />
            ))}

            {/* Lo que se hornea al pedido. Va aparte y no mezclado con las
                hojaldras porque se cuenta distinto: aquí no hay molde que
                elegir ni cuadros que repartir, hay piezas. */}
            {alPedido.map(([categoria, lista]) => (
              <div key={categoria} className="pt-4">
                <p className="font-mono text-xs uppercase tracking-[0.16em] text-sa-green">
                  {categoria} · se piden en piezas
                </p>
                {lista.map((p) => (
                  <RenglonDePedido
                    key={p.producto_id}
                    clave={p.nombre}
                    nombre={p.nombre}
                    detalle={medidaDeVenta(p).texto || 'se hornea al pedido'}
                    imagen={p.imagen_url}
                    base={base}
                    unidad="pieza"
                    valor={pedido[p.nombre]}
                    onCambiar={(r) =>
                      setPedido((q) => {
                        const { [p.nombre]: _fuera, ...resto } = q
                        return r ? { ...resto, [p.nombre]: r } : resto
                      })
                    }
                  />
                ))}
              </div>
            ))}

            {/* La hora va abajo, junto al total: es lo último que se
                decide, con los renglones ya enfrente. */}
            <div className="flex items-center gap-3 pt-5 flex-wrap">
              <span className={cx.label}>Para las</span>
              <input
                type="time"
                value={horaObjetivo}
                onChange={(ev) => setHoraObjetivo(ev.target.value)}
                className="rounded-sa border border-sa-green-ink/15 px-3 py-2 font-mono text-sm"
                aria-label="Hora a la que tiene que estar lista"
              />
              {horaObjetivo && (
                <button
                  onClick={() => setHoraObjetivo('')}
                  className="font-mono text-[11px] uppercase tracking-wide text-sa-green-ink/50"
                >
                  Quitar la hora
                </button>
              )}
              <span className="font-body text-xs text-sa-green-ink/45">
                Opcional. Sin hora, la mesa la hace en el orden en que llegó.
              </span>
            </div>

            <div className="flex items-center justify-between gap-4 pt-5">
              <p className="font-body text-sm text-sa-green-ink/70">
                {aMandar > 0
                  ? [
                      aMandarMoldes > 0
                        ? `${aMandarMoldes} molde${aMandarMoldes === 1 ? '' : 's'} · ${aMandarCuadros} cuadros`
                        : '',
                      aMandarPiezas > 0
                        ? `${aMandarPiezas} pieza${aMandarPiezas === 1 ? '' : 's'}`
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : 'Todavía no ha puesto nada'}
              </p>
              <button
                onClick={() => void mandar()}
                disabled={aMandar === 0 || mandando}
                className={cx.btnPrimary}
              >
                {mandando ? 'Mandando…' : 'Mandar a producir'}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {/* En CUADROS, igual que sus dos vecinos. Decia "N moldes" dividiendo
            entre un solo tamano de molde, y con moldes de 48 y de 24 mezclados
            en el mismo dia ese numero no es de nada: 96 cuadros son dos moldes
            de 48 o cuatro de 24. El cuadro si es la misma unidad siempre. */}
        <div className={cx.panelChico}>
          <p className={cx.label}>Horneado</p>
          <p className="font-display text-2xl sm:text-3xl text-sa-green-ink mt-1">
            {enMoldes(cuadrosHorneados, 48).texto}
          </p>
          <p className="font-body text-[11px] text-sa-green-ink/45 mt-0.5">
            {cuadrosHorneados} cuadros
          </p>
        </div>
        <div className={cx.panelChico}>
          <p className={cx.label}>Vendido</p>
          <p className="font-display text-2xl sm:text-3xl text-sa-green-ink mt-1">
            {enMoldes(cuadrosVendidos, 48).texto}
          </p>
          <p className="font-body text-[11px] text-sa-green-ink/45 mt-0.5">
            {cuadrosVendidos} cuadros
          </p>
        </div>
        <div className={cx.panelChico}>
          <p className={cx.label}>Libre</p>
          <p className="font-display text-2xl sm:text-3xl text-sa-green mt-1">
            {enMoldes(cuadrosLibres, 48).texto}
          </p>
          <p className="font-body text-[11px] text-sa-green-ink/45 mt-0.5">
            {cuadrosLibres} cuadros
          </p>
          {cuadrosApartados > 0 && (
            <p className="font-body text-xs text-sa-banana mt-1">
              {enMoldes(cuadrosApartados, 48).texto} apartado
              {cuadrosApartados === 1 ? '' : 's'}
            </p>
          )}
        </div>
      </div>

      {agotados.length > 0 && (
        <div className="rounded-sa bg-sa-strawberry/10 border-l-4 border-sa-strawberry px-5 py-4">
          <p className="font-display text-lg text-sa-green-ink">
            Se acabó {agotados.length === 1 ? 'este sabor' : `${agotados.length} sabores`}
          </p>
          <p className="font-body text-sm text-sa-green-ink/70 mt-1">
            {agotados.map((a) => a.sabor).join(' · ')}
          </p>
        </div>
      )}

      {porCategoria.map(([categoria, lista]) => (
        <div key={categoria} className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-sa-green pt-2">
            {categoria}
          </p>
          {lista.map((e) => (
            <Fila
              key={e.sabor}
              e={e}
              paquetes={porSabor.get(e.sabor) ?? []}
              base={base}
              ocupado={ocupado === e.sabor}
              onHornear={(m, mol) => void hornear(e, m, mol)}
              onMerma={(mol) => void merma(e, mol)}
            />
          ))}
        </div>
      ))}

      <p className={`font-body text-sm ${cx.muted}`}>
        Solo aparecen los menús que hoy están abiertos. Para abrir o cerrar un
        menú completo, vaya a <b>Menús del día</b>.
      </p>
    </div>
  )
}
