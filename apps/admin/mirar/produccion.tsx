/**
 * Admin → Producción, con una tienda de mediodía.
 *
 *     cd apps/admin && pnpm dev
 *     →   http://localhost:5173/mirar/produccion.html
 *
 * **Hace falta un `.env` aunque esto no consulte nada.** `Produccion.tsx`
 * importa `../lib/sb`, que abre el cliente de Supabase al cargar el módulo y
 * revienta sin llaves — así que la página sale en blanco sin ningún error a
 * la vista. Con valores de relleno alcanza, porque aquí nadie consulta:
 *
 *     printf 'VITE_SUPABASE_URL=http://localhost:1\nVITE_SUPABASE_ANON_KEY=x\n' \
 *       > apps/admin/.env.local
 *
 * Es la pantalla que más piezas nuevas junta —los tamaños en pastillas, el
 * molde por fila, y el panel de «Mandar a producir» con sus dos unidades— y
 * ninguna de las tres se revisa leyendo el código. Aquí se mira con los casos
 * que de verdad rompen: un sabor con los dos moldes vivos, uno agotado, uno
 * que todavía no se hornea, y uno que se cuenta en piezas.
 */
import { createRoot } from 'react-dom/client'
import { Fila, RenglonDePedido } from '../src/pages/Produccion'
import type { ExistenciaPorMolde, ProductoDelDia } from '@lily/supabase'
import '../src/index.css'

const ex = (
  sabor: string,
  p: Partial<ExistenciaPorMolde> = {},
): ExistenciaPorMolde =>
  ({
    sabor,
    imagen_url: null,
    categoria: 'Menú del día',
    cuadros_horneados: 192,
    cuadros_mermados: 0,
    cuadros_vendidos: 60,
    cuadros_apartados: 24,
    cuadros_libres: 108,
    horneados_48: 192,
    horneados_24: 0,
    libres_48: 108,
    libres_24: 0,
    ...p,
  }) as ExistenciaPorMolde

const paq = (nombre: string, cuadros: number, posibles: number | null): ProductoDelDia =>
  ({
    producto_id: `${nombre}-${cuadros}`,
    nombre,
    sabor: nombre,
    categoria: 'Menú del día',
    cuadros,
    piezas: null,
    precio: 0,
    imagen_url: null,
    cuadros_libres: 108,
    paquetes_posibles: posibles,
    vendidos: 0,
  }) as ProductoDelDia

const casos: { rotulo: string; e: ExistenciaPorMolde; paquetes: ProductoDelDia[] }[] = [
  {
    rotulo: 'Los cuatro tamaños, con los dos moldes vivos',
    e: ex('Fiesta', { horneados_48: 192, horneados_24: 72, libres_48: 108, libres_24: 48 }),
    paquetes: [
      paq('Fiesta · 6 cuadros', 6, 26),
      paq('Fiesta · Mini', 12, 13),
      paq('Fiesta · Chica', 24, 6),
      paq('Fiesta · Grande', 48, 2),
    ],
  },
  {
    rotulo: 'Tres tamaños, un solo molde',
    e: ex('Jamón y Queso', { horneados_48: 96, libres_48: 24, cuadros_libres: 24 }),
    paquetes: [
      paq('Jamón y Queso · Mini', 12, 2),
      paq('Jamón y Queso · Chica', 24, 1),
      paq('Jamón y Queso · Grande', 48, 0),
    ],
  },
  {
    rotulo: 'Se acabó',
    e: ex('Hawaiana', { cuadros_libres: 0, libres_48: 0, libres_24: 0, cuadros_vendidos: 192 }),
    paquetes: [],
  },
  {
    rotulo: 'Todavía no se hornea nada hoy',
    e: ex('Queso de Bola', {
      cuadros_horneados: 0, horneados_48: 0, horneados_24: 0,
      cuadros_vendidos: 0, cuadros_apartados: 0,
      cuadros_libres: 0, libres_48: 0, libres_24: 0,
    }),
    paquetes: [],
  },
]

createRoot(document.getElementById('root')!).render(
  <div className="bg-sa-cream-paper min-h-screen text-sa-green-ink">
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="space-y-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-sa-green">
          Las filas de existencias
        </p>
        {casos.map((c) => (
          <div key={c.rotulo} className="space-y-1">
            <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/40">
              {c.rotulo}
            </p>
            <Fila
              e={c.e}
              paquetes={c.paquetes}
              base=""
              ocupado={false}
              onHornear={() => {}}
              onMerma={() => {}}
            />
          </div>
        ))}
      </div>

      <div className="bg-sa-cream-soft rounded-sa-lg p-5 shadow-sa space-y-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-sa-green">
          Mandar a producir
        </p>
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-sa-green pt-2">
          Hojaldras · se piden en moldes
        </p>
        <RenglonDePedido
          clave="Fiesta" nombre="Fiesta"
          detalle="quedan 2 moldes y ¼ de 48 y 2 moldes de 24"
          imagen={null} base="" unidad="molde"
          valor={{ sabor: 'Fiesta', cantidad: 3, unidad: 'molde', molde: 48 }}
          onCambiar={() => {}}
        />
        <RenglonDePedido
          clave="Queso de Bola" nombre="Queso de Bola"
          detalle="quedan nada"
          imagen={null} base="" unidad="molde"
          valor={{ sabor: 'Queso de Bola', cantidad: 2, unidad: 'molde', molde: 24 }}
          onCambiar={() => {}}
        />
        <RenglonDePedido
          clave="Hawaiana" nombre="Hawaiana"
          detalle="quedan 1 molde de 48"
          imagen={null} base="" unidad="molde"
          valor={undefined}
          onCambiar={() => {}}
        />
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-sa-green pt-4">
          Panes · se piden en piezas
        </p>
        <RenglonDePedido
          clave="Rosca de Queso Philadelphia · Grande"
          nombre="Rosca de Queso Philadelphia · Grande"
          detalle="se hornea al pedido"
          imagen={null} base="" unidad="pieza"
          valor={{ sabor: 'Rosca', cantidad: 20, unidad: 'pieza', molde: 48 }}
          onCambiar={() => {}}
        />
        <RenglonDePedido
          clave="Trenza Suiza" nombre="Trenza Suiza"
          detalle="se hornea al pedido"
          imagen={null} base="" unidad="pieza"
          valor={undefined}
          onCambiar={() => {}}
        />
      </div>
    </div>
  </div>,
)
