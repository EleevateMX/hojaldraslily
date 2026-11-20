import React, { useState } from 'react'
import { usePosStore } from '@/store/posStore'
import { AvisoDeConexion } from './AvisoDeConexion'
import { CatalogoBusqueda } from './CatalogoBusqueda'
import { OrdenPanel } from './OrdenPanel'
import { PanelDeProduccion } from './PanelDeProduccion'
import type { CategoriaPOS } from '@/hooks/useProductosPOS'
import type { ProductoVenta, ExtraDeProducto, CanalDeVenta } from '@lily/supabase'
import { mxn } from '@lily/utils'

/**
 * La pantalla de venta, separada de quien la alimenta.
 *
 * `Caja.tsx` carga el contexto (almacén, caja, turno) y el catálogo; esto
 * solo pinta. Es la misma partición que `produccion/vista.tsx`: lo que se
 * quiere MIRAR con datos de una tienda ocupada tiene que poder montarse sin
 * Supabase (`mirar/caja.html`).
 *
 * Y es donde vive la forma para cada aparato:
 *
 *  - **PC y tableta acostada** (`lg`, 1024 px o más): catálogo a la izquierda
 *    y el ticket siempre visible a la derecha, como en el mostrador.
 *  - **Teléfono y tableta parada**: el catálogo ocupa todo, y el ticket es
 *    una **barra abajo** con lo que lleva y el total; al tocarla sube como
 *    hoja encima del catálogo, con su «Cobrar». Un ticket de 384 px al lado
 *    de un catálogo de 390 no cabe: antes el ticket aplastaba el catálogo a
 *    una columna de dos dedos y se vendía a ciegas.
 *  - La cabecera guarda lo secundario (pedidos de kiosko, encargos, corte,
 *    salir) en un menú en pantallas angostas. Lo que se queda a la vista es
 *    lo que se toca a cada rato: el canal, producción y el ticket.
 */
export interface PantallaDeVentaProps {
  productos: ProductoVenta[]
  productosExtra: ProductoVenta[]
  extras: ExtraDeProducto[]
  categorias: CategoriaPOS[]
  loading: boolean
  hora: string
  almacenNombre: string
  empleadoNombre: string
  canal: CanalDeVenta
  setCanal: (c: CanalDeVenta) => void
  onIr: (ruta: '/pendientes' | '/encargos' | '/corte' | '/cobro' | '/historial') => void
  onSalir: () => void
}

const btnCabecera =
  'font-mono text-xs uppercase tracking-wide bg-sa-cream-warm/10 hover:bg-sa-cream-warm/20 text-sa-cream px-4 py-2 rounded-full transition-colors border border-sa-cream/20 whitespace-nowrap'

export function PantallaDeVenta({
  productos, productosExtra, extras, categorias, loading, hora, almacenNombre, empleadoNombre,
  canal, setCanal, onIr, onSalir,
}: PantallaDeVentaProps) {
  const totalItems = usePosStore((s) => s.totalItems())
  const aCobrar = usePosStore((s) => s.aCobrar())
  const encargo = usePosStore((s) => s.encargo)
  const modificacion = usePosStore((s) => s.modificacion)
  const setModificacion = usePosStore((s) => s.setModificacion)
  const limpiarOrden = usePosStore((s) => s.limpiarOrden)
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [ticketAbierto, setTicketAbierto] = useState(false)

  const ir = (ruta: '/pendientes' | '/encargos' | '/corte' | '/historial') => {
    setMenuAbierto(false)
    onIr(ruta)
  }

  const secundarios = (
    <>
      <button onClick={() => ir('/pendientes')} className={btnCabecera}>Pedidos de kiosko</button>
      <button onClick={() => ir('/encargos')} className={btnCabecera}>Encargos</button>
      <button onClick={() => ir('/historial')} className={btnCabecera}>Historial</button>
      <button onClick={() => ir('/corte')} className={btnCabecera}>Corte de caja</button>
      <button
        onClick={onSalir}
        className="font-mono text-xs uppercase tracking-wide bg-sa-strawberry/15 hover:bg-sa-strawberry/30 text-sa-strawberry px-4 py-2 rounded-full transition-colors border border-sa-strawberry/30 whitespace-nowrap"
      >
        Salir
      </button>
    </>
  )

  return (
    <div className="h-dvh flex flex-col bg-sa-cream-paper overflow-hidden">
      <AvisoDeConexion />
      {modificacion && (
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-sa-banana/25 border-b border-sa-banana/40 flex-shrink-0">
          <span className="font-mono text-xs text-sa-green-ink">
            Modificando la venta #{modificacion.folioVieja} · ya pagó {mxn(modificacion.credito)} · arma el nuevo pedido y cobra la diferencia
          </span>
          <button
            onClick={() => { setModificacion(null); limpiarOrden() }}
            className="font-mono text-xs uppercase tracking-wide text-sa-green-deep underline whitespace-nowrap"
          >
            Cancelar
          </button>
        </div>
      )}
      <header className="flex items-center justify-between gap-2 px-3 lg:px-5 py-2 lg:py-2.5 bg-sa-green-deep text-sa-cream flex-shrink-0 border-b border-sa-cream/10">
        <div className="flex items-center gap-2 lg:gap-3 min-w-0">
          {/* En el teléfono no cabe el logotipo junto a los controles: a 390
              px salía aplastado a una tira de dos dedos, que es peor que no
              ponerlo. La marca ya está en el icono de la app. */}
          <img
            src={`${import.meta.env.BASE_URL}logo-negativo.png`}
            alt="Hojaldras Lily"
            className="hidden md:block h-[80px] lg:h-[110px] w-auto -my-5 lg:-my-6 shrink-0"
          />
          <span className="hidden md:inline font-mono text-xs uppercase tracking-widest text-sa-cream/50 truncate">
            {almacenNombre}
          </span>
        </div>
        <div className="flex items-center gap-2 lg:gap-4">
          {/* De donde viene la venta. Rappi cobra otra lista de precios --
              la plataforma se lleva su comision-- y el ticket tiene que
              salir con ESE precio para que el corte cuadre contra lo que la
              plataforma deposita. Vuelve a Mostrador solo al cobrar. */}
          <div className="flex items-center rounded-full bg-sa-cream/10 p-1">
            {([
              { k: 'pos' as const, t: 'Mostrador' },
              { k: 'rappi' as const, t: 'Rappi' },
            ]).map((c) => (
              <button
                key={c.k}
                onClick={() => setCanal(c.k)}
                className={[
                  'font-mono text-xs uppercase tracking-wide px-3 lg:px-4 py-1.5 rounded-full transition-colors',
                  canal === c.k ? 'bg-sa-cream text-sa-green-deep' : 'text-sa-cream/70',
                ].join(' ')}
              >
                {c.t}
              </button>
            ))}
          </div>
          <span className="hidden lg:inline font-mono text-sm text-sa-cream/70">{hora}</span>
          <span className="hidden lg:inline font-display text-lg text-sa-cream">{empleadoNombre}</span>
          {/* El puesto de mando de la produccion: que hay en el horno, que
              queda en moldes, y mandar a hacer mas. Un boton y un cajon, no
              tres ventanas -- la caja no navega a otra pagina con un ticket a
              medias. */}
          <PanelDeProduccion />
          <div className="hidden lg:flex items-center gap-4">{secundarios}</div>
          {/* En angosto: un menú con lo que no se toca a cada rato. */}
          <div className="relative lg:hidden">
            <button
              onClick={() => setMenuAbierto((v) => !v)}
              aria-expanded={menuAbierto}
              aria-label="Más opciones"
              className={`${btnCabecera} px-3`}
            >
              ☰
            </button>
            {menuAbierto && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuAbierto(false)} />
                <div className="absolute right-0 top-full mt-2 z-50 w-56 rounded-sa-lg bg-sa-green-deep border border-sa-cream/15 shadow-sa-lg p-3 flex flex-col gap-2">
                  <p className="font-display text-base text-sa-cream px-1">{empleadoNombre}</p>
                  <p className="font-mono text-xs text-sa-cream/60 px-1 -mt-1">{hora} · {almacenNombre}</p>
                  {secundarios}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden gap-3 p-2 lg:p-3">
        <div className="flex-1 flex flex-col overflow-hidden bg-sa-cream-soft rounded-sa shadow-sa-sm">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <p className="font-mono text-sm text-sa-green-ink/50 animate-pulse">Cargando menú…</p>
            </div>
          ) : (
            <CatalogoBusqueda productos={productos} categorias={categorias} extras={extras} productosExtra={productosExtra} />
          )}
        </div>

        {/* El ticket al lado, en PC y tableta acostada. */}
        <div className="hidden lg:flex w-96 flex-shrink-0 flex-col bg-white rounded-sa shadow-sa-sm overflow-hidden">
          <OrdenPanel onCobrar={() => onIr('/cobro')} productos={productos} />
        </div>
      </div>

      {/* El ticket abajo, en teléfono y tableta parada. La barra solo existe
          cuando hay algo que cobrar: vacía no dice nada. */}
      {(totalItems > 0 || encargo) && (
        <button
          onClick={() => setTicketAbierto(true)}
          className="lg:hidden flex-shrink-0 flex items-center justify-between gap-3 px-4 py-3 bg-sa-green text-sa-cream shadow-sa-lg"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <span className="font-mono text-xs uppercase tracking-wide">
            {totalItems} {totalItems === 1 ? 'producto' : 'productos'}
            {encargo ? ` · encargo #${encargo.folio}` : ''}
          </span>
          <span className="font-display text-2xl leading-none">{mxn(aCobrar)}</span>
          <span className="font-mono text-xs uppercase tracking-wide bg-sa-cream text-sa-green-deep px-3 py-1.5 rounded-full">
            Ver ticket
          </span>
        </button>
      )}

      {ticketAbierto && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-sa-green-ink/40" onClick={() => setTicketAbierto(false)} />
          <div className="relative bg-white rounded-t-sa-lg shadow-sa-lg flex flex-col h-[88dvh]">
            <button
              onClick={() => setTicketAbierto(false)}
              className="flex-shrink-0 w-full flex items-center justify-center gap-2 py-2 font-mono text-xs uppercase tracking-wide text-sa-green-ink/60"
            >
              <span className="block w-10 h-1 rounded-full bg-sa-green-ink/20" />
              <span className="sr-only">Cerrar el ticket</span>
            </button>
            <div className="flex-1 min-h-0 flex flex-col">
              <OrdenPanel
                onCobrar={() => { setTicketAbierto(false); onIr('/cobro') }}
                productos={productos}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
