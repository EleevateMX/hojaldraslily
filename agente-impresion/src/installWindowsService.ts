/**
 * Instala este agente como Servicio de Windows (arranca solo con Windows,
 * antes de iniciar sesión, y se reinicia solo si truena).
 *
 * Requiere el paquete opcional `node-windows` (no se instala con
 * `pnpm install` normal por ser específico de Windows):
 *
 *   npm install node-windows
 *   npm run install-windows-service
 *
 * Alternativa sin dependencias extra: usar el Programador de tareas de
 * Windows apuntando a `node dist/index.js` con "Ejecutar al iniciar
 * sesión" — más simple de explicar por teléfono, documentado como
 * opción B en docs/instalacion-agente-impresion.md.
 */
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

async function main(): Promise<void> {
  if (process.platform !== 'win32') {
    console.error('Este instalador es solo para Windows. En Linux/Mac usa pm2, systemd o launchd (ver docs).')
    process.exit(1)
  }

  // Import dinámico: node-windows es un optionalDependency y puede no
  // estar instalado en equipos que no son Windows.
  const nodeWindows = await import('node-windows').catch(() => {
    console.error('Falta node-windows. Corre: npm install node-windows')
    process.exit(1)
  })
  if (!nodeWindows) return

  const __dirname = dirname(fileURLToPath(import.meta.url))
  const script = join(__dirname, '..', 'dist', 'index.js')

  const svc = new nodeWindows.Service({
    name: 'Hojaldras Lily Agente de Impresion',
    description: 'Reclama e imprime comandas de Hojaldras Lily en las impresoras térmicas de esta estación.',
    script,
    env: [{ name: 'NODE_ENV', value: 'production' }],
  })

  svc.on('install', () => {
    console.log('Servicio instalado. Se iniciará automáticamente con Windows.')
  })

  svc.install()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
