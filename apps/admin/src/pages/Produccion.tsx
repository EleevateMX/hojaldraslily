import { useCallback, useEffect, useMemo, useState } from 'react'
import { sb } from '../lib/sb'
import {
  listarExistenciasDelDia,
  registrarProduccion,
  mandarAProducir,
  partirNombreDeVenta,
  type ExistenciaDelDia,
} from '@shake/supabase'
import { mensajeDeError, urlDeFoto } from '@shake/utils'
import { PageHeader, Loading, ErrorMsg, cx } from '../ui'

/**
 * Lo que salió del horno hoy, y lo que queda.
 *
 * El inventario que venía del motor original cuenta INSUMOS por almacén
 * (harina, jamón, queso, en kilos). Eso sirve para costear, pero no contesta
 * la pregunta de media mañana: «¿cuántos paquetes de guayaba chica me
 * quedan?».
 *
 * Esta pantalla lleva el producto TERMINADO, en paquetes, como se vende:
 * de la hornada salen tantos de cada sabor y tamaño, y lo que se cobra en
 * caja va bajando el número solo. Disponible = horneado − merma − vendido.
 *
 * Está hecha para capturarse de pie y con prisa, sin leer instrucciones:
 * el dibujo del sabor manda, los botones son grandes y el número que importa
 * —cuántos quedan— es el más grande de la fila.
 */

/** Cuánto suma cada botón. Son las tandas con las que de verdad se hornea. */
const TANDAS = [1, 5, 10]

function Fila({
  e,
  base,
  ocupado,
  onSumar,
  onMerma,
}: {
  e: ExistenciaDelDia
  base: string
  ocupado: boolean
  onSumar: (n: number) => void
  onMerma: () => void
}) {
  const { sabor, medida } = partirNombreDeVenta(e.nombre)
  const foto = urlDeFoto(e.imagen_url, base)
  const agotado = e.disponibles <= 0 && e.horneados > 0
  const sinHornear = e.horneados === 0

  return (
    <div
      className={[
        /* En el telefono los botones no caben en el mismo renglon que el
           nombre y el numero: se envuelven a uno propio en vez de encogerse
           hasta no poder picarse con el dedo. */
        'flex flex-wrap sm:flex-nowrap items-center gap-3 sm:gap-4 rounded-sa border p-4 transition-colors',
        agotado ? 'bg-sa-strawberry/10 border-sa-strawberry/40' : 'bg-white border-sa-green-ink/10',
      ].join(' ')}
    >
      {foto && (
        <img src={foto} alt="" className="w-14 h-14 shrink-0 object-contain" draggable={false} />
      )}

      <div className="min-w-0 flex-1 basis-0 min-w-[9rem]">
        <p className="font-display text-lg leading-tight text-sa-green-ink">{sabor}</p>
        {medida && (
          <p className="font-mono text-[11px] uppercase tracking-wide text-sa-green-ink/50 mt-0.5">
            {medida}
          </p>
        )}
        {/* La cuenta, en palabras: "se hornearon 12, se vendieron 5". Un
            renglon de numeros sueltos no lo lee nadie con prisa. */}
        <p className="font-body text-xs text-sa-green-ink/55 mt-1">
          {sinHornear
            ? 'Todavía no se hornea nada hoy'
            : `Se hornearon ${e.horneados}` +
              (e.mermados > 0 ? ` · se perdieron ${e.mermados}` : '') +
              ` · se vendieron ${e.vendidos}`}
        </p>
        {/* Lo apartado es de alguien mas, aunque siga en la vitrina: si no se
            dice aqui, se vende dos veces la misma pieza. */}
        {e.apartados > 0 && (
          <p className="font-body text-xs text-sa-banana mt-1">
            {e.apartados} apartada{e.apartados === 1 ? '' : 's'} para encargos ·
            libres para vender: <b>{Math.max(0, e.libres)}</b>
          </p>
        )}
      </div>

      {/* El numero que importa, en grande. */}
      <div className="shrink-0 w-24 text-center">
        <p
          className={[
            'font-display leading-none',
            agotado ? 'text-3xl text-sa-strawberry' : 'text-4xl text-sa-green-ink',
          ].join(' ')}
        >
          {e.disponibles}
        </p>
        <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/45 mt-1">
          {agotado ? 'se acabó' : 'quedan'}
        </p>
      </div>

      <div className="shrink-0 flex items-center gap-2 w-full sm:w-auto justify-end">
        {TANDAS.map((n) => (
          <button
            key={n}
            disabled={ocupado}
            onClick={() => onSumar(n)}
            className="w-12 h-12 rounded-full bg-sa-green text-sa-cream font-display text-base flex items-center justify-center shadow-sa-sm active:scale-95 transition-transform disabled:opacity-50"
            aria-label={`Agregar ${n} de ${sabor}${medida ? ' ' + medida : ''}`}
          >
            +{n}
          </button>
        ))}
        <button
          disabled={ocupado || e.disponibles <= 0}
          onClick={onMerma}
          className="w-12 h-12 rounded-full border border-sa-green-ink/15 text-sa-green-ink/70 font-display text-xl flex items-center justify-center hover:bg-sa-cream-soft active:scale-95 transition-all disabled:opacity-30"
          title="Se perdió una pieza (se quemó, se cayó)"
          aria-label={`Restar una merma de ${sabor}`}
        >
          −
        </button>
      </div>
    </div>
  )
}

export default function Produccion() {
  const [filas, setFilas] = useState<ExistenciaDelDia[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  // Lo que se va a mandar a hacer: producto_id -> cuantos. Vive aparte de las
  // existencias porque es una intencion, no un hecho: hasta que no se toca
  // "Mandar a producir" no ha pasado nada.
  const [pedido, setPedido] = useState<Record<string, number>>({})
  const [abrirPedido, setAbrirPedido] = useState(false)
  const [mandando, setMandando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  const base = import.meta.env.BASE_URL

  const cargar = useCallback(async (conSpinner = true) => {
    if (conSpinner) setCargando(true)
    try {
      setFilas(await listarExistenciasDelDia(sb))
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

  async function mover(e: ExistenciaDelDia, cantidad: number, motivo: 'horneado' | 'merma') {
    setOcupado(e.producto_id)
    try {
      await registrarProduccion(sb, e.producto_id, cantidad, motivo)
      await cargar(false)
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setOcupado(null)
    }
  }

  async function mandar() {
    const items = Object.entries(pedido)
      .filter(([, n]) => n > 0)
      .map(([producto_id, cantidad]) => ({ producto_id, cantidad }))
    if (items.length === 0) return
    setMandando(true)
    try {
      await mandarAProducir(sb, items)
      const piezas = items.reduce((s, i) => s + i.cantidad, 0)
      setAviso(`Mandado a producir: ${piezas} pieza${piezas === 1 ? '' : 's'}. Ya salió en la pantalla de producción.`)
      setPedido({})
      setAbrirPedido(false)
      setError(null)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setMandando(false)
    }
  }

  const porCategoria = useMemo(() => {
    const m = new Map<string, ExistenciaDelDia[]>()
    filas.forEach((f) => {
      const l = m.get(f.categoria) ?? []
      l.push(f)
      m.set(f.categoria, l)
    })
    return [...m.entries()]
  }, [filas])

  const totalHorneado = filas.reduce((s, f) => s + f.horneados, 0)
  const totalDisponible = filas.reduce((s, f) => s + Math.max(0, f.disponibles), 0)
  const totalVendido = filas.reduce((s, f) => s + f.vendidos, 0)
  const agotados = filas.filter((f) => f.horneados > 0 && f.disponibles <= 0)
  const aMandar = Object.values(pedido).reduce((s, n) => s + n, 0)
  const totalApartado = filas.reduce((s, f) => s + f.apartados, 0)

  if (cargando) return <Loading>Cargando la producción de hoy…</Loading>

  return (
    <div className="space-y-6">
      <PageHeader
        title="Producción de hoy"
        subtitle="Apunte lo que va saliendo del horno. Lo que se cobre en caja va bajando el número solo."
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

      {/* Mandar a producir.
          Va arriba y cerrado: es lo PRIMERO que se hace en el dia (decidir
          que se hornea) pero se hace una vez, y el resto del dia esta pantalla
          se usa para lo otro -- ver como va. Abierto todo el tiempo empujaria
          hacia abajo lo que se consulta cada rato. */}
      <div className={cx.panel}>
        <button
          onClick={() => setAbrirPedido((v) => !v)}
          className="w-full flex items-center justify-between gap-4 text-left"
        >
          <div>
            <p className="font-display text-xl text-sa-green-ink">Mandar a producir</p>
            <p className="font-body text-sm text-sa-green-ink/60 mt-0.5">
              Lo que escriba aquí sale en la pantalla de producción, y al
              terminarse entra solo al inventario.
            </p>
          </div>
          <span className="font-mono text-xs uppercase tracking-wide text-sa-green shrink-0">
            {abrirPedido ? 'Cerrar' : 'Abrir'}
          </span>
        </button>

        {abrirPedido && (
          <div className="mt-5 space-y-2">
            {filas.map((f) => {
              const { sabor, medida } = partirNombreDeVenta(f.nombre)
              const n = pedido[f.producto_id] ?? 0
              return (
                <div
                  key={f.producto_id}
                  className="flex items-center gap-3 py-2 border-b border-sa-green-ink/5 last:border-0"
                >
                  {urlDeFoto(f.imagen_url, base) && (
                    <img
                      src={urlDeFoto(f.imagen_url, base)!}
                      alt=""
                      className="w-9 h-9 object-contain shrink-0"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-body text-sm text-sa-green-ink leading-tight">{sabor}</p>
                    {medida && (
                      <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/45">
                        {medida}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() =>
                        setPedido((p) => ({ ...p, [f.producto_id]: Math.max(0, n - 5) }))
                      }
                      disabled={n === 0}
                      className="w-9 h-9 rounded-full border border-sa-green-ink/15 text-sa-green-ink/60 disabled:opacity-25"
                      aria-label={`Quitar 5 de ${sabor}`}
                    >
                      −
                    </button>
                    <span className="font-mono text-base w-8 text-center tabular-nums">{n}</span>
                    <button
                      onClick={() => setPedido((p) => ({ ...p, [f.producto_id]: n + 5 }))}
                      className="w-9 h-9 rounded-full bg-sa-green text-sa-cream font-display"
                      aria-label={`Agregar 5 de ${sabor}`}
                    >
                      +
                    </button>
                  </div>
                </div>
              )
            })}

            <div className="flex items-center justify-between gap-4 pt-4">
              <p className="font-body text-sm text-sa-green-ink/70">
                {aMandar > 0
                  ? `${aMandar} pieza${aMandar === 1 ? '' : 's'} en la orden`
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
        <div className={cx.panelChico}>
          <p className={cx.label}>Salieron del horno</p>
          <p className="font-display text-2xl sm:text-3xl text-sa-green-ink mt-1">{totalHorneado}</p>
        </div>
        <div className={cx.panelChico}>
          <p className={cx.label}>Se vendieron</p>
          <p className="font-display text-2xl sm:text-3xl text-sa-green-ink mt-1">{totalVendido}</p>
        </div>
        <div className={cx.panelChico}>
          <p className={cx.label}>Quedan</p>
          <p className="font-display text-2xl sm:text-3xl text-sa-green mt-1">{totalDisponible}</p>
          {totalApartado > 0 && (
            <p className="font-body text-xs text-sa-banana mt-1">
              {totalApartado} apartada{totalApartado === 1 ? '' : 's'} para encargos
            </p>
          )}
        </div>
      </div>

      {/* Lo agotado se avisa arriba: es lo unico de esta pantalla que obliga a
          hacer algo ahora (hornear mas, o avisar en la barra). */}
      {agotados.length > 0 && (
        <div className="rounded-sa bg-sa-strawberry/10 border-l-4 border-sa-strawberry px-5 py-4">
          <p className="font-display text-lg text-sa-green-ink">
            Se acabaron {agotados.length === 1 ? 'estas piezas' : `${agotados.length} piezas`}
          </p>
          <p className="font-body text-sm text-sa-green-ink/70 mt-1">
            {agotados.map((a) => partirNombreDeVenta(a.nombre).sabor + ' ' + partirNombreDeVenta(a.nombre).medida).join(' · ')}
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
              key={e.producto_id}
              e={e}
              base={base}
              ocupado={ocupado === e.producto_id}
              onSumar={(n) => void mover(e, n, 'horneado')}
              onMerma={() => void mover(e, 1, 'merma')}
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
