/**
 * Auto-actualización remota del agente de caja.
 *
 * El problema que resuelve: cambiar una línea del ticket ya no obliga a ir a
 * la PC —eso viaja en `parametros.ticket`—, pero cambiar el PROGRAMA sí. La
 * casa pidió poder actualizarlo «de manera remota, así como desde Admin». Así
 * que el agente se vigila a sí mismo: cada tanto le pregunta al repo qué
 * versión está publicada y, si no es la suya, se baja el nuevo `.mjs` encima
 * del propio y se reinicia. El lanzador (`iniciar-agente-caja.bat`) corre en
 * un bucle, así que salir con código 0 lo vuelve a levantar con el código
 * nuevo.
 *
 * La fuente es la MISMA que usa el instalador: `dist/` en la rama `main` del
 * repo (raw.githubusercontent). La versión publicada vive en el
 * `dist/package.json`. Se compara por DISTINTO, no por mayor, para que una
 * reversión (publicar una versión anterior porque la nueva salió mal) también
 * se aplique sola.
 *
 * Todo va envuelto en try/catch y nunca interrumpe una impresión: una falla
 * de red al revisar la actualización no puede dejar a la caja sin imprimir.
 * Por eso la decisión de salir la toma quien llama, cuando el agente está
 * ocioso, no este módulo.
 */
import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** La carpeta donde vive este agente (donde está `agente-caja.mjs`). */
export const CARPETA_AGENTE = dirname(fileURLToPath(import.meta.url))

const BASE_DEFECTO =
  'https://raw.githubusercontent.com/EleevateMX/hojaldraslily/main/apps/agente-caja/dist'

/** De dónde se bajan las actualizaciones. Se puede apuntar a otro lado con el .env. */
export const URL_ACTUALIZAR = process.env.AGENTE_ACTUALIZAR_URL?.trim() || BASE_DEFECTO

async function bajarTexto(url: string): Promise<string> {
  const r = await fetch(url, { cache: 'no-store' } as RequestInit)
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.text()
}

/**
 * Revisa si hay una versión nueva publicada y, si la hay, la deja escrita en
 * disco. Devuelve la versión nueva (para reiniciar) o `null` si no hay nada
 * que hacer. No reinicia: eso lo decide quien llama, cuando no esté imprimiendo.
 */
export async function revisarActualizacion(versionActual: string): Promise<string | null> {
  let publicada: string
  try {
    const pkg = JSON.parse(await bajarTexto(`${URL_ACTUALIZAR}/package.json`))
    publicada = String(pkg?.version ?? '').trim()
  } catch {
    // Sin red, o el repo no contesta: se intenta en la próxima vuelta. Nunca
    // es un error que valga interrumpir nada.
    return null
  }
  if (!publicada || publicada === versionActual) return null

  // Hay otra versión. Se baja el bundle ANTES de tocar el archivo de verdad:
  // si la descarga sale corta o vacía, no se pisa un agente que sí funciona.
  let codigo: string
  try {
    codigo = await bajarTexto(`${URL_ACTUALIZAR}/agente-caja.mjs`)
  } catch {
    return null
  }
  // Sanidad mínima: que sea el bundle del agente y no una página de error de
  // GitHub o un corte a medias.
  if (codigo.length < 5000 || !codigo.includes('Hojaldras Lily')) return null

  try {
    // El package.json también, para que la versión instalada quede al día y
    // no se re-descargue en bucle.
    const pkgNuevo = await bajarTexto(`${URL_ACTUALIZAR}/package.json`)
    await writeFile(join(CARPETA_AGENTE, 'agente-caja.mjs'), codigo, 'utf8')
    await writeFile(join(CARPETA_AGENTE, 'package.json'), pkgNuevo, 'utf8')
  } catch {
    return null
  }
  return publicada
}
