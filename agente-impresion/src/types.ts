/**
 * Qué lenguaje entiende la impresora. **No se adivina y no tiene un valor
 * "seguro"**: mandarle a una etiquetadora TSPL un flujo ESC/POS no da error,
 * simplemente no imprime — el trabajo queda marcado como impreso y la comanda
 * se pierde sin que nadie se entere. Es la avería más difícil de diagnosticar
 * de todo el sistema, así que se declara explícito por impresora.
 *
 *  - `escpos` → impresoras de recibos (80 mm en rollo continuo).
 *  - `tspl`   → etiquetadoras 3nstar / TSC (etiquetas de 80 × 25 mm).
 */
export type LenguajeImpresora = 'escpos' | 'tspl'

export interface PrinterConfig {
  /** Identificador local (solo para logs, no viaja a la base). */
  id: string
  descripcion?: string
  /** agente_token de la fila en `impresoras` (Admin → Impresoras). */
  token: string
  /**
   * node-thermal-printer interface string:
   *  - Red:  "tcp://IP:PUERTO"        (la mayoría de impresoras 80mm/58mm)
   *  - USB (Linux):   "/dev/usb/lp0"
   *  - USB (Windows): "printer:NombreCompartidoDeLaImpresora"
   *
   * Con `lenguaje: "tspl"` solo vale la forma de red: se abre el socket a
   * pelo, sin pasar por node-thermal-printer.
   */
  interface: string
  /** Por omisión `escpos`, que es lo que había antes de existir este campo. */
  lenguaje?: LenguajeImpresora
  anchoPapel: '58mm' | '80mm'
  copias: number
  corteAutomatico: boolean
  buzzer: boolean
}

export type EstadoTrabajoImpresion =
  | 'pending'
  | 'claimed'
  | 'printing'
  | 'printed'
  | 'retry'
  | 'failed'
  | 'cancelled'

export interface ItemComanda {
  cantidad: number
  nombre: string
  /**
   * Texto libre tal como lo guarda hoy la base. Si los campos de abajo
   * vienen vacíos, `etiquetas.ts` lo reparte entre ellos como puede.
   */
  personalizacion?: string | null

  /**
   * Cómo se llama UNA bebida de esta familia ("Kombucha", "Hydration
   * Drink"). Lo manda la base cuando la categoría tiene nombre en singular.
   *
   * Existe porque en barra se confundían: "Lemon Twist" es Hydration,
   * "Lemon Glow" es Collagen y "Lemon Lime" es Amino — con varias en cola,
   * el sabor solo no alcanza para saber qué preparar.
   */
  categoria?: string | null

  // Campos ya separados. Opcionales a propósito: la base todavía no los
  // emite, pero el día que lo haga el agente los usa sin tocar nada más.
  tamano?: string | null
  proteina?: string | null
  leche?: string | null
  /**
   * Los extras de este producto. La forma con `cantidad` trae el TOTAL de la
   * línea (para las `cantidad` unidades del producto), no lo que lleva cada
   * una: quien arma las etiquetas lo divide, porque es quien sabe cuántas va
   * a sacar. La forma de texto suelto se acepta por compatibilidad.
   */
  extras?: Array<string | ExtraComanda> | null
  notas?: string | null
}

export interface ExtraComanda {
  nombre: string
  /** Total de la línea. Si falta, se asume uno por unidad del producto. */
  cantidad?: number
}

export interface PayloadComanda {
  folio?: number
  /** Alternativa a `folio` cuando el ticket no es numérico. */
  ticket?: string
  canal?: string
  estacion?: string
  creado_en?: string
  cajero?: string | null
  cliente?: string | null
  /** Nombre a rotular, si no es el del cliente registrado. */
  nombre?: string | null
  items?: ItemComanda[]
  prueba?: boolean
  impresora?: string
  hora?: string
}

export interface TrabajoImpresion {
  id: string
  orden_id: string | null
  pedido_id: string | null
  estacion_id: string | null
  printer_id: string | null
  tipo_documento: 'comanda' | 'ticket'
  payload: PayloadComanda
  estado: EstadoTrabajoImpresion
  intentos: number
  max_intentos: number
  numero_copia: number
  created_at: string
}
