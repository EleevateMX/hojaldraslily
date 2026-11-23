import { useEffect, useState } from 'react'
import { sb } from '../lib/sb'
import { reporteGerencial } from '@lily/supabase'
import { mensajeDeError } from '@lily/utils'
import { Loading, ErrorMsg } from '../ui'
import ReporteGerencial, { type ReporteData } from './ReporteGerencial'
import { REPORTE_EJEMPLO } from './reporteEjemplo'

/**
 * Pestaña «Reporte gerencial»: comparativas con datos REALES (Fase 2). Una
 * sola RPC (`fn_reporte_gerencial`) arma todo el JSON; el toggle Esta semana /
 * Este mes / 90 días cambia el rango y vuelve a pedir. Si la consulta falla, se
 * enseña el reporte de ejemplo para que la pantalla no quede en blanco.
 */

const ZONA = 'America/Merida'
const hoyMerida = () => new Date().toLocaleDateString('en-CA', { timeZone: ZONA })
function diasAtras(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('en-CA', { timeZone: ZONA })
}
const inicioDeMes = () => `${hoyMerida().slice(0, 7)}-01`

/** 0 = Esta semana · 1 = Este mes · 2 = 90 días → [desde, hasta]. */
function rango(i: number): [string, string] {
  const hasta = hoyMerida()
  if (i === 0) return [diasAtras(6), hasta]
  if (i === 2) return [diasAtras(89), hasta]
  return [inicioDeMes(), hasta]
}

export default function Reporte() {
  const [i, setI] = useState(1) // Este mes
  const [data, setData] = useState<ReporteData | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    setCargando(true)
    setError(null)
    const [desde, hasta] = rango(i)
    reporteGerencial(sb, desde, hasta)
      .then((d) => { if (vivo) setData(d as ReporteData) })
      .catch((e) => { if (vivo) setError(mensajeDeError(e)) })
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [i])

  // Primera carga sin datos: spinner. En un cambio de periodo se mantiene el
  // reporte anterior mientras llega el nuevo (sin parpadeo).
  if (cargando && !data) return <Loading>Cargando reporte…</Loading>

  if (error) {
    return (
      <div className="space-y-4">
        <ErrorMsg>No se pudo cargar el reporte: {error}. Se muestra un ejemplo.</ErrorMsg>
        <ReporteGerencial data={REPORTE_EJEMPLO} periodoActivo={i} onCambiarPeriodo={setI} />
      </div>
    )
  }
  if (!data) return <ErrorMsg>Sin datos del reporte.</ErrorMsg>
  return <ReporteGerencial data={data} periodoActivo={i} onCambiarPeriodo={setI} />
}
