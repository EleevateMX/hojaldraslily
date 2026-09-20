import React from 'react'
import { useNavigate } from 'react-router-dom'
import { urlDeFoto } from '@lily/utils'
import { useCarrito } from '@/store/carritoStore'

export function Carrito() {
  const navigate = useNavigate()
  const { items, incrementar, decrementar, extrasDe, total, totalItems } =
    useCarrito()
  // Los extras se pintan DEBAJO de su producto, no como líneas sueltas: es la
  // misma agrupación que sale en la comanda, así que lo que ve el cajero es
  // lo que va a ver quien prepara.
  const lineasPrincipales = items.filter((i) => !i.padreLinea)

  if (totalItems() === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-sa-cream-paper gap-6 px-8 text-center">
        <img src={`${import.meta.env.BASE_URL}hojaldra.png`} alt="Hojaldra de la casa" className="h-56" />
        <p className="font-display text-4xl text-sa-green-ink">
          Todavía no ha puesto nada
        </p>
        <p className="font-body text-sa-green-ink/70 max-w-sm">
          Elija sus hojaldras del menú y aparecen aquí.
        </p>
        <button
          onClick={() => navigate('/catalogo')}
          className="mt-4 bg-sa-green text-sa-cream px-10 h-16 rounded-full font-display text-2xl shadow-sa-sm active:scale-95 transition-transform"
        >
          Volver al menú
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-sa-cream-paper">
      <header className="flex items-center gap-4 px-8 py-6 bg-sa-green-deep text-sa-cream">
        <button
          onClick={() => navigate('/catalogo')}
          className="w-12 h-12 rounded-full bg-sa-green-ink hover:bg-sa-green flex items-center justify-center text-2xl"
          aria-label="Volver"
        >
          ←
        </button>
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-sa-banana">
            #PEDIDO
          </p>
          <h1 className="font-display text-3xl mt-1">Tu pedido</h1>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-8 py-6 space-y-4">
        {lineasPrincipales.map((item) => {
          const extras = extrasDe(item.linea)
          const totalLinea =
            item.precio * item.cantidad + extras.reduce((s, e) => s + e.precio * e.cantidad, 0)
          return (
            <div key={item.linea} className="bg-sa-cream-soft rounded-sa-lg p-4 shadow-sa-sm">
              <div className="flex items-center gap-4">
                {item.imagen_url ? (
                  <img
                    src={urlDeFoto(item.imagen_url, import.meta.env.BASE_URL)!}
                    alt={item.nombre}
                    className="w-20 h-20 rounded-sa object-cover"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-sa bg-sa-cream-warm flex items-center justify-center">
                    <img src={`${import.meta.env.BASE_URL}hojaldra.png`} alt="" className="h-16 opacity-80" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-display text-2xl text-sa-green-ink leading-tight truncate">
                    {item.nombre}
                  </p>
                  {item.personalizacion && (
                    <p className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/50 mt-0.5 truncate">
                      {item.personalizacion}
                    </p>
                  )}
                  <p className="font-mono text-base text-sa-green mt-1">
                    ${totalLinea.toFixed(2)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => decrementar(item.linea)}
                    className="w-14 h-14 rounded-full bg-sa-cream-warm text-sa-green-ink font-display text-2xl flex items-center justify-center active:scale-95 transition-transform"
                    aria-label="Quitar uno"
                  >
                    −
                  </button>
                  <span className="w-10 text-center font-mono text-xl text-sa-green-ink">
                    {item.cantidad}
                  </span>
                  <button
                    onClick={() => incrementar(item.linea)}
                    className="w-14 h-14 rounded-full bg-sa-green text-sa-cream font-display text-2xl flex items-center justify-center active:scale-95 transition-transform"
                    aria-label="Agregar uno"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Los extras no tienen sus propios botones: suben y bajan con
                  su pieza. Tenerlos sueltos permitía quedarse con un extra
                  sin la pieza que lo lleva, cobrándose solo. */}
              {extras.length > 0 && (
                <ul className="mt-3 pl-24 space-y-1">
                  {extras.map((e) => (
                    <li
                      key={e.linea}
                      className="flex items-baseline justify-between gap-3 font-mono text-xs uppercase tracking-wide text-sa-green-ink/60"
                    >
                      <span className="truncate">
                        + {e.cantidad > 1 ? `${e.cantidad}× ` : ''}
                        {e.nombre}
                      </span>
                      {e.precio > 0 && (
                        <span className="flex-shrink-0">${(e.precio * e.cantidad).toFixed(2)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </main>

      <footer className="bg-sa-green text-sa-cream px-8 py-6 rounded-t-sa-lg shadow-sa">
        <div className="flex items-end justify-between mb-5">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-sa-banana">
              Total del pedido
            </p>
            <p className="font-mono text-xs text-sa-cream/70 mt-1">
              {totalItems()} {totalItems() === 1 ? 'cosa' : 'cosas'} · MXN
            </p>
          </div>
          <span className="font-display text-5xl leading-none text-sa-cream">
            ${total().toFixed(2)}
          </span>
        </div>
        <button
          onClick={() => navigate('/pago')}
          className="w-full bg-sa-strawberry text-white py-5 rounded-full font-display text-3xl shadow-sa-sm active:scale-[0.98] transition-transform"
        >
          A pagar
        </button>
      </footer>

    </div>
  )
}
