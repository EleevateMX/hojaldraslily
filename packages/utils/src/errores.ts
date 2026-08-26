/**
 * Traduce cualquier cosa que llegue a un `catch` en un mensaje legible.
 *
 * Existe por un error real y caro: los errores de Supabase NO son
 * instancias de `Error` — postgrest-js devuelve un objeto plano
 * `{ code, message, details, hint }`. El patrón que estaba repetido en 27
 * archivos del monorepo —comprobar `instanceof Error` y si no, `String(e)`—
 * daba false contra ese objeto, y `String({...})` imprime literalmente
 * "[object Object]". En pantalla se veía un texto rojo sin información, y
 * el motivo verdadero —"no se pueden mezclar Alimentos y Bebidas en un
 * mismo combo"— nunca llegaba a quien podía corregirlo.
 *
 * `hint` es la parte accionable de un error de Postgres, así que se
 * conserva cuando viene.
 */
export function mensajeDeError(e: unknown): string {
  if (e instanceof Error && e.message) return e.message

  if (e && typeof e === 'object') {
    const o = e as { message?: unknown; hint?: unknown; details?: unknown }
    const partes: string[] = []
    if (typeof o.message === 'string' && o.message.trim()) partes.push(o.message.trim())
    if (typeof o.hint === 'string' && o.hint.trim()) partes.push(o.hint.trim())
    // `details` solo si no hay nada mejor: suele ser ruido técnico.
    if (partes.length === 0 && typeof o.details === 'string' && o.details.trim()) {
      partes.push(o.details.trim())
    }
    if (partes.length > 0) return partes.join(' — ')
  }

  const texto = String(e)
  // Último recurso: nunca devolver el "[object Object]" que motivó esto.
  return texto === '[object Object]' ? 'Ocurrió un error inesperado.' : texto
}
