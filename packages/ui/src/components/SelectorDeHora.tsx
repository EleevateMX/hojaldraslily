/**
 * La hora como la escoge gerencia: un desplegable en 12 h, partido en
 * **mañana** y **tarde**.
 *
 * Lo pidió la casa así. El `<input type="time">` del navegador se ve
 * distinto en cada aparato —en un teléfono abre una rueda, en Windows pide
 * teclear— y en algunos sale en 24 h. Un desplegable con «7:00 a.m. …
 * 9:00 p.m.» se ve igual en todos y no hay cómo teclear mal.
 *
 * Guarda `HH:MM` (24 h), que es lo que `minutosDeHora` lee sin adivinar y lo
 * que la cola de encargos sabe ordenar. Si llega un valor que no está en la
 * lista —un encargo viejo con «13:02»— se enseña tal cual como una opción
 * más, para no borrarle la hora a nadie al abrir el formulario.
 */
import type { ChangeEvent } from 'react'

export interface SelectorDeHoraProps {
  /** `HH:MM`, o vacío para «sin hora». */
  value: string
  onChange: (hora: string) => void
  className?: string
  /** Hora en punto en que empieza la lista. 7 por omisión. */
  desde?: number
  /** Hora en punto en que termina la lista (incluida). 21 por omisión. */
  hasta?: number
  /** Minutos entre opciones. 30 por omisión. */
  paso?: number
  /** Texto de la opción vacía. */
  sinHora?: string
  'aria-label'?: string
  disabled?: boolean
}

function en12h(min: number): string {
  const h24 = Math.floor(min / 60)
  const mm = min % 60
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(mm).padStart(2, '0')} ${h24 < 12 ? 'a.m.' : 'p.m.'}`
}

function aHHMM(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

export function SelectorDeHora({
  value,
  onChange,
  className,
  desde = 7,
  hasta = 21,
  paso = 30,
  sinHora = 'Sin hora',
  disabled,
  ...resto
}: SelectorDeHoraProps) {
  const opciones: number[] = []
  for (let m = desde * 60; m <= hasta * 60; m += paso) opciones.push(m)
  const manana = opciones.filter((m) => m < 12 * 60)
  const tarde = opciones.filter((m) => m >= 12 * 60)

  // Un valor que no está en la lista se enseña igual: es el de un encargo
  // capturado antes, y abrir el formulario no debe borrárselo.
  const conocido = value === '' || opciones.some((m) => aHHMM(m) === value)
  // Y se enseña en 12 h como las demás: «13:02» se lee «1:02 p.m.».
  const m = /^(\d{1,2}):(\d{2})$/.exec(value)
  const etiquetaDesconocida = m ? en12h(Number(m[1]) * 60 + Number(m[2])) : value

  return (
    <select
      className={className}
      value={value}
      disabled={disabled}
      aria-label={resto['aria-label'] ?? 'Hora'}
      onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
    >
      <option value="">{sinHora}</option>
      {!conocido && <option value={value}>{etiquetaDesconocida}</option>}
      <optgroup label="Mañana">
        {manana.map((m) => (
          <option key={m} value={aHHMM(m)}>{en12h(m)}</option>
        ))}
      </optgroup>
      <optgroup label="Tarde">
        {tarde.map((m) => (
          <option key={m} value={aHHMM(m)}>{en12h(m)}</option>
        ))}
      </optgroup>
    </select>
  )
}
