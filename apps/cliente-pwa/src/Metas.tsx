import { useEffect, useRef, useState } from 'react'
import {
  misMetas, cobrarMeta, enviarEvidencia, subirImagen,
  type Meta,
} from '@shake/supabase'
import { sb } from './lib/sb'
import { IconoPalomita, IconoRegalo } from './Iconos'

/**
 * Metas: mancuernas por cosas que no cuestan producto.
 *
 * El programa de lealtad solo premia comprar, y comprar cuesta. Estas
 * premian volver, dejar una resena, completar el perfil — que valen mucho
 * para el negocio y cuestan centavos, porque la mancuerna vale $0.10.
 *
 * La de "abrir la app" se cobra SOLA al entrar: pedirle al cliente que
 * toque un boton para recibir 1 mancuerna es hacerle trabajo por diez
 * centavos. Las de captura sí necesitan su mano, y ademas la aprobacion de
 * gerencia — si no, una resena de 100 mancuernas la cobra cualquiera
 * subiendo una foto del rollo.
 */

const MOTIVOS: Record<string, string> = {
  todavia_no: 'Ya la cobraste hoy. Vuelve mañana.',
  ya_hoy: 'Ya la cobraste hoy. Vuelve mañana.',
  ya_cumplida: 'Esta ya la cumpliste.',
  falta_telefono: 'Primero guarda tu teléfono en la pestaña Cuenta.',
  sin_cliente: 'Primero entra a tu cuenta.',
}

export function Metas({ alGanar }: { alGanar: () => void }) {
  const [metas, setMetas] = useState<Meta[] | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const yaSalude = useRef(false)

  async function refrescar() {
    try {
      setMetas(await misMetas(sb))
    } catch {
      setMetas([])
    }
  }

  useEffect(() => {
    // Al abrir: cobrar la visita del día sin preguntar, y solo entonces
    // leer el catálogo, para que la meta ya aparezca palomeada.
    if (yaSalude.current) return
    yaSalude.current = true
    void (async () => {
      try {
        const r = await cobrarMeta(sb, 'visita_diaria')
        if (r.acreditada) {
          setAviso(`+${r.mancuernas} mancuerna por pasar a saludar`)
          alGanar()
        }
      } catch {
        // Que falle el saludo diario no puede estropear la pantalla.
      }
      void refrescar()
    })()
    // Corre una sola vez al montar, a proposito: el guardia es `yaSalude`,
    // no la lista de dependencias. Volver a correrlo porque cambio la
    // funcion del padre intentaria cobrar el saludo otra vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!metas || metas.length === 0) return null

  async function cobrar(m: Meta) {
    setError(null)
    setAviso(null)
    try {
      const r = await cobrarMeta(sb, m.clave)
      if (r.acreditada) {
        setAviso(`+${r.mancuernas} mancuernas · ${r.nombre}`)
        alGanar()
      } else {
        setError(MOTIVOS[r.motivo ?? ''] ?? 'Todavía no se puede cobrar.')
      }
      await refrescar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo.')
    }
  }

  const pendientes = metas.filter((m) => m.disponible || m.pendiente).length

  return (
    <section className="rounded-sa-lg p-5 mb-3 bg-sa-cream-paper text-sa-green-ink shadow-sa">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg text-sa-green">Metas</h2>
        {pendientes > 0 && (
          <span className="font-mono text-[11px] text-sa-green-ink/55">
            {pendientes} por hacer
          </span>
        )}
      </div>
      <p className="text-xs text-sa-green-ink/55 mb-3">
        Mancuernas sin comprar nada.
      </p>

      {aviso && (
        <p className="mb-3 rounded-sa bg-sa-mint/30 border border-sa-mint/60 px-3 py-2 text-sm font-semibold text-sa-green">
          {aviso}
        </p>
      )}
      {error && (
        <p className="mb-3 rounded-sa bg-sa-strawberry/10 border border-sa-strawberry/40 px-3 py-2 text-sm text-sa-strawberry leading-snug">
          {error}
        </p>
      )}

      <div className="space-y-2">
        {metas.map((m) => (
          <Tarjeta key={m.clave} m={m} alCobrar={() => void cobrar(m)}
                   alRefrescar={() => void refrescar()} alGanar={alGanar}
                   avisar={setAviso} fallar={setError} />
        ))}
      </div>
    </section>
  )
}

function Tarjeta({
  m, alCobrar, alRefrescar, avisar, fallar,
}: {
  m: Meta
  alCobrar: () => void
  alRefrescar: () => void
  alGanar: () => void
  avisar: (t: string | null) => void
  fallar: (t: string | null) => void
}) {
  const [subiendo, setSubiendo] = useState(false)
  const archivo = useRef<HTMLInputElement>(null)

  const cumplida = !m.disponible && !m.pendiente && m.veces > 0

  async function mandarCaptura(f: File) {
    setSubiendo(true)
    avisar(null)
    fallar(null)
    try {
      const url = await subirImagen(sb, 'evidencias', f)
      await enviarEvidencia(sb, m.clave, url)
      avisar(`Captura enviada. En cuanto la revisemos se te abonan ${m.mancuernas} mancuernas.`)
      alRefrescar()
    } catch (e) {
      fallar(e instanceof Error ? e.message : 'No se pudo enviar la captura.')
    } finally {
      setSubiendo(false)
      if (archivo.current) archivo.current.value = ''
    }
  }

  return (
    <div
      className={`rounded-sa border px-3 py-3 ${
        cumplida
          ? 'border-sa-green-ink/10 bg-sa-mint/15'
          : 'border-sa-green-ink/10'
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${
            cumplida ? 'bg-sa-green text-sa-cream' : 'bg-sa-banana/30 text-sa-green'
          }`}
        >
          {cumplida ? <IconoPalomita className="w-4 h-4" /> : <IconoRegalo className="w-[18px] h-[18px]" />}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-display text-base leading-tight">{m.nombre}</p>
            <span className="shrink-0 font-mono text-xs font-bold text-sa-green">
              +{m.mancuernas}
            </span>
          </div>
          <p className="text-[12px] text-sa-green-ink/65 leading-snug mt-0.5">
            {m.descripcion}
          </p>

          {m.pendiente && (
            <p className="text-[12px] text-sa-green-ink/55 mt-1.5">
              Esperando que la revisemos…
            </p>
          )}

          {cumplida && (
            <p className="text-[12px] text-sa-green mt-1.5">
              Cumplida{m.ultima ? ` el ${m.ultima}` : ''}
              {m.veces > 1 ? ` · ${m.veces} veces` : ''}
            </p>
          )}

          {m.disponible && m.tipo === 'automatica' && (
            <button
              onClick={alCobrar}
              className="mt-2 rounded-sa bg-sa-green text-sa-cream font-display text-sm px-4 py-2 active:scale-95 transition-transform"
            >
              Cobrar
            </button>
          )}

          {m.disponible && m.tipo === 'evidencia' && (
            <>
              <button
                onClick={() => archivo.current?.click()}
                disabled={subiendo}
                className="mt-2 rounded-sa bg-sa-green text-sa-cream font-display text-sm px-4 py-2 disabled:opacity-40 active:scale-95 transition-transform"
              >
                {subiendo ? 'Enviando…' : (m.pide_texto ?? 'Mandar captura')}
              </button>
              <input
                ref={archivo}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void mandarCaptura(f)
                }}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
