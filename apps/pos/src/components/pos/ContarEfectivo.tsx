import {
  BILLETES, MONEDAS, CONTEO_VACIO,
  ponerPiezas, piezasDe, sumaConteo, hayConteo,
  mxn,
  type Conteo, type EspecieEfectivo,
} from '@lily/utils'

/**
 * Contar el cajón, pieza por pieza.
 *
 * Es la diferencia entre un corte que dice «faltan $340» —con lo que nadie
 * puede hacer nada— y uno que dice «falta un billete de $200 y tres de
 * $50», que es una frase con la que alguien se acuerda de algo.
 *
 * **Los billetes y las monedas van en dos columnas separadas**, y no es
 * decoración: el $20 existe como las dos cosas. Una sola fila de «20» hace
 * que al teclear las monedas se borren los billetes (le pasó a la tienda
 * hermana, con diez cortes ya guardados y sin forma de recuperarlos).
 *
 * El total se pinta mientras se teclea, pero **el que vale es el del
 * servidor**: `fn_abrir_caja` y `fn_cerrar_caja` lo recalculan desde este
 * mismo desglose. Esto es para que quien cuenta se dé cuenta a tiempo, no
 * para decirle a la base cuánto hay.
 */
export function ContarEfectivo({
  conteo,
  onCambio,
  autoFocus,
}: {
  conteo: Conteo
  onCambio: (c: Conteo) => void
  autoFocus?: boolean
}) {
  const total = sumaConteo(conteo)

  const columna = (especie: EspecieEfectivo, dens: readonly number[], titulo: string) => (
    <div className="flex-1">
      <p className="font-mono text-xs uppercase tracking-widest text-sa-green-ink/50 mb-2">
        {titulo}
      </p>
      <div className="space-y-1.5">
        {dens.map((den, i) => {
          const piezas = piezasDe(conteo, especie, den)
          return (
            <div key={den} className="flex items-center gap-2">
              <span className="font-mono text-sm text-sa-green-ink/70 w-14 text-right">
                ${den}
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                autoFocus={autoFocus && especie === 'billetes' && i === 0}
                value={piezas === 0 ? '' : piezas}
                placeholder="0"
                onChange={(e) => onCambio(ponerPiezas(conteo, especie, den, Number(e.target.value)))}
                className="w-16 px-2 py-1.5 bg-white border border-sa-green-ink/10 rounded-sa font-mono text-base text-center text-sa-green-ink focus:outline-none focus:ring-2 focus:ring-sa-green/30"
                aria-label={`${titulo} de ${den}`}
              />
              {/* El subtotal solo cuando hay algo. Catorce renglones diciendo
                  "$0" entrenan a no leer ninguno. */}
              <span className="font-mono text-sm text-sa-green-ink/45 min-w-[4.5rem]">
                {piezas > 0 ? mxn(den * piezas) : ''}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <div>
      <div className="flex gap-4">
        {columna('billetes', BILLETES, 'Billetes')}
        {columna('monedas', MONEDAS, 'Monedas')}
      </div>
      <div className="flex justify-between items-baseline mt-4 pt-3 border-t border-sa-green-ink/15">
        <span className="font-mono text-xs uppercase tracking-widest text-sa-green-ink/60">
          En el cajón
        </span>
        <span className="font-display text-3xl text-sa-green-ink">{mxn(total)}</span>
      </div>
      {!hayConteo(conteo) && (
        <p className="font-mono text-xs text-sa-green-ink/45 mt-2 leading-relaxed">
          Teclea cuántas piezas hay de cada una. El sistema saca el total.
        </p>
      )}
    </div>
  )
}

export { CONTEO_VACIO }
