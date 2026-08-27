// El logotipo va sobre carmin pleno (barra lateral): version en negativo.
import logo from '@shake/brand/logo-negativo.png'
import { useState, type ReactElement } from 'react'
import Dashboard from './pages/Dashboard'
import EnVivo from './pages/EnVivo'
import Diagnostico from './pages/Diagnostico'
import Metas from './pages/Metas'
import Rewards from './pages/Rewards'
import Menu from './pages/Menu'
import Menus from './pages/Menus'
import Produccion from './pages/Produccion'
import Almacen from './pages/Almacen'
import Categorias from './pages/Categorias'
import Combos from './pages/Combos'
import Extras from './pages/Extras'
import Ventas from './pages/Ventas'
import Inventario from './pages/Inventario'
import Promos from './pages/Promos'
import Clientes from './pages/Clientes'
import Empleados from './pages/Empleados'
import Impresoras from './pages/Impresoras'
import Sistema from './pages/Sistema'

type Tab = 'dashboard' | 'envivo' | 'menus' | 'produccion' | 'almacen' | 'diagnostico' | 'menu' | 'categorias' | 'combos' | 'extras' | 'inventario' | 'promos' | 'ventas' | 'clientes' | 'metas' | 'rewards' | 'empleados' | 'impresoras' | 'sistema'

const w = 18

const IconDashboard = () => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="13" width="4" height="8" rx="1" /><rect x="10" y="8" width="4" height="13" rx="1" /><rect x="17" y="3" width="4" height="18" rx="1" />
  </svg>
)
const IconEnVivo = () => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    <path d="M16.24 7.76a6 6 0 0 1 0 8.49" /><path d="M7.76 16.24a6 6 0 0 1 0-8.49" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" /><path d="M4.93 19.07a10 10 0 0 1 0-14.14" />
  </svg>
)
const IconDiagnostico = () => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </svg>
)
const IconAlmacen = () => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9.5 12 4l9 5.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" /><rect x="8" y="13" width="8" height="8" rx="1" />
  </svg>
)
const IconProduccion = () => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="9" width="18" height="12" rx="3" /><path d="M7 9V6a5 5 0 0 1 10 0v3" /><line x1="7" y1="14" x2="17" y2="14" />
  </svg>
)
const IconMenus = () => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="6" width="20" height="12" rx="6" /><circle cx="16" cy="12" r="3" />
  </svg>
)
const IconMenu = () => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" /><line x1="7" y1="2" x2="7" y2="22" /><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Z" /><line x1="21" y1="15" x2="21" y2="22" />
  </svg>
)
const IconCategorias = () => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
    <circle cx="4" cy="6" r="1.2" /><circle cx="4" cy="12" r="1.2" /><circle cx="4" cy="18" r="1.2" />
  </svg>
)
const IconCombos = () => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
)
const IconExtras = () => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)
const IconInventario = () => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><line x1="12" y1="22" x2="12" y2="12" />
  </svg>
)
const IconPromos = () => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" /><circle cx="7" cy="7" r="1" fill="currentColor" stroke="none" />
  </svg>
)
const IconVentas = () => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
  </svg>
)
const IconClientes = () => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" /><circle cx="8.5" cy="10.5" r="2" /><path d="M5.5 16c.6-1.6 1.7-2.5 3-2.5s2.4.9 3 2.5" /><path d="M14.5 9.5H19M14.5 13h4.5M14.5 16.5H17" />
  </svg>
)
const IconEmpleados = () => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
)
const IconImpresoras = () => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" />
  </svg>
)
const IconSistema = () => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)

const IconRewards = () => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12" />
  </svg>
)

const IconMetas = () => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" />
  </svg>
)

/**
 * Lo que se ve en la barra lateral.
 *
 * Clientes, Rewards y Extras estan FUERA de esta lista a proposito: la
 * panaderia todavia no opera lealtad ni extras, y tres pantallas vacias en el
 * menu hacen que nadie encuentre las que si se usan. El codigo y sus rutas
 * siguen ahi: el dia que se quieran, se vuelven a poner en esta lista y ya
 * funcionan.
 */
const navItems: { id: Tab; label: string; Icon: () => ReactElement }[] = [
  { id: 'dashboard', label: 'Dashboard', Icon: IconDashboard },
  { id: 'envivo', label: 'En vivo', Icon: IconEnVivo },
  { id: 'produccion', label: 'Producción', Icon: IconProduccion },
  { id: 'almacen', label: 'Almacén', Icon: IconAlmacen },
  { id: 'menus', label: 'Menús del día', Icon: IconMenus },
  { id: 'diagnostico', label: 'Diagnóstico', Icon: IconDiagnostico },
  { id: 'menu', label: 'Menú', Icon: IconMenu },
  { id: 'categorias', label: 'Categorías', Icon: IconCategorias },
  { id: 'combos', label: 'Combos', Icon: IconCombos },
  { id: 'inventario', label: 'Inventario', Icon: IconInventario },
  { id: 'promos', label: 'Promos', Icon: IconPromos },
  { id: 'ventas', label: 'Ventas', Icon: IconVentas },
  { id: 'metas', label: 'Metas', Icon: IconMetas },
  { id: 'empleados', label: 'Empleados', Icon: IconEmpleados },
  { id: 'impresoras', label: 'Impresoras', Icon: IconImpresoras },
  { id: 'sistema', label: 'Sistema', Icon: IconSistema },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard')

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-sa-cream-paper">
      {/* Sidebar (barra superior en móvil, lateral en escritorio) */}
      <aside className="w-full md:w-60 shrink-0 bg-sa-green-deep text-sa-cream flex flex-col">
        <div className="px-5 md:px-6 pt-5 md:pt-7 pb-4 md:pb-6">
          <img src={logo} alt="Hojaldras Lily" className="w-[112px] md:w-[140px] h-auto select-none" draggable={false} />
        </div>
        <nav className="flex md:flex-col gap-1 px-3 pb-3 md:pb-0 md:flex-1 overflow-x-auto">
          {navItems.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`shrink-0 md:w-full flex items-center gap-2 md:gap-3 px-4 py-2.5 md:py-3 rounded-sa-lg text-sm whitespace-nowrap transition-colors ${
                tab === id
                  ? 'bg-sa-cream text-sa-green-ink font-semibold shadow-sa-sm'
                  : 'text-sa-cream/80 hover:text-sa-cream hover:bg-white/5 font-medium'
              }`}
            >
              <Icon />
              {label}
            </button>
          ))}
        </nav>
        <div className="hidden md:block px-4 py-4 border-t border-sa-cream/10">
          <p className="text-[11px] font-mono uppercase tracking-wider text-sa-cream/40 px-1">
            Hojaldras Lily · Admin
          </p>
        </div>
      </aside>

      {/* Contenido */}
      <main className="flex-1 min-w-0 p-4 md:p-8 pb-24 md:pb-8">
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'envivo' && <EnVivo />}
        {tab === 'diagnostico' && <Diagnostico />}
        {tab === 'metas' && <Metas />}
        {tab === 'rewards' && <Rewards />}
        {tab === 'produccion' && <Produccion />}
        {tab === 'almacen' && <Almacen />}
        {tab === 'menus' && <Menus />}
        {tab === 'menu' && <Menu />}
        {tab === 'categorias' && <Categorias />}
        {tab === 'combos' && <Combos />}
        {tab === 'extras' && <Extras />}
        {tab === 'ventas' && <Ventas />}
        {tab === 'inventario' && <Inventario />}
        {tab === 'promos' && <Promos />}
        {tab === 'clientes' && <Clientes />}
        {tab === 'empleados' && <Empleados />}
        {tab === 'impresoras' && <Impresoras />}
        {tab === 'sistema' && <Sistema />}
      </main>
    </div>
  )
}
