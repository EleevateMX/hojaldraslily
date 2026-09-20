import { useCallback, useEffect, useState } from 'react'
import { hornoEnVivo, relojDelHorno, type HornoEnVivo } from '@shake/supabase'
import { sb } from '../../lib/sb'

/**
 * Lo que está en el horno, visto desde la caja.
 *
 * Es la flecha que **vuelve** de H a C: la caja manda a producir y el horno le
 * contesta. Sin esto, la pregunta más común del mostrador —«¿y no va a salir
 * más guayaba?»— se contesta gritando hacia la cocina.
 *
 * Va como una pastilla chica en la cabecera y se abre al tocarla. No es un
 * panel fijo a propósito: la caja es para cobrar, y una lista del horno
 * siempre abierta le quita espacio al catálogo. La pastilla dice lo único que
 * hay que saber de un vistazo (cuántas tandas y si alguna se pasó); el
 * detalle está a un toque.
 */

const REFRESCO_MS = 30000

export function ChipDelHorno() {
  const [datos, setDatos] = useState<HornoEnVivo | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [ahora, setAhora] = useState(() => new Date())

  const cargar = useCallback(async () => {
    try {
      setDatos(await hornoEnVivo(sb))
    } catch {
      // Si el horno no contesta, la pastilla desaparece y ya. La caja tiene
      // que poder cobrar aunque esto falle: un error aquí no es su problema.
      setDatos(null)
    }
  }, [])

  useEffect(() => {
    void cargar()
    const t = setInterval(() => void cargar(), REFRESCO_MS)
    return () => clearInterval(t)
  }, [cargar])

  useEffect(() => {
    if (!abierto) return
    const t = setInterval(() => setAhora(new Date()), 1000)
    return () => clearInterval(t)
  }, [abierto])

  if (!datos) return null

  const { en_horno, esperando, sin_armar, tarde } = datos.resumen
  const nada = en_horno === 0 && esperando === 0 && sin_armar === 0
  if (nada) return null

  return (
    <div className="relative">
      <button
        onClick={() => setAbierto((v) => !v)}
        className={[
          'font-mono text-xs uppercase tracking-wide px-4 py-2 rounded-full border transition-colors',
          tarde > 0
            ? 'bg-sa-cream text-sa-green border-sa-cream animate-pulse'
            : 'bg-sa-cream-warm/10 hover:bg-sa-cream-warm/20 text-sa-cream border-sa-cream/20',
        ].join(' ')}
      >
        Horno {en_horno > 0 ? `· ${en_horno}` : ''}
        {tarde > 0 && ` · ${tarde} se pasó`}
      </button>

      {abierto && (
        <>
          {/* Un velo para cerrar tocando fuera: en táctil no hay «clic
              afuera» que se sienta natural sin esto. */}
          <div className="fixed inset-0 z-40" onClick={() => setAbierto(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 w-80 max-h-[70vh] overflow-y-auto rounded-sa-lg bg-white shadow-sa-lg border border-sa-green-ink/10 p-4 text-left">
            <p className="font-display text-lg text-sa-green-ink mb-3">En el horno</p>

            {datos.adentro.length === 0 && (
              <p className="font-body text-sm text-sa-green-ink/50 mb-3">
                Nada horneándose ahorita.
              </p>
            )}

            {datos.adentro.map((i) => {
              const reloj = relojDelHorno(i.listo_en, ahora)
              return (
                <div key={i.item_id} className="py-2 border-b border-sa-green-ink/5 last:border-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-body text-sa-green-ink">{i.sabor}</p>
                    <p
                      className={[
                        'font-mono text-sm shrink-0',
                        reloj.tarde ? 'text-sa-green font-semibold' : 'text-sa-green-ink/60',
                      ].join(' ')}
                    >
                      {reloj.texto}
                    </p>
                  </div>
                  <p className="font-mono text-[11px] uppercase tracking-wide text-sa-green-ink/45">
                    {i.moldes} de {i.molde} · {i.cuadros} cuadros
                  </p>
                </div>
              )
            })}

            {(esperando > 0 || sin_armar > 0) && (
              <div className="mt-3 pt-3 border-t border-sa-green-ink/10 space-y-1">
                {esperando > 0 && (
                  <p className="font-body text-sm text-sa-green-ink/70">
                    <strong>{esperando}</strong> molde{esperando === 1 ? '' : 's'} esperando
                    turno para entrar.
                  </p>
                )}
                {sin_armar > 0 && (
                  <p className="font-body text-sm text-sa-green-ink/70">
                    <strong>{sin_armar}</strong> todavía sin armar en producción.
                  </p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
