// El logotipo va sobre carmin pleno (barra lateral): version en negativo.
import logo from '@lily/brand/logo-negativo.png'
import { useEffect, useState, type ReactElement } from 'react'
import Dashboard from './pages/Dashboard'
import EnVivo from './pages/EnVivo'
import Diagnostico from './pages/Diagnostico'
import Menu from './pages/Menu'
import Menus from './pages/Menus'
import Produccion from './pages/Produccion'
import Almacen from './pages/Almacen'
import Categorias from './pages/Categorias'
import Combos from './pages/Combos'
import Ventas from './pages/Ventas'
import Inventario from './pages/Inventario'
import Empleados from './pages/Empleados'
import Impresoras from './pages/Impresoras'
import Sistema from './pages/Sistema'
import Cortes from './pages/Cortes'
import Facturacion from './pages/Facturacion'
import Descargas from './pages/Descargas'

type Tab = 'dashboard' | 'envivo' | 'menus' | 'produccion' | 'almacen' | 'diagnostico' | 'menu' | 'categorias' | 'combos' | 'inventario' | 'ventas' | 'cortes' | 'facturacion' | 'empleados' | 'impresoras' | 'descargas' | 'sistema'

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
const IconInventario = () => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><line x1="12" y1="22" x2="12" y2="12" />
  </svg>
)
const IconVentas = () => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
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
const IconCortes = () => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M6 12h.01M18 12h.01" />
  </svg>
)
const IconFacturacion = () => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 2h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" /><polyline points="14 2 14 8 20 8" /><path d="M9 13h6M9 17h6" />
  </svg>
)
const IconDescargas = () => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
  </svg>
)
const IconSistema = () => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)



/**
 * Lo que se ve en la barra lateral.
 *
 * Aqui ya no hay lealtad. Clientes, Rewards, Metas y Extras venian del motor
 * original —una heladeria con mancuernas, sellos y toppings— y esto es una
 * panaderia: se vende pan, no se acumulan puntos. Estaban escondidas del menu
 * "por si acaso", y una pantalla que nadie va a usar es codigo que hay que
 * mantener, migrar y revisar cada vez que se toca la base.
 *
 * El historial de git las guarda si algun dia hacen falta.
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
  { id: 'ventas', label: 'Ventas', Icon: IconVentas },
  { id: 'cortes', label: 'Cortes de caja', Icon: IconCortes },
  { id: 'facturacion', label: 'Facturación', Icon: IconFacturacion },
  { id: 'empleados', label: 'Empleados', Icon: IconEmpleados },
  { id: 'impresoras', label: 'Impresoras', Icon: IconImpresoras },
  { id: 'descargas', label: 'Descargas', Icon: IconDescargas },
  { id: 'sistema', label: 'Sistema', Icon: IconSistema },
]

const TABS = new Set<Tab>(navItems.map((n) => n.id))

/** La pestaña que pide la URL (`#impresoras`), si existe. */
function tabDeLaUrl(): Tab | null {
  const h = window.location.hash.replace(/^#/, '') as Tab
  return TABS.has(h) ? h : null
}

export default function App() {
  // La pestaña va también en el hash de la URL. Sirve para dos cosas: mandar
  // por WhatsApp «mira admin.hojaldraslily.com/#impresoras» y que abra ahí,
  // y para poder MIRAR cada pantalla en un arnés sin hacer clic en la barra.
  // Es un hash y no una ruta porque Admin no usa router y no lo necesita.
  const [tab, setTabEstado] = useState<Tab>(() => tabDeLaUrl() ?? 'dashboard')
  const setTab = (t: Tab) => {
    setTabEstado(t)
    window.history.replaceState(null, '', `#${t}`)
  }
  useEffect(() => {
    const alCambiar = () => { const t = tabDeLaUrl(); if (t) setTabEstado(t) }
    window.addEventListener('hashchange', alCambiar)
    return () => window.removeEventListener('hashchange', alCambiar)
  }, [])

  // En el teléfono la barra lateral no cabe, y la primera versión la
  // convertía en una tira horizontal con scroll: se veían TRES secciones de
  // catorce y nada decía que había más a la derecha. Impresoras, Empleados y
  // Sistema quedaban escondidas para quien no supiera deslizar. Ahora el
  // teléfono lleva una cabecera con la sección actual y un botón que abre la
  // lista completa — se ve todo y se toca lo que se busca.
  const [menuAbierto, setMenuAbierto] = useState(false)
  const actual = navItems.find((n) => n.id === tab)

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-sa-cream-paper">
      {/* Sidebar (cabecera con menú en el teléfono, lateral en tableta y PC) */}
      <aside className="w-full md:w-60 shrink-0 bg-sa-green-deep text-sa-cream flex flex-col md:sticky md:top-0 md:h-screen">
        <div className="flex items-center justify-between px-4 md:px-6 pt-4 md:pt-7 pb-3 md:pb-6">
          <img src={logo} alt="Hojaldras Lily" className="w-[96px] md:w-[140px] h-auto select-none" draggable={false} />
          <button
            type="button"
            onClick={() => setMenuAbierto((v) => !v)}
            aria-expanded={menuAbierto}
            className="md:hidden flex items-center gap-2 bg-sa-cream text-sa-green-ink font-semibold text-sm px-3.5 py-2 rounded-sa-lg shadow-sa-sm"
          >
            {actual && <actual.Icon />}
            <span>{actual?.label ?? 'Secciones'}</span>
            <span aria-hidden className="text-xs">{menuAbierto ? '▲' : '▼'}</span>
          </button>
        </div>
        <nav
          className={`${menuAbierto ? 'grid' : 'hidden'} md:flex grid-cols-2 gap-1 px-3 pb-3 md:pb-0 md:flex-col md:flex-1 md:overflow-y-auto`}
        >
          {navItems.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => { setTab(id); setMenuAbierto(false) }}
              className={`md:w-full flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2.5 md:py-3 rounded-sa-lg text-sm whitespace-nowrap transition-colors ${
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
        {tab === 'produccion' && <Produccion />}
        {tab === 'almacen' && <Almacen />}
        {tab === 'menus' && <Menus />}
        {tab === 'menu' && <Menu />}
        {tab === 'categorias' && <Categorias />}
        {tab === 'combos' && <Combos />}
        {tab === 'ventas' && <Ventas />}
        {tab === 'cortes' && <Cortes />}
        {tab === 'facturacion' && <Facturacion />}
        {tab === 'inventario' && <Inventario />}
        {tab === 'empleados' && <Empleados />}
        {tab === 'impresoras' && <Impresoras />}
        {tab === 'descargas' && <Descargas />}
        {tab === 'sistema' && <Sistema />}
      </main>
    </div>
  )
}
