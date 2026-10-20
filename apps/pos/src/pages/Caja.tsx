import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePosStore } from '@/store/posStore'
import { sb } from '../lib/sb'
import { listarAlmacenes, listarCajas, corteAbierto, abrirCaja } from '@lily/supabase'
import { ContarEfectivo, CONTEO_VACIO } from '@/components/pos/ContarEfectivo'
import { PantallaDeVenta } from '@/components/pos/PantallaDeVenta'
import { useProductosPOS } from '@/hooks/useProductosPOS'
import { mensajeDeError, sumaConteo, hayConteo, horaEnMerida, type Conteo } from '@lily/utils'
import { conRespaldo } from '../lib/respaldo'
import { salirDeLaCaja } from '../lib/sesion'

export function Caja() {
  const navigate = useNavigate()
  const {
    empleado, almacen, caja, corte, setContexto, setCorte,
    canal, setCanal,
  } = usePosStore()
  const salir = () => void salirDeLaCaja().then(() => navigate('/login'))

  // El horno ya no se consulta aquí: lo hace el PanelDeProducción, que es
  // quien lo enseña. Antes esta pantalla leía `listarOrdenesConTiempo` para
  // pintar una franja, y el panel leía `fn_horno_en_vivo` para lo mismo —
  // DOS consultas contestando la misma pregunta desde dos lados. En cuanto
  // una cuenta piezas y la otra moldes, terminan diciendo cosas distintas
  // del mismo horno y ya no se sabe a cuál creerle.
  const { productos, productosExtra, extras, categorias, loading } = useProductosPOS()

  const [horaActual, setHoraActual] = useState(new Date())
  const [cargandoCtx, setCargandoCtx] = useState(!corte)
  const [error, setError] = useState<string | null>(null)
  // El fondo se cuenta pieza por pieza. El numero suelto se queda como
  // salida de emergencia para el dia que haya prisa, pero el desglose es lo
  // que convierte «faltan $340» en algo que alguien puede recordar.
  const [conteo, setConteo] = useState<Conteo>(CONTEO_VACIO)
  const [contando, setContando] = useState(true)
  const [fondo, setFondo] = useState('0')
  const [abriendo, setAbriendo] = useState(false)

  useEffect(() => {
    const interval = setInterval(() => setHoraActual(new Date()), 30000)
    return () => clearInterval(interval)
  }, [])

  // Bootstrap real: almacén kiosko + caja de la sucursal + corte abierto.
  useEffect(() => {
    if (corte) {
      setCargandoCtx(false)
      return
    }
    let vivo = true
    ;(async () => {
      try {
        // Con respaldo: sin internet, la caja abre con el almacen, la caja y
        // el turno que tenia la ultima vez. El corte es el que mas importa —
        // sin el, esta pantalla manda a «abrir caja» y la cajera abriria un
        // segundo turno sobre el que ya estaba abierto.
        const almacenes = await conRespaldo('almacenes', () => listarAlmacenes(sb))
        const kiosko = almacenes.find((a) => a.tipo === 'kiosko') ?? almacenes[0]
        if (!kiosko) throw new Error('No hay almacenes configurados.')
        const cajas = await conRespaldo('cajas', () => listarCajas(sb))
        const c = cajas.find((x) => x.sucursal_id === kiosko.sucursal_id) ?? cajas[0]
        if (!c) throw new Error('No hay cajas configuradas.')
        const abierto = await conRespaldo(`corte_${c.id}`, () => corteAbierto(sb, c.id))
        if (!vivo) return
        setContexto({ almacen: kiosko, caja: c, corte: abierto })
      } catch (e) {
        if (vivo) setError(mensajeDeError(e))
      } finally {
        if (vivo) setCargandoCtx(false)
      }
    })()
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleAbrir() {
    if (!caja) return
    setAbriendo(true)
    setError(null)
    try {
      const nuevo = contando
        ? await abrirCaja(sb, caja.id, { conteo })
        : await abrirCaja(sb, caja.id, { fondo: Number(fondo) || 0 })
      setCorte(nuevo)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setAbriendo(false)
    }
  }

  const hora = horaEnMerida(horaActual)

  // --- Apertura de caja (sin corte abierto) ---
  if (!corte) {
    return (
      <div className="min-h-screen bg-sa-green-deep flex flex-col items-center justify-center px-4 py-8">
        <img src={`${import.meta.env.BASE_URL}logo-negativo.png`} alt="Hojaldras Lily" className="w-[190px] h-auto mb-6 drop-shadow-2xl" />
        <div className="bg-sa-cream-soft rounded-sa-lg shadow-sa w-full max-w-md p-8">
          {cargandoCtx ? (
            <p className="text-center font-mono text-sm text-sa-green-ink/50 animate-pulse py-8">
              Cargando caja…
            </p>
          ) : (
            <>
              <h1 className="font-display text-3xl text-sa-green-ink text-center leading-tight">
                Abrir caja{caja ? ` — ${caja.nombre}` : ''}
              </h1>
              <p className="font-body text-sa-green-ink/60 mt-2 text-sm text-center">
                No hay un corte abierto. Ingresa el fondo inicial para comenzar a vender.
              </p>
              {error && (
                <p className="text-center text-sa-strawberry text-sm mt-4 font-mono">{error}</p>
              )}
              <div className="mt-6">
                <label className="block font-mono text-xs uppercase tracking-wide text-sa-green-ink/60 mb-2">
                  Fondo inicial en efectivo
                </label>
                {contando ? (
                  <>
                    <ContarEfectivo conteo={conteo} onCambio={setConteo} autoFocus />
                    <button
                      type="button"
                      onClick={() => setContando(false)}
                      className="mt-3 font-mono text-xs uppercase tracking-wide text-sa-green-ink/50 hover:text-sa-green-ink underline"
                    >
                      Teclear solo el total
                    </button>
                  </>
                ) : (
                  <>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono text-sa-green-ink/40 text-xl">$</span>
                      <input
                        type="number"
                        value={fondo}
                        onChange={(e) => setFondo(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-white border border-sa-green-ink/10 rounded-sa font-mono text-2xl text-sa-green-ink focus:outline-none focus:ring-2 focus:ring-sa-green/30"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setContando(true)}
                      className="mt-3 font-mono text-xs uppercase tracking-wide text-sa-green-ink/50 hover:text-sa-green-ink underline"
                    >
                      Contar por denominación
                    </button>
                  </>
                )}
              </div>
              <button
                onClick={() => void handleAbrir()}
                disabled={abriendo || !caja}
                className="w-full mt-5 bg-sa-green disabled:opacity-40 text-sa-cream py-4 rounded-sa-lg font-display text-xl hover:bg-sa-green-deep transition-colors"
              >
                {abriendo
                  ? 'Abriendo…'
                  : contando && hayConteo(conteo)
                    ? `Abrir caja con ${sumaConteo(conteo).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}`
                    : 'Abrir caja'}
              </button>
              <button
                onClick={salir}
                className="w-full mt-3 font-mono text-xs uppercase tracking-wide text-sa-green-ink/50 hover:text-sa-strawberry"
              >
                Salir
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  // --- Venta (corte abierto) ---
  return (
    <PantallaDeVenta
      productos={productos}
      productosExtra={productosExtra}
      extras={extras}
      categorias={categorias}
      loading={loading}
      hora={hora}
      almacenNombre={almacen?.nombre ?? 'Caja'}
      empleadoNombre={empleado?.nombre.split(' ')[0] ?? ''}
      canal={canal}
      setCanal={setCanal}
      onIr={(ruta) => navigate(ruta)}
      onSalir={salir}
    />
  )
}
