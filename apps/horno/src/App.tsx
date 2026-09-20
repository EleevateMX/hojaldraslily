import { useCallback, useEffect, useRef, useState } from 'react'
import {
  hornoEnVivo,
  meterAlHorno,
  sacarDelHorno,
  relojDelHorno,
  entrarConPin,
  empleadoDeLaSesion,
  salirDeSesion,
  type HornoEnVivo,
  type EnElHorno,
  type EsperandoHorno,
  type EmpleadoSesion,
} from '@shake/supabase'
import { CandadoDeEstacion } from '@shake/ui'
import { mensajeDeError, urlDeFoto, enMoldes } from '@shake/utils'
import { sb } from './lib/sb'

/**
 * La pantalla del Horno.
 *
 * Es la **H** del diagrama: producción le deja moldes armados, aquí se meten,
 * se vigila el reloj y se sacan. Sacar es lo que mete el pan al inventario —
 * antes de eso no hay nada que vender.
 *
 * Tres columnas y nada más, porque son las tres preguntas de quien está
 * parado frente al horno:
 *
 *   1. ¿Qué tengo adentro y cuánto le falta?   (lo urgente, va primero)
 *   2. ¿Qué meto ahora?                        (lo que producción ya armó)
 *   3. ¿Qué viene después?                     (lo que aún no arman)
 *
 * El reloj corre en la pantalla, no en el servidor: se pide la hora de salida
 * una vez y aquí se cuenta. Así el número baja cada segundo sin machacar la
 * base — y si se cae el internet, el reloj sigue andando, que es justo cuando
 * más falta hace.
 */

const REFRESCO_MS = 15000

/** Una tanda dentro del horno, con su reloj. */
function Adentro({
  item,
  ahora,
  ocupado,
  onSacar,
}: {
  item: EnElHorno
  ahora: Date
  ocupado: boolean
  onSacar: () => void
}) {
  const reloj = relojDelHorno(item.listo_en, ahora)
  const foto = urlDeFoto(item.imagen_url, import.meta.env.BASE_URL)

  return (
    <div
      className={[
        'rounded-sa-lg border-2 p-4 transition-colors',
        reloj.tarde
          ? 'border-sa-green bg-sa-green/10 animate-pulse'
          : 'border-sa-banana bg-sa-banana/10',
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        {/* La foto primero: frente al horno se reconoce el pan de un vistazo,
            su nombre completo a dos metros no. */}
        {foto && <img src={foto} alt="" className="w-16 h-16 object-contain shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className="font-display text-2xl text-sa-green-ink leading-tight">{item.sabor}</p>
          <p className="font-mono text-[11px] uppercase tracking-wide text-sa-green-ink/50 mt-1">
            {item.moldes} {item.moldes === 1 ? 'molde' : 'moldes'} de {item.molde} ·{' '}
            {enMoldes(item.cuadros, item.molde).texto}
          </p>
        </div>
        <span className="font-mono text-xs text-sa-green-ink/45 shrink-0">#{item.folio}</span>
      </div>

      {/* El reloj es lo más grande de la tarjeta: es lo que se mira de lejos. */}
      <p
        className={[
          'font-display mt-3 leading-none',
          reloj.tarde ? 'text-sa-green text-5xl' : 'text-sa-green-ink text-5xl',
        ].join(' ')}
      >
        {reloj.texto}
      </p>
      {reloj.tarde && (
        <p className="font-body text-sm text-sa-green mt-1">Ya se pasó — sácalo ya.</p>
      )}

      <button
        onClick={onSacar}
        disabled={ocupado}
        className="mt-4 w-full h-16 rounded-sa-lg bg-sa-green text-sa-cream font-display text-xl active:scale-95 disabled:opacity-40 transition-all"
      >
        Sacar del horno
      </button>
      <p className="text-center font-body text-[11px] text-sa-green-ink/45 mt-1.5">
        Al sacarlo entra al inventario
      </p>
    </div>
  )
}

/** Un renglón armado por producción, esperando turno. */
function Esperando({
  item,
  ocupado,
  onMeter,
}: {
  item: EsperandoHorno
  ocupado: boolean
  onMeter: (moldes: number) => void
}) {
  const foto = urlDeFoto(item.imagen_url, import.meta.env.BASE_URL)
  return (
    <div className="rounded-sa-lg border border-sa-green-ink/10 bg-white p-4">
      <div className="flex items-start gap-3">
        {foto && <img src={foto} alt="" className="w-12 h-12 object-contain shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className="font-display text-xl text-sa-green-ink leading-tight">{item.sabor}</p>
          <p className="font-mono text-[11px] uppercase tracking-wide text-sa-green-ink/50 mt-1">
            {item.moldes} {item.moldes === 1 ? 'molde' : 'moldes'} de {item.molde} ·{' '}
            {item.minutos} min
          </p>
        </div>
        <span className="font-mono text-xs text-sa-green-ink/45 shrink-0">#{item.folio}</span>
      </div>

      <div className="flex gap-2 mt-3">
        <button
          onClick={() => onMeter(1)}
          disabled={ocupado}
          className="flex-1 h-14 rounded-sa-lg border-2 border-sa-banana text-sa-chocolate font-display text-lg active:scale-95 disabled:opacity-40"
        >
          Meter 1
        </button>
        {/* Meter todo solo aparece si hay más de uno: un botón que hace lo
            mismo que el de al lado nada más ocupa espacio y hace dudar. */}
        {item.moldes > 1 && (
          <button
            onClick={() => onMeter(item.moldes)}
            disabled={ocupado}
            className="flex-1 h-14 rounded-sa-lg bg-sa-banana text-white font-display text-lg active:scale-95 disabled:opacity-40"
          >
            Meter {item.moldes}
          </button>
        )}
      </div>
    </div>
  )
}

function Columna({
  titulo,
  cuenta,
  children,
  vacio,
}: {
  titulo: string
  cuenta: number
  children: React.ReactNode
  vacio: string
}) {
  return (
    <section className="flex flex-col min-h-0">
      <div className="flex items-baseline gap-2 mb-3 px-1">
        <h2 className="font-display text-lg text-sa-green-ink">{titulo}</h2>
        <span className="font-mono text-sm text-sa-green-ink/40">{cuenta}</span>
      </div>
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {cuenta === 0 ? (
          <p className="font-body text-sm text-sa-green-ink/40 px-1 py-6">{vacio}</p>
        ) : (
          children
        )}
      </div>
    </section>
  )
}

export default function App() {
  const [empleado, setEmpleado] = useState<EmpleadoSesion | null>(null)
  const [datos, setDatos] = useState<HornoEnVivo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [ahora, setAhora] = useState(() => new Date())
  const avisoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    void empleadoDeLaSesion(sb).then(setEmpleado)
  }, [])

  const cargar = useCallback(async () => {
    try {
      setDatos(await hornoEnVivo(sb))
      setError(null)
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }, [])

  useEffect(() => {
    if (!empleado) return
    void cargar()
    const t = setInterval(() => void cargar(), REFRESCO_MS)
    return () => clearInterval(t)
  }, [empleado, cargar])

  // El reloj de la pantalla: un tic por segundo, del lado del navegador.
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  function avisar(texto: string) {
    setAviso(texto)
    clearTimeout(avisoTimer.current)
    avisoTimer.current = setTimeout(() => setAviso(null), 6000)
  }

  async function meter(itemId: string, moldes: number) {
    setOcupado(true)
    try {
      const r = await meterAlHorno(sb, itemId, moldes)
      avisar(`Al horno. Sale en ${r.minutos} min.`)
      await cargar()
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setOcupado(false)
    }
  }

  async function sacar(item: EnElHorno) {
    setOcupado(true)
    try {
      const r = await sacarDelHorno(sb, item.item_id)
      avisar(`Salieron ${r.cuadros} cuadros de ${r.sabor}. Quedan ${r.libres} libres.`)
      await cargar()
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setOcupado(false)
    }
  }

  if (!empleado) {
    return (
      <CandadoDeEstacion
        estacion="Horno"
        logo={`${import.meta.env.BASE_URL}logo-negativo.png`}
        onEntrar={async (pin) => {
          const r = await entrarConPin(sb, pin)
          if (!r.ok || !r.empleado) return r.error ?? 'PIN incorrecto'
          setEmpleado(r.empleado)
          return null
        }}
      />
    )
  }

  const r = datos?.resumen
  const tarde = r?.tarde ?? 0

  return (
    <div className="h-screen flex flex-col bg-sa-cream-paper text-sa-green-ink">
      {/* Cabecera: lo que hay que saber sin leer nada más. */}
      <header className="shrink-0 bg-sa-green text-sa-cream px-5 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <img
            src={`${import.meta.env.BASE_URL}logo-negativo.png`}
            alt=""
            className="h-9 w-auto shrink-0"
          />
          <div className="min-w-0">
            <p className="font-display text-xl leading-none">Horno</p>
            <p className="font-body text-xs text-sa-cream/70 truncate">{empleado.nombre}</p>
          </div>
        </div>

        <div className="flex items-center gap-5 shrink-0">
          <div className="text-right">
            <p className="font-display text-2xl leading-none">{r?.en_horno ?? 0}</p>
            <p className="font-mono text-[10px] uppercase tracking-wide text-sa-cream/60">
              adentro
            </p>
          </div>
          {tarde > 0 && (
            <div className="text-right bg-sa-cream text-sa-green rounded-sa px-3 py-1 animate-pulse">
              <p className="font-display text-2xl leading-none">{tarde}</p>
              <p className="font-mono text-[10px] uppercase tracking-wide">se pasó</p>
            </div>
          )}
          <button
            onClick={() => void salirDeSesion(sb).then(() => setEmpleado(null))}
            className="font-mono text-xs uppercase tracking-wide bg-sa-cream/15 rounded-sa px-3 py-2"
          >
            Salir
          </button>
        </div>
      </header>

      {(error || aviso) && (
        <div
          className={[
            'shrink-0 px-5 py-2.5 font-body text-sm',
            error ? 'bg-sa-green/10 text-sa-green-deep' : 'bg-sa-mint/15 text-sa-mint',
          ].join(' ')}
        >
          {error ?? aviso}
        </div>
      )}

      <main className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-5 p-5">
        <Columna
          titulo="En el horno"
          cuenta={datos?.adentro.length ?? 0}
          vacio="El horno está vacío."
        >
          {datos?.adentro.map((i) => (
            <Adentro
              key={i.item_id}
              item={i}
              ahora={ahora}
              ocupado={ocupado}
              onSacar={() => void sacar(i)}
            />
          ))}
        </Columna>

        <Columna
          titulo="Listo para entrar"
          cuenta={datos?.esperando.length ?? 0}
          vacio="Nada armado esperando turno."
        >
          {datos?.esperando.map((i) => (
            <Esperando
              key={i.item_id}
              item={i}
              ocupado={ocupado}
              onMeter={(m) => void meter(i.item_id, m)}
            />
          ))}
        </Columna>

        <Columna
          titulo="Producción lo está armando"
          cuenta={datos?.sin_armar.length ?? 0}
          vacio="Producción va al día."
        >
          {datos?.sin_armar.map((i) => (
            <div
              key={i.item_id}
              className="rounded-sa-lg border border-dashed border-sa-green-ink/15 bg-sa-cream-soft/60 p-4"
            >
              <div className="flex items-start gap-3">
                {urlDeFoto(i.imagen_url, import.meta.env.BASE_URL) && (
                  <img
                    src={urlDeFoto(i.imagen_url, import.meta.env.BASE_URL) as string}
                    alt=""
                    className="w-10 h-10 object-contain shrink-0 opacity-60"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-display text-lg text-sa-green-ink/70 leading-tight">
                    {i.sabor}
                  </p>
                  <p className="font-mono text-[11px] uppercase tracking-wide text-sa-green-ink/40 mt-1">
                    {i.moldes} de {i.molde} · aún sin armar
                  </p>
                </div>
                <span className="font-mono text-xs text-sa-green-ink/35 shrink-0">#{i.folio}</span>
              </div>
            </div>
          ))}
        </Columna>
      </main>
    </div>
  )
}
