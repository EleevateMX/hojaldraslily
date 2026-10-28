// Edge Function: contadigital-facturar
//
// Timbra la FACTURA GLOBAL del día con ContaDigital (Isyconta): una sola
// factura a público en general que lista CADA FOLIO del día como un renglón
// (Comentarios = "Folio N", Importe = total de ese folio). El pan va a TASA 0%
// de IVA, así que subtotal = total. Es como la casa comprueba ingresos diario.
//
// Lo que NO se negocia:
//   * **El total lo decide el servidor.** Los folios y sus totales salen de
//     `fn_facturacion_dia` (ordenes pagadas, no canceladas, del día en Mérida),
//     nunca de la pantalla.
//   * **Solo gerencia.** Exige el JWT del usuario y pregunta `fn_es_jefe()`.
//   * **Un día no se timbra dos veces.** El FolioOriginal es 'GLOBAL-YYYYMMDD';
//     si ya hay una timbrada para ese día se devuelve esa, no se timbra otra.
//   * **La API Key vive en los secrets**, nunca en el repo ni en el navegador.
//   * **Sin emisor no se finge nada.** Si el RFC no está dado de alta en
//     ContaDigital (hoy es el caso de Hojaldras Lily), se detiene con un
//     mensaje claro; no inventa una factura.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import {
  ContaDigitalError,
  ContaDigitalSinCredenciales,
  clientePorRfc,
  conectar,
  configContaDigital,
  empresaPorRfc,
  porClave,
  porDescripcion,
  timbrar,
  utiles,
} from '../_shared/contadigital.ts'

const RFC_PUBLICO = 'XAXX010101000'

const json = (status: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } })

const falla = (status: number, codigo: string, mensaje: string, extra: Record<string, unknown> = {}) =>
  json(status, { ok: false, error: { codigo, mensaje }, ...extra })

const redondea = (n: number) => Math.round(Number(n) * 100) / 100

/** 'YYYY-MM-DD' y 'YYYY-MM-DDTHH:MM:SS' en horario de Mérida. */
function ahoraMerida(): { fechaHora: string } {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Merida', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date())
  const g = (t: string) => f.find((p) => p.type === t)?.value ?? '00'
  return { fechaHora: `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}:${g('second')}` }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return falla(405, 'metodo', 'Usa POST')

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const auth = req.headers.get('Authorization') ?? ''

  // --- Solo gerencia ---------------------------------------------------------
  const sbUsuario = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
  })
  const { data: esJefe } = await sbUsuario.rpc('fn_es_jefe')
  if (!esJefe) return falla(403, 'sin_permiso', 'Solo gerencia puede facturar')
  const { data: { user } } = await sbUsuario.auth.getUser()

  let body: { fecha?: string; ambiente?: string; solo_guardar?: boolean }
  try { body = await req.json() } catch { return falla(400, 'cuerpo', 'JSON inválido') }
  const fecha = (body.fecha ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return falla(400, 'fecha', 'Falta la fecha (YYYY-MM-DD)')

  const sb = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const folioOriginal = `GLOBAL-${fecha.replaceAll('-', '')}`

  // --- Ya timbrada: idempotente ---------------------------------------------
  const { data: yaHay } = await sb
    .from('facturas_globales')
    .select('*')
    .eq('folio_original', folioOriginal)
    .eq('estatus', 'timbrada')
    .maybeSingle()
  if (yaHay) return json(200, { ok: true, yaExistia: true, factura: yaHay })

  // --- Qué se factura ese día ------------------------------------------------
  const { data: ventas, error: eVentas } = await sb.rpc('fn_facturacion_dia', { p_fecha: fecha })
  if (eVentas) return falla(500, 'ventas', `No se pudo leer el día: ${eVentas.message}`)
  if (!ventas || ventas.length === 0) return falla(400, 'sin_ventas', `No hay ventas pagadas el ${fecha}`)

  const lineas = (ventas as { folio: number; total: number }[]).map((v) => ({
    folio: v.folio, total: redondea(v.total),
  }))
  const total = redondea(lineas.reduce((s, l) => s + l.total, 0))

  // --- Config + conexión -----------------------------------------------------
  let cfg
  try { cfg = configContaDigital() } catch (e) {
    if (e instanceof ContaDigitalSinCredenciales) return falla(503, 'not_configured', e.message, { faltan: e.faltan })
    throw e
  }
  if (body.ambiente === 'pruebas' || body.ambiente === 'pro') {
    cfg = { ...cfg, ambiente: body.ambiente, base: cfg.base.replace(/\/(pro|pruebas)\//, `/${body.ambiente}/`) }
  }
  if (!cfg.rfc) return falla(503, 'not_configured', 'Falta CONTADIGITAL_RFC (RFC del emisor)', { faltan: ['CONTADIGITAL_RFC'] })

  try {
    const { token, empresas } = await conectar(cfg)
    const empresa = empresaPorRfc(empresas, cfg.rfc)
    if (!empresa) {
      return falla(409, 'empresa_no_alta',
        `El RFC ${cfg.rfc} todavía no está dado de alta en ContaDigital. ` +
        `Hay que crear esa empresa (con su CSD) en ContaDigital antes de poder timbrar.`,
        { empresas_disponibles: empresas.map((e) => ({ RFC: e.RFC, Nombre: e.Nombre, Creditos: e.Creditos })) })
    }
    if (empresa.Creditos <= 0) {
      return falla(409, 'sin_timbres', `La empresa ${empresa.Nombre} no tiene timbres disponibles en ContaDigital.`)
    }

    // --- Catálogos del emisor ------------------------------------------------
    const u = await utiles(cfg, token, empresa.Id)
    const idRFC = u.IdRFC
    const idExp = u.IdExpedidoENDefault
    const cp = empresa.CP || ''
    const serie = (cfg.serie ? porDescripcion(u.Series, cfg.serie) : null) ?? porDescripcion(u.Series, 'factura') ?? (u.Series ?? [])[0]
    if (!serie) return falla(409, 'sin_serie', 'El emisor no tiene una serie de facturas configurada en ContaDigital.')
    const moneda = porDescripcion(u.Monedas, 'peso') ?? (u.Monedas ?? [])[0]
    const forma = porDescripcion(u.FormasDePago, 'efectivo') ?? (u.FormasDePago ?? [])[0]
    const usoS01 = porClave(u.UsosDeCFDI, 'S01')
    if (!usoS01) return falla(409, 'sin_uso', 'El emisor no tiene el uso de CFDI S01 (Sin efectos fiscales) disponible.')

    if (!cfg.idProducto || !cfg.idUm) {
      return falla(503, 'not_configured',
        'Falta configurar el producto/unidad genéricos para la factura global ' +
        '(CONTADIGITAL_ID_PRODUCTO y CONTADIGITAL_ID_UM).',
        { faltan: [!cfg.idProducto && 'CONTADIGITAL_ID_PRODUCTO', !cfg.idUm && 'CONTADIGITAL_ID_UM'].filter(Boolean) })
    }

    // --- Receptor: público en general ---------------------------------------
    const cliente = await clientePorRfc(cfg, token, empresa.Id, RFC_PUBLICO)
    if (!cliente || !cliente.IdCliente) {
      return falla(409, 'sin_cliente_global',
        `Falta dar de alta el cliente "Público en General" (RFC ${RFC_PUBLICO}) en ContaDigital para esta empresa.`)
    }

    // --- Armar la factura global --------------------------------------------
    const productos = lineas.map((l) => ({
      IdProducto: cfg.idProducto, IdUM: cfg.idUm,
      Cantidad: 1, Precio: l.total, Descuento: 0,
      PorcentajeIVA: 0, IVA: 0, TasaCero: true,
      TasaIEPS: 0, ImporteIEPS: 0,
      BaseRetIVA: 0, TipoRetIVA: 0, RetIVA: 0, TasaISR: 0, RetISR: 0,
      Importe: l.total, Total: l.total,
      Comentarios: `Folio ${l.folio}`,
      ClaveIdentificacion: '01010101',
    }))

    const [anio, mes] = fecha.split('-')
    const factura: Record<string, unknown> = {
      Id: 0,
      IdEmpresa: empresa.Id,
      IdRFC: idRFC,
      FolioOriginal: folioOriginal,
      Fecha: ahoraMerida().fechaHora,
      TipoComprobante: (porClave(u.TiposDeComprobante, 'Factura')?.Clave) ?? 'Factura',
      IdSerie: serie.Id,
      IdSucursal: idExp,
      IdLugarDeExpedicion: idExp,
      LugarDeExpedicion: cp,
      IdCliente: cliente.IdCliente,
      IdSucursalCliente: cliente.IdSucursalDefault ?? cliente.IdSucursalCliente ?? 0,
      UsoCFDI: usoS01.Clave,
      TipoRelacion: '',
      CFDIRelacionados: '',
      TipoDeCambio: 1,
      IdMoneda: moneda?.Id ?? 0,
      IdBanco: 0,
      MetodoDePago: 'PUE',
      IdFormaDePago: forma?.Id ?? 0,
      FormaDePago: forma?.Descripcion ?? 'Efectivo',
      Descuento: 0,
      PorcentajeIVA: 0, IVA: 0,
      RetencionISR: 0, TipoRetencionIVA: 0, RetencionIVA: 0, IEPS: 0,
      TotalImpuestosLocalesRetenidos: 0, TotalImpuestosLocalesTrasladados: 0,
      Subtotal: total, Total: total,
      Productos: productos,
      // Factura global: periodicidad diaria, el mes y el año del día facturado.
      PeriodicidadGlobal: '01',
      MesesGlobal: mes,
      AnioGlobal: Number(anio),
      AgregarLeyendasFiscales: false,
      TipoComplementoAddenda: 0,
      SoloGuardar: body.solo_guardar === true,
    }

    const res = await timbrar(cfg, token, factura)
    const timbrada = res.Codigo === 0 && !!res.Resultado?.UUID
    const fila = {
      fecha, folio_original: folioOriginal, ambiente: cfg.ambiente, id_empresa: empresa.Id,
      uuid: res.Resultado?.UUID ?? null,
      serie: res.Resultado?.Serie ?? serie.Descripcion,
      folio_cfdi: res.Resultado?.Folio ?? null,
      estatus: timbrada ? 'timbrada' : 'error',
      num_folios: lineas.length, subtotal: total, iva: 0, total,
      pdf_link: res.PdfLink ?? null, xml_link: res.XmlLink ?? null,
      mensaje: res.Mensaje ?? null, respuesta: res as unknown,
      creado_por: user?.id ?? null, updated_at: new Date().toISOString(),
    }
    const { data: guardada } = await sb
      .from('facturas_globales')
      .insert(fila)
      .select()
      .single()

    if (!timbrada) {
      return falla(502, 'no_timbrada', res.Mensaje || 'ContaDigital no timbró la factura', { factura: guardada })
    }
    return json(200, { ok: true, factura: guardada })
  } catch (e) {
    if (e instanceof ContaDigitalError) {
      return falla(502, 'contadigital', e.message, { codigo: e.codigo, detalle: e.crudo })
    }
    return falla(500, 'interno', e instanceof Error ? e.message : 'Error inesperado')
  }
})
