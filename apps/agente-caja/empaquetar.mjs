/**
 * Empaquetar el agente de tickets para la PC de la tienda.
 *
 * ## Por qué hace falta
 *
 * Este agente importa `@lily/ui/papel` — el MISMO módulo que pinta el ticket
 * en pantalla — y eso es a propósito: dos formateadores para un mismo papel
 * es cómo una vista previa empieza a mentir. Pero `@lily/ui` es un paquete
 * del monorepo (`workspace:*`), y un `npm install` en la PC de la tienda no
 * sabe de monorepos: no existe en el registro público y el agente no
 * arranca.
 *
 * El de etiquetas (`agente-impresion/`) no tiene este problema porque no
 * comparte una sola línea con las apps. Este sí, y no se va a dejar de
 * compartir para facilitar la instalación — se empaqueta.
 *
 * ## Qué sale
 *
 * `dist/` con tres cosas y nada más:
 *
 *   - `agente-caja.mjs`  — el agente con `@lily/ui` ADENTRO, un solo archivo
 *   - `package.json`     — solo las dos dependencias que se bajan de npm
 *   - `iniciar.bat`      — la ventana que se deja abierta
 *
 * `@supabase/supabase-js` y `dotenv` se dejan FUERA a propósito: son
 * dependencias normales de npm, pesan, y meterlas adentro obligaría a
 * reempaquetar para actualizar una llave o un parche de seguridad suyo. Lo
 * que se mete adentro es lo que no se puede bajar de ningún lado.
 *
 * No se versiona: `dist/` está en `.gitignore`, igual que los artefactos de
 * la vitrina. Se arma al publicar.
 */
import { build } from 'esbuild'
import { mkdir, writeFile, copyFile, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const dist = join(aqui, 'dist')

const paquete = JSON.parse(await readFile(join(aqui, 'package.json'), 'utf8'))

// Las que se quedan fuera del bundle. Si alguna más se agregara a
// `dependencies` sin pensarlo, esta lista la deja fuera y el agente revienta
// al arrancar con un «Cannot find module» — ruidoso, que es lo que se quiere.
const EXTERNOS = ['@supabase/supabase-js', 'dotenv']

await mkdir(dist, { recursive: true })

const salida = await build({
  entryPoints: [join(aqui, 'src/index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: join(dist, 'agente-caja.mjs'),
  external: EXTERNOS,
  // Sin minificar: si algo falla en la tienda, el rastro de pila tiene que
  // poder leerse por teléfono.
  minify: false,
  sourcemap: false,
  banner: {
    js: '// Hojaldras Lily — agente de tickets de caja. Generado por empaquetar.mjs.\n'
      + '// No editar a mano: se reescribe en cada publicación.',
  },
  metafile: true,
})

await writeFile(
  join(dist, 'package.json'),
  JSON.stringify(
    {
      name: 'agente-caja',
      version: paquete.version,
      private: true,
      type: 'module',
      engines: { node: '>=20' },
      scripts: { start: 'node agente-caja.mjs' },
      dependencies: Object.fromEntries(
        EXTERNOS.map((d) => [d, paquete.dependencies[d]]),
      ),
    },
    null,
    2,
  ) + '\n',
)

await copyFile(join(aqui, 'iniciar.bat'), join(dist, 'iniciar.bat'))
await copyFile(join(aqui, '.env.example'), join(dist, '.env.example'))
await copyFile(join(aqui, 'LEEME.txt'), join(dist, 'LEEME.txt'))

// Que el bundle de verdad se haya llevado `@lily/ui` adentro. Si el día de
// mañana alguien lo pone en `EXTERNOS` sin querer, el agente se instalaría
// «bien» en la tienda y fallaría al primer ticket — con un cliente enfrente.
const js = await readFile(join(dist, 'agente-caja.mjs'), 'utf8')
if (js.includes("from '@lily/ui") || js.includes('require("@lily/ui')) {
  console.error('ERROR: @lily/ui quedó FUERA del bundle. En la tienda no existe ese paquete.')
  process.exit(1)
}
if (!js.includes('COLUMNAS_80MM') && !js.includes('48')) {
  console.error('ERROR: el bundle no trae el armador del ticket.')
  process.exit(1)
}

const bytes = Object.values(salida.metafile.outputs)[0].bytes
console.log(`dist/agente-caja.mjs  ${(bytes / 1024).toFixed(1)} kB  (con @lily/ui adentro)`)
console.log('dist/package.json     solo ' + EXTERNOS.join(' y '))
console.log('Listo. Esto es lo que se copia a la PC de la tienda.')
