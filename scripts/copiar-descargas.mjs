#!/usr/bin/env node
/**
 * Copia los instaladores de Windows a `apps/admin/public/descargas/`, para
 * que Admin los sirva desde su propio dominio.
 *
 * Se COPIAN en cada build en vez de tener una segunda copia versionada: dos
 * copias de un `.bat` en el repo se separan en cuanto alguien toca una, y
 * entonces Admin reparte un instalador viejo sin que nadie se entere. La
 * carpeta destino está en .gitignore justo por eso.
 *
 * Servirlos desde admin.hojaldraslily.com y no mandar a la gente a GitHub
 * tiene dos razones: no hay que explicar cómo se baja un archivo crudo de
 * GitHub, y la tienda ya confía en ese dominio.
 *
 * SOLO `.bat`, nunca un `.ps1`. Un `.ps1` bajado del navegador no se puede
 * abrir de doble clic: Windows lo marca como venido de internet y PowerShell
 * contesta «la ejecución de scripts está deshabilitada en este sistema», que
 * suena a PC rota cuando es la política de siempre. Un `.bat` corre el script
 * con permiso solo para ESA ejecución.
 *
 * (Portado del script de la tienda hermana; aquí la lista es la de Lily.)
 */
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const DESTINO = join(RAIZ, 'apps/admin/public/descargas')

const ARCHIVOS = [
  'instalar-todo.bat',
  'abrir-hojaldraslily.bat',
  'abrir-caja-y-admin.bat',
  'instalar-agente-impresion.bat',
]

// Se borra antes de copiar: un archivo que se retira de la lista no se puede
// quedar servido para siempre.
rmSync(DESTINO, { recursive: true, force: true })
mkdirSync(DESTINO, { recursive: true })
for (const nombre of ARCHIVOS) {
  copyFileSync(join(RAIZ, 'scripts', nombre), join(DESTINO, nombre))
}

// Las versiones de los dos agentes, para que Admin pueda decir si la PC
// está al día comparándolas con lo que reportan las impresoras en su latido.
const agente = JSON.parse(readFileSync(join(RAIZ, 'agente-impresion/package.json'), 'utf8'))
const agenteCaja = JSON.parse(readFileSync(join(RAIZ, 'apps/agente-caja/package.json'), 'utf8'))
writeFileSync(
  join(DESTINO, 'version.json'),
  JSON.stringify({ agente: agente.version, agente_caja: agenteCaja.version, archivos: ARCHIVOS }, null, 2) + '\n',
)
console.log(`descargas: ${ARCHIVOS.length} archivos · agente ${agente.version} · agente-caja ${agenteCaja.version}`)
