import { useConexion, desdeQueHora } from '../../lib/conexion'
import { useVentasSinInternet } from '../../store/sinInternet'

export interface EstadoDeLaFranja {
  enLinea: boolean
  /** Desde cuándo no hay internet (ISO). */
  desde: string | null
  pendientes: number
  enviando: boolean
}

/**
 * La franja que le dice al cajero en qué mundo está.
 *
 * Tres estados y **uno solo a la vez**, en el orden en que duele:
 *
 * 1. **Sin internet** — lo urgente. Dice desde qué hora y, sobre todo, dice
 *    que se puede seguir vendiendo: la noche que esto pasó en la otra tienda,
 *    el kiosko daba errores sueltos, nadie supo que podía cobrar igual y no
 *    entró una sola venta en 53 minutos.
 * 2. **Registrando N ventas** — ya volvió, se están mandando.
 * 3. **N ventas sin registrar** — hay internet y algo quedó atorado. Es el
 *    único de los tres que pide que alguien haga algo.
 *
 * Va **encima de la cabecera** y no dentro: la cabecera es carmín profundo, y
 * una alarma del mismo color que el fondo no es una alarma. Esta franja
 * aparece donde antes no había nada, que es lo que de verdad se nota a un
 * metro.
 */
export function AvisoDeConexion() {
  const enLinea = useConexion((s) => s.enLinea)
  const desde = useConexion((s) => s.desde)
  const pendientes = useVentasSinInternet((s) => s.pendientes.length)
  const enviando = useVentasSinInternet((s) => s.enviando)
  return <FranjaDeConexion enLinea={enLinea} desde={desde} pendientes={pendientes} enviando={enviando} />
}

/**
 * La franja, sin saber de dónde sale su estado.
 *
 * Va aparte de `AvisoDeConexion` para poder MIRARLA con los cuatro casos en
 * la misma página (`mirar/sin-internet.html`). No es una comodidad: el primer
 * intento de ese arnés empujaba los cuatro estados al store global, y como el
 * store es uno solo, los cuatro recuadros salieron con el último — es decir,
 * vacíos. La captura enseñó cuatro cabeceras sin franja y pareció que el
 * componente estaba roto. Con la presentación separada, cada caso recibe el
 * suyo y lo que se ve es lo que va a ver el cajero.
 */
export function FranjaDeConexion({ enLinea, desde, pendientes, enviando }: EstadoDeLaFranja) {
  if (!enLinea) {
    const hora = desdeQueHora(desde)
    return (
      // El titular y la explicación van UNO ENCIMA DEL OTRO, no lado a lado.
      // Puestos en fila, la explicación le comía el ancho al titular y «Sin
      // internet desde las 9:07 p.m.» salía partido en dos renglones — lo
      // único que hay que leer a un metro, roto por la mitad. Se vio en
      // `mirar/sin-internet.html`, no leyendo esto.
      <div className="flex-shrink-0 bg-sa-cream border-b-2 border-sa-green-deep px-5 py-2 flex items-start gap-3">
        <span className="h-2.5 w-2.5 mt-2 rounded-full bg-sa-green-deep animate-pulse flex-shrink-0" aria-hidden />
        <div>
          <p className="font-display text-xl text-sa-green-deep leading-tight">
            Sin internet{hora ? ` desde las ${hora}` : ''}
          </p>
          <p className="font-body text-sm text-sa-green-ink/70 leading-snug">
            Se puede seguir vendiendo: <b>efectivo</b> o lo que ya se cobró en la{' '}
            <b>terminal del banco</b>. El folio sale como «S-01» y la venta se
            registra sola cuando vuelva.
            {pendientes > 0 && ` Van ${pendientes} por registrar.`}
          </p>
        </div>
      </div>
    )
  }

  if (pendientes === 0) return null

  if (enviando) {
    return (
      <div className="flex-shrink-0 bg-sa-banana/20 border-b border-sa-banana px-5 py-2 flex items-center gap-3">
        <span className="h-2.5 w-2.5 rounded-full bg-sa-banana animate-pulse" aria-hidden />
        <p className="font-body text-sm text-sa-green-ink">
          Registrando {pendientes} {pendientes === 1 ? 'venta' : 'ventas'} de cuando no había
          internet…
        </p>
      </div>
    )
  }

  return (
    <div className="flex-shrink-0 bg-sa-cream border-b-2 border-sa-green-deep px-5 py-2 flex items-center gap-3">
      <span className="h-2.5 w-2.5 rounded-full bg-sa-green-deep" aria-hidden />
      <p className="font-body text-sm text-sa-green-ink">
        <b className="text-sa-green-deep">
          {pendientes} {pendientes === 1 ? 'venta' : 'ventas'} sin registrar
        </b>{' '}
        — hay internet pero el servidor las rechazó. No se puede cerrar la caja hasta
        que entren. Avísale a gerencia.
      </p>
    </div>
  )
}
