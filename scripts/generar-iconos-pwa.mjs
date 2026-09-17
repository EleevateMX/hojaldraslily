// Genera los iconos de las apps instalables.
//
// Se generan y no se dibujan a mano por la razón de siempre: un PNG suelto en
// `public/` es un lugar más donde la identidad se desvía sola (CLAUDE.md
// §2.5). Los iconos que ya existían en `cliente-pwa` son la prueba -- traen la
// crema vieja (#F8EDD5) y el coral viejo (#C4463C), de antes de que la marca
// fuera carmín.
//
// Los colores se leen de `packages/brand/tokens.css`. El arte, de
// `packages/brand/assets/hojaldra.png`.
//
// POR QUÉ UN COLOR POR APP: en la PC de la tienda se instalan cuatro o cinco
// (Caja, Producción, Almacén, Admin, Kiosko). Con el mismo icono, la barra de
// tareas es una fila de hojaldras idénticas y hay que pasar el mouse por
// encima para saber cuál es cuál. Cada app lleva un acento -- uno por
// superficie, nunca varios, como manda la marca.
//
// El arte va SIEMPRE sobre crema, nunca sobre el acento pleno: la hojaldra
// tiene relleno carmín y sobre carmín se pierde contra su propio fondo (la
// misma razón por la que existe `logo-negativo.png`). El acento va en el aro.
//
//   node scripts/generar-iconos-pwa.mjs
//
// Necesita Python con Pillow, que es lo que hay en este entorno.

import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tokens = readFileSync(path.join(raiz, 'packages/brand/tokens.css'), 'utf8')

function color(token) {
  const m = new RegExp(`--${token}\\s*:\\s*(#[0-9a-fA-F]{6})`).exec(tokens)
  if (!m) throw new Error(`No encuentro el token --${token} en tokens.css`)
  return m[1]
}

// El acento de cada app. El nombre del token importa: si mañana cambia el
// valor en tokens.css, estos iconos se regeneran con el color nuevo.
// Se reparten por MATIZ, no por gusto: a 48 px lo unico que queda de un
// icono es su color, y dos carmines distintos (#D81B4A y #A8123A) se ven
// exactamente igual de chicos -- probado, no supuesto. Rojo, morado, oro,
// lila, cafe y verde si se distinguen de un golpe de vista.
//
// El carmin se lo queda el kiosko y Rewards: son las dos que ve el cliente,
// y ahi la marca manda sobre la comodidad del personal.
const APPS = [
  ['kiosko', 'sa-green'], // Autoservicio -- carmín, es la cara al cliente
  ['cliente-pwa', 'sa-green'], // Rewards -- también del cliente
  ['pos', 'sa-green-ink'], // Caja -- morado hojaldra
  ['produccion', 'sa-banana'], // Horno -- dorado horneado
  ['almacen', 'sa-blueberry'], // Almacén -- lila
  ['admin', 'sa-chocolate'], // Gerencia -- cacao
  ['cliente-display', 'sa-mint'], // TV de folios -- verde
  ['web', 'sa-green'],
]

const py = `
import sys
from PIL import Image, ImageDraw

arte_p, destino, crema, acento, lado, aro_pct, encoge = sys.argv[1:8]
lado = int(lado); aro = max(1, round(int(lado) * float(aro_pct))); encoge = float(encoge)

def rgb(h): h = h.lstrip('#'); return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

lienzo = Image.new('RGBA', (lado, lado), rgb(crema) + (255,))

# El arte, centrado y a la escala que pidan. \`encoge\` < 1 deja el margen que
# los iconos maskable necesitan: Android les recorta un circulo y lo que quede
# afuera se pierde.
arte = Image.open(arte_p).convert('RGBA')
caja = arte.getbbox()
if caja: arte = arte.crop(caja)
util = int(lado * encoge)
w, h = arte.size
esc = util / max(w, h)
arte = arte.resize((max(1, round(w * esc)), max(1, round(h * esc))), Image.LANCZOS)
lienzo.alpha_composite(arte, ((lado - arte.size[0]) // 2, (lado - arte.size[1]) // 2))

# El aro del acento: es lo que distingue una app de otra en la barra de tareas.
# Va por dentro del borde para que no se lo coma el recorte redondeado que
# Windows y Android le aplican al icono.
if aro_pct != '0':
    d = ImageDraw.Draw(lienzo)
    d.ellipse([aro // 2, aro // 2, lado - aro // 2 - 1, lado - aro // 2 - 1],
              outline=rgb(acento) + (255,), width=aro)

lienzo.save(destino)
`

const crema = color('sa-cream')
const arte = path.join(raiz, 'packages/brand/assets/hojaldra.png')
let hechos = 0

for (const [app, token] of APPS) {
  const dir = path.join(raiz, 'apps', app, 'public')
  if (!existsSync(dir)) {
    console.log(`  -- ${app}: no tiene public/, lo salto`)
    continue
  }
  const acento = color(token)

  // 192 y 512: el icono normal, a sangre. El aro se ve completo.
  // maskable: el arte encogido, sin aro, porque el aro cae justo donde
  // Android recorta -- un aro a medio comer se ve como un error, no como
  // identidad.
  // El aro va GRUESO (12 % del lado). Uno fino se ve elegante a 512 px y
  // desaparece a 48, que es el tamano al que de verdad se usa el icono.
  const piezas = [
    ['icono-192.png', 192, '0.12', 0.72],
    ['icono-512.png', 512, '0.12', 0.72],
    ['icono-maskable-512.png', 512, '0', 0.56],
  ]

  for (const [nombre, lado, aroPct, encoge] of piezas) {
    execFileSync('python3', [
      '-c', py, arte, path.join(dir, nombre), crema, acento, String(lado), aroPct, String(encoge),
    ])
    hechos++
  }
  console.log(`  ok  ${app.padEnd(16)} acento ${acento} (--${token})`)
}

console.log(`\n${hechos} iconos generados desde packages/brand.`)
