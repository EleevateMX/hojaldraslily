import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePosStore } from '@/store/posStore'
import { sb } from '../lib/sb'
import { listarAlmacenes, listarCajas, corteAbierto, abrirCaja } from '@shake/supabase'
import { CatalogoBusqueda } from '@/components/pos/CatalogoBusqueda'
import { OrdenPanel } from '@/components/pos/OrdenPanel'
import { useProductosPOS } from '@/hooks/useProductosPOS'
import { mensajeDeError } from '@shake/utils'

export function Caja() {
  const navigate = useNavigate()
  const { empleado, almacen, caja, corte, setContexto, setCorte, cerrarSesion, limpiarOrden } =
    usePosStore()
  const { productos, productosExtra, extras, categorias, loading } = useProductosPOS()

  const [horaActual, setHoraActual] = useState(new Date())
  const [cargandoCtx, setCargandoCtx] = useState(!corte)
  const [error, setError] = useState<string | null>(null)
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
        const almacenes = await listarAlmacenes(sb)
        const kiosko = almacenes.find((a) => a.tipo === 'kiosko') ?? almacenes[0]
        if (!kiosko) throw new Error('No hay almacenes configurados.')
        const cajas = await listarCajas(sb)
        const c = cajas.find((x) => x.sucursal_id === kiosko.sucursal_id) ?? cajas[0]
        if (!c) throw new Error('No hay cajas configuradas.')
        const abierto = await corteAbierto(sb, c.id)
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
      const nuevo = await abrirCaja(sb, caja.id, Number(fondo) || 0, empleado?.id)
      setCorte(nuevo)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setAbriendo(false)
    }
  }

  const hora = horaActual.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })

  // --- Apertura de caja (sin corte abierto) ---
  if (!corte) {
    return (
      <div className="min-h-screen bg-sa-green-deep flex flex-col items-center justify-center px-4 py-8">
        <img src="/logo.png" alt="Hojaldras Lily" className="w-[160px] h-auto mb-6 drop-shadow-2xl" />
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
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono text-sa-green-ink/40 text-xl">$</span>
                  <input
                    type="number"
                    value={fondo}
                    onChange={(e) => setFondo(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-white border border-sa-green-ink/10 rounded-sa font-mono text-2xl text-sa-green-ink focus:outline-none focus:ring-2 focus:ring-sa-green/30"
                  />
                </div>
              </div>
              <button
                onClick={() => void handleAbrir()}
                disabled={abriendo || !caja}
                className="w-full mt-5 bg-sa-green disabled:opacity-40 text-sa-cream py-4 rounded-sa-lg font-display text-xl hover:bg-sa-green-deep transition-colors"
              >
                {abriendo ? 'Abriendo…' : 'Abrir caja'}
              </button>
              <button
                onClick={() => { cerrarSesion(); navigate('/login') }}
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
    <div className="h-screen flex flex-col bg-sa-cream-paper overflow-hidden">
      <header className="flex items-center justify-between px-5 py-2.5 bg-sa-green-deep text-sa-cream flex-shrink-0 border-b border-sa-cream/10">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Hojaldras Lily" className="h-[110px] w-auto -my-6" />
          <span className="font-mono text-xs uppercase tracking-widest text-sa-cream/50">
            {almacen?.nombre ?? 'Caja'}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-mono text-sm text-sa-cream/70">{hora}</span>
          <span className="font-display text-lg text-sa-cream">
            {empleado?.nombre.split(' ')[0]}
          </span>
          <button
            onClick={() => navigate('/pendientes')}
            className="font-mono text-xs uppercase tracking-wide bg-sa-cream-warm/10 hover:bg-sa-cream-warm/20 text-sa-cream px-4 py-2 rounded-full transition-colors border border-sa-cream/20"
          >
            Pedidos de kiosko
          </button>
          <button
            onClick={() => navigate('/corte')}
            className="font-mono text-xs uppercase tracking-wide bg-sa-cream-warm/10 hover:bg-sa-cream-warm/20 text-sa-cream px-4 py-2 rounded-full transition-colors border border-sa-cream/20"
          >
            Corte de caja
          </button>
          <button
            onClick={() => { limpiarOrden(); cerrarSesion(); navigate('/login') }}
            className="font-mono text-xs uppercase tracking-wide bg-sa-strawberry/15 hover:bg-sa-strawberry/30 text-sa-strawberry px-4 py-2 rounded-full transition-colors border border-sa-strawberry/30"
          >
            Salir
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden gap-3 p-3">
        <div className="flex-1 flex flex-col overflow-hidden bg-sa-cream-soft rounded-sa shadow-sa-sm">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <p className="font-mono text-sm text-sa-green-ink/50 animate-pulse">Cargando menú…</p>
            </div>
          ) : (
            <CatalogoBusqueda productos={productos} categorias={categorias} extras={extras} productosExtra={productosExtra} />
          )}
        </div>

        <div className="w-96 flex-shrink-0 flex flex-col bg-white rounded-sa shadow-sa-sm overflow-hidden">
          <OrdenPanel onCobrar={() => navigate('/cobro')} productos={productos} />
        </div>
      </div>
    </div>
  )
}
