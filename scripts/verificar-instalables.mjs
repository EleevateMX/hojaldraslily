// Comprueba que cada app se puede INSTALAR de verdad.
//
// No de palabra: le pregunta a Chromium con `Page.getInstallabilityErrors`,
// que es el mismo criterio con el que Chrome decide si ofrece "Instalar".
// Un manifest que se ve bien y un service worker que existe no bastan -- la
// primera vez que se probo asi salieron dos fallas que a ojo no se veian.
//
//   pnpm -r build
//   node scripts/verificar-instalables.mjs
//
// Necesita `playwright` y el Chromium del entorno. No es dependencia del
// repo a proposito: es una herramienta de verificacion, no algo que corra en
// cada build. Si no esta, se instala aparte:
//
//   npm i playwright --prefix /tmp/pw && NODE_PATH=/tmp/pw/node_modules node scripts/verificar-instalables.mjs

import { chromium } from 'playwright'
import http from 'node:http'
import { readFile, stat, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const TIPOS = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
}

/** Un servidor de archivos, lo mas tonto posible: solo sirve el `dist/`. */
function servir(dir, puerto) {
  const srv = http.createServer(async (req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0])
    if (p.endsWith('/')) p += 'index.html'
    const f = path.join(dir, p)
    try {
      if (!(await stat(f)).isFile()) throw new Error('no es archivo')
      res.writeHead(200, { 'content-type': TIPOS[path.extname(f)] ?? 'application/octet-stream' })
      res.end(await readFile(f))
    } catch {
      res.writeHead(404).end('no')
    }
  })
  return new Promise((r) => srv.listen(puerto, () => r(srv)))
}

async function revisar(app, puerto, chrome) {
  const dir = path.join(RAIZ, 'apps', app, 'dist')
  const srv = await servir(dir, puerto)

  // Perfil PERSISTENTE, no incognito: Chrome se niega a instalar en incognito
  // y reporta `in-incognito`, que tapa cualquier otro problema real.
  const nav = await chromium.launchPersistentContext(`/tmp/perfil-instalable-${app}`, {
    executablePath: chrome,
  })
  try {
    const pag = await nav.newPage()
    const cdp = await nav.newCDPSession(pag)
    await pag.goto(`http://localhost:${puerto}/`, { waitUntil: 'load' })
    await pag
      .waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 })
      .catch(() => {})
    const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors')
    const manifest = await pag.evaluate(async () => {
      const l = document.querySelector('link[rel=manifest]')
      if (!l) return null
      const m = await (await fetch(l.href)).json()
      return { corto: m.short_name, color: m.theme_color, iconos: (m.icons ?? []).length }
    })
    return { app, manifest, errores: installabilityErrors }
  } finally {
    await nav.close()
    srv.close()
  }
}

// El Chromium que trae el entorno. Se busca en vez de fijarlo porque la
// version va en el nombre de la carpeta y cambia sola.
async function buscarChrome() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
  if (existsSync(path.join(base, 'chromium'))) return path.join(base, 'chromium')
  for (const d of await readdir(base)) {
    const c = path.join(base, d, 'chrome-linux', 'chrome')
    if (d.startsWith('chromium') && existsSync(c)) return c
  }
  throw new Error(`No encuentro Chromium en ${base}`)
}

// Las que DEBEN ser instalables. Va escrita y no deducida de los `dist/` que
// existan, porque en apps/ hay tres que a proposito no lo son y un barrido
// las contaba como fallas:
//   - `costos` es HTML plano, sin empaquetador;
//   - `cocina-alimentos` y `cocina-bebidas` son las pantallas de comandas que
//     el giro de panaderia retiro (aqui se despacha por encargo).
// Si se agrega una app instalable, se agrega aqui: que una app nueva se
// olvide es justo lo que este guion tiene que gritar.
const APPS = [
  'pos',
  'kiosko',
  'admin',
  'produccion',
  'horno',
  'empaque',
  'cliente-display',
  'cliente-pwa',
  'web',
]

const apps = APPS.filter((a) => {
  if (existsSync(path.join(RAIZ, 'apps', a, 'dist/index.html'))) return true
  console.log(`SIN BUILD   ${a}`)
  return false
})

if (apps.length !== APPS.length) {
  console.error('\nFalta compilar. Corre `pnpm -r build` primero.')
  process.exit(1)
}

const chrome = await buscarChrome()
let puerto = 4700
let malas = 0

for (const app of apps) {
  const r = await revisar(app, puerto++, chrome)
  const ok = r.errores.length === 0 && r.manifest !== null
  if (!ok) malas++
  console.log(
    `${ok ? 'INSTALABLE' : 'NO INSTALA'}  ${app.padEnd(16)} ` +
      (r.manifest ? `"${r.manifest.corto}" ${r.manifest.color} ${r.manifest.iconos} iconos` : 'SIN MANIFEST') +
      (ok ? '' : `  ${JSON.stringify(r.errores)}`),
  )
}

console.log(`\n${apps.length - malas} de ${apps.length} apps instalables.`)
process.exit(malas === 0 ? 0 : 1)
