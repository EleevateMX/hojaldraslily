/**
 * La caja sin internet, mirada con los cuatro estados juntos.
 *
 *     cd apps/pos && pnpm dev   →   http://localhost:5181/mirar/sin-internet.html
 *
 * Esto no se puede revisar leyendo el código. Lo que hay que ver es si el
 * aviso **se lee a un metro** sobre la cabecera carmín, y si los cuatro
 * estados se distinguen entre sí de un vistazo: una franja que dice algo
 * distinto en cada caso no sirve de nada si los cuatro se ven igual.
 *
 * Los cuatro, en el orden en que duelen:
 *
 *   1. Sin internet, vendiendo — lo normal durante la falla.
 *   2. De vuelta, registrando — dura segundos y se tiene que notar.
 *   3. Con internet y ventas rechazadas — el único que pide que alguien haga
 *      algo, y el que no puede parecerse al de arriba.
 *   4. Todo en orden — la franja NO existe. Ocupar sitio para decir «todo
 *      bien» entrena a no mirarla.
 */
import { createRoot } from 'react-dom/client'
import { FranjaDeConexion } from '../src/components/pos/AvisoDeConexion'
import type { VentaSinInternet } from '../src/store/sinInternet'
import { mxn } from '@lily/utils'
import '../src/index.css'

const venta = (
  folio: string,
  total: number,
  efectivo: number,
  extra: Partial<VentaSinInternet> = {},
): VentaSinInternet => ({
  id: folio,
  folio_local: folio,
  vendida_en: '2026-10-19T03:12:00Z',
  sucursal_id: 's',
  almacen_id: 'a',
  corte_id: 'c',
  empleado_id: 'e',
  nombre_cliente: null,
  descuento: 0,
  referencia: null,
  metodo: 'efectivo',
  efectivo,
  tarjeta: total - efectivo,
  total_pantalla: total,
  items: [],
  resumen: [{ nombre: 'Jamón y Queso · Chica · 24 cuadros', cantidad: 1 }],
  intentos: 0,
  ultimoError: null,
  ...extra,
})

/** Una caja de media tarde: tres cobradas a oscuras, una de ellas rechazada. */
const COLA = [
  venta('S-01', 620, 620),
  venta('S-02', 310, 100, { metodo: 'mixto' }),
  venta('S-03', 185, 185, {
    intentos: 3,
    ultimoError: 'El corte de caja ya está cerrado.',
  }),
]

/** La cabecera de verdad, para ver el aviso contra el carmín de siempre. */
function Cabecera() {
  return (
    <header className="flex items-center justify-between px-5 py-2.5 bg-sa-green-deep text-sa-cream border-b border-sa-cream/10">
      <span className="font-mono text-xs uppercase tracking-widest text-sa-cream/50">
        Almacén Kiosko
      </span>
      <div className="flex items-center gap-4">
        <span className="font-mono text-sm text-sa-cream/70">21:14</span>
        <span className="font-display text-lg text-sa-cream">Rosa</span>
        <span className="font-mono text-xs uppercase tracking-wide bg-sa-cream-warm/10 text-sa-cream px-4 py-2 rounded-full border border-sa-cream/20">
          Corte de caja
        </span>
      </div>
    </header>
  )
}

function Caso({
  rotulo,
  enLinea,
  desde,
  pendientes,
  enviando,
}: {
  rotulo: string
  enLinea: boolean
  desde: string | null
  pendientes: VentaSinInternet[]
  enviando: boolean
}) {
  return (
    <section style={{ marginBottom: 28 }}>
      <p className="font-mono text-xs uppercase tracking-widest text-sa-green-ink/50 mb-1.5">
        {rotulo}
      </p>
      <div className="rounded-sa overflow-hidden shadow-sa-sm">
        <FranjaDeConexion
          enLinea={enLinea}
          desde={desde}
          pendientes={pendientes.length}
          enviando={enviando}
        />
        <Cabecera />
        <div className="bg-sa-cream-paper px-5 py-6 font-body text-sm text-sa-green-ink/40">
          (aquí va el menú)
        </div>
      </div>
    </section>
  )
}

/** El candado del corte, con su lista. Mismo contenido que CorteCaja. */
function Candado() {
  const sinRegistrar = COLA.length
  const efectivo = COLA.reduce((t, v) => t + v.efectivo, 0)
  return (
    <section>
      <p className="font-mono text-xs uppercase tracking-widest text-sa-green-ink/50 mb-1.5">
        5 · El corte, con ventas sin registrar
      </p>
      <div className="bg-sa-cream-soft rounded-sa p-5 shadow-sa-sm max-w-xl">
        <div className="bg-sa-cream border-2 border-sa-green-deep rounded-sa p-4 mb-6">
          <p className="font-display text-lg text-sa-green-deep leading-tight">
            Todavía no se puede cerrar la caja
          </p>
          <p className="font-body text-sm text-sa-green-ink/80 mt-1 leading-relaxed">
            Hay <b>{sinRegistrar}</b> ventas cobradas sin internet ({mxn(efectivo)} en efectivo)
            que aún no entran al sistema. Si se cerrara ahora, ese dinero estaría en el cajón y
            no en el corte.
          </p>
          <p className="font-mono text-xs text-sa-green-ink/60 mt-2">
            Hay internet pero el servidor las rechazó. Avísale a gerencia.
          </p>
          <ul className="mt-3 space-y-1">
            {COLA.map((v) => (
              <li key={v.id} className="font-mono text-xs text-sa-green-ink/70">
                {v.folio_local} · {mxn(v.total_pantalla)}
                {v.ultimoError ? ` · ${v.ultimoError}` : ''}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex gap-3">
          <button className="flex-1 border border-sa-green-ink/15 bg-white text-sa-green-ink py-4 rounded-sa-lg font-display text-base">
            Seguir vendiendo
          </button>
          <button
            disabled
            className="flex-1 bg-sa-strawberry opacity-50 text-white py-4 rounded-sa-lg font-display text-xl shadow-sa-sm"
          >
            Faltan {sinRegistrar} por registrar
          </button>
        </div>
      </div>
    </section>
  )
}

createRoot(document.getElementById('root')!).render(
  <div className="min-h-screen bg-sa-cream-paper p-6">
    <h1 className="font-display text-2xl text-sa-green-ink mb-5">La caja sin internet</h1>
    <Caso
      rotulo="1 · Sin internet, vendiendo"
      enLinea={false}
      desde="2026-10-19T03:07:00Z"
      pendientes={COLA.slice(0, 2)}
      enviando={false}
    />
    <Caso
      rotulo="2 · Volvió el internet, registrando"
      enLinea
      desde={null}
      pendientes={COLA}
      enviando
    />
    <Caso
      rotulo="3 · Con internet, el servidor las rechazó"
      enLinea
      desde={null}
      pendientes={COLA}
      enviando={false}
    />
    <Caso rotulo="4 · Todo en orden (no hay franja)" enLinea desde={null} pendientes={[]} enviando={false} />
    <Candado />
  </div>,
)
