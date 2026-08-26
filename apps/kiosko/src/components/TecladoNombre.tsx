/**
 * Teclado táctil propio para el nombre del pedido (vista de cajero).
 *
 * Existe porque el teclado en pantalla de Windows es ajeno al kiosko: tapa
 * media pantalla, sale cuando quiere y no combina con nada. Este vive
 * debajo del campo, escribe directo al estado (no depende del foco del
 * input) y deja que los chips predictivos hagan el resto.
 *
 * Solo letras: un nombre de pila no lleva números ni símbolos, y los
 * acentos los ponen los chips ("adri" → tocar "Adrián"). La primera letra
 * de cada palabra sale sola en mayúscula.
 */

const FILAS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ñ'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
]

const TECLA =
  'flex-1 basis-0 max-w-12 py-3.5 rounded-xl bg-white border-2 border-sa-green-ink/10 ' +
  'font-display text-xl text-sa-green-ink active:scale-95 active:bg-sa-cream transition-all'

interface Props {
  valor: string
  onCambio: (nuevo: string) => void
  maxLargo?: number
}

export function TecladoNombre({ valor, onCambio, maxLargo = 20 }: Props) {
  const teclear = (letra: string) => {
    if (valor.length >= maxLargo) return
    // Mayúscula al inicio de cada palabra, minúscula en medio: sale
    // "Maria Jose" sin que nadie piense en el shift.
    const iniciaPalabra = valor.length === 0 || valor.endsWith(' ')
    onCambio(valor + (iniciaPalabra ? letra.toUpperCase() : letra.toLowerCase()))
  }

  const espacio = () => {
    if (valor.length === 0 || valor.endsWith(' ') || valor.length >= maxLargo) return
    onCambio(valor + ' ')
  }

  const borrar = () => onCambio(valor.slice(0, -1))

  return (
    <div className="w-full select-none touch-manipulation" aria-label="Teclado en pantalla">
      {FILAS.map((fila) => (
        <div key={fila[0]} className="flex justify-center gap-1.5 mb-1.5">
          {fila.map((l) => (
            <button key={l} type="button" onClick={() => teclear(l)} className={TECLA}>
              {l}
            </button>
          ))}
          {fila[0] === 'Z' && (
            <button
              type="button"
              onClick={borrar}
              disabled={valor.length === 0}
              aria-label="Borrar letra"
              className={`${TECLA} max-w-20 bg-sa-cream-warm disabled:opacity-30`}
            >
              ⌫
            </button>
          )}
        </div>
      ))}
      <div className="flex justify-center gap-1.5">
        <button
          type="button"
          onClick={espacio}
          className="flex-1 max-w-64 py-3.5 rounded-xl bg-white border-2 border-sa-green-ink/10 font-mono text-xs uppercase tracking-[0.25em] text-sa-green-ink/60 active:scale-95 active:bg-sa-cream transition-all"
        >
          Espacio
        </button>
      </div>
    </div>
  )
}
