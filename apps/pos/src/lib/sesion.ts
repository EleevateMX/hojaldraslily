import { empleadoDeLaSesion, salirDeSesion, type EmpleadoSesion } from '@lily/supabase'
import { sb } from './sb'
import { usePosStore } from '../store/posStore'
import { conRespaldo, guardarRespaldo } from './respaldo'

/**
 * La sesión de la caja, de un lado al otro de una recarga.
 *
 * El cajero vivía solo en memoria (`usePosStore.empleado`). En la PC de la
 * tienda eso aguanta todo el día; en una tableta no: al bloquearla, el
 * sistema descarta la página para ahorrar memoria y al desbloquear la vuelve
 * a cargar desde cero. La sesión de Supabase sí sobrevive —vive en
 * localStorage— pero nadie la miraba, así que la caja mandaba al login con
 * la sesión todavía viva. Era literal el reclamo de la casa: «al bloquear la
 * tableta y abrirla, se sale del programa».
 *
 * Ahora, al arrancar, si hay sesión se recupera al cajero desde la base. Y
 * con respaldo: si en ese momento no hay internet (la tableta se desbloquea
 * antes de que el WiFi vuelva), vale el último cajero que esa sesión tuvo.
 * El respaldo va atado al usuario de la sesión para que nunca se le cuelgue a
 * una sesión el cajero de otra.
 */
export async function recuperarCajero(): Promise<EmpleadoSesion | null> {
  const { data } = await sb.auth.getSession()
  if (!data.session) return null
  const clave = `cajero_${data.session.user.id}`
  try {
    return await conRespaldo(clave, () => empleadoDeLaSesion(sb))
  } catch {
    return null
  }
}

/** Después de entrar con PIN: que la próxima recarga sin internet lo recuerde. */
export async function recordarCajero(empleado: EmpleadoSesion): Promise<void> {
  const { data } = await sb.auth.getSession()
  if (data.session) guardarRespaldo(`cajero_${data.session.user.id}`, empleado)
}

/**
 * Salir de verdad.
 *
 * «Salir» solo vaciaba el store, y la sesión de Supabase seguía viva en el
 * navegador. No se notaba porque el store no se recuperaba nunca; desde que sí
 * se recupera, un «Salir» que no cierre la sesión del servidor volvería a
 * meter al cajero en la siguiente recarga. Se cierra aunque no haya internet:
 * el store se vacía igual y el token queda marcado para borrarse.
 */
export async function salirDeLaCaja(): Promise<void> {
  usePosStore.getState().limpiarOrden()
  usePosStore.getState().cerrarSesion()
  try {
    await salirDeSesion(sb)
  } catch {
    // Sin red el servidor no se entera; el navegador ya soltó el token y la
    // próxima entrada pide PIN igual.
  }
}
