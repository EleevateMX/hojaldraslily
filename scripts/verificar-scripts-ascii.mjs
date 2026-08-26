#!/usr/bin/env node
/**
 * Los scripts de Windows tienen que ser ASCII puro.
 *
 * Windows PowerShell 5.1 —el que trae la PC de la sucursal— lee un `.ps1`
 * sin BOM como ANSI (cp1252), no como UTF-8. Una raya larga UTF-8 (`—`,
 * bytes E2 80 94) se convierte ahí en tres caracteres: `â`, `€` y `”`. Y ese
 * último **PowerShell lo acepta como comilla**, así que la cadena se corta a
 * media línea y el resto se parsea como otra cosa.
 *
 * Lo peor es que NO da error de sintaxis: el archivo parsea y hace algo
 * distinto. Pasó de verdad — el instalador imprimió "OK" para las dos
 * impresoras y a continuación "ninguna impresora responde", y mandó a
 * revisar cables que estaban bien.
 *
 * Un archivo ASCII se lee idéntico en UTF-8 y en cp1252, así que no hay nada
 * que se pueda torcer. Los acentos se pierden; a cambio, el script hace lo
 * que dice en cualquier equipo.
 *
 * Los `.bat` van igual: los lee la consola en la codificación OEM (cp850),
 * que tampoco coincide con UTF-8.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const CARPETA = new URL('.', import.meta.url).pathname
const EXTENSIONES = /\.(ps1|bat|cmd)$/i

/** Los que rompen el parseo, no solo la ortografía. */
const VENENOSOS = new Map([
  [0x2014, 'raya larga —'],
  [0x2013, 'raya –'],
  [0x201c, 'comilla “'],
  [0x201d, 'comilla ”'],
  [0x2018, "comilla ‘"],
  [0x2019, "comilla ’"],
  [0xfeff, 'BOM'],
])

let fallos = 0

for (const archivo of readdirSync(CARPETA).filter((f) => EXTENSIONES.test(f)).sort()) {
  const ruta = join(CARPETA, archivo)
  const bytes = readFileSync(ruta)
  const texto = bytes.toString('utf8')

  const hallazgos = []
  let linea = 1
  for (const ch of texto) {
    if (ch === '\n') linea++
    else if (ch.codePointAt(0) > 127) {
      const cp = ch.codePointAt(0)
      hallazgos.push({ linea, ch, cp, veneno: VENENOSOS.has(cp) })
    }
  }

  if (hallazgos.length === 0) {
    console.log(`  ok  ${archivo}`)
    continue
  }

  fallos++
  const venenosos = hallazgos.filter((h) => h.veneno)
  console.error(`  X   ${archivo}: ${hallazgos.length} caracteres fuera de ASCII`)
  for (const h of hallazgos.slice(0, 5)) {
    const marca = h.veneno ? '  <-- ROMPE EL PARSEO' : ''
    console.error(`        linea ${h.linea}: ${JSON.stringify(h.ch)} (U+${h.cp.toString(16).toUpperCase().padStart(4, '0')})${marca}`)
  }
  if (hallazgos.length > 5) console.error(`        ... y ${hallazgos.length - 5} mas`)
  if (venenosos.length > 0) {
    console.error(`        ${venenosos.length} de ellos se leen como comillas en PS 5.1 y cambian lo que hace el script.`)
  }
}

if (fallos > 0) {
  console.error(`\n${fallos} script(s) con caracteres fuera de ASCII.`)
  console.error('Cambia las rayas largas por "-", quita los acentos, y vuelve a correr esto.')
  process.exit(1)
}
console.log('\nTodos los scripts de Windows son ASCII puro.')
