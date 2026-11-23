import ReporteGerencial from './ReporteGerencial'
import { REPORTE_EJEMPLO } from './reporteEjemplo'

/**
 * Pestaña «Reporte gerencial» del Admin.
 *
 * Fase 1: muestra el reporte con DATOS DE EJEMPLO y un aviso claro. La Fase 2
 * reemplaza `REPORTE_EJEMPLO` por las consultas reales (heatmap hora×día,
 * producto por día, composición, comparativa mensual) sin tocar el diseño.
 */
export default function Reporte() {
  return (
    <div className="space-y-4">
      <div className="rounded-sa border border-sa-banana/50 bg-sa-banana/15 px-4 py-3 text-sm text-sa-green-ink">
        <b>Datos de ejemplo.</b> Esta pantalla ya tiene su forma final; en la siguiente fase se conecta
        a las ventas reales (aún faltan las consultas de agregación). Los números de abajo son de muestra.
      </div>
      <ReporteGerencial data={REPORTE_EJEMPLO} />
    </div>
  )
}
