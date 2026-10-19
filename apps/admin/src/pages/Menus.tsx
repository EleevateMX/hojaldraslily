import { useCallback, useEffect, useState } from 'react'
import { sb } from '../lib/sb'
import {
  listarMenusDelDia,
  cambiarMenuActivo,
  listarProductosDeMenu,
  pausarProducto,
  type MenuDelDia,
  type ProductoDeMenu,
} from '@lily/supabase'
import { mxn, mensajeDeError, urlDeFoto } from '@lily/utils'
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
 * El interruptor grande vive en la CATEGORÍA, no en cada producto, por una
 * razón que costó caro: apagar producto por producto **no servía**, porque el
 * siguiente guardado de Costeos los revive (`fn_sync_app_data` pone
 * `activo = precio > 0`). Está explicado en CLAUDE.md, 4.
 *
 * Pero adentro de un menú a veces hay DOS temporadas. El Menú de Temporada
 * lleva el Pan de Muerto y la Rosca de Reyes, y en enero hay que cambiar uno
 * por el otro: con un solo interruptor por menú, la única manera era ponerle
 * cero a los ocho precios del Pan de Muerto —o sea borrarlos— y volver a
 * teclearlos en octubre.
 *
 * Por eso cada pieza tiene además su **«Guardar para después»**, que es una
 * bandera aparte (`productos.pausado`) y el guardado de Costeos sí respeta.
 * Guardar una pieza no le quita el precio ni la receta: desaparece del kiosko
 * y de la caja, y vuelve tal cual estaba.
 *
 * Apagar un menú tampoco borra nada ni cambia precios.
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

/**
 * Las piezas de un menú, con su «Guardar para después».
 *
 * Va plegado y solo se abre cuando hace falta: en el día a día lo que se toca
 * es el interruptor del menú entero, y una lista de veintitrés piezas debajo
 * de cada uno enterraría justo eso.
 */
function PiezasDelMenu({ menu, onError }: { menu: MenuDelDia; onError: (m: string) => void }) {
  const [abierto, setAbierto] = useState(false)
  const [piezas, setPiezas] = useState<ProductoDeMenu[] | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const base = import.meta.env.BASE_URL

  const traer = useCallback(async () => {
    try {
      setPiezas(await listarProductosDeMenu(sb, menu.id))
    } catch (e) {
      onError(mensajeDeError(e))
    }
  }, [menu.id, onError])

  async function alternar(p: ProductoDeMenu) {
    setOcupado(p.id)
    // Se pinta de una vez: el interruptor responde al dedo. Si la base lo
    // rechaza, el `traer()` de abajo deja la pantalla como está de verdad.
    setPiezas((antes) =>
      (antes ?? []).map((x) =>
        x.id === p.id ? { ...x, pausado: !x.pausado, activo: x.pausado && x.precio > 0 } : x,
      ),
    )
    try {
      await pausarProducto(sb, p.id, !p.pausado)
    } catch (e) {
      onError(mensajeDeError(e))
    } finally {
      await traer()
      setOcupado(null)
    }
  }

  const guardadas = (piezas ?? []).filter((p) => p.pausado).length

  return (
    <div className="border-t border-sa-green-ink/10 mt-3 pt-3">
      <button
        onClick={() => {
          setAbierto((v) => !v)
          if (!piezas) void traer()
        }}
        className="font-mono text-[11px] uppercase tracking-wide text-sa-green hover:brightness-110"
      >
        {abierto ? 'Cerrar las piezas' : 'Ver las piezas, una por una'}
        {guardadas > 0 && !abierto && ` · ${guardadas} guardada${guardadas === 1 ? '' : 's'}`}
      </button>

      {abierto && (
        <div className="mt-3 space-y-1">
          {piezas === null ? (
            <p className="font-mono text-xs text-sa-green-ink/45">Un momento…</p>
          ) : piezas.length === 0 ? (
            <p className="font-body text-sm text-sa-green-ink/55">
              Este menú no tiene piezas. Se capturan en Costeos.
            </p>
          ) : (
            piezas.map((p) => {
              const foto = urlDeFoto(p.imagen_url, base)
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-3 py-1.5 border-b border-sa-green-ink/5 last:border-0"
                >
                  {foto && <img src={foto} alt="" className="w-8 h-8 object-contain shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p
                      className={[
                        'font-body text-sm leading-tight',
                        p.pausado ? 'text-sa-green-ink/40' : 'text-sa-green-ink',
                      ].join(' ')}
                    >
                      {p.nombre}
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/45">
                      {p.precio > 0 ? mxn(p.precio) : 'sin precio'}
                      {/* Sin precio no se vende aunque no esté guardada, y eso
                          se arregla en Costeos, no aquí. Decirlo evita que
                          alguien le dé al interruptor y no pase nada. */}
                      {p.precio <= 0 && ' · póngale precio en Costeos'}
                    </p>
                  </div>
                  <button
                    disabled={ocupado === p.id}
                    onClick={() => void alternar(p)}
                    className={[
                      'shrink-0 font-mono text-[11px] uppercase tracking-wide px-3 py-1.5 rounded-full transition-colors',
                      p.pausado
                        ? 'bg-sa-green text-sa-cream'
                        : 'border border-sa-green-ink/15 text-sa-green-ink/60 hover:bg-sa-cream-soft',
                      ocupado === p.id ? 'opacity-50' : '',
                    ].join(' ')}
                  >
                    {p.pausado ? 'Sacarla de nuevo' : 'Guardar para después'}
                  </button>
                </div>
              )
            })
          )}
          <p className="font-body text-xs text-sa-green-ink/45 pt-2">
            Guardar una pieza no le quita el precio ni la receta: desaparece del
            kiosko y de la caja, y vuelve tal cual. Es lo que sirve para cambiar
            de temporada sin volver a capturar nada.
          </p>
        </div>
      )}
    </div>
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

      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <div className={cx.panelChico}>
          <p className={cx.label}>Menús abiertos</p>
          <p className="font-display text-2xl sm:text-3xl text-sa-green-ink mt-1">
            {abiertos.length} <span className="text-lg text-sa-green-ink/40">de {menus.length}</span>
          </p>
        </div>
        <div className={cx.panelChico}>
          <p className={cx.label}>Piezas vendidas hoy</p>
          <p className="font-display text-2xl sm:text-3xl text-sa-green-ink mt-1">{piezasHoy}</p>
        </div>
        <div className={cx.panelChico}>
          <p className={cx.label}>Vendido hoy</p>
          <p className="font-display text-2xl sm:text-3xl text-sa-green mt-1">{mxn(vendidoHoy)}</p>
        </div>
      </div>

      <div className="space-y-3">
        {menus.map((m) => {
          const sinProductos = m.productos === 0
          return (
            <div
              key={m.id}
              className={[
                'rounded-sa border p-4 sm:p-5 transition-colors',
                m.activa
                  ? 'bg-white border-sa-green/30'
                  : 'bg-sa-cream-soft/60 border-sa-green-ink/10',
              ].join(' ')}
            >
              <div className="flex items-center gap-3 sm:gap-5">
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

              {/* En el telefono el interruptor YA dice si esta abierto: la
                  etiqueta de texto solo robaria el ancho que necesita el
                  nombre del menu. */}
              <div className="hidden sm:block shrink-0 w-24 text-right">
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

              <PiezasDelMenu menu={m} onError={setError} />
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
