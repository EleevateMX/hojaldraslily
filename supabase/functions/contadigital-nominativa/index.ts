// Edge Function: contadigital-nominativa
//
// Facturación NOMINATIVA (a un RFC real, persona física o moral) con
// ContaDigital, aparte de la factura GLOBAL a público en general.
//
// Tres acciones (por `accion` en el body):
//   * 'clientes'         → lista los clientes de la empresa.
//   * 'agregar_cliente'  → da de alta un cliente (RFC, razón social, régimen…).
//   * 'timbrar_folio'    → timbra un FOLIO de venta a un cliente.
//
// Lo que NO se negocia (igual que la global):
//   * **El total lo decide el servidor.** Sale de `fn_folio_facturable` (la
//     orden pagada, no cancelada), nunca de la pantalla.
//   * **Solo gerencia o contabilidad** (`fn_puede_facturar`).
//   * **Un folio no se factura dos veces** ni se nomina si su día ya se timbró
//     global (sería facturar el mismo ingreso dos veces). Lo revisa
//     `fn_folio_facturable` y lo refuerza el índice único de la tabla.
//   * **Mismo trato fiscal que la global**: una línea de pan, clave 50181900,
//     IVA tasa 0%.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import {
  ContaDigitalError,
  ContaDigitalSinCredenciales,
  clientePorRfc,
  conectar,
  configContaDigital,
  crearCliente,
  empresaPorRfc,
  listarClientes,
  porClave,
  porDescripcion,
  timbrar,
  utiles,
} from '../_shared/contadigital.ts'

const json = (status: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } })

const falla = (status: number, codigo: string, mensaje: string, extra: Record<string, unknown> = {}) =>
  json(status, { ok: false, error: { codigo, mensaje }, ...extra })

const redondea = (n: number) => Math.round(Number(n) * 100) / 100

function ahoraMerida(): string {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Merida', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date())
  const g = (t: string) => f.find((p) => p.type === t)?.value ?? '00'
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}:${g('second')}`
}

interface Cuerpo {
  accion?: 'clientes' | 'agregar_cliente' | 'timbrar_folio'
  ambiente?: string
  // agregar_cliente
  cliente?: {
    rfc?: string; razonSocial?: string; regimenFiscal?: string; usoCFDI?: string
    cp?: string; calle?: string; noExterior?: string; colonia?: string
    municipio?: string; estado?: string; email?: string
  }
  // timbrar_folio
  folio?: number
  rfc?: string
  uso?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return falla(405, 'metodo', 'Usa POST')

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const auth = req.headers.get('Authorization') ?? ''

  // --- Solo gerencia o contabilidad ------------------------------------------
  const sbUsuario = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
  })
  const { data: puedeFacturar } = await sbUsuario.rpc('fn_puede_facturar')
  if (!puedeFacturar) return falla(403, 'sin_permiso', 'Solo gerencia o contabilidad pueden facturar')
  const { data: { user } } = await sbUsuario.auth.getUser()

  let body: Cuerpo
  try { body = await req.json() } catch { return falla(400, 'cuerpo', 'JSON inválido') }
  const accion = body.accion

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

  const sb = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  try {
    const { token, empresas } = await conectar(cfg)
    const empresa = empresaPorRfc(empresas, cfg.rfc)
    if (!empresa) {
      return falla(409, 'empresa_no_alta',
        `El RFC ${cfg.rfc} todavía no está dado de alta en ContaDigital.`,
        { empresas_disponibles: empresas.map((e) => ({ RFC: e.RFC, Nombre: e.Nombre })) })
    }

    // ---- Listar clientes ----------------------------------------------------
    if (accion === 'clientes') {
      const lista = await listarClientes(cfg, token, empresa.Id)
      const clientes = (lista ?? []).map((c: any) => ({
        id: c.Id, rfc: c.RFC, razonSocial: c.RazonSocial,
        regimenFiscal: c.RegimenFiscal, usoCFDI: c.UsoCFDIDefault, cp: c.CP,
      }))
      return json(200, { ok: true, clientes })
    }

    // ---- Agregar cliente ----------------------------------------------------
    if (accion === 'agregar_cliente') {
      const c = body.cliente ?? {}
      const rfc = (c.rfc ?? '').trim().toUpperCase()
      const razon = (c.razonSocial ?? '').trim()
      const regimen = (c.regimenFiscal ?? '').trim()
      const cp = (c.cp ?? '').trim()
      const calle = (c.calle ?? '').trim()
      if (!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(rfc)) return falla(400, 'rfc', 'El RFC no tiene el formato correcto.')
      if (!razon) return falla(400, 'razon', 'Falta la razón social / nombre.')
      if (!/^\d{3}$/.test(regimen)) return falla(400, 'regimen', 'Falta el régimen fiscal (3 dígitos del SAT).')
      if (!/^\d{5}$/.test(cp)) return falla(400, 'cp', 'El código postal es de 5 dígitos.')
      if (!calle) return falla(400, 'calle', 'ContaDigital pide al menos la calle.')

      const nuevo = {
        Id: 0, RFC: rfc, RazonSocial: razon,
        // 0 = RFC normal (uno real); 1/2 son los genéricos nacional/extranjero.
        TipoGenerico: 0,
        RegimenFiscal: regimen,
        UsoCFDIDefault: (c.usoCFDI ?? 'G03').trim() || 'G03',
        CP: cp, Calle: calle, NoExterior: (c.noExterior ?? '').trim() || 'S/N', NoInterior: '',
        Colonia: (c.colonia ?? '').trim(), Municipio: (c.municipio ?? '').trim(),
        Estado: (c.estado ?? '').trim(), Localidad: (c.municipio ?? '').trim(),
        Pais: 'México', ClaveSATPais: 'MEX', Estatus: true,
        IdEmpresaCliente: empresa.Id, Email: (c.email ?? '').trim(),
      }
      const creado = await crearCliente(cfg, token, nuevo)
      return json(200, { ok: true, cliente: { id: creado?.Id, rfc: creado?.RFC, razonSocial: creado?.RazonSocial } })
    }

    // ---- Timbrar un folio ---------------------------------------------------
    if (accion === 'timbrar_folio') {
      const folio = Number(body.folio)
      const rfc = (body.rfc ?? '').trim().toUpperCase()
      if (!Number.isInteger(folio) || folio <= 0) return falla(400, 'folio', 'Falta el folio de la venta.')
      if (!rfc) return falla(400, 'rfc', 'Falta el RFC del cliente.')

      // El total y el estado del folio los dice el servidor.
      const { data: folios, error: eFolio } = await sb.rpc('fn_folio_facturable', { p_folio: folio })
      if (eFolio) return falla(500, 'folio', `No se pudo leer el folio: ${eFolio.message}`)
      const info = Array.isArray(folios) ? folios[0] : folios
      if (!info) return falla(404, 'folio_no_encontrado', `No hay una venta pagada con folio ${folio}.`)
      if (info.ya_nominada) return falla(409, 'ya_nominada', `El folio ${folio} ya tiene una factura nominativa.`)
      if (info.dia_global_timbrado) {
        return falla(409, 'dia_global',
          `El ${info.fecha} ya se timbró la factura global, así que el folio ${folio} ya quedó incluido ahí. ` +
          `No se puede facturar aparte sin cancelar primero esa global.`)
      }
      const total = redondea(Number(info.total))
      if (!(total > 0)) return falla(400, 'total', 'El folio no tiene un importe que facturar.')

      const cliente = await clientePorRfc(cfg, token, empresa.Id, rfc)
      const idCliente = cliente?.Id ?? cliente?.IdCliente
      if (!cliente || !idCliente) {
        return falla(409, 'sin_cliente', `El RFC ${rfc} no está dado de alta en ContaDigital. Agrégalo primero.`)
      }

      const u = await utiles(cfg, token, empresa.Id)
      const serie = (cfg.serie ? porDescripcion(u.Series, cfg.serie) : null) ?? porDescripcion(u.Series, 'factura') ?? (u.Series ?? [])[0]
      if (!serie) return falla(409, 'sin_serie',
        'El emisor no tiene una serie de facturas configurada en ContaDigital ' +
        '(Configuración de la empresa → Series/Folios).')
      const moneda = porDescripcion(u.Monedas, 'peso') ?? (u.Monedas ?? [])[0]
      const forma = porDescripcion(u.FormasDePago, 'efectivo') ?? (u.FormasDePago ?? [])[0]
      // El uso: el que mandó la pantalla, si no el del cliente, si no G03.
      const uso = (body.uso ?? '').trim() || cliente.UsoCFDIDefault || 'G03'
      if (!cfg.idProducto || !cfg.idUm) {
        return falla(503, 'not_configured',
          'Falta el producto/unidad genéricos (CONTADIGITAL_ID_PRODUCTO y CONTADIGITAL_ID_UM).')
      }

      const factura: Record<string, unknown> = {
        Id: 0,
        IdEmpresa: empresa.Id,
        IdRFC: u.IdRFC,
        FolioOriginal: `NOM-${folio}`,
        Fecha: ahoraMerida(),
        TipoComprobante: (porClave(u.TiposDeComprobante, 'Factura')?.Clave) ?? 'Factura',
        IdSerie: serie.Id,
        IdSucursal: u.IdExpedidoENDefault,
        IdLugarDeExpedicion: u.IdExpedidoENDefault,
        LugarDeExpedicion: empresa.CP || '',
        IdCliente: idCliente,
        IdSucursalCliente: cliente.IdSucursalDefault ?? cliente.IdSucursalCliente ?? 0,
        UsoCFDI: uso,
        TipoRelacion: '0',
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
        Productos: [{
          IdProducto: cfg.idProducto, IdUM: cfg.idUm,
          Cantidad: 1, Precio: total, Descuento: 0,
          PorcentajeIVA: 0, IVA: 0, TasaCero: true,
          TasaIEPS: 0, ImporteIEPS: 0,
          BaseRetIVA: 0, TipoRetIVA: 0, RetIVA: 0, TasaISR: 0, RetISR: 0,
          Importe: total, Total: total,
          Comentarios: `Venta folio ${folio}`,
          ClaveIdentificacion: '01010101',
        }],
        AgregarLeyendasFiscales: false,
        TipoComplementoAddenda: 0,
      }

      const res = await timbrar(cfg, token, factura)
      const timbrada = res.Codigo === 0 && !!res.Resultado?.UUID
      const fila = {
        folio_venta: folio, rfc_receptor: rfc,
        nombre_receptor: cliente.RazonSocial ?? null,
        ambiente: cfg.ambiente, id_empresa: empresa.Id,
        uuid: res.Resultado?.UUID ?? null,
        serie: res.Resultado?.Serie ?? serie.Descripcion,
        folio_cfdi: res.Resultado?.Folio ?? null,
        uso_cfdi: uso,
        estatus: timbrada ? 'timbrada' : 'error',
        subtotal: total, iva: 0, total,
        pdf_link: res.PdfLink ?? null, xml_link: res.XmlLink ?? null,
        mensaje: res.Mensaje ?? null, respuesta: res as unknown,
        creado_por: user?.id ?? null, updated_at: new Date().toISOString(),
      }
      const { data: guardada } = await sb.from('facturas_nominativas').insert(fila).select().single()

      if (!timbrada) {
        return falla(502, 'no_timbrada', res.Mensaje || 'ContaDigital no timbró la factura', { factura: guardada })
      }
      return json(200, { ok: true, factura: guardada })
    }

    return falla(400, 'accion', 'Acción no reconocida.')
  } catch (e) {
    if (e instanceof ContaDigitalError) {
      return falla(502, 'contadigital', e.message, { codigo: e.codigo, detalle: e.crudo })
    }
    return falla(500, 'interno', e instanceof Error ? e.message : 'Error inesperado')
  }
})
