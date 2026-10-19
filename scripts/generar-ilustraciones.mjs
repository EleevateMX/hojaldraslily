#!/usr/bin/env node
/**
 * Las ilustraciones de los productos que no tenían, en el mismo estilo plano
 * de las que ya había (`fiesta.png`, `cafe-de-olla.png`): formas redondeadas
 * sin contorno, dos o tres tonos por pieza, un brillo blanco y una sombra
 * suave abajo. 256 × 256, fondo transparente.
 *
 *     node scripts/generar-ilustraciones.mjs            # escribe en los 8 public/productos
 *     node scripts/generar-ilustraciones.mjs --solo pan-de-muerto
 *
 * Se dibujan como SVG aquí mismo y se rasterizan con el Chromium de
 * Playwright, en vez de pedirlas a un servicio: así cualquiera puede retocar
 * un color o una forma y volver a correr esto, y las 20 salen del mismo
 * molde. (Y porque desde este contenedor no hay cómo subir ni bajar imágenes
 * de un servicio externo.)
 *
 * Playwright no vive en el repo; se toma de PLAYWRIGHT_MOD si está puesto
 * (p. ej. `/opt/node22/lib/node_modules/playwright/index.mjs`).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const APPS = ['pos', 'kiosko', 'admin', 'produccion', 'horno', 'empaque', 'cliente-display', 'web']

// ── Paleta de la repisa ────────────────────────────────────────────────────
const C = {
  masa: '#F2D3A0', masa2: '#E8C285', masa3: '#D9A96A', corteza: '#C98B4E', corteza2: '#B5753C',
  dorado: '#E0A55C', crema: '#FFF6DF', blanco: '#FFFFFF',
  guayaba: '#D94C5E', guayaba2: '#C23A4F', queso: '#F2C94C', queso2: '#E3B23A',
  philly: '#FFF3E0', bola: '#F2C94C', cera: '#C8384D', verde: '#7FA85A',
  nutella: '#5C3A25', nutella2: '#4A2C1A', canela: '#A9633A', lomo: '#B86B4B',
  azucar: '#FFF9EE', sombra: '#000000',
}

// ── Piezas reutilizables ───────────────────────────────────────────────────
const sombra = (cx = 128, cy = 214, rx = 70, ry = 12) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#sombra)"/>`
const brillo = (x, y, r = 4) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${C.blanco}" opacity=".9"/>`
const defs = `<defs>
  <radialGradient id="sombra"><stop offset="0" stop-color="${C.sombra}" stop-opacity=".22"/><stop offset="1" stop-color="${C.sombra}" stop-opacity="0"/></radialGradient>
</defs>`

/** La hojaldra de la casa: tres capas apiladas, como `fiesta.png`. */
function hojaldra(topping, { x = 48, y = 56, w = 160, h = 120 } = {}) {
  const capa = (dy, color) => `<rect x="${x}" y="${y + dy}" width="${w}" height="${h}" rx="14" fill="${color}"/>`
  return `${sombra()}
    ${capa(26, C.corteza)}${capa(14, C.masa3)}${capa(0, C.masa)}
    ${brillo(x + 28, y + 16)}${brillo(x + w - 30, y + 18, 3)}
    ${topping}
    <rect x="${x + 22}" y="${y + h - 30}" width="${w - 44}" height="5" rx="2.5" fill="${C.masa3}"/>
    <rect x="${x + 22}" y="${y + h - 18}" width="${w - 44}" height="5" rx="2.5" fill="${C.masa3}"/>`
}

/** Un bollo redondo con su brillo. */
function bollo(cx, cy, r, color = C.masa2, color2 = C.corteza) {
  return `<ellipse cx="${cx}" cy="${cy + r * 0.22}" rx="${r}" ry="${r * 0.86}" fill="${color2}"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${r * 0.86}" fill="${color}"/>
    ${brillo(cx - r * 0.42, cy - r * 0.42, r * 0.11)}`
}

/** Una rosca: un aro con su hueco. */
function rosca(cx, cy, R, r, color = C.masa2, color2 = C.corteza) {
  const aro = (dy, c) =>
    `<path d="M${cx - R},${cy + dy} a${R},${R * 0.78} 0 1,0 ${2 * R},0 a${R},${R * 0.78} 0 1,0 ${-2 * R},0 M${cx - r},${cy + dy} a${r},${r * 0.7} 0 1,1 ${2 * r},0 a${r},${r * 0.7} 0 1,1 ${-2 * r},0" fill="${c}" fill-rule="evenodd"/>`
  return `${aro(16, color2)}${aro(0, color)}${brillo(cx - R * 0.55, cy - R * 0.45, 5)}`
}

/** Motas (ajonjolí, anís, azúcar). */
function motas(puntos, color, r = 2.6) {
  return puntos.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}"/>`).join('')
}

/** Un pastelito: cuadrito de hojaldre con un relleno asomando. */
function pastelito(x, y, relleno) {
  return `<rect x="${x}" y="${y + 10}" width="72" height="52" rx="10" fill="${C.corteza}"/>
    <rect x="${x}" y="${y}" width="72" height="52" rx="10" fill="${C.masa}"/>
    <rect x="${x + 14}" y="${y + 20}" width="44" height="12" rx="6" fill="${relleno}"/>
    ${brillo(x + 14, y + 10, 3)}`
}

// ── Las 20 ilustraciones ───────────────────────────────────────────────────
const ILUSTRACIONES = {
  // Anís
  'bola-francesa': `${sombra(128, 210, 66)}${bollo(128, 128, 68, C.masa2, C.corteza)}
    <path d="M100,110 q28,-10 56,0" stroke="${C.corteza}" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M100,146 q28,-10 56,0" stroke="${C.corteza}" stroke-width="5" fill="none" stroke-linecap="round"/>
    ${motas([[90, 128], [112, 92], [150, 96], [170, 130], [128, 160]], C.corteza2, 2.2)}`,
  'bolitas-de-anis': `${sombra(128, 212, 80)}
    ${bollo(80, 150, 36)}${bollo(176, 150, 36)}${bollo(128, 104, 38)}
    ${motas([[70, 140], [92, 160], [166, 140], [188, 160], [118, 94], [140, 112]], C.corteza2, 2.2)}`,
  'rosca-de-anis': `${sombra(128, 212, 78)}${rosca(128, 124, 80, 28)}
    ${motas([[70, 100], [96, 70], [160, 72], [186, 104], [182, 150], [76, 150], [128, 182]], C.corteza2, 2.4)}`,

  // Bocadillos
  'bolitas-de-queso-philadelphia': `${sombra(128, 212, 80)}
    ${bollo(80, 150, 36, C.masa, C.masa3)}${bollo(176, 150, 36, C.masa, C.masa3)}${bollo(128, 104, 38, C.masa, C.masa3)}
    <circle cx="80" cy="150" r="12" fill="${C.philly}"/><circle cx="176" cy="150" r="12" fill="${C.philly}"/><circle cx="128" cy="104" r="12" fill="${C.philly}"/>`,
  'pastelitos-de-jamon-y-queso': `${sombra(128, 214, 82)}
    ${pastelito(52, 118, C.guayaba)}${pastelito(132, 118, C.queso)}${pastelito(92, 60, C.guayaba)}
    <rect x="106" y="80" width="44" height="12" rx="6" fill="${C.queso}" opacity=".9"/>`,
  'pastelitos-de-lomo': `${sombra(128, 214, 82)}
    ${pastelito(52, 118, C.lomo)}${pastelito(132, 118, C.lomo)}${pastelito(92, 60, C.lomo)}`,
  'pastelitos-solo-queso': `${sombra(128, 214, 82)}
    ${pastelito(52, 118, C.queso)}${pastelito(132, 118, C.queso)}${pastelito(92, 60, C.queso)}`,

  // Galletas
  'galletas-de-manteca-dulces': `${sombra(128, 212, 78)}
    ${bollo(92, 140, 46, C.masa, C.masa3)}${bollo(164, 128, 46, C.masa, C.masa3)}
    ${motas([[76, 128], [100, 150], [92, 120], [150, 118], [172, 140], [160, 146], [182, 116]], C.azucar, 3)}`,
  'galletas-de-manteca-saladas': `${sombra(128, 212, 78)}
    ${bollo(92, 140, 46, C.masa2, C.corteza)}${bollo(164, 128, 46, C.masa2, C.corteza)}
    <path d="M74,134 h36 M74,146 h36 M146,122 h36 M146,134 h36" stroke="${C.corteza}" stroke-width="3" stroke-linecap="round"/>`,
  'hojaldritas': `${sombra(128, 214, 84)}
    <g transform="translate(40,96) scale(.42)">${hojaldra('')}</g>
    <g transform="translate(118,96) scale(.42)">${hojaldra('')}</g>
    <g transform="translate(79,44) scale(.42)">${hojaldra('')}</g>
    ${motas([[72, 150], [108, 128], [150, 150], [186, 130], [128, 76]], C.azucar, 3)}`,

  // Temporada
  'pan-de-muerto': `${sombra(128, 212, 72)}${bollo(128, 134, 72, C.masa2, C.corteza)}
    <path d="M70,134 q58,-22 116,0" stroke="${C.masa3}" stroke-width="16" fill="none" stroke-linecap="round"/>
    <path d="M128,76 q-22,58 0,116" stroke="${C.masa3}" stroke-width="16" fill="none" stroke-linecap="round"/>
    ${motas([[70, 134], [186, 134], [128, 76], [128, 192]], C.masa3, 10)}
    <circle cx="128" cy="134" r="16" fill="${C.masa3}"/>${brillo(122, 128, 3)}
    ${motas([[96, 108], [160, 108], [96, 160], [160, 160], [128, 100]], C.azucar, 3)}`,

  // Panes
  // Pálido pero no crema: el crema se perdía contra el fondo de las tarjetas.
  'pan-de-leche': `${sombra(128, 212, 80)}
    <ellipse cx="96" cy="142" rx="54" ry="38" fill="${C.masa3}"/><ellipse cx="96" cy="130" rx="54" ry="38" fill="#F7E3BF"/>
    <ellipse cx="164" cy="130" rx="54" ry="38" fill="${C.masa3}"/><ellipse cx="164" cy="118" rx="54" ry="38" fill="${C.masa}"/>
    <path d="M70,124 q26,-10 52,0" stroke="${C.masa3}" stroke-width="4" fill="none" stroke-linecap="round" opacity=".7"/>
    <path d="M138,112 q26,-10 52,0" stroke="${C.masa3}" stroke-width="4" fill="none" stroke-linecap="round" opacity=".7"/>
    ${brillo(72, 112)}${brillo(140, 100)}`,
  'pata-de-canela': `${sombra(128, 212, 84)}
    <path d="M44,150 q0,-60 84,-60 q84,0 84,60 q0,30 -84,30 q-84,0 -84,-30z" fill="${C.corteza}" transform="translate(0,12)"/>
    <path d="M44,150 q0,-60 84,-60 q84,0 84,60 q0,30 -84,30 q-84,0 -84,-30z" fill="${C.masa2}"/>
    <path d="M78,96 v34 M112,90 v40 M146,90 v40 M180,96 v34" stroke="${C.corteza}" stroke-width="6" stroke-linecap="round"/>
    <path d="M60,150 q34,-14 68,0 q34,14 68,0" stroke="${C.canela}" stroke-width="6" fill="none" stroke-linecap="round"/>
    ${brillo(70, 118)}`,
  'pata-de-queso-de-bola': `${sombra(128, 212, 84)}
    <path d="M44,150 q0,-60 84,-60 q84,0 84,60 q0,30 -84,30 q-84,0 -84,-30z" fill="${C.corteza}" transform="translate(0,12)"/>
    <path d="M44,150 q0,-60 84,-60 q84,0 84,60 q0,30 -84,30 q-84,0 -84,-30z" fill="${C.masa2}"/>
    <path d="M78,96 v34 M112,90 v40 M146,90 v40 M180,96 v34" stroke="${C.corteza}" stroke-width="6" stroke-linecap="round"/>
    ${motas([[72, 150], [104, 156], [136, 150], [168, 156]], C.bola, 7)}${motas([[88, 162], [152, 164]], C.cera, 4)}
    ${brillo(70, 118)}`,
  'rosca-de-queso-de-bola': `${sombra(128, 212, 78)}${rosca(128, 124, 80, 28)}
    ${motas([[72, 112], [104, 70], [152, 70], [184, 112], [176, 156], [80, 156], [128, 184]], C.bola, 7)}
    ${motas([[88, 90], [168, 90], [128, 170]], C.cera, 4)}`,
  'rosca-de-queso-philadelphia': `${sombra(128, 212, 78)}${rosca(128, 124, 80, 28)}
    <path d="M60,124 q34,-60 68,0 q34,60 68,0" stroke="${C.philly}" stroke-width="12" fill="none" stroke-linecap="round"/>`,
  'trenza-suiza': `${sombra(128, 214, 90)}
    <rect x="34" y="112" width="188" height="56" rx="28" fill="${C.corteza}"/>
    <rect x="34" y="100" width="188" height="56" rx="28" fill="${C.masa2}"/>
    <path d="M60,128 q18,-22 36,0 q18,22 36,0 q18,-22 36,0 q18,22 36,0" stroke="${C.corteza}" stroke-width="7" fill="none" stroke-linecap="round"/>
    <path d="M60,128 q18,22 36,0 q18,-22 36,0 q18,22 36,0 q18,-22 36,0" stroke="${C.dorado}" stroke-width="7" fill="none" stroke-linecap="round"/>
    ${motas([[70, 112], [128, 112], [186, 112]], C.azucar, 3)}`,
  'tuti-de-queso-de-bola': `${sombra(128, 212, 70)}
    <circle cx="128" cy="142" r="70" fill="${C.corteza}"/><circle cx="128" cy="128" r="70" fill="${C.masa2}"/>
    <path d="M128,128 m-50,0 a50,50 0 1,1 100,0 a36,36 0 1,1 -72,0 a22,22 0 1,1 44,0 a8,8 0 1,1 -16,0" stroke="${C.corteza}" stroke-width="7" fill="none" stroke-linecap="round"/>
    ${motas([[92, 108], [168, 110], [150, 160], [100, 156]], C.bola, 7)}${motas([[128, 86]], C.cera, 4)}
    ${brillo(96, 94)}`,
  'tuti-de-nutella': `${sombra(128, 212, 70)}
    <circle cx="128" cy="142" r="70" fill="${C.corteza}"/><circle cx="128" cy="128" r="70" fill="${C.masa2}"/>
    <path d="M128,128 m-50,0 a50,50 0 1,1 100,0 a36,36 0 1,1 -72,0 a22,22 0 1,1 44,0 a8,8 0 1,1 -16,0" stroke="${C.nutella}" stroke-width="9" fill="none" stroke-linecap="round"/>
    ${brillo(96, 94)}`,

  // Por encargo
  'hojaldra-de-corazon': `${sombra(128, 216, 76)}
    <path d="M128,206 C70,164 44,134 44,98 a40,40 0 0,1 84,-18 a40,40 0 0,1 84,18 c0,36 -26,66 -84,108z" fill="${C.corteza}" transform="translate(0,14)"/>
    <path d="M128,206 C70,164 44,134 44,98 a40,40 0 0,1 84,-18 a40,40 0 0,1 84,18 c0,36 -26,66 -84,108z" fill="${C.masa}"/>
    <ellipse cx="112" cy="112" rx="26" ry="18" fill="${C.guayaba}"/><ellipse cx="146" cy="120" rx="22" ry="16" fill="${C.queso}"/>
    <ellipse cx="128" cy="140" rx="16" ry="11" fill="${C.verde}"/>
    ${brillo(78, 88)}${brillo(176, 92, 3)}`,
}

// ── Rasterizar ─────────────────────────────────────────────────────────────
const solo = process.argv.includes('--solo') ? process.argv[process.argv.indexOf('--solo') + 1] : null
const { chromium } = await import(process.env.PLAYWRIGHT_MOD ?? 'playwright')
const navegador = await chromium.launch({ executablePath: process.env.CHROMIUM ?? undefined })
const pagina = await navegador.newPage({ viewport: { width: 256, height: 256 }, deviceScaleFactor: 1 })

const salida = join(RAIZ, 'scripts', 'ilustraciones')
mkdirSync(salida, { recursive: true })
let n = 0
for (const [nombre, cuerpo] of Object.entries(ILUSTRACIONES)) {
  if (solo && nombre !== solo) continue
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">${defs}${cuerpo}</svg>`
  writeFileSync(join(salida, `${nombre}.svg`), svg)
  await pagina.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`)
  const png = await pagina.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: 256, height: 256 } })
  for (const app of APPS) {
    const dir = join(RAIZ, 'apps', app, 'public', 'productos')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `${nombre}.png`), png)
  }
  n++
}
await navegador.close()
console.log(`ilustraciones: ${n} dibujos → ${APPS.length} apps (y el SVG fuente en scripts/ilustraciones/)`)
