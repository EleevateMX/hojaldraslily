import { useEffect, useState } from 'react'
import { sb } from '../lib/sb'
import { listarImpresoras, type ImpresoraAdmin } from '@lily/supabase'
import { mensajeDeError } from '@lily/utils'
import { PageHeader, Loading, ErrorMsg, Panel, cx } from '../ui'

/**
 * Los instaladores de la PC de la tienda, servidos desde este mismo dominio.
 *
 * Los archivos NO están versionados aquí: `scripts/copiar-descargas.mjs` los
 * copia desde `scripts/` en cada build. Dos copias del mismo `.bat` en el
 * repo se separan en cuanto alguien toca una, y entonces Admin repartiría un
 * instalador viejo sin que nadie se entere.
 *
 * `version.json` sale del mismo copiado, así que dice la versión de los dos
 * agentes que trae ESTE despliegue — y comparada contra la que reportan las
 * impresoras en su latido, contesta la única pregunta que importa aquí:
 * ¿la PC de la tienda está al día o hay que ir a instalarle algo?
 *
 * (Portado de la tienda hermana; aquí la lista es la de Lily: dos agentes
 * —etiquetas y tickets— y la caja como pantalla principal.)
 */

interface Descarga {
  archivo: string
  titulo: string
  cuando: string
  detalle: string
  principal?: boolean
}

const DESCARGAS: Descarga[] = [
  {
    archivo: 'instalar-todo.bat',
    titulo: 'Instalar todo',
    cuando: 'Una vez por computadora nueva',
    detalle:
      'Deja los dos agentes de impresión (etiquetas y tickets), los accesos directos y el ' +
      'arranque automático. Es lo único que hay que bajar: los demás archivos los descarga él solo. ' +
      'Pide el código de instalación que se genera en Impresoras → «Conectar la PC de la tienda», ' +
      'y Windows va a pedir permiso de administrador una vez.',
    principal: true,
  },
  {
    archivo: 'instalar-agente-impresion.bat',
    titulo: 'Solo los agentes de impresión',
    cuando: 'Si la PC ya está armada y solo falta actualizar o reconectar un agente',
    detalle:
      'Normalmente no hace falta: los agentes se actualizan solos al abrir la tienda. ' +
      'Esto sirve para forzarlo hoy sin esperar a mañana, o para conectar una impresora nueva ' +
      'con un código de instalación.',
  },
  {
    archivo: 'abrir-hojaldraslily.bat',
    titulo: 'Abrir la tienda',
    cuando: 'Si alguien borró el acceso directo del escritorio',
    detalle:
      'Espera internet, arranca los agentes, abre la caja en el monitor principal y las ' +
      'estaciones (producción, horno, empaque) en los demás, y al final busca actualización. ' +
      'Es el que corre solo al prender.',
  },
  {
    archivo: 'abrir-caja-y-admin.bat',
    titulo: 'Abrir Caja y Admin',
    cuando: 'Cuando se necesitan esas dos ventanas en otra computadora',
    detalle:
      'La caja con la impresión silenciosa activada (sin el diálogo de Chrome en cada cobro) ' +
      'y Admin al lado. En la PC de la tienda la caja ya abre sola con el arranque.',
  },
]

interface Publicada {
  agente: string | null
  agente_caja: string | null
}

/** "1.2.0" → [1,2,0], para comparar sin sorpresas de orden alfabético. */
function versionA(v: string | null | undefined): number[] {
  return (v ?? '0').split('.').map((n) => parseInt(n, 10) || 0)
}
export function estaAlDia(instalada: string | null | undefined, publicada: string): boolean {
  const a = versionA(instalada)
  const b = versionA(publicada)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0)
  }
  return true
}

export default function Descargas() {
  const [impresoras, setImpresoras] = useState<ImpresoraAdmin[] | null>(null)
  const [publicada, setPublicada] = useState<Publicada>({ agente: null, agente_caja: null })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listarImpresoras(sb)
      .then((l) => setImpresoras(l.filter((i) => i.activa)))
      .catch((e) => setError(mensajeDeError(e)))
    // Mismo origen: es el archivo que dejó el build de esta misma app.
    fetch('/descargas/version.json', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j: Partial<Publicada>) => setPublicada({ agente: j.agente ?? null, agente_caja: j.agente_caja ?? null }))
      .catch(() => setPublicada({ agente: null, agente_caja: null }))
  }, [])

  return (
    <div>
      <PageHeader
        title="Descargas"
        subtitle="Los instaladores de la PC de la tienda, siempre en su última versión"
      />

      {error && <ErrorMsg>{error}</ErrorMsg>}

      <div className="space-y-6">
        <Panel title="¿La PC está al día?">
          {!impresoras && !error && <Loading>Consultando…</Loading>}
          {impresoras?.length === 0 && (
            <p className={cx.muted}>No hay impresoras activas configuradas.</p>
          )}
          <div className="space-y-3">
            {impresoras?.map((i) => {
              // La térmica de tickets la atiende OTRO programa con su propia
              // versión: compararla contra la de etiquetas siempre diría «falta».
              const esCaja = i.rol === 'tickets'
              const meta = esCaja ? publicada.agente_caja : publicada.agente
              const alDia = meta ? estaAlDia(i.agente_version, meta) : true
              return (
                <div
                  key={i.id}
                  className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-sa px-4 py-3 border border-sa-green-ink/10"
                >
                  <div>
                    <p className="font-medium text-sa-green-ink">{i.nombre}</p>
                    <p className="font-mono text-xs text-sa-green-ink/55 mt-0.5">
                      {i.conectada ? 'reportándose' : 'sin señal — el agente no está corriendo'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-sa-green-ink/60">
                      {esCaja ? 'agente de caja' : 'agente de etiquetas'} {i.agente_version ?? '—'}
                    </span>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        alDia ? 'bg-sa-mint/30 text-sa-green-ink' : 'bg-sa-banana/40 text-sa-green-ink'
                      }`}
                    >
                      {alDia ? 'Al día' : `Falta ${meta}`}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-sa-green-ink/60 mt-4 leading-relaxed">
            Este despliegue trae el agente de etiquetas <strong>{publicada.agente ?? '—'}</strong> y
            el de tickets <strong>{publicada.agente_caja ?? '—'}</strong>.
            Los agentes <strong>se actualizan solos</strong> al abrir la tienda al día
            siguiente, así que casi nunca hay que bajar nada. Si dice “falta” y no
            se puede esperar, baja <em>Solo los agentes de impresión</em> y córrelo en esa PC.
          </p>
        </Panel>

        {DESCARGAS.map((d) => (
          <Panel key={d.archivo}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className={`${d.principal ? 'text-xl' : 'text-lg'} font-medium text-sa-green-ink`}>
                  {d.titulo}
                </p>
                <p className="font-mono text-[11px] uppercase tracking-wide text-sa-green-ink/50 mt-1">
                  {d.cuando}
                </p>
                <p className="text-sm text-sa-green-ink/70 mt-2 leading-relaxed">{d.detalle}</p>
                <p className="font-mono text-xs text-sa-green-ink/40 mt-2">{d.archivo}</p>
              </div>
              {/* Descarga directa del mismo dominio: `download` fuerza el
                  guardado y el _headers pone Content-Disposition, así ningún
                  navegador se pone a mostrar el .bat como texto. */}
              <a
                href={`/descargas/${d.archivo}`}
                download={d.archivo}
                className={
                  d.principal
                    ? 'shrink-0 bg-sa-green text-sa-cream px-6 py-3 rounded-full font-medium hover:bg-sa-green-deep transition-colors'
                    : 'shrink-0 border border-sa-green-ink/20 text-sa-green-ink px-5 py-2.5 rounded-full text-sm hover:border-sa-green transition-colors'
                }
              >
                Descargar
              </a>
            </div>
          </Panel>
        ))}

        <Panel title="El único permiso que debe pedirte">
          <p className="text-sm text-sa-green-ink/75 leading-relaxed">
            <strong className="text-sa-green-ink">El de administrador, una sola
            vez</strong>, y solo el instalador. Nada más.
          </p>
          <p className="text-sm text-sa-green-ink/75 mt-3 leading-relaxed">
            Si alguna vez viste <em>“no se puede cargar el archivo… la ejecución
            de scripts está deshabilitada en este sistema”</em>, era por bajar un
            archivo <code className="font-mono text-xs">.ps1</code>. Ya no se
            reparte ninguno: aquí todo es <code className="font-mono text-xs">.bat</code>,
            y cada uno corre lo que necesita con permiso solo para esa vez.
            <strong className="text-sa-green-ink"> No hay que cambiarle ninguna
            política de seguridad a la computadora</strong> — eso sí sería
            bajarle la guardia.
          </p>
          <p className="text-sm text-sa-green-ink/75 mt-4 leading-relaxed">
            Lo que sí puede salir la primera vez, porque Windows avisa de todo lo
            que viene de internet:
          </p>
          <ol className="text-sm text-sa-green-ink/75 mt-2 space-y-1.5 list-decimal pl-5 leading-relaxed">
            <li>Pantalla azul <strong>“Windows protegió tu PC”</strong> →
              <strong> Más información → Ejecutar de todas formas</strong>.</li>
            <li>Chrome dice que el archivo <strong>no es común</strong> →
              <strong> Conservar</strong>.</li>
          </ol>
          <p className="text-xs text-sa-green-ink/55 mt-4 leading-relaxed">
            Los dos avisos son de la <strong>primera</strong> vez: cada archivo se
            quita solo la marca de “venido de internet” al arrancar, así que a
            partir de ahí abre limpio. Y siempre se baja de este mismo dominio,
            en la versión del último despliegue — no hay copias viejas dando
            vueltas.
          </p>
        </Panel>
      </div>
    </div>
  )
}
