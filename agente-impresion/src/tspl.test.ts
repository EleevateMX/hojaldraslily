import { describe, expect, it } from 'vitest'
import {
  abreviarExtra,
  caracteresPorLinea,
  compactarSpec,
  FRASES,
  frasePara,
  generarTSPL,
  limpiar,
  partir,
  vistaPrevia,
  type EtiquetaComanda,
} from './tspl.js'
import {
  etiquetasDeTrabajo, formatearFecha, porEtiqueta, repartirPersonalizacion, conFamilia,
} from './etiquetas.js'
import type { TrabajoImpresion } from './types.js'

/**
 * La etiqueta del ejemplo validado contra la impresora física
 * (CONFIGURACION-POS.md §6). Cada coordenada de ese ejemplo es una medida
 * real, no una preferencia: si el generador se desvía, el texto sale
 * encimado o cortado y solo se descubre gastando etiquetas.
 */
const EJEMPLO: EtiquetaComanda = {
  destino: 'Bebidas',
  ticket: '156490945',
  item: 2,
  deTotal: 5,
  nombre: 'Javier',
  producto: 'Shake Oreo',
  tamano: '20 OZ',
  proteina: 'Whey chocolate',
  leche: 'Deslactosada',
  extras: ['extra galleta', 'sin crema'],
  fecha: '10/08 18:58',
  frase: 'Eres un hojaldraslily',
}

describe('geometría TSPL', () => {
  it('reproduce exactamente el diseño validado en la impresora', () => {
    const lineas = generarTSPL(EJEMPLO).split('\r\n')
    expect(lineas).toEqual([
      'SIZE 80 mm,25 mm',
      'GAP 4 mm,0 mm',
      'DIRECTION 0',
      'REFERENCE 0,0',
      'DENSITY 8',
      'SPEED 4',
      'CLS',
      'TEXT 576,16,"1",90,1,1,"BEBIDAS #156490945"',
      'TEXT 562,16,"1",90,1,1,"2 de 5"',
      'TEXT 528,16,"3",90,1,1,"JAVIER"',
      'TEXT 490,16,"2",90,1,1,"SHAKE OREO"',
      // El tamano ya NO se imprime (vive solo en pantalla): la SPEC sube.
      'TEXT 440,16,"1",90,1,1,"SPEC"',
      'TEXT 414,16,"1",90,1,1,"+WHEY CHOCOLATE"',
      'TEXT 397,16,"1",90,1,1,"+DESLACTOSADA"',
      'TEXT 380,16,"1",90,1,1,"+GALLETA"',
      'TEXT 363,16,"1",90,1,1,"+S/CREMA"',
      'TEXT 322,16,"1",90,1,1,"10/08 18:58"',
      'TEXT 284,16,"2",90,1,1,"Eres un"',
      'TEXT 261,16,"2",90,1,1,"hojaldraslily"',
      'PRINT 1,1',
      '',
    ])
  })

  it('rota todo el texto 90 grados: sin eso sale de lado', () => {
    for (const linea of generarTSPL(EJEMPLO).split('\r\n')) {
      if (linea.startsWith('TEXT ')) expect(linea).toContain(',90,1,1,')
    }
  })

  it('nunca pasa de los caracteres que caben en la línea', () => {
    const largo: EtiquetaComanda = {
      ...EJEMPLO,
      nombre: 'Maria Guadalupe de la Concepcion',
      producto: 'Shake de fresa con platano y crema de cacahuate',
      notas: 'Alergica a la nuez y a todo lo que tenga trazas de cacahuate',
    }
    for (const linea of generarTSPL(largo).split('\r\n')) {
      const m = linea.match(/^TEXT \d+,\d+,"(\d)",90,1,1,"(.*)"$/)
      if (!m) continue
      expect(m[2].length).toBeLessThanOrEqual(caracteresPorLinea(m[1] as '1' | '2' | '3'))
    }
  })

  it('las líneas nunca se encensan: cada X va por debajo de la anterior', () => {
    const xs = generarTSPL(EJEMPLO)
      .split('\r\n')
      .filter((l) => l.startsWith('TEXT '))
      .map((l) => Number(l.split(' ')[1].split(',')[0]))
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeLessThan(xs[i - 1])
  })

  it('no deja escapar comillas dobles, que romperían el comando', () => {
    const tspl = generarTSPL({ ...EJEMPLO, producto: 'Shake "wow"' })
    const linea = tspl.split('\r\n').find((l) => l.includes('WOW'))
    expect(linea).toBe('TEXT 490,16,"2",90,1,1,"SHAKE \'WOW\'"')
  })

  it('omite las secciones vacías y acorta la etiqueta', () => {
    const minima: EtiquetaComanda = {
      destino: 'Alimentos', ticket: 'T1', item: 1, deTotal: 1,
      nombre: 'Ana', producto: 'Waffle', fecha: '10/08 18:58', frase: 'Buen dia!',
    }
    const tspl = generarTSPL(minima)
    expect(tspl).not.toContain('SPEC')
    expect(tspl).not.toContain('REVERSE')
  })
})

describe('limpieza de texto', () => {
  it('quita acentos y respeta la eñe como N (code page 850)', () => {
    expect(limpiar('Plátano piña')).toBe('Platano pina')
  })

  it('parte palabras más largas que la línea en vez de dejar que se corten', () => {
    expect(partir('SUPERCALIFRAGILISTICOESPIALIDOSO', 10)).toEqual([
      'SUPERCALIF', 'RAGILISTIC', 'OESPIALIDO', 'SO',
    ])
  })
})

describe('abreviaturas de extras', () => {
  it.each([
    ['sin azucar', '+S/AZUCAR'],
    ['sin crema', '+S/CREMA'],
    ['extra galleta', '+GALLETA'],
    ['con extra galleta', '+GALLETA'],
    ['mas galleta', '+GALLETA'],
    ['poco hielo', '+-HIELO'],
    ['menos hielo', '+-HIELO'],
    ['con canela', '+C/CANELA'],
    ['galleta', '+GALLETA'],
  ])('%s → %s', (entrada, esperado) => {
    expect(abreviarExtra(entrada)).toBe(esperado)
  })
})

describe('compactar la línea de SPEC', () => {
  it.each([
    ['Proteína OPTIMUM - Chocolate', 'OPTIMUM CHOCOLATE'],
    ['2x Proteína OPTIMUM - Chocolate', '2X OPTIMUM CHOCOLATE'],
    ['Leche de almendras', 'ALMENDRAS'],
    ['Leche deslactosada', 'DESLACTOSADA'],
    ['2 Galletas L&L Cremes (Chocolate)', '2 GALLETAS L&L CREMES CHOCOLATE'],
  ])('%s → %s', (entrada, esperado) => {
    expect(compactarSpec(entrada).toUpperCase()).toBe(esperado)
  })

  it('no toca la marca ni el sabor, que es lo que distingue', () => {
    expect(compactarSpec('Proteína CBUM - Choco Cacahuate').toUpperCase())
      .toBe('CBUM CHOCO CACAHUATE')
  })
})

describe('frase del pie', () => {
  it('es la misma para el mismo ticket: una reimpresión no puede verse distinta', () => {
    expect(frasePara('156490945', 2)).toBe(frasePara('156490945', 2))
  })

  it('cambia entre etiquetas del mismo pedido', () => {
    expect(frasePara('156490945', 1)).not.toBe(frasePara('156490945', 2))
  })

  it('toda frase cabe en el pie: dos renglones como máximo', () => {
    for (const frase of FRASES) {
      const renglones = partir(limpiar(frase), caracteresPorLinea('2'))
      expect(renglones.length, `"${frase}" ocupa ${renglones.length} renglones`).toBeLessThanOrEqual(2)
    }
  })

  it('toda frase es ASCII puro: la impresora está en cp850 y no queremos sorpresas', () => {
    for (const frase of FRASES) {
      expect(frase, `"${frase}" trae caracteres fuera de ASCII`).toMatch(/^[\x20-\x7e]+$/)
    }
  })
})

describe('repartir la personalización de texto libre', () => {
  it('reconoce leche, proteína, tamaño y peticiones', () => {
    expect(repartirPersonalizacion('20 OZ, Leche deslactosada, Proteina whey chocolate, sin crema')).toEqual({
      tamano: '20 OZ',
      leche: 'Leche deslactosada',
      proteina: 'Proteina whey chocolate',
      extras: ['sin crema'],
      notas: null,
    })
  })

  it('no pierde lo que no reconoce: cae en notas', () => {
    expect(repartirPersonalizacion('Alergica a la nuez').notas).toBe('Alergica a la nuez')
  })

  it('aguanta vacío', () => {
    expect(repartirPersonalizacion(null).extras).toEqual([])
  })
})

describe('etiquetas de un trabajo', () => {
  const trabajo: TrabajoImpresion = {
    id: 't1', orden_id: null, pedido_id: null, estacion_id: null, printer_id: null,
    tipo_documento: 'comanda',
    payload: {
      folio: 1042,
      estacion: 'Bebidas',
      cliente: 'Ana',
      creado_en: '2026-08-10T18:58:00',
      items: [
        { cantidad: 2, nombre: 'Shake Oreo', personalizacion: 'Leche deslactosada' },
        { cantidad: 1, nombre: 'Smoothie mango' },
      ],
    },
    estado: 'claimed', intentos: 0, max_intentos: 5, numero_copia: 1,
    created_at: '2026-08-10T18:58:00',
  }

  it('saca una etiqueta por unidad, no por línea de pedido', () => {
    const e = etiquetasDeTrabajo(trabajo)
    expect(e).toHaveLength(3)
    expect(e.map((x) => `${x.item} de ${x.deTotal}`)).toEqual(['1 de 3', '2 de 3', '3 de 3'])
  })

  it('lleva la leche a su campo, no a las notas', () => {
    expect(etiquetasDeTrabajo(trabajo)[0].leche).toBe('Leche deslactosada')
  })

  it('usa el folio como nombre cuando nadie se identificó', () => {
    const anonimo = { ...trabajo, payload: { ...trabajo.payload, cliente: null } }
    expect(etiquetasDeTrabajo(anonimo)[0].nombre).toBe('#1042')
  })

  it('prefiere los campos ya separados si la base los manda', () => {
    const estructurado: TrabajoImpresion = {
      ...trabajo,
      payload: {
        ...trabajo.payload,
        items: [{
          cantidad: 1, nombre: 'Shake Oreo', personalizacion: 'Leche de coco',
          tamano: '16 OZ', leche: 'Almendra', extras: ['sin azucar'],
        }],
      },
    }
    const e = etiquetasDeTrabajo(estructurado)[0]
    expect(e.tamano).toBe('16 OZ')
    expect(e.leche).toBe('Almendra')
  })

  it('combina los extras de la base con la leche del texto libre', () => {
    // El caso real: la base ya manda los extras como líneas hijas, pero la
    // leche sigue dentro de `personalizacion`. Si lo estructurado ganara del
    // todo, la leche se perdería.
    const mezclado: TrabajoImpresion = {
      ...trabajo,
      payload: {
        ...trabajo.payload,
        items: [{
          cantidad: 1,
          nombre: '#1 Choco Killer',
          personalizacion: 'Leche de almendras',
          extras: ['2 Galletas L&L Cremes (Chocolate)', '2x Proteína OPTIMUM - Chocolate'],
        }],
      },
    }
    const e = etiquetasDeTrabajo(mezclado)[0]
    expect(e.leche).toBe('Leche de almendras')
    expect(e.proteina).toBe('2x Proteína OPTIMUM - Chocolate')
    expect(e.extras).toEqual(['2 Galletas L&L Cremes (Chocolate)'])
  })

  it('reparte la cantidad del extra entre las etiquetas del producto', () => {
    // Dos shakes con UNA promo de galletas cada uno: la línea trae el total
    // (2). Si ese 2 se copiara a cada etiqueta, en barra saldrían cuatro.
    const dos: TrabajoImpresion = {
      ...trabajo,
      payload: {
        ...trabajo.payload,
        items: [{
          cantidad: 2,
          nombre: '#1 Choco Killer',
          extras: [{ nombre: '2 Galletas L&L Cremes (Chocolate)', cantidad: 2 }],
        }],
      },
    }
    const e = etiquetasDeTrabajo(dos)
    expect(e).toHaveLength(2)
    for (const et of e) expect(et.extras).toEqual(['2 Galletas L&L Cremes (Chocolate)'])
  })

  it('sí marca el múltiplo cuando de verdad van dos por vaso', () => {
    const dobles: TrabajoImpresion = {
      ...trabajo,
      payload: {
        ...trabajo.payload,
        items: [{
          cantidad: 2, nombre: '#1 Choco Killer',
          extras: [{ nombre: 'Proteína OPTIMUM - Chocolate', cantidad: 4 }],
        }],
      },
    }
    expect(etiquetasDeTrabajo(dobles)[0].proteina).toBe('2x Proteína OPTIMUM - Chocolate')
  })

  it('saca el tamaño del nombre del producto y no lo repite', () => {
    const conTamano: TrabajoImpresion = {
      ...trabajo,
      payload: { ...trabajo.payload, items: [{ cantidad: 1, nombre: 'Shake Oreo 20 OZ' }] },
    }
    const e = etiquetasDeTrabajo(conTamano)[0]
    expect(e.producto).toBe('Shake Oreo')
    expect(e.tamano).toBe('20 OZ')
  })
})

describe('cuánto de un extra lleva cada etiqueta', () => {
  it.each([
    [{ nombre: 'Galletas', cantidad: 2 }, 2, 'Galletas'],
    [{ nombre: 'Galletas', cantidad: 4 }, 2, '2x Galletas'],
    [{ nombre: 'Galletas', cantidad: 1 }, 1, 'Galletas'],
    [{ nombre: 'Galletas' }, 3, 'Galletas'],
  ])('%o entre %i → %s', (extra, unidades, esperado) => {
    expect(porEtiqueta(extra, unidades)).toBe(esperado)
  })

  it('no redondea un reparto desigual: lo deja visible', () => {
    expect(porEtiqueta({ nombre: 'Galletas', cantidad: 3 }, 2)).toBe('3 p/2 Galletas')
  })
})

describe('impresion de prueba', () => {
  // fn_imprimir_prueba encola un payload sin productos. Antes salian cero
  // etiquetas y el trabajo se confirmaba igual: el boton de "probar" decia
  // que si y no salia nada.
  const prueba: TrabajoImpresion = {
    id: 'p1', orden_id: null, pedido_id: null, estacion_id: null, printer_id: null,
    tipo_documento: 'comanda',
    payload: { prueba: true, impresora: 'Barra — Bebidas', hora: '2026-08-10T18:58:00' },
    estado: 'claimed', intentos: 0, max_intentos: 5, numero_copia: 1,
    created_at: '2026-08-10T18:58:00',
  }

  it('saca una etiqueta, no cero', () => {
    expect(etiquetasDeTrabajo(prueba)).toHaveLength(1)
  })

  it('dice de que impresora salio, para saber cual es cual', () => {
    const dibujo = vistaPrevia(etiquetasDeTrabajo(prueba)[0])
    expect(dibujo).toContain('PRUEBA')
    expect(dibujo).toContain('BARRA')
  })

  it('genera TSPL valido', () => {
    const tspl = generarTSPL(etiquetasDeTrabajo(prueba)[0])
    expect(tspl.startsWith('SIZE 80 mm,25 mm')).toBe(true)
    expect(tspl).toContain('PRINT 1,1')
  })
})

describe('formato de fecha', () => {
  it('es dd/MM HH:mm', () => {
    expect(formatearFecha('2026-08-10T18:58:00')).toBe('10/08 18:58')
  })
})

describe('vista previa', () => {
  it('dibuja la etiqueta sin gastar consumible', () => {
    const dibujo = vistaPrevia(EJEMPLO)
    expect(dibujo).toContain('JAVIER')
    // El tamano no va en papel: solo pantalla.
    expect(dibujo).not.toContain('[20 OZ]')
    expect(dibujo).toContain('+S/CREMA')
  })
})

describe('familia de la bebida en el nombre', () => {
  it('antepone la familia: en barra "Lemon Twist" solo no dice qué preparar', () => {
    expect(conFamilia('Hydration Drink', 'Lemon Twist')).toBe('Hydration Drink - Lemon Twist')
    expect(conFamilia('Kombucha', 'Limonada Durazno')).toBe('Kombucha - Limonada Durazno')
  })

  it('sin familia deja el nombre tal cual — un shake se lee bien solo', () => {
    expect(conFamilia(null, '#1 Choco Killer')).toBe('#1 Choco Killer')
    expect(conFamilia('   ', 'El Clásico')).toBe('El Clásico')
    expect(conFamilia(undefined, 'Waffle')).toBe('Waffle')
  })

  it('no repite la familia si el producto ya empieza con ella', () => {
    expect(conFamilia('Hydration Drink', 'Hydration Drink Lemon Twist'))
      .toBe('Hydration Drink Lemon Twist')
  })

  it('el nombre compuesto más largo sigue cabiendo en la etiqueta', () => {
    // Es el caso real más largo: familia larga + sabor de dos palabras,
    // con spec cargada. Si esto desborda, la etiqueta sale mutilada y en
    // barra preparan a ciegas.
    const e: EtiquetaComanda = {
      destino: 'Bebidas', ticket: '999', item: 1, deTotal: 1,
      nombre: 'Guadalupe',
      producto: conFamilia('Hydration Drink', 'Watermelon Splash'),
      tamano: '20 OZ',
      proteina: 'OPTIMUM VAINILLA',
      leche: 'Leche de almendras',
      extras: ['DOBLE SCOOP', 'CREATINA'],
      notas: 'sin azucar, extra frio',
      fecha: '20/08 13:00', frase: 'No pain, no gain',
    }
    const tspl = generarTSPL(e)
    const xs = tspl.split('\r\n')
      .filter((l) => l.startsWith('TEXT'))
      .map((l) => Number(l.slice(5).split(',')[0]))
    // X va descendiendo; por debajo de 24 dots el generador marca desborde.
    expect(Math.min(...xs)).toBeGreaterThan(24)
    expect(tspl).toContain('HYDRATION')
    expect(tspl).toContain('WATERMELON')
  })
})
