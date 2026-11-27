import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  hornoEnVivo,
  listarEncargos,
  horaDeSalida,
  type HornoEnVivo,
  type Encargo,
} from '@lily/supabase'
import { sb } from '@/lib/sb'
import { Llama, Reloj, Caja } from './IconosUI'

/**
 * La franja de estado de la caja (dirección A, «para un mejor manejo»).
 *
 * Es la banda bajo la cabecera que le dice a quien cobra —sin levantarse ni
 * abrir nada— las tres cosas que están pasando atrás:
 *
 *   🔥 EN EL HORNO    — cuántos moldes y a qué hora salen
 *   ⏱ SE PASÓ         — lo que ya se pasó de su hora (la alarma)
 *   📦 ENCARGOS DE HOY — cuántos faltan por empacar
 *
 * El panel «Producción» de la cabecera sigue teniendo el detalle a un toque;
 * esto es el vistazo permanente. Por eso NO repite el total de cifras: dice lo
 * urgente y lo encamina.
 *
 * Lee de la MISMA fuente que el panel (`fn_horno_en_vivo` + `listarEncargos`),
 * nunca de otra consulta: una franja que contara el horno por su cuenta tarde
 * o temprano diría algo distinto del panel —ya pasó una vez y se quitó— (ver
 * CLAUDE.md §4). Como es la misma función, no pueden discrepar.
 */

const REFRESCO_MS = 10000

/** ¿Este encargo se entrega hoy (o ya se pasó)? Mismo criterio que el panel. */
function esDeHoy(e: Encargo): boolean {
  if (!e.fecha_entrega) return true
  const entrega = new Date(e.fecha_entrega + 'T12:00:00')
  const hoy = new Date()
  hoy.setHours(12, 0, 0, 0)
  return entrega.getTime() <= hoy.getTime()
}

// ─────────────────────────── Presentación ───────────────────────────
// Separada del dato (como FranjaDeConexion): así se puede MIRAR con cada
// estado —horno lleno, algo pasado, nada pendiente— sin Supabase.

export interface FranjaDeProduccionProps {
  enHorno: number
  /** La hora a la que sale la próxima charola, ya en 12 h, o null. */
  proximaSalida: string | null
  tarde: number
  sinEmpacar: number
  encargosHoy: number
  onEncargos: () => void
}

function Segmento({ icono, children }: { icono: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2 whitespace-nowrap">
      <span aria-hidden className="opacity-80">{icono}</span>
      {children}
    </span>
  )
}

function Pastilla({ alarma, children }: { alarma?: boolean; children: React.ReactNode }) {
  return (
    <span
      className={[
        'font-mono text-[11px] uppercase tracking-wide rounded-full px-2.5 py-0.5',
        alarma ? 'bg-sa-cream text-sa-green font-semibold' : 'bg-sa-cream/15 text-sa-cream',
      ].join(' ')}
    >
      {children}
    </span>
  )
}

export function FranjaDeProduccion({
  enHorno, proximaSalida, tarde, sinEmpacar, encargosHoy, onEncargos,
}: FranjaDeProduccionProps) {
  return (
    <div className="flex-shrink-0 bg-sa-green-deep text-sa-cream border-t border-sa-cream/10">
      <div className="flex items-center gap-x-6 gap-y-1 flex-wrap px-4 lg:px-5 py-2">
        {/* EN EL HORNO */}
        <Segmento icono={<Llama className="w-4 h-4" />}>
          <span className="font-mono text-[11px] uppercase tracking-wide text-sa-cream/70">
            En el horno
          </span>
          {enHorno > 0 ? (
            <Pastilla>
              {enHorno} molde{enHorno === 1 ? '' : 's'}
              {proximaSalida ? ` · salen ${proximaSalida}` : ''}
            </Pastilla>
          ) : (
            <span className="font-mono text-[11px] text-sa-cream/50">nada ahorita</span>
          )}
        </Segmento>

        {/* SE PASÓ — solo cuando lo hay; es la alarma, va en pastilla clara. */}
        {tarde > 0 && (
          <Segmento icono={<Reloj className="w-4 h-4" />}>
            <Pastilla alarma>
              {tarde} se pasó de su hora
            </Pastilla>
          </Segmento>
        )}

        {/* ENCARGOS DE HOY — toca para ir a la pantalla de encargos. */}
        <button onClick={onEncargos} className="flex items-center gap-2 whitespace-nowrap hover:brightness-110">
          <span aria-hidden className="opacity-80"><Caja className="w-4 h-4" /></span>
          <span className="font-mono text-[11px] uppercase tracking-wide text-sa-cream/70">
            Encargos de hoy
          </span>
          {encargosHoy === 0 ? (
            <span className="font-mono text-[11px] text-sa-cream/50">nadie pasa</span>
          ) : sinEmpacar > 0 ? (
            <Pastilla>{sinEmpacar} por empacar</Pastilla>
          ) : (
            <Pastilla>todo empacado</Pastilla>
          )}
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────── Contenedor ───────────────────────────

export function FranjaProduccionCaja({ onEncargos }: { onEncargos: () => void }) {
  const [datos, setDatos] = useState<HornoEnVivo | null>(null)
  const [encargos, setEncargos] = useState<Encargo[]>([])

  // Las dos consultas en paralelo, cada una se traga su error: si el horno no
  // contesta, los encargos igual se ven, y la caja cobra aunque esto falle.
  const cargar = useCallback(async () => {
    const [h, e] = await Promise.all([
      hornoEnVivo(sb).catch(() => null),
      listarEncargos(sb).catch(() => [] as Encargo[]),
    ])
    setDatos(h)
    setEncargos(e)
  }, [])

  // Solo sondea cada 10 s; NO se suscribe a Realtime. El panel «Producción» de
  // la cabecera ya tiene el canal `camino-del-pan`, y Supabase no deja dos
  // suscriptores al mismo canal —el segundo tira «cannot add postgres_changes
  // callbacks after subscribe()» y rompe la pantalla—. 10 s es de sobra para
  // una banda de estado: el detalle en vivo está en el panel.
  useEffect(() => {
    void cargar()
    const t = setInterval(() => void cargar(), REFRESCO_MS)
    return () => clearInterval(t)
  }, [cargar])

  const { enHorno, tarde, proximaSalida, sinEmpacar, encargosHoy } = useMemo(() => {
    const r = datos?.resumen
    // La próxima charola en salir: la más cercana de las que están adentro.
    const salidas = (datos?.adentro ?? [])
      .map((i) => i.listo_en)
      .filter(Boolean)
      .sort()
    const deHoy = encargos.filter(esDeHoy)
    return {
      enHorno: r?.en_horno ?? 0,
      tarde: r?.tarde ?? 0,
      proximaSalida: salidas[0] ? horaDeSalida(salidas[0]) : null,
      sinEmpacar: deHoy.filter((e) => !e.empacado_at).length,
      encargosHoy: deHoy.length,
    }
  }, [datos, encargos])

  return (
    <FranjaDeProduccion
      enHorno={enHorno}
      proximaSalida={proximaSalida}
      tarde={tarde}
      sinEmpacar={sinEmpacar}
      encargosHoy={encargosHoy}
      onEncargos={onEncargos}
    />
  )
}
