import hojaldra from '@shake/brand/hojaldra.png'
import { useEffect, useState } from 'react'
import {
  sesionActual, usuarioActual, iniciarSesionGoogle, cerrarSesion, onCambioSesion,
  vincularClienteAuth, guardarMiTelefono, miResumenLealtad, listarProductosParaVenta,
  canjearTarjeta,
  nombreParaOrdenar,
  type ResumenLealtad, type ProductoVenta,
} from '@shake/supabase'
import { mxn } from '@shake/utils'
import { sb } from './lib/sb'
import { esNativo, iniciarSesionGoogleNativa, escucharVueltaDeLogin } from './nativo'
import {
  IconoMancuerna, IconoVaso, IconoLista, IconoPersona,
  IconoComida, IconoRegalo, IconoPalomita,
} from './Iconos'
import { Metas } from './Metas'
import { Avatar, CambiarFoto } from './Avatar'
import QR from './QR'

/** Las secciones de la app, como pestañas de abajo. */
type Pestana = 'inicio' | 'menu' | 'actividad' | 'cuenta'

type IconoPestana = (p: { className?: string }) => JSX.Element

const PESTANAS: { id: Pestana; label: string; Icono: IconoPestana }[] = [
  { id: 'inicio', label: 'Tarjeta', Icono: IconoMancuerna },
  { id: 'menu', label: 'Menú', Icono: IconoVaso },
  { id: 'actividad', label: 'Actividad', Icono: IconoLista },
  { id: 'cuenta', label: 'Cuenta', Icono: IconoPersona },
]

const WHATSAPP = 'https://wa.me/529999267151'

/** Los errores crudos no le sirven a nadie parado en la barra. */
function mensajeAmable(e: unknown): string {
  const raw = (e instanceof Error ? e.message : String(e ?? '')).toLowerCase()
  if (raw.includes('provider is not enabled') || raw.includes('unsupported provider')) {
    return 'Rewards estará disponible en un momentito. Estamos afinando el acceso — vuelve a intentar muy pronto.'
  }
  if (raw.includes('failed to fetch') || raw.includes('networkerror') || raw.includes('network')) {
    return 'Sin conexión. Revisa tu internet e inténtalo de nuevo.'
  }
  return 'Algo salió mal. Inténtalo de nuevo en un momento.'
}

export default function App() {
  const [cargando, setCargando] = useState(true)
  const [logueado, setLogueado] = useState(false)
  const [datos, setDatos] = useState<ResumenLealtad | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Los atajos del icono (mantener presionado en el celular) abren
  // directo en una pestaña: /?ir=menu. Si prometemos el atajo, tiene que
  // llevar a algún lado.
  const [pestana, setPestana] = useState<Pestana>(() => {
    const ir = new URLSearchParams(window.location.search).get('ir')
    return (['inicio', 'menu', 'actividad', 'cuenta'] as const).includes(ir as Pestana)
      ? (ir as Pestana)
      : 'inicio'
  })
  const [menu, setMenu] = useState<ProductoVenta[] | null>(null)

  /**
   * Trae la sesión y el expediente completo.
   *
   * Al volver de Google la sesión tarda un instante en asentarse, y esto se
   * dispara dos veces (al montar y al cambiar la sesión). El intento que
   * llega temprano fallaba y pintaba un error rojo que se iba solo un
   * segundo después: alarmar por algo ya resuelto es peor que callar. Los
   * primeros tropiezos se reintentan en silencio.
   */
  async function sincronizar(intento = 0) {
    let reintentando = false
    try {
      const sesion = await sesionActual(sb)
      if (!sesion) {
        setLogueado(false)
        setDatos(null)
        return
      }
      setLogueado(true)
      const user = await usuarioActual(sb)
      if (!user) return
      const nombre =
        (user.user_metadata?.full_name as string) ||
        (user.user_metadata?.name as string) ||
        user.email ||
        'Cliente'
      // Da de alta la ficha si es la primera vez; el servidor toma el id y
      // el correo de la sesión, no de aquí.
      await vincularClienteAuth(sb, { nombre })
      setDatos(await miResumenLealtad(sb))
      setError(null)
    } catch (e) {
      if (intento < 2) {
        reintentando = true
        window.setTimeout(() => void sincronizar(intento + 1), 700)
        return
      }
      setError(mensajeAmable(e))
    } finally {
      if (!reintentando) setCargando(false)
    }
  }

  useEffect(() => {
    void sincronizar()
    const off = onCambioSesion(sb, () => void sincronizar())
    // Solo hace algo dentro de la app de iOS/Android; en el navegador
    // devuelve una funcion vacia.
    let soltar: (() => void) | null = null
    void escucharVueltaDeLogin(sb, () => void sincronizar()).then((f) => { soltar = f })
    return () => {
      off()
      soltar?.()
    }
  }, [])

  // El menú se trae la primera vez que se abre esa pestaña, no al arrancar:
  // la mayoría entra a ver su saldo, no la carta.
  useEffect(() => {
    if (pestana !== 'menu' || menu !== null) return
    listarProductosParaVenta(sb).then(setMenu).catch(() => setMenu([]))
  }, [pestana, menu])

  if (cargando) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-3 px-5 bg-sa-green-deep font-body text-sa-cream/70">
        <img src={hojaldra} alt="" className="w-24 h-auto animate-pulse" />
        <p>Cargando…</p>
      </div>
    )
  }

  if (!logueado) return <Bienvenida error={error} />

  const c = datos?.cliente

  return (
    <div className="min-h-[100dvh] bg-sa-green-deep font-body flex flex-col">
      {/* Encabezado compacto: en una app el nombre no ocupa media pantalla. */}
      <header className="flex items-center gap-3 px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3 shrink-0">
        <Avatar foto={c?.foto ?? null} nombre={c?.nombre ?? ''} tam={40} />
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-sa-banana">
            Hojaldras Lily Rewards
          </p>
          <p className="font-display text-xl text-sa-cream leading-tight truncate">
            {c?.nombre?.split(' ')[0] ?? 'Hola'}
          </p>
        </div>
      </header>

      {error && (
        <div className="mx-4 mb-3 rounded-sa border border-sa-strawberry/60 bg-sa-strawberry/15 text-sa-strawberry font-mono text-sm px-4 py-3">
          {error}
        </div>
      )}

      {/* El contenido se desplaza; las pestañas se quedan fijas abajo. */}
      <main className="flex-1 min-h-0 overflow-y-auto px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
        {pestana === 'inicio' && <Inicio datos={datos} alRecargar={() => void sincronizar()} />}
        {pestana === 'menu' && <Menu productos={menu} />}
        {pestana === 'actividad' && <Actividad datos={datos} />}
        {pestana === 'cuenta' && <Cuenta datos={datos} alRecargar={() => void sincronizar()} />}
      </main>

      {/* Barra de pestañas — el patrón que la gente ya conoce de cualquier
          app, y lo que hace que esto se sienta una app y no una página. */}
      {/* Fondo solido, no 95% + desenfoque: a 95% el desenfoque no se
          alcanza a ver, pero obliga al telefono a recomponer la capa en
          cada scroll. En un celular de gama media eso se nota. */}
      <nav className="fixed bottom-0 inset-x-0 bg-sa-green-ink border-t border-sa-cream/10 px-2 pb-[env(safe-area-inset-bottom)]">
        <div className="flex">
          {PESTANAS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPestana(p.id)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors ${
                pestana === p.id ? 'text-sa-banana' : 'text-sa-cream/45'
              }`}
            >
              <p.Icono className="w-6 h-6" />
              <span className="font-mono text-[10px] uppercase tracking-wide">{p.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}

// ─────────────────────────── Pantalla de entrada ──────────────────────────

/**
 * Entrar con Google.
 *
 * En el navegador, Supabase redirige y vuelve con el codigo en la URL. En
 * la app envuelta no hay a donde redirigir, asi que la vuelta llega como
 * enlace profundo y hay que atenderla aparte (ver `nativo.ts`).
 */
async function entrarConGoogle() {
  if (esNativo()) return iniciarSesionGoogleNativa(sb)
  return iniciarSesionGoogle(sb, window.location.origin)
}

function Bienvenida({ error }: { error: string | null }) {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center px-5 bg-sa-green-deep font-body">
      <div className="text-center max-w-[340px] w-full">
        <img src={hojaldra} alt="Hojaldra de la casa" className="w-[132px] h-auto mx-auto" />
        <h1 className="font-display text-3xl text-sa-cream mt-3 mb-2 leading-tight">
          Hojaldras Lily Rewards
        </h1>
        <p className="text-sa-mint">
          Acumula <b className="font-semibold">mancuernas</b> con cada compra y gana hojaldras gratis.
        </p>
        {error && (
          <div className="mt-4 rounded-sa border border-sa-mint/40 bg-sa-mint/10 text-sa-cream text-sm px-4 py-3 leading-snug">
            {error}
          </div>
        )}
        <button
          className="mt-4 mb-2 w-full rounded-sa-lg bg-sa-cream text-sa-green-ink font-display text-xl py-4 active:scale-[0.98] transition-transform"
          onClick={() => void entrarConGoogle()}
        >
          Continuar con Google
        </button>
        <p className="text-sa-cream/45 text-xs mt-3">
          1 mancuerna por cada $10 · 100 mancuernas = un cupón
        </p>
      </div>
    </div>
  )
}

// ──────────────────────────────── Tarjeta ─────────────────────────────────

const NOMBRE_SELLO: Record<string, { titulo: string; Icono: IconoPestana; que: string }> = {
  bebida: { titulo: 'Bebidas', Icono: IconoVaso, que: 'bebida' },
  alimento: { titulo: 'Comida', Icono: IconoComida, que: 'comida' },
}

function Inicio({ datos, alRecargar }: { datos: ResumenLealtad | null; alRecargar: () => void }) {
  const c = datos?.cliente
  const [ampliado, setAmpliado] = useState(false)
  if (!c) return null

  return (
    <>
      <Pase cliente={c} alAmpliar={() => setAmpliado(true)} />
      {ampliado && c.codigo && <CodigoEnGrande codigo={c.codigo} alCerrar={() => setAmpliado(false)} />}

      <Bolsas datos={datos} />
      <Metas alGanar={alRecargar} />
      <Sellos datos={datos} />
      <Cupones datos={datos} />
      <Paquetes datos={datos} />
      <TarjetaRegalo alRecargar={alRecargar} />
      <Guardar codigo={c.codigo} />

      {datos?.vida && datos.vida.visitas > 0 && (
        <section className="grid grid-cols-3 gap-2 mb-3">
          <Dato valor={String(datos.vida.visitas)} pie="visitas" />
          <Dato valor={mxn(datos.vida.gastado)} pie="gastado" />
          <Dato valor={String(datos.ganadas_total ?? 0)} pie="ganadas" />
        </section>
      )}

      <button
        onClick={alRecargar}
        className="w-full rounded-sa border border-sa-cream/20 text-sa-cream/70 font-mono text-xs uppercase tracking-wide py-3 mb-3 active:scale-[0.99] transition-transform"
      >
        Actualizar
      </button>
    </>
  )
}

/**
 * El pase: la tarjeta como se ve en un wallet.
 *
 * Está dibujada con la misma anatomía de un pase de Apple Wallet —
 * encabezado con la marca, un dato grande, campos secundarios y el código
 * abajo tras una perforación — para que el día que se emita el `.pkpass`
 * real el cliente reconozca lo mismo en los dos lados.
 *
 * El QR va chico a propósito: aquí es la firma de la tarjeta, no la
 * herramienta. Cuando de verdad hay que escanearlo se toca y ocupa la
 * pantalla completa sobre blanco, que es lo que un lector necesita.
 */
function Pase({
  cliente,
  alAmpliar,
}: {
  cliente: NonNullable<ResumenLealtad['cliente']>
  alAmpliar: () => void
}) {
  return (
    <section className="relative overflow-hidden rounded-sa-lg mb-3 text-sa-cream shadow-sa bg-gradient-to-br from-sa-green to-sa-green-deep">
      <img src={hojaldra} alt="" className="absolute -right-6 top-6 h-36 opacity-15 pointer-events-none" />

      <div className="px-5 pt-4 relative z-10 flex items-center gap-3">
        <Avatar foto={cliente.foto} nombre={cliente.nombre} tam={44} />
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-sa-cream/45">
            Titular
          </p>
          <p className="font-display text-lg text-sa-cream leading-tight truncate">
            {cliente.nombre}
          </p>
        </div>
      </div>

      <div className="px-5 pt-3 relative z-10">
        <p className="font-mono text-[10px] uppercase tracking-wider text-sa-cream/50">
          Mancuernas disponibles
        </p>
        <p className="font-display text-6xl leading-none text-sa-banana mt-0.5">
          {cliente.total_canjeable.toLocaleString('es-MX')}
        </p>
        <p className="text-sa-cream/80 text-sm mt-1">
          valen <b className="text-sa-cream">{mxn(cliente.vale_pesos)}</b> en la barra
        </p>
      </div>

      {/* La perforación: dos muescas y una línea punteada, como el pase de
          un boleto. Es lo que hace que se lea "tarjeta" y no "recuadro". */}
      <div className="relative mt-4">
        <span className="absolute -left-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-sa-green-deep" />
        <span className="absolute -right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-sa-green-deep" />
        <div className="mx-5 border-t border-dashed border-sa-cream/25" />
      </div>

      <button
        onClick={alAmpliar}
        disabled={!cliente.codigo}
        className="w-full flex items-center gap-4 px-5 py-4 text-left active:scale-[0.99] transition-transform relative z-10"
      >
        {cliente.codigo ? (
          <span className="bg-white rounded-sa p-1.5 shrink-0 leading-none">
            <QR value={cliente.codigo} size={62} />
          </span>
        ) : (
          <span className="w-[74px] h-[74px] shrink-0 rounded-sa bg-sa-cream/10" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-[10px] uppercase tracking-wider text-sa-cream/50">
            Tu código
          </span>
          <span className="block font-mono text-lg tracking-[0.15em] text-sa-cream leading-tight">
            {cliente.codigo ?? '—'}
          </span>
          <span className="block text-[11px] text-sa-banana mt-0.5">
            Toca para agrandarlo en caja →
          </span>
        </span>
      </button>
    </section>
  )
}

/**
 * El código a pantalla completa, sobre blanco.
 *
 * Un lector de códigos falla con un QR chico sobre fondo verde y el celular
 * a media luz. Blanco de borde a borde es lo más cerca que se puede estar
 * de subir el brillo desde la web.
 */
function CodigoEnGrande({ codigo, alCerrar }: { codigo: string; alCerrar: () => void }) {
  const lado = Math.min(300, Math.round(window.innerWidth * 0.72))
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={alCerrar}
      onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') alCerrar() }}
      className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center gap-5 px-6"
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-sa-green-ink/50">
        Muéstralo antes de pagar
      </p>
      <QR value={codigo} size={lado} />
      <p className="font-mono text-2xl tracking-[0.2em] text-sa-green-ink">{codigo}</p>
      <p className="font-mono text-[11px] uppercase tracking-wide text-sa-green-ink/40">
        Toca para cerrar
      </p>
    </div>
  )
}

/**
 * Las dos bolsas, separadas.
 *
 * Se ven aparte porque son cosas distintas: las ganadas son promoción y
 * pueden caducar; las compradas son dinero del cliente y no caducan nunca.
 * Juntarlas en un solo número escondería de quién es cada peso.
 */
function Bolsas({ datos }: { datos: ResumenLealtad | null }) {
  const c = datos?.cliente
  const p = datos?.progreso
  if (!c) return null
  return (
    <section className="rounded-sa-lg p-5 mb-3 bg-sa-cream-paper text-sa-green-ink shadow-sa">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-sa bg-sa-mint/25 border border-sa-mint/50 px-3 py-3">
          <p className="font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/55">Ganadas</p>
          <p className="font-display text-3xl text-sa-green leading-none mt-0.5">
            {c.mancuernas.toLocaleString('es-MX')}
          </p>
          <p className="text-[11px] text-sa-green-ink/60 mt-1 leading-snug">Por tus compras</p>
        </div>
        <div className="rounded-sa bg-sa-banana/25 border border-sa-banana/50 px-3 py-3">
          <p className="font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/55">Compradas</p>
          <p className="font-display text-3xl text-sa-green leading-none mt-0.5">
            {c.saldo.toLocaleString('es-MX')}
          </p>
          <p className="text-[11px] text-sa-green-ink/60 mt-1 leading-snug">Tu saldo · no caduca</p>
        </div>
      </div>

      {p && (
        <div className="mt-4">
          <div className="h-2.5 rounded-full bg-sa-green-ink/10 overflow-hidden">
            <div className="h-full rounded-full bg-sa-green transition-all" style={{ width: `${p.pct}%` }} />
          </div>
          <p className="text-sm text-sa-green-ink/75 mt-2 leading-snug">
            {p.faltan === 0 ? (
              '¡Tienes un cupón listo! Pídelo en caja.'
            ) : (
              <>Te faltan <b className="text-sa-green">{p.faltan}</b> mancuernas ganadas para tu próximo cupón</>
            )}
          </p>
        </div>
      )}
    </section>
  )
}

/** Las tarjetas 13 + 1, una por familia. */
function Sellos({ datos }: { datos: ResumenLealtad | null }) {
  const sellos = datos?.sellos ?? []
  const premios = datos?.premios ?? []
  if (sellos.length === 0) return null

  return (
    <section className="rounded-sa-lg p-5 mb-3 bg-sa-cream-paper text-sa-green-ink shadow-sa">
      <h2 className="font-display text-lg text-sa-green">Tus tarjetas de sellos</h2>
      <p className="text-xs text-sa-green-ink/55 mb-3">
        Junta 13 y la 14 va por cuenta de la casa. Bebidas y comida cuentan por separado.
      </p>

      <div className="space-y-4">
        {sellos.map((s) => {
          const info = NOMBRE_SELLO[s.tipo] ?? { titulo: s.tipo, Icono: IconoRegalo, que: s.tipo }
          const cuantos = premios.filter((pr) => pr.tipo === s.tipo).length
          return (
            <div key={s.tipo}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-display text-base leading-tight flex items-center gap-1.5">
                  <info.Icono className="w-[18px] h-[18px] text-sa-green" />
                  {info.titulo}
                </p>
                <p className="font-mono text-xs text-sa-green-ink/55">
                  {s.tiene}/{s.requeridos}
                </p>
              </div>

              {/* Los sellos como los del papel: se ven de un vistazo cuántos
                  faltan sin tener que leer un número. */}
              <div className="grid grid-cols-7 gap-1.5 mt-2">
                {Array.from({ length: s.requeridos }, (_, i) => (
                  <span
                    key={i}
                    className={`aspect-square rounded-full border flex items-center justify-center text-[11px] ${
                      i < s.tiene
                        ? 'bg-sa-green border-sa-green text-sa-cream'
                        : 'border-dashed border-sa-green-ink/25 text-sa-green-ink/20'
                    }`}
                  >
                    {i < s.tiene ? <IconoPalomita className="w-3.5 h-3.5" /> : i + 1}
                  </span>
                ))}
                <span
                  className={`aspect-square rounded-full border flex items-center justify-center text-[11px] ${
                    s.listo
                      ? 'bg-sa-banana border-sa-banana text-sa-green-ink font-bold'
                      : 'border-dashed border-sa-banana/50 text-sa-banana/60'
                  }`}
                >
                  <IconoRegalo className="w-[15px] h-[15px]" />
                </span>
              </div>

              <p className={`text-[12px] mt-1.5 leading-snug ${s.listo ? 'text-sa-green font-semibold' : 'text-sa-green-ink/60'}`}>
                {s.listo
                  ? `¡Lista! Pide tu ${info.que} gratis en caja.`
                  : `Te ${s.faltan === 1 ? 'falta' : 'faltan'} ${s.faltan} para tu ${info.que} gratis${cuantos > 0 ? ` (${cuantos} a elegir)` : ''}.`}
              </p>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** Los paquetes de recarga, con el regalo bien a la vista. */
function Paquetes({ datos }: { datos: ResumenLealtad | null }) {
  const paquetes = datos?.paquetes ?? []
  const tasa = datos?.tasa ?? 10
  if (paquetes.length === 0) return null

  return (
    <section className="rounded-sa-lg p-5 mb-3 bg-sa-cream-paper text-sa-green-ink shadow-sa">
      <h2 className="font-display text-lg text-sa-green">Recarga tus mancuernas</h2>
      <p className="text-xs text-sa-green-ink/55 mb-3">
        Adelanta tu consumo y te regalamos mancuernas. {tasa} mancuernas = $1.
      </p>

      <div className="space-y-2">
        {paquetes.map((p) => (
          <div key={p.nombre} className="flex items-center gap-3 rounded-sa border border-sa-green-ink/10 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="font-display text-base leading-tight">{mxn(p.precio)}</p>
              <p className="text-[12px] text-sa-green-ink/65 leading-snug">
                {p.mancuernas.toLocaleString('es-MX')} mancuernas · valen {mxn(p.vale)}
              </p>
            </div>
            {p.bono_pct > 0 && (
              <span className="shrink-0 rounded-full bg-sa-banana px-2.5 py-1 font-mono text-[11px] font-bold text-sa-green-ink">
                +{p.bono_pct}%
              </span>
            )}
          </div>
        ))}
      </div>

      <p className="text-[12px] text-sa-green-ink/55 mt-3 leading-snug">
        Se compran en caja o en el kiosko — se cargan a tu cuenta al pagar.
      </p>
    </section>
  )
}

/**
 * Canjear una tarjeta de regalo física.
 *
 * El plástico es el vehículo de la venta, no el monedero: al canjearlo el
 * saldo pasa a la cuenta y la tarjeta queda muerta. Por eso si la pierde
 * después de canjearla no pierde nada.
 */
function TarjetaRegalo({ alRecargar }: { alRecargar: () => void }) {
  const [codigo, setCodigo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  async function canjear() {
    const limpio = codigo.trim().toUpperCase()
    if (limpio.length < 6) {
      setError('Escribe el código completo de la tarjeta.')
      return
    }
    setEnviando(true)
    setError(null)
    setOk(null)
    try {
      const r = await canjearTarjeta(sb, limpio)
      setOk(`¡Listo! Se cargaron ${r.cargadas.toLocaleString('es-MX')} mancuernas (${mxn(r.vale_pesos)}).`)
      setCodigo('')
      alRecargar()
    } catch (e) {
      // Aquí sí conviene el mensaje del servidor: "ya se usó el 12/08" dice
      // exactamente qué pasó, y es lo que el cliente va a repetir en caja.
      setError(e instanceof Error && e.message ? e.message : 'No se pudo canjear.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <section className="rounded-sa-lg p-5 mb-3 bg-sa-cream-paper text-sa-green-ink shadow-sa">
      <h2 className="font-display text-lg text-sa-green mb-1">¿Tienes una tarjeta de regalo?</h2>
      <p className="text-xs text-sa-green-ink/60 mb-3">
        Escribe su código y el saldo se pasa a tu cuenta.
      </p>
      <div className="flex gap-2">
        <input
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.toUpperCase())}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder="SHKG-XXXXXXXX"
          className="flex-1 min-w-0 rounded-sa border border-sa-green-ink/15 px-3 py-2.5 font-mono tracking-wider uppercase"
        />
        <button
          onClick={() => void canjear()}
          disabled={enviando}
          className="rounded-sa bg-sa-green text-sa-cream font-display text-lg px-5 disabled:opacity-40 active:scale-95 transition-transform"
        >
          {enviando ? '…' : 'Canjear'}
        </button>
      </div>
      {error && <p className="text-sa-strawberry text-xs mt-2 leading-snug">{error}</p>}
      {ok && <p className="text-sa-green text-sm mt-2 font-semibold leading-snug">{ok}</p>}
    </section>
  )
}

/**
 * Guardar la tarjeta en el celular.
 *
 * El pase de Apple Wallet / Google Wallet necesita firma con certificado y
 * un servidor que lo emita — es el siguiente paso. Mientras tanto esto sí
 * deja la tarjeta a un toque: instalada en la pantalla de inicio abre en su
 * código sin pasar por el navegador. Prometer un botón que no existe sería
 * peor que decir cómo se hace hoy.
 */
function Guardar({ codigo }: { codigo: string | null }) {
  const [abierto, setAbierto] = useState(false)
  const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
  const instalada = window.matchMedia?.('(display-mode: standalone)').matches

  if (instalada || !codigo) return null

  return (
    <section className="rounded-sa-lg p-5 mb-3 bg-sa-cream-paper text-sa-green-ink shadow-sa">
      <button
        onClick={() => setAbierto((v) => !v)}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <span className="min-w-0">
          <span className="block font-display text-lg text-sa-green leading-tight">
            Guarda tu tarjeta en el celular
          </span>
          <span className="block text-xs text-sa-green-ink/60 mt-0.5">
            Para abrirla de un toque, sin buscar la página
          </span>
        </span>
        <span className="shrink-0 font-mono text-sa-green-ink/40">{abierto ? '−' : '+'}</span>
      </button>

      {abierto && (
        <div className="mt-3 text-sm text-sa-green-ink/75 leading-snug space-y-2">
          {esIOS ? (
            <p>
              En Safari toca <b>Compartir</b> (el cuadrito con la flecha) y elige{' '}
              <b>Agregar a inicio</b>.
            </p>
          ) : (
            <p>
              En Chrome abre el menú <b>⋮</b> y elige <b>Instalar aplicación</b> o{' '}
              <b>Agregar a pantalla de inicio</b>.
            </p>
          )}
          <p className="text-sa-green-ink/55">
            Queda con su ícono y sin barra del navegador. El pase para Apple Wallet y
            Google Wallet está en camino.
          </p>
        </div>
      )}
    </section>
  )
}

function Dato({ valor, pie }: { valor: string; pie: string }) {
  return (
    <div className="rounded-sa bg-sa-cream-paper/10 border border-sa-cream/10 px-2 py-3 text-center">
      <p className="font-display text-xl text-sa-cream leading-none">{valor}</p>
      <p className="font-mono text-[9px] uppercase tracking-wide text-sa-cream/45 mt-1">{pie}</p>
    </div>
  )
}

function Cupones({ datos }: { datos: ResumenLealtad | null }) {
  const cupones = datos?.cupones ?? []
  return (
    <section className="rounded-sa-lg p-5 mb-3 bg-sa-cream-paper text-sa-green-ink shadow-sa">
      <h2 className="font-display text-lg text-sa-green mb-2">
        Cupones activos ({cupones.length})
      </h2>
      {cupones.length === 0 ? (
        <p className="text-sm text-sa-green-ink/55">
          Todavía ninguno. Al llegar a 100 mancuernas te damos el primero.
        </p>
      ) : (
        <div className="space-y-3">
          {cupones.map((cu) => (
            <div key={cu.codigo} className="flex items-center gap-3 rounded-sa bg-sa-mint/20 border border-sa-mint/50 p-3">
              <div className="bg-white rounded p-1.5 shrink-0">
                <QR value={cu.codigo} size={64} />
              </div>
              <div className="min-w-0">
                <p className="font-display text-base leading-tight">{cu.beneficio}</p>
                <p className="font-mono text-[11px] text-sa-green-ink/60 mt-0.5">{cu.codigo}</p>
                <p className={`text-[11px] mt-0.5 ${cu.dias_restantes <= 7 ? 'text-sa-strawberry font-semibold' : 'text-sa-green-ink/55'}`}>
                  {cu.dias_restantes <= 0
                    ? 'Vence hoy'
                    : cu.dias_restantes <= 7
                      ? `Vence en ${cu.dias_restantes} días`
                      : `Vence el ${cu.vence}`}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ────────────────────────────────── Menú ──────────────────────────────────

function Menu({ productos }: { productos: ProductoVenta[] | null }) {
  if (productos === null) {
    return <p className="text-sa-cream/50 text-center py-10 font-mono text-xs uppercase tracking-widest">Cargando el menú…</p>
  }

  // Solo lo que se antoja: los scoops y suplementos son surtido de
  // mostrador, no carta.
  const carta = new Map<string, ProductoVenta[]>()
  for (const p of productos) {
    const cat = p.categorias?.nombre
    if (!cat || /^(extras|scoops|suplementos)/i.test(cat)) continue
    if (!carta.has(cat)) carta.set(cat, [])
    carta.get(cat)!.push(p)
  }

  if (carta.size === 0) {
    return <p className="text-sa-cream/50 text-center py-10">El menú no está disponible ahora.</p>
  }

  return (
    <>
      <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-sa-banana mb-3">
        Lo que hay hoy en la barra
      </p>
      {[...carta.entries()].map(([cat, items]) => (
        <section key={cat} className="rounded-sa-lg p-5 mb-3 bg-sa-cream-paper text-sa-green-ink shadow-sa">
          <h2 className="font-display text-lg text-sa-green mb-2">{cat}</h2>
          <div className="divide-y divide-sa-green-ink/10">
            {items.map((p) => (
              <div key={p.id} className="flex items-baseline justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-tight">{nombreParaOrdenar(p.nombre)}</p>
                  {p.descripcion && (
                    <p className="text-xs text-sa-green-ink/55 leading-snug mt-0.5">{p.descripcion}</p>
                  )}
                </div>
                <p className="font-mono text-sm text-sa-green shrink-0">{mxn(p.precio)}</p>
              </div>
            ))}
          </div>
        </section>
      ))}
      <a
        href={WHATSAPP}
        className="block w-full rounded-sa-lg bg-sa-banana text-sa-green-ink font-display text-xl py-4 text-center mb-3 active:scale-[0.98] transition-transform"
      >
        Pedir por WhatsApp
      </a>
    </>
  )
}

// ──────────────────────────────── Actividad ───────────────────────────────

function Actividad({ datos }: { datos: ResumenLealtad | null }) {
  const historial = datos?.historial ?? []
  const favoritos = datos?.favoritos ?? []
  const movimientos = datos?.movimientos ?? []

  if (historial.length === 0 && movimientos.length === 0) {
    return (
      <div className="text-center py-12">
        <img src={hojaldra} alt="" className="h-24 mx-auto opacity-60" />
        <p className="font-display text-xl text-sa-cream mt-3">Aún no hay nada por aquí</p>
        <p className="text-sm text-sa-cream/60 mt-1 max-w-[260px] mx-auto">
          En tu próxima compra, muestra tu código en caja y aquí verás tus
          mancuernas y lo que pediste.
        </p>
      </div>
    )
  }

  return (
    <>
      {favoritos.length > 0 && (
        <section className="rounded-sa-lg p-5 mb-3 bg-sa-cream-paper text-sa-green-ink shadow-sa">
          <h2 className="font-display text-lg text-sa-green mb-2">Lo que siempre pides</h2>
          <div className="space-y-1.5">
            {favoritos.map((f, i) => (
              <div key={f.nombre} className="flex items-center gap-3">
                <span className="w-6 h-6 shrink-0 rounded-full bg-sa-green text-sa-cream font-display text-xs flex items-center justify-center">
                  {i + 1}
                </span>
                <span className="text-sm flex-1 min-w-0 truncate">{nombreParaOrdenar(f.nombre)}</span>
                <span className="font-mono text-xs text-sa-green-ink/50">{f.veces}×</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {historial.length > 0 && (
        <section className="rounded-sa-lg p-5 mb-3 bg-sa-cream-paper text-sa-green-ink shadow-sa">
          <h2 className="font-display text-lg text-sa-green mb-2">Tus compras</h2>
          <div className="divide-y divide-sa-green-ink/10">
            {historial.map((h) => (
              <div key={h.folio} className="py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-mono text-xs text-sa-green-ink/55">{h.fecha}</p>
                  <p className="font-mono text-sm">{mxn(h.total)}</p>
                </div>
                <p className="text-sm leading-snug mt-0.5">{h.items}</p>
                {h.mancuernas > 0 && (
                  <p className="font-mono text-[11px] text-sa-green mt-0.5">+{h.mancuernas} mancuernas</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {movimientos.length > 0 && (
        <section className="rounded-sa-lg p-5 mb-3 bg-sa-cream-paper text-sa-green-ink shadow-sa">
          <h2 className="font-display text-lg text-sa-green mb-2">Movimientos</h2>
          <div className="divide-y divide-sa-green-ink/10">
            {movimientos.map((m, i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm truncate">{m.descripcion}</p>
                  <p className="font-mono text-[11px] text-sa-green-ink/50">{m.fecha}</p>
                </div>
                <span className={`font-mono text-sm shrink-0 ${m.puntos > 0 ? 'text-sa-green' : 'text-sa-strawberry'}`}>
                  {m.puntos > 0 ? '+' : ''}{m.puntos}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  )
}

// ───────────────────────────────── Cuenta ─────────────────────────────────

function Cuenta({ datos, alRecargar }: { datos: ResumenLealtad | null; alRecargar: () => void }) {
  const c = datos?.cliente
  const [telefono, setTelefono] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [errorTel, setErrorTel] = useState<string | null>(null)

  async function guardarTelefono() {
    const limpio = telefono.replace(/\D/g, '')
    if (limpio.length !== 10) {
      setErrorTel('Escribe tu número a 10 dígitos.')
      return
    }
    setGuardando(true)
    setErrorTel(null)
    try {
      await guardarMiTelefono(sb, limpio)
      setTelefono('')
      alRecargar()
    } catch (e) {
      setErrorTel(e instanceof Error && e.message ? e.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <>
      <CambiarFoto
        foto={c?.foto ?? null}
        nombre={c?.nombre ?? ''}
        propia={c?.foto_propia ?? false}
        alCambiar={alRecargar}
      />

      <section className="rounded-sa-lg p-5 mb-3 bg-sa-cream-paper text-sa-green-ink shadow-sa">
        <h2 className="font-display text-lg text-sa-green mb-2">Tu cuenta</h2>
        <div className="space-y-2 text-sm">
          <Fila etiqueta="Nombre" valor={c?.nombre ?? '—'} />
          <Fila etiqueta="Código" valor={c?.codigo ?? '—'} mono />
          <Fila etiqueta="Teléfono" valor={c?.telefono ?? 'sin registrar'} mono />
          <Fila etiqueta="Cliente desde" valor={c?.desde ?? '—'} />
        </div>
      </section>

      {!c?.telefono && (
        <section className="rounded-sa-lg p-5 mb-3 bg-sa-cream-paper text-sa-green-ink shadow-sa">
          <h2 className="font-display text-lg text-sa-green mb-1">Agrega tu teléfono</h2>
          <p className="text-xs text-sa-green-ink/60 mb-3">
            Con él te encontramos en caja aunque no traigas el celular.
          </p>
          <div className="flex gap-2">
            <input
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              inputMode="numeric"
              placeholder="9991234567"
              className="flex-1 min-w-0 rounded-sa border border-sa-green-ink/15 px-3 py-2.5 font-mono"
            />
            <button
              onClick={() => void guardarTelefono()}
              disabled={guardando}
              className="rounded-sa bg-sa-green text-sa-cream font-display text-lg px-5 disabled:opacity-40 active:scale-95 transition-transform"
            >
              {guardando ? '…' : 'Guardar'}
            </button>
          </div>
          {errorTel && <p className="text-sa-strawberry text-xs mt-2">{errorTel}</p>}
        </section>
      )}

      <section className="rounded-sa-lg p-5 mb-3 bg-sa-cream-paper text-sa-green-ink shadow-sa">
        <h2 className="font-display text-lg text-sa-green mb-2">Cómo funciona</h2>
        <ul className="text-sm text-sa-green-ink/75 space-y-1.5 leading-snug">
          <li>· Ganas <b>1 mancuerna por cada $10</b> de compra.</li>
          <li>· Al llegar a <b>100</b> te damos un cupón.</li>
          <li>· Muestra tu código en caja <b>antes de pagar</b> para que cuente.</li>
          <li>· Tus cupones vencen al año de ganarlos.</li>
        </ul>
      </section>

      <section className="rounded-sa-lg p-5 mb-3 bg-sa-cream-paper text-sa-green-ink shadow-sa">
        <h2 className="font-display text-lg text-sa-green mb-2">Hojaldras Lily</h2>
        <div className="space-y-2 text-sm">
          <a href={WHATSAPP} className="block text-sa-green underline underline-offset-4">WhatsApp: 999 504 4797</a>
          <a href="https://www.instagram.com/hojaldraslily" className="block text-sa-green underline underline-offset-4">@hojaldraslily</a>
          <a href="https://hojaldraslily.com" className="block text-sa-green underline underline-offset-4">hojaldraslily.com</a>
          <p className="text-sa-green-ink/60 leading-snug pt-1">
            Calle 29-A #183 por Av. 22, Col. Miguel Alemán · Mérida, Yuc.
          </p>
        </div>
      </section>

      <button
        onClick={() => void cerrarSesion(sb)}
        className="w-full rounded-sa border border-sa-cream/25 text-sa-cream/70 font-mono text-xs uppercase tracking-wide py-3.5 mb-3 active:scale-[0.99] transition-transform"
      >
        Cerrar sesión
      </button>
    </>
  )
}

function Fila({ etiqueta, valor, mono }: { etiqueta: string; valor: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sa-green-ink/55 text-xs uppercase tracking-wide font-mono">{etiqueta}</span>
      <span className={`${mono ? 'font-mono' : ''} text-right min-w-0 truncate`}>{valor}</span>
    </div>
  )
}
