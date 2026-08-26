import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Spinner } from '@shake/ui'
import { useCarrito } from '@/store/carritoStore'
import {
  listarProductosParaVenta, listarExtras, listarProductosExtra, listarObservaciones,
  nombreParaOrdenar, agruparCategorias,
} from '@shake/supabase'
import type { ProductoVenta, ExtraDeProducto } from '@shake/supabase'
import { sb } from '@/lib/sb'
import { ModalExtras } from '@/components/ModalExtras'
import { CorteMilo } from '@/components/CorteMilo'
import { HistorialPedidos } from '@/components/HistorialPedidos'

interface Categoria {
  id: string
  nombre: string
  orden: number
  cocinas: { id: string; nombre: string; slug: string } | null
}

export function Catalogo() {
  const navigate = useNavigate()
  const { agregar, agregarConExtras, totalItems } = useCarrito()
  const [productos, setProductos] = useState<ProductoVenta[]>([])
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [extras, setExtras] = useState<ExtraDeProducto[]>([])
  const [productosExtra, setProductosExtra] = useState<ProductoVenta[]>([])
  const [personalizando, setPersonalizando] = useState<ProductoVenta | null>(null)
  /**
   * Los chips de "menos hielo" / "sin tomate", por estación. Vienen de la
   * base (Admin -> Observaciones): antes estaban escritos en el código y
   * cambiar uno obligaba a desplegar el kiosko.
   */
  const [observaciones, setObservaciones] = useState<Record<string, string[]>>({})
  /**
   * Pasadizo del corte de caja: cinco toques a Milo en menos de cuatro
   * segundos. Sin botón visible a propósito — el personal lo sabe, el
   * cliente no tiene por qué.
   */
  const [modalCorte, setModalCorte] = useState(false)
  const [verHistorial, setVerHistorial] = useState(false)
  const toquesMilo = React.useRef<number[]>([])
  function tocarMilo() {
    const ahora = Date.now()
    toquesMilo.current = [...toquesMilo.current.filter((t) => ahora - t < 4000), ahora]
    if (toquesMilo.current.length >= 5) {
      toquesMilo.current = []
      setModalCorte(true)
    }
  }

  useEffect(() => {
    Promise.all([listarProductosParaVenta(sb), listarExtras(sb), listarProductosExtra(sb)])
      .then(([prods, exs, prodExtra]) => {
        setProductos(prods)
        setExtras(exs)
        setProductosExtra(prodExtra)
      })
      .catch(() => setProductos([]))
      .finally(() => setLoading(false))

    // Aparte y sin bloquear: si esto falla, el modal simplemente no muestra
    // chips de observación y la venta sigue igual.
    Promise.all([listarObservaciones(sb, 'bebidas'), listarObservaciones(sb, 'alimentos')])
      .then(([beb, ali]) => setObservaciones({
        bebidas: beb.map((o) => o.texto),
        alimentos: ali.map((o) => o.texto),
      }))
      .catch(() => {})
  }, [])

  const extrasDe = (productoId: string) => extras.filter((e) => e.producto_id === productoId)

  /**
   * Si el producto ofrece extras (tipo de leche, adicionales), se abre el
   * modal para elegirlos; si no, se agrega directo. Así el "+" no obliga a
   * pasar por una pantalla extra en los productos que no la necesitan, como
   * un agua o un snack.
   */
  function tocarAgregar(p: ProductoVenta) {
    // El modal se abre si hay algo que decidir: extras, o las observaciones
    // de alimentos ("sin tomate"…). Las bebidas embotelladas (Coca, Gatorade)
    // no tienen ni lo uno ni lo otro y siguen entrando en un toque.
    if (extrasDe(p.id).length > 0 || p.categorias?.cocinas?.slug === 'alimentos') {
      setPersonalizando(p)
      return
    }
    agregar({
      producto_id: p.id,
      nombre: p.nombre,
      precio: p.precio,
      cocina_id: p.categorias?.cocinas?.id ?? '',
      imagen_url: p.imagen_url,
    })
  }

  /**
   * Cada extra entra como su PROPIA línea del carrito, igual que en el POS:
   * así cuesta, cobra y descuenta inventario como cualquier producto. Pero
   * ahora queda COLGADO del shake que lo lleva, no suelto en la lista.
   *
   * Ese vínculo es el que hace que la comanda imprima "+GALLETA" bajo el
   * shake correcto. Sin él, con dos shakes en el mismo pedido —uno con
   * galletas y otro sin— no hay forma de saber cuál las lleva, y en barra se
   * las ponen al vaso equivocado.
   *
   * La nota (el tipo de leche) sigue viajando pegada al shake.
   */
  function agregarPersonalizado(nota: string | null, elegidos: ExtraDeProducto[]) {
    const p = personalizando
    if (!p) return

    // Los repetidos se agrupan con su cantidad en vez de repetir la línea:
    // dos scoops son una línea de cantidad 2, no dos líneas de uno.
    const porExtra = new Map<string, { extra: ExtraDeProducto; cantidad: number }>()
    for (const e of elegidos) {
      const previo = porExtra.get(e.extra_id)
      porExtra.set(e.extra_id, { extra: e, cantidad: (previo?.cantidad ?? 0) + 1 })
    }

    agregarConExtras(
      {
        producto_id: p.id,
        nombre: p.nombre,
        precio: p.precio,
        cocina_id: p.categorias?.cocinas?.id ?? '',
        imagen_url: p.imagen_url,
        ...(nota ? { personalizacion: nota } : {}),
      },
      [...porExtra.values()].map(({ extra, cantidad }) => {
        const prod = productosExtra.find((x) => x.id === extra.extra_id)
        return {
          producto_id: extra.extra_id,
          nombre: extra.nombre,
          precio: extra.precio,
          cocina_id: prod?.categorias?.cocinas?.id ?? p.categorias?.cocinas?.id ?? '',
          imagen_url: null,
          porUnidad: cantidad,
        }
      }),
    )
    setPersonalizando(null)
  }

  const categorias = useMemo<Categoria[]>(() => {
    const map = new Map<string, Categoria>()
    productos.forEach((p) => {
      if (p.categoria_id && p.categorias && !map.has(p.categoria_id)) {
        map.set(p.categoria_id, {
          id: p.categoria_id,
          nombre: p.categorias.nombre,
          orden: p.categorias.orden,
          cocinas: p.categorias.cocinas,
        })
      }
    })
    return [...map.values()].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre))
  }, [productos])

  /**
   * Las categorías, agrupadas en dos niveles.
   *
   * Al partir Scoops y Suplementos por tipo pasamos de 12 chips a 24, y la
   * fila de filtros creció de dos renglones a cuatro: se comía media
   * pantalla antes de mostrar un solo producto. El nombre ya trae la
   * jerarquía ("Scoops - Proteínas"), así que se usa esa misma marca para
   * plegarlas: un renglón de familias, y la sub-fila solo cuando hace falta.
   *
   * "Suplementos Birdman" no lleva guion —así lo pidió el negocio— por eso
   * se reconoce aparte en vez de exigir un separador.
   */
  const familias = useMemo(() => agruparCategorias(categorias), [categorias])

  /** La familia abierta. Null = ninguna, se ve todo. */
  const [familiaActiva, setFamiliaActiva] = useState<string | null>(null)
  const familia = familias.find((f) => f.nombre === familiaActiva) ?? null

  /**
   * Qué se muestra. Si hay una subcategoría elegida manda ella; si solo hay
   * familia abierta se muestran TODOS sus productos juntos, que es lo que
   * espera quien tocó "Scoops" sin más.
   */
  const productosFiltrados = useMemo(() => {
    if (categoriaActiva) return productos.filter((p) => p.categoria_id === categoriaActiva)
    if (familia) {
      const ids = new Set([...(familia.propia ? [familia.propia.id] : []), ...familia.subs.map((c) => c.id)])
      return productos.filter((p) => p.categoria_id && ids.has(p.categoria_id))
    }
    return productos
  }, [productos, categoriaActiva, familia])

  return (
    <div className="flex flex-col h-screen bg-sa-cream-paper">
      {/* Hero strip */}
      <header className="relative bg-sa-green-deep text-sa-cream px-8 pt-8 pb-10 overflow-hidden">
        {/* Toca a Milo 5 veces: abre el corte de caja (ver CorteMilo).
            Va como fondo CSS y no como <img>: una imagen de verdad, al
            mantenerla presionada, saca el menú del navegador ("buscar
            imagen", arrastrar) — como fondo es un dibujo estático que solo
            cuenta toques. */}
        <div
          onClick={tocarMilo}
          onContextMenu={(e) => e.preventDefault()}
          className="absolute -right-6 -bottom-10 opacity-90 select-none h-56 w-[242px] drop-shadow-2xl"
          style={{
            backgroundImage: 'url(/milo-transparent.png)',
            backgroundSize: 'contain',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
            WebkitTouchCallout: 'none',
            WebkitUserSelect: 'none',
          } as React.CSSProperties}
        />
        <div className="relative z-10 flex items-start justify-between gap-6">
          <div className="flex items-center gap-5">
            <img
              src="/logo.png"
              alt="Hojaldras Lily"
              className="h-20 w-auto drop-shadow-lg"
            />
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.25em] text-sa-banana">
                #MENU · KIOSKO 01
              </p>
              <h1 className="font-display text-5xl leading-none mt-2 text-sa-cream">
                Hojaldras Lily
              </h1>
              <p className="font-body text-lg mt-3 max-w-md text-sa-cream/90">
                ¿Con jamón y queso o de guayaba? Hojaldre dorado, relleno a la vista y pan recién horneado.
              </p>
              {/* Acceso a la invitación de lealtad: el cajero la muestra
                  cuando quiere ofrecerle el programa al cliente. */}
              <div className="mt-4 flex items-center gap-3 flex-wrap">
                <button
                  onClick={() => navigate('/rewards')}
                  className="inline-flex items-center gap-2 bg-sa-banana/20 hover:bg-sa-banana/30 border border-sa-banana/40 text-sa-banana px-4 py-2 rounded-full font-mono text-xs uppercase tracking-wide transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                  Únete a Rewards
                </button>
                {/* Historial a la mano: la barra pregunta "¿de quién era el
                    último?" sin esperar a la pantalla de confirmación. */}
                <button
                  onClick={() => setVerHistorial(true)}
                  className="inline-flex items-center gap-2 bg-sa-cream/10 hover:bg-sa-cream/20 border border-sa-cream/30 text-sa-cream/90 px-4 py-2 rounded-full font-mono text-xs uppercase tracking-wide transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  Historial de pedidos
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Categorías en dos niveles.

          Todas visibles a la vez y envueltas en renglones: en una pantalla
          táctil una fila con desplazamiento horizontal esconde la mitad del
          menú, porque nadie arrastra una barra que no sabe que existe.

          Pero al partir Scoops y Suplementos por tipo pasamos de 12 chips a
          24 y la fila creció a cuatro renglones — media pantalla gastada
          antes del primer producto. Por eso las subcategorías se pliegan
          bajo su familia y solo se despliegan cuando alguien la toca. */}
      <div className="bg-sa-cream-paper border-b border-sa-cream-warm">
        <div className="flex flex-wrap gap-2.5 px-8 pt-4 pb-3">
          <button
            onClick={() => { setFamiliaActiva(null); setCategoriaActiva(null) }}
            className={`flex-shrink-0 px-5 h-12 rounded-full font-mono text-sm uppercase tracking-wider transition-all ${
              familiaActiva === null
                ? 'bg-sa-green text-sa-cream shadow-sa-sm'
                : 'bg-sa-cream-warm text-sa-green-ink hover:bg-sa-cream'
            }`}
          >
            Todo
          </button>
          {familias.map((f) => (
            <button
              key={f.nombre}
              onClick={() => {
                // Volver a tocar la familia abierta la cierra: es la forma
                // más rápida de regresar a "Todo" sin cruzar la pantalla.
                const abrir = familiaActiva !== f.nombre
                setFamiliaActiva(abrir ? f.nombre : null)
                setCategoriaActiva(null)
              }}
              className={`flex-shrink-0 px-5 h-12 rounded-full font-mono text-sm uppercase tracking-wider transition-all ${
                familiaActiva === f.nombre
                  ? 'bg-sa-green text-sa-cream shadow-sa-sm'
                  : 'bg-sa-cream-warm text-sa-green-ink hover:bg-sa-cream'
              }`}
            >
              {f.nombre}
              {f.subs.length > 0 && (
                <span className="ml-2 opacity-50">{familiaActiva === f.nombre ? '\u2212' : '+'}</span>
              )}
            </button>
          ))}
        </div>

        {familia && familia.subs.length > 0 && (
          <div className="flex flex-wrap gap-2 px-8 pb-4">
            <button
              onClick={() => setCategoriaActiva(null)}
              className={`flex-shrink-0 px-4 h-10 rounded-full font-mono text-xs uppercase tracking-wider transition-all ${
                categoriaActiva === null
                  ? 'bg-sa-green-ink text-sa-cream'
                  : 'bg-sa-cream-warm/60 text-sa-green-ink/80 hover:bg-sa-cream-warm'
              }`}
            >
              Todos
            </button>
            {familia.subs.map((sub) => (
              <button
                key={sub.id}
                onClick={() => setCategoriaActiva(sub.id)}
                className={`flex-shrink-0 px-4 h-10 rounded-full font-mono text-xs uppercase tracking-wider transition-all ${
                  categoriaActiva === sub.id
                    ? 'bg-sa-green-ink text-sa-cream'
                    : 'bg-sa-cream-warm/60 text-sa-green-ink/80 hover:bg-sa-cream-warm'
                }`}
              >
                {sub.nombre}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Productos */}
      <div className="relative flex-1 min-h-0">
        <main className="h-full overflow-y-auto sin-barra px-8 py-6 pb-32">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Spinner className="w-12 h-12 text-sa-green" />
          </div>
        ) : productosFiltrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-5 text-center">
            <img src="/milo-transparent.png" alt="Hojaldra de la casa" className="h-40 opacity-80" />
            <p className="font-display text-3xl text-sa-green-ink">
              Aún no hay nada en la charola
            </p>
            <p className="font-body text-sa-green-ink/70 max-w-sm">
              Conecta Supabase para llenar la vitrina con hojaldras, bocadillos y pan de verdad.
            </p>
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-sa-green/70 mt-2">
              · sin polvo raro ·
            </p>
          </div>
        ) : (
          <div
            /* Rejilla que se acomoda sola en vez de saltar por breakpoints.
               La pantalla de la tienda es vertical y con `lg:grid-cols-4`
               salían cuatro tarjetas angostas con el nombre y la descripción
               cortados a media palabra. Con un ancho MÍNIMO por tarjeta, la
               pantalla decide cuántas caben y todas quedan legibles: tres en
               la vertical de la tienda, más en un monitor ancho. */
            className="grid gap-5"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}
          >
            {productosFiltrados.map((producto) => (
              <div
                key={producto.id}
                className="group relative bg-sa-cream-soft rounded-sa-lg overflow-hidden shadow-sa-sm hover:shadow-sa transition-all active:scale-[0.98]"
              >
                <div className="relative">
                  {producto.imagen_url ? (
                    /* object-contain, no cover: las fotos son vasos verticales
                       sobre fondo blanco y `cover` les cortaba la tapa y el
                       popote. Se sube la altura porque al no recortar, la
                       imagen ocupa menos ancho. */
                    <div className="w-full h-56 bg-white flex items-center justify-center">
                      <img
                        src={producto.imagen_url}
                        alt={nombreParaOrdenar(producto.nombre)}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                  ) : (
                    /* Sin foto: en vez de un hueco gris, Milo se la comió. */
                    <div className="w-full h-56 bg-sa-cream-warm flex flex-col items-center justify-center gap-1">
                      <img src="/milo-transparent.png" alt="" className="h-24 opacity-80" />
                      <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/45 text-center px-2">
                        Ups, se lo ha comido Milo
                      </p>
                    </div>
                  )}
                  <span className="absolute top-3 left-3 font-mono text-[10px] uppercase tracking-widest bg-sa-green-deep text-sa-cream px-2 py-1 rounded-full">
                    #{producto.id.slice(0, 4)}
                  </span>
                </div>
                <div className="p-4">
                  <p className="font-display text-xl leading-tight text-sa-green-ink line-clamp-2">
                    {nombreParaOrdenar(producto.nombre)}
                  </p>
                  {producto.descripcion && (
                    <p className="font-body text-xs text-sa-green-ink/60 mt-1 line-clamp-2">
                      {producto.descripcion}
                    </p>
                  )}
                  <div className="flex items-center justify-between mt-3">
                    <p className="font-mono text-lg font-medium text-sa-green">
                      ${producto.precio.toFixed(2)}
                    </p>
                    <button
                      onClick={() => tocarAgregar(producto)}
                      className="w-14 h-14 rounded-full bg-sa-green text-sa-cream font-display text-3xl flex items-center justify-center shadow-sa-sm active:scale-95 transition-transform"
                      aria-label={`Agregar ${nombreParaOrdenar(producto.nombre)}`}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
        {/* Sin barra de scroll no hay señal de que la lista sigue. Este
            degradado la da, y no intercepta toques: la tarjeta de abajo se
            puede tocar a través de él. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-sa-cream-paper to-transparent" />
      </div>

      <ModalExtras
        observaciones={observaciones}
        producto={personalizando}
        extras={personalizando ? extrasDe(personalizando.id) : []}
        onCerrar={() => setPersonalizando(null)}
        onAgregar={agregarPersonalizado}
      />

      {/* Floating cart */}
      {totalItems() > 0 && (
        <button
          onClick={() => navigate('/carrito')}
          className="fixed bottom-8 right-8 z-20 flex items-center gap-3 bg-sa-strawberry text-white pl-6 pr-7 h-16 rounded-full shadow-sa active:scale-95 transition-transform"
        >
          <span className="font-display text-2xl">Tu shake</span>
          <span className="font-mono text-sm bg-white text-sa-strawberry rounded-full min-w-7 h-7 px-2 flex items-center justify-center font-medium">
            {totalItems()}
          </span>
        </button>
      )}

      <CorteMilo abierto={modalCorte} onCerrar={() => setModalCorte(false)} />
      <HistorialPedidos abierto={verHistorial} onCerrar={() => setVerHistorial(false)} />
    </div>
  )
}
