import React, { useEffect, useState } from 'react'
import {
  listarAlmacenes, listarCajas, corteAbierto, abrirCaja, cerrarCaja, resumenCorte,
  entrarConPin, salirDeSesion, empleadoDeLaSesion,
} from '@shake/supabase'
import type { EmpleadoSesion } from '@shake/supabase'
import type { Caja, CajaCorte, CorteResumen } from '@shake/types'
import { mxn, mensajeDeError } from '@shake/utils'
import { sb } from '@/lib/sb'

interface Props {
  abierto: boolean
  onCerrar: () => void
}

type Fase = 'pin' | 'cargando' | 'abrir' | 'cerrar' | 'listo'

/**
 * El pasadizo secreto del kiosko: cinco toques a la hojaldra abren el corte de caja.
 *
 * Existe porque el turno arranca y cambia frente a ESTA pantalla, no frente
 * al POS. Antes había que ir a la otra ventana solo para abrir la caja;
 * ahora quien llega en la mañana o entra al turno lo hace aquí mismo, con su
 * PIN, y la apertura queda registrada a su nombre. Sin botón visible: el
 * cliente que usa el kiosko jamás debe descubrir que esto está ahí.
 */
export function PanelDeCorte({ abierto, onCerrar }: Props) {
  const [fase, setFase] = useState<Fase>('cargando')
  const [pin, setPin] = useState('')
  const [verificando, setVerificando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [empleado, setEmpleado] = useState<EmpleadoSesion | null>(null)
  /**
   * Si la sesión de personal la abrió este modal, también la cierra al salir.
   * Si el kiosko ya estaba en modo cajero, la sesión no es nuestra y se
   * respeta: cerrarla dejaría al cajero fuera a media venta.
   */
  const [sesionPropia, setSesionPropia] = useState(false)
  const [caja, setCaja] = useState<Caja | null>(null)
  const [corte, setCorte] = useState<CajaCorte | null>(null)
  const [resumen, setResumen] = useState<CorteResumen | null>(null)
  const [fondo, setFondo] = useState('')
  const [conteo, setConteo] = useState<Conteo>({})
  const [guardando, setGuardando] = useState(false)
  const [resultado, setResultado] = useState<'abierto' | 'cerrado' | null>(null)

  useEffect(() => {
    if (!abierto) return
    setPin(''); setError(null); setFondo(''); setConteo({})
    setResultado(null); setResumen(null); setCorte(null)
    setFase('cargando')
    empleadoDeLaSesion(sb)
      .then((emp) => {
        if (emp) {
          setEmpleado(emp)
          setSesionPropia(false)
          void cargarContexto()
        } else {
          setFase('pin')
        }
      })
      .catch(() => setFase('pin'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto])

  async function cargarContexto() {
    setFase('cargando')
    setError(null)
    try {
      // Mismo descubrimiento de caja que usa el POS: el almacén del kiosko
      // manda a su sucursal, y la sucursal a su caja.
      const almacenes = await listarAlmacenes(sb)
      const alm = almacenes.find((a) => a.tipo === 'kiosko') ?? almacenes[0]
      if (!alm) throw new Error('No hay almacenes configurados.')
      const cajas = await listarCajas(sb)
      const c = cajas.find((x) => x.sucursal_id === alm.sucursal_id) ?? cajas[0]
      if (!c) throw new Error('No hay cajas configuradas.')
      setCaja(c)
      const abierta = await corteAbierto(sb, c.id)
      setCorte(abierta)
      if (abierta) {
        setResumen(await resumenCorte(sb, abierta.id))
        setFase('cerrar')
      } else {
        setFase('abrir')
      }
    } catch (e) {
      setError(mensajeDeError(e))
      setFase('abrir')
    }
  }

  async function intentarPin(pinCompleto: string) {
    setVerificando(true)
    setError(null)
    try {
      const r = await entrarConPin(sb, pinCompleto)
      if (!r.ok || !r.empleado) {
        setError(r.error ?? 'PIN incorrecto')
        setPin('')
        return
      }
      setEmpleado(r.empleado)
      setSesionPropia(true)
      await cargarContexto()
    } catch (e) {
      setError(mensajeDeError(e))
      setPin('')
    } finally {
      setVerificando(false)
    }
  }

  function teclearPin(d: string) {
    if (verificando) return
    const nuevo = (pin + d).slice(0, 6)
    setPin(nuevo)
    setError(null)
    // Hay PINes de 4 y de 6 dígitos: a los 6 se valida solo; con 4 o 5, el
    // botón Entrar. (Validar a los 4 dejaría fuera los PINes largos.)
    if (nuevo.length === 6) void intentarPin(nuevo)
  }

  async function abrirTurno() {
    if (!caja || guardando) return
    setGuardando(true)
    setError(null)
    try {
      await abrirCaja(sb, caja.id, Number(fondo) || 0, empleado?.id)
      setResultado('abierto')
      setFase('listo')
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setGuardando(false)
    }
  }

  async function cerrarTurno() {
    if (!corte || guardando) return
    setGuardando(true)
    setError(null)
    try {
      await cerrarCaja(sb, corte.id, sumaConteo(conteo), empleado?.id)
      setCorte(null)
      setResultado('cerrado')
      setFase('listo')
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setGuardando(false)
    }
  }

  async function salir() {
    if (sesionPropia) {
      // El modal abrió la sesión de personal; no debe quedar viva en una
      // pantalla que opera el público.
      try { await salirDeSesion(sb) } catch { /* sin sesión ya es salir */ }
    }
    onCerrar()
  }

  if (!abierto) return null

  const totalContado = sumaConteo(conteo)
  const dif = totalContado - (resumen?.efectivo_esperado ?? 0)

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6">
      <div className="bg-sa-cream-paper rounded-3xl shadow-2xl w-[440px] max-w-full max-h-full overflow-y-auto">
        {/* Encabezado */}
        <div className="bg-sa-green-deep text-sa-cream rounded-t-3xl px-6 py-5 flex items-center justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-sa-cream/50">
              {caja ? caja.nombre : 'Caja'}{empleado ? ` · ${empleado.nombre}` : ''}
            </p>
            <h2 className="font-display text-2xl leading-tight">Corte de caja</h2>
          </div>
          <button
            onClick={() => void salir()}
            className="w-11 h-11 rounded-full border border-sa-cream/25 text-sa-cream/80 hover:bg-sa-cream/10 text-xl"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="p-6">
          {error && (
            <p className="font-mono text-sm text-sa-strawberry bg-sa-strawberry/10 border border-sa-strawberry/30 rounded-sa px-4 py-3 mb-4">
              {error}
            </p>
          )}

          {/* ---- PIN ---- */}
          {fase === 'pin' && (
            <div className="flex flex-col items-center">
              <p className="font-body text-sa-green-ink/70 text-center text-sm">
                Ingresa tu PIN de personal para abrir o cerrar el turno.
              </p>
              <div className="flex gap-2.5 mt-5 h-4">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <span
                    key={i}
                    className={`w-3.5 h-3.5 rounded-full transition-colors ${
                      i < pin.length ? 'bg-sa-green' : 'bg-sa-green-ink/15'
                    }`}
                  />
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3 mt-5">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                  <button
                    key={d}
                    onClick={() => teclearPin(d)}
                    disabled={verificando}
                    className="w-[72px] h-[72px] rounded-full bg-sa-green-deep text-sa-cream active:scale-95 transition-all font-display text-2xl disabled:opacity-40"
                  >
                    {d}
                  </button>
                ))}
                <button
                  onClick={() => setPin('')}
                  disabled={verificando}
                  className="w-[72px] h-[72px] rounded-full border border-sa-green-ink/20 text-sa-green-ink font-mono text-[10px] uppercase tracking-wide disabled:opacity-40"
                >
                  Borrar
                </button>
                <button
                  onClick={() => teclearPin('0')}
                  disabled={verificando}
                  className="w-[72px] h-[72px] rounded-full bg-sa-green-deep text-sa-cream active:scale-95 transition-all font-display text-2xl disabled:opacity-40"
                >
                  0
                </button>
                <button
                  onClick={() => pin.length >= 4 && void intentarPin(pin)}
                  disabled={verificando || pin.length < 4}
                  className="w-[72px] h-[72px] rounded-full bg-sa-banana text-sa-green-ink font-display text-sm disabled:opacity-30"
                >
                  Entrar
                </button>
              </div>
              {verificando && (
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-sa-green-ink/40 mt-4">
                  Verificando…
                </p>
              )}
            </div>
          )}

          {/* ---- Cargando ---- */}
          {fase === 'cargando' && (
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-sa-green-ink/50 text-center py-10">
              Consultando la caja…
            </p>
          )}

          {/* ---- Abrir turno ---- */}
          {fase === 'abrir' && (
            <div>
              <p className="font-body text-sa-green-ink/70 text-sm">
                No hay un corte abierto. Captura el fondo inicial en efectivo
                para arrancar el turno.
              </p>
              <MontoConPad etiqueta="Fondo inicial" valor={fondo} onCambiar={setFondo} />
              <button
                onClick={() => void abrirTurno()}
                disabled={guardando}
                className="w-full mt-5 bg-sa-green hover:brightness-110 disabled:opacity-50 text-sa-cream py-4 rounded-sa-lg font-display text-xl shadow-sa-sm transition-all"
              >
                {guardando ? 'Abriendo…' : `Abrir caja con ${mxn(Number(fondo) || 0)}`}
              </button>
            </div>
          )}

          {/* ---- Cerrar turno ---- */}
          {fase === 'cerrar' && resumen && (
            <div>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {[
                  { pie: 'Órdenes', dato: String(resumen.num_ordenes ?? 0) },
                  { pie: 'Cobrado', dato: mxn(resumen.total_pagado) },
                  { pie: 'Efectivo esperado', dato: mxn(resumen.efectivo_esperado) },
                ].map((b) => (
                  <div key={b.pie} className="bg-white rounded-sa p-3 text-center shadow-sa-sm">
                    <p className="font-display text-lg leading-none text-sa-green-ink">{b.dato}</p>
                    <p className="font-mono text-[9px] uppercase tracking-wide text-sa-green-ink/50 mt-1.5">{b.pie}</p>
                  </div>
                ))}
              </div>
              <ConteoDeCaja conteo={conteo} onCambiar={setConteo} />
              {totalContado > 0 && (
                <p
                  className={`font-mono text-xs rounded-sa px-3 py-2 mt-3 ${
                    dif === 0
                      ? 'bg-sa-mint/25 text-sa-green-ink'
                      : 'bg-sa-strawberry/10 text-sa-strawberry'
                  }`}
                >
                  Diferencia: {mxn(dif)} {dif === 0 ? '(cuadra)' : dif > 0 ? '(sobrante)' : '(faltante)'}
                </p>
              )}
              <button
                onClick={() => void cerrarTurno()}
                disabled={guardando}
                className="w-full mt-5 bg-sa-strawberry hover:brightness-110 disabled:opacity-50 text-white py-4 rounded-sa-lg font-display text-xl shadow-sa-sm transition-all"
              >
                {guardando ? 'Cerrando…' : 'Cerrar caja'}
              </button>
              <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/40 mt-3 text-center">
                Para cambio de turno: cierra y en seguida abre el nuevo
              </p>
            </div>
          )}

          {/* ---- Resultado ---- */}
          {fase === 'listo' && (
            <div className="flex flex-col items-center text-center">
              <img src={`${import.meta.env.BASE_URL}hojaldra.png`} alt="" className="h-28 drop-shadow-xl" />
              {resultado === 'abierto' ? (
                <>
                  <h3 className="font-display text-3xl text-sa-green-ink mt-3">Caja abierta</h3>
                  <p className="font-body text-sa-green-ink/60 text-sm mt-1">
                    Turno registrado{empleado ? ` a nombre de ${empleado.nombre}` : ''}. ¡A hornear!
                  </p>
                </>
              ) : (
                <>
                  <h3 className="font-display text-3xl text-sa-green-ink mt-3">Buen turno, campeón</h3>
                  <p className="font-mono text-xs uppercase tracking-widest text-sa-green-ink/50 mt-2">Total cobrado</p>
                  <p className="font-display text-3xl text-sa-strawberry">{mxn(resumen?.total_pagado ?? 0)}</p>
                </>
              )}
              <div className="flex gap-3 mt-6 w-full">
                {resultado === 'cerrado' && (
                  <button
                    onClick={() => { setFondo(''); setError(null); setFase('abrir') }}
                    className="flex-1 border border-sa-green-ink/15 bg-white text-sa-green-ink py-3.5 rounded-sa-lg font-display text-base hover:bg-sa-cream-soft transition-colors"
                  >
                    Abrir nuevo turno
                  </button>
                )}
                <button
                  onClick={() => void salir()}
                  className="flex-1 bg-sa-green-deep text-sa-cream py-3.5 rounded-sa-lg font-display text-base hover:brightness-110 transition-all"
                >
                  Listo
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Conteo por denominación.
 *
 * Antes había que sumar el cajón de cabeza y teclear un total. Eso es
 * justo donde se cuela el error del corte: si el número no cuadra, no hay
 * forma de saber si falta dinero o si alguien sumó mal, y lo segundo pasa
 * mucho más seguido que lo primero.
 *
 * Contando por denominación el total lo hace la máquina, y de paso queda
 * el desglose: si mañana falta un billete de 500, se ve cuántos había.
 */
const BILLETES = [500, 200, 100, 50, 20]
const MONEDAS = [20, 10, 5, 2, 1]

type Conteo = Record<number, number>

function sumaConteo(c: Conteo): number {
  return Object.entries(c).reduce((t, [den, n]) => t + Number(den) * (n || 0), 0)
}

function FilaDenominacion({
  den, cuantos, onCambiar, moneda,
}: { den: number; cuantos: number; onCambiar: (n: number) => void; moneda?: boolean }) {
  const subtotal = den * (cuantos || 0)
  return (
    <div className="flex items-center gap-2">
      <span
        className={`shrink-0 w-14 text-center font-display text-base leading-none py-2 rounded-sa ${
          moneda
            ? 'bg-sa-banana/25 text-sa-green-ink'
            : 'bg-sa-mint/25 text-sa-green-ink'
        }`}
      >
        ${den}
      </span>
      <button
        onClick={() => onCambiar(Math.max(0, (cuantos || 0) - 1))}
        className="shrink-0 w-11 h-11 rounded-sa bg-sa-cream-soft border border-sa-green-ink/10 font-display text-xl text-sa-green-ink active:scale-95 transition-transform disabled:opacity-30"
        disabled={!cuantos}
        aria-label={`Quitar un ${den}`}
      >
        −
      </button>
      <input
        value={cuantos || ''}
        onChange={(e) => onCambiar(Math.max(0, Math.min(999, Number(e.target.value.replace(/\D/g, '')) || 0)))}
        inputMode="numeric"
        placeholder="0"
        className="w-14 h-11 text-center rounded-sa border border-sa-green-ink/15 font-mono text-lg"
      />
      <button
        onClick={() => onCambiar(Math.min(999, (cuantos || 0) + 1))}
        className="shrink-0 w-11 h-11 rounded-sa bg-sa-cream-soft border border-sa-green-ink/10 font-display text-xl text-sa-green-ink active:scale-95 transition-transform"
        aria-label={`Agregar un ${den}`}
      >
        +
      </button>
      <span className="flex-1 text-right font-mono text-sm text-sa-green-ink/60">
        {subtotal ? mxn(subtotal) : ''}
      </span>
    </div>
  )
}

function ConteoDeCaja({
  conteo, onCambiar,
}: { conteo: Conteo; onCambiar: (c: Conteo) => void }) {
  const poner = (den: number, n: number) => onCambiar({ ...conteo, [den]: n })
  const total = sumaConteo(conteo)

  return (
    <div className="mt-4">
      <p className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/60 mb-2">
        Efectivo contado en caja
      </p>

      <div className="bg-white border border-sa-green-ink/10 rounded-sa p-3 space-y-2">
        <p className="font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/45">Billetes</p>
        {BILLETES.map((d) => (
          <FilaDenominacion key={d} den={d} cuantos={conteo[d] || 0} onCambiar={(n) => poner(d, n)} />
        ))}

        <p className="font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/45 pt-2">Monedas</p>
        {MONEDAS.map((d) => (
          <FilaDenominacion key={d} den={d} cuantos={conteo[d] || 0} onCambiar={(n) => poner(d, n)} moneda />
        ))}
      </div>

      <div className="flex items-baseline justify-between gap-3 mt-3 px-1">
        <span className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/60">Total contado</span>
        <span className="font-display text-3xl text-sa-green-ink leading-none">{mxn(total)}</span>
      </div>
    </div>
  )
}

/**
 * Campo de dinero con su teclado en pantalla: el kiosko es táctil y no hay
 * teclado físico a la mano cuando se abre el turno.
 */
function MontoConPad({
  etiqueta, valor, onCambiar,
}: { etiqueta: string; valor: string; onCambiar: (v: string) => void }) {
  function tecla(d: string) {
    if (d === '←') return onCambiar(valor.slice(0, -1))
    onCambiar((valor + d).replace(/^0+(?=\d)/, '').slice(0, 6))
  }
  return (
    <div className="mt-4">
      <p className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/60 mb-2">{etiqueta}</p>
      <div className="bg-white border border-sa-green-ink/10 rounded-sa px-4 py-3 font-mono text-3xl text-sa-green-ink text-right">
        ${valor === '' ? '0' : valor}
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', '←'].map((d) => (
          <button
            key={d}
            onClick={() => tecla(d)}
            className="h-14 rounded-sa bg-sa-cream-soft border border-sa-green-ink/10 font-display text-xl text-sa-green-ink active:scale-95 transition-transform"
          >
            {d}
          </button>
        ))}
      </div>
    </div>
  )
}
