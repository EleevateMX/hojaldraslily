import { useCallback, useEffect, useState } from 'react'
import { sb } from '../lib/sb'
import { listarMenusDelDia, cambiarMenuActivo, type MenuDelDia } from '@shake/supabase'
import { mxn, mensajeDeError } from '@shake/utils'
import { PageHeader, Loading, ErrorMsg, cx } from '../ui'

/**
 * Los menús del día: qué se está vendiendo hoy y qué no.
 *
 * Hojaldras Lily no vende siempre lo mismo. El "Menú del día" está abierto
 * todos los días; "Por encargo" solo cuando hay quien lo hornee; "Temporada"
 * solo en su temporada. Esta pantalla es el interruptor de cada uno, y al
 * lado la cuenta de lo que lleva vendido hoy: la decisión de dejar un menú
 * abierto se toma mirando las dos cosas juntas.
 *
 * Por qué el interruptor vive en la CATEGORÍA y no en cada producto: apagar
 * producto por producto no sirve de nada, porque el siguiente guardado de
 * Costeos los revive (fn_sync_app_data pone `activo = precio > 0`).
 * `categorias.activa` es la única bandera del catálogo que ese guardado no
 * toca, así que es la única que aguanta. Está explicado en CLAUDE.md, 4.
 *
 * Apagar un menú NO borra nada ni cambia precios: los productos siguen ahí,
 * con su costeo intacto, y vuelven en cuanto se prenda.
 */

/** Cierra el menú si al tocar el interruptor la cuenta no cuadra con la vista. */
function Interruptor({
  encendido,
  ocupado,
  onCambiar,
  etiqueta,
}: {
  encendido: boolean
  ocupado: boolean
  onCambiar: () => void
  etiqueta: string
}) {
  return (
    <button
      role="switch"
      aria-checked={encendido}
      aria-label={etiqueta}
      disabled={ocupado}
      onClick={onCambiar}
      className={[
        'relative w-[76px] h-10 rounded-full transition-colors shrink-0',
        'focus:outline-none focus:ring-2 focus:ring-sa-green/40 focus:ring-offset-2',
        ocupado ? 'opacity-60 cursor-wait' : 'cursor-pointer',
        encendido ? 'bg-sa-green' : 'bg-sa-green-ink/20',
      ].join(' ')}
    >
      <span
        className={[
          'absolute top-1 w-8 h-8 rounded-full bg-white shadow transition-all',
          encendido ? 'left-[40px]' : 'left-1',
        ].join(' ')}
      />
    </button>
  )
}

export default function Menus() {
  const [menus, setMenus] = useState<MenuDelDia[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cambiando, setCambiando] = useState<string | null>(null)

  const cargar = useCallback(async (conSpinner = true) => {
    if (conSpinner) setCargando(true)
    try {
      setMenus(await listarMenusDelDia(sb))
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

  async function alternar(m: MenuDelDia) {
    setCambiando(m.id)
    // Se pinta el cambio de una vez: el interruptor tiene que responder al
    // dedo, no medio segundo despues. Si la base lo rechaza, `cargar()` del
    // catch deja la pantalla como esta la base de verdad.
    setMenus((antes) =>
      antes.map((x) => (x.id === m.id ? { ...x, activa: !x.activa } : x)),
    )
    try {
      await cambiarMenuActivo(sb, m.id, !m.activa)
      await cargar(false)
    } catch (e) {
      setError(mensajeDeError(e))
      await cargar(false)
    } finally {
      setCambiando(null)
    }
  }

  if (cargando) return <Loading>Cargando los menús…</Loading>

  const abiertos = menus.filter((m) => m.activa)
  const vendidoHoy = menus.reduce((s, m) => s + Number(m.importe_hoy), 0)
  const piezasHoy = menus.reduce((s, m) => s + Number(m.vendidos_hoy), 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Menús del día"
        subtitle="Prenda lo que hoy sí se vende. Lo que apague desaparece del kiosko y de la caja al instante; nada se borra y los precios no se tocan."
      />

      {error && <ErrorMsg>{error}</ErrorMsg>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className={cx.panel}>
          <p className={cx.label}>Menús abiertos</p>
          <p className="font-display text-3xl text-sa-green-ink mt-1">
            {abiertos.length} <span className="text-lg text-sa-green-ink/40">de {menus.length}</span>
          </p>
        </div>
        <div className={cx.panel}>
          <p className={cx.label}>Piezas vendidas hoy</p>
          <p className="font-display text-3xl text-sa-green-ink mt-1">{piezasHoy}</p>
        </div>
        <div className={cx.panel}>
          <p className={cx.label}>Vendido hoy</p>
          <p className="font-display text-3xl text-sa-green mt-1">{mxn(vendidoHoy)}</p>
        </div>
      </div>

      <div className="space-y-3">
        {menus.map((m) => {
          const sinProductos = m.productos === 0
          return (
            <div
              key={m.id}
              className={[
                'flex items-center gap-5 rounded-sa border p-5 transition-colors',
                m.activa
                  ? 'bg-white border-sa-green/30'
                  : 'bg-sa-cream-soft/60 border-sa-green-ink/10',
              ].join(' ')}
            >
              <Interruptor
                encendido={m.activa}
                ocupado={cambiando === m.id}
                onCambiar={() => void alternar(m)}
                etiqueta={`${m.activa ? 'Apagar' : 'Prender'} ${m.nombre}`}
              />

              <div className="min-w-0 flex-1">
                <p
                  className={[
                    'font-display text-xl leading-tight',
                    m.activa ? 'text-sa-green-ink' : 'text-sa-green-ink/45',
                  ].join(' ')}
                >
                  {m.nombre}
                </p>
                <p className="font-mono text-[11px] uppercase tracking-wide text-sa-green-ink/45 mt-1">
                  {m.cocina} · {m.productos} {m.productos === 1 ? 'pieza' : 'piezas'}
                </p>
                {/* Un menu prendido y vacio no le sirve a nadie: sale como
                    boton en el kiosko y al tocarlo no hay nada. Se avisa
                    aqui, que es donde se puede arreglar. */}
                {m.activa && sinProductos && (
                  <p className="font-body text-xs text-sa-banana mt-1.5">
                    Está prendido pero no tiene nada que vender. Agréguele piezas
                    en Costeos o apáguelo.
                  </p>
                )}
              </div>

              <div className="text-right shrink-0">
                <p className="font-mono text-[11px] uppercase tracking-wide text-sa-green-ink/45">
                  Hoy
                </p>
                <p className="font-display text-2xl text-sa-green-ink leading-none mt-1">
                  {m.vendidos_hoy}
                </p>
                <p className="font-mono text-xs text-sa-green-ink/55 mt-1">
                  {mxn(Number(m.importe_hoy))}
                </p>
              </div>

              <div className="shrink-0 w-24 text-right">
                <span
                  className={[
                    'font-mono text-[11px] uppercase tracking-wide px-2.5 py-1 rounded-full',
                    m.activa
                      ? 'bg-sa-green/10 text-sa-green-deep'
                      : 'bg-sa-green-ink/8 text-sa-green-ink/50',
                  ].join(' ')}
                >
                  {m.activa ? 'Abierto' : 'Cerrado'}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      <p className={`font-body text-sm ${cx.muted}`}>
        Las piezas y los precios de cada menú se capturan en Costeos. Aquí solo
        se decide cuáles se ofrecen hoy.
      </p>
    </div>
  )
}
