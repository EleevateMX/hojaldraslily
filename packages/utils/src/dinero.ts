const fmt = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })

export function mxn(monto: number | null | undefined): string {
  return fmt.format(monto ?? 0)
}

export function pct(fraccion: number | null | undefined): string {
  if (fraccion == null) return '—'
  return `${(fraccion * 100).toFixed(1)}%`
}
