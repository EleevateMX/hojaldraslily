import { describe, it, expect } from 'vitest'
import { construirDocumento, esPayloadDeTicket, type TrabajoCaja } from './render'
import { NEGOCIO_DEFAULT, type TicketData } from '@lily/ui/tipos'

const venta: TicketData = {
  folio: 1042,
  fecha: new Date('2026-10-19T20:26:00Z'),
  canal: 'Caja',
  items: [{ cantidad: 2, nombre: 'Pastelitos de Lomo · 5 pzas', precioUnitario: 140 }],
  metodoPago: 'Efectivo',
  recibido: 300,
}

const trabajo = (payload: unknown): TrabajoCaja => ({
  id: '11111111-2222-3333-4444-555555555555',
  tipo_documento: 'ticket',
  payload: payload as Record<string, unknown>,
})

/** Los bytes, como texto, para poder buscar comandos dentro. */
const hex = (b: Buffer) => b.toString('hex')

describe('construirDocumento', () => {
  it('abre inicializando y fijando la página de códigos', () => {
    const b = construirDocumento(trabajo(venta), NEGOCIO_DEFAULT, null)
    // ESC @ (reset) y ESC t 16 (WPC1252). Sin lo segundo, «Sesión» sale
    // «SesiÃ³n» en el papel.
    expect(hex(b).startsWith('1b40' + '1b7410')).toBe(true)
  })

  it('cierra avanzando el papel ANTES de cortar', () => {
    const b = construirDocumento(trabajo(venta), NEGOCIO_DEFAULT, null)
    // ESC d 6 (avanza 6 líneas) y luego GS V 1 (corte parcial). Si se corta
    // sin avanzar, la guillotina —que está 15-20 mm sobre el cabezal— cae
    // sobre las últimas líneas y el ticket sale mutilado.
    expect(hex(b).endsWith('1b6406' + '1d5601')).toBe(true)
  })

  it('las acentuadas van en latin1, no en utf-8', () => {
    const b = construirDocumento(trabajo(venta), NEGOCIO_DEFAULT, null)
    // «Alemán» de la dirección: la á es 0xE1 en latin1 y 0xC3 0xA1 en utf-8.
    // Si se cuela utf-8, la impresora saca dos caracteres raros por acento.
    expect(hex(b)).toContain(Buffer.from('Alemán', 'latin1').toString('hex'))
    expect(hex(b)).not.toContain(Buffer.from('Alemán', 'utf8').toString('hex'))
  })

  it('el importe del ticket va en los bytes', () => {
    const b = construirDocumento(trabajo(venta), NEGOCIO_DEFAULT, null)
    expect(b.toString('latin1')).toContain('$280.00')
  })

  // Un payload roto tiene que fallar RUIDOSAMENTE: el trabajo se marca
  // fallido y se ve en Admin. Sacar papel en blanco es el modo de fallo que
  // este agente viene a cerrar.
  it('un payload que no es un ticket revienta con un mensaje claro', () => {
    expect(() => construirDocumento(trabajo({ hola: 1 }), NEGOCIO_DEFAULT, null))
      .toThrow(/no trae un ticket/)
  })

  // La prueba de Admin reusa el payload `prueba: true` que el agente de
  // etiquetas ya conocía. Si en vez de dibujarla reventara, el botón
  // «Probar» de la térmica no serviría para nada — que es justo lo que se
  // viene a arreglar.
  it('la prueba de impresion sale, no revienta', () => {
    const b = construirDocumento(
      trabajo({ prueba: true, impresora: 'Caja mostrador', hora: '2026-10-19T20:26:00Z' }),
      NEGOCIO_DEFAULT,
      null,
    )
    expect(b.toString('latin1')).toContain('PRUEBA DE IMPRESION')
    expect(b.toString('latin1')).toContain('Caja mostrador')
    // Y las acentuadas en latin1, igual que el ticket: si salen con basura,
    // la pagina de codigos esta mal y se ve en la prueba, no con un cliente
    // enfrente.
    expect(hex(b)).toContain(Buffer.from('áéíóú', 'latin1').toString('hex'))
    expect(hex(b).endsWith('1b6406' + '1d5601')).toBe(true)
  })

  it('a 58 mm ninguna linea se pasa del papel', () => {
    const b = construirDocumento(trabajo(venta), NEGOCIO_DEFAULT, null, 32)
    const texto = b.toString('latin1')
    // Se miran solo los renglones de texto, sin los comandos del principio
    // y del final.
    const largas = texto.split('\n').slice(1, -1).filter((l) => l.replace(/[\x00-\x1f]/g, '').length > 32)
    expect(largas).toEqual([])
  })

  it('esPayloadDeTicket distingue lo imprimible', () => {
    expect(esPayloadDeTicket(venta)).toBe(true)
    expect(esPayloadDeTicket(null)).toBe(false)
    expect(esPayloadDeTicket({ folio: 1, items: [] })).toBe(false)       // sin metodoPago
    expect(esPayloadDeTicket({ folio: 1, metodoPago: 'x' })).toBe(false) // sin items
  })
})

/**
 * El paquete que se copia a la PC de la tienda.
 *
 * `dist/agente-caja.mjs` está VERSIONADO a propósito, y eso es una decisión
 * incómoda: el código generado que se guarda se queda viejo en silencio. Va
 * versionado porque el instalador baja un zip del repo y en la PC de la
 * tienda no hay monorepo ni empaquetador — y este agente importa
 * `@lily/ui/papel`, que no existe en el registro público.
 *
 * El guardián es esta prueba: vuelve a empaquetar y compara. Si alguien tocó
 * el agente o `@lily/ui` y no corrió `pnpm --filter @lily/agente-caja
 * empaquetar`, aquí revienta — en vez de que lo descubra la tienda cuando el
 * ticket salga con el formato de la semana pasada.
 */
describe('el paquete de la tienda', () => {
  it('dist/ está al día con el código', async () => {
    const { execFileSync } = await import('node:child_process')
    const { readFileSync, existsSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const { dirname, join } = await import('node:path')

    const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
    const bundle = join(raiz, 'dist/agente-caja.mjs')
    expect(
      existsSync(bundle),
      'Falta dist/. Corre: pnpm --filter @lily/agente-caja empaquetar',
    ).toBe(true)

    const antes = readFileSync(bundle, 'utf8')
    execFileSync('node', [join(raiz, 'empaquetar.mjs')], { cwd: raiz, stdio: 'pipe' })
    const despues = readFileSync(bundle, 'utf8')

    expect(
      despues,
      'dist/ quedó viejo. Corre: pnpm --filter @lily/agente-caja empaquetar — y commitéalo.',
    ).toBe(antes)
  }, 30_000)
})
