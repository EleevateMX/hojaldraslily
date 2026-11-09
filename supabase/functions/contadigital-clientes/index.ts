// Edge Function: contadigital-clientes
//
// Lista los clientes de la empresa en ContaDigital CON TODA su dirección, para
// poder mostrarla al elegir un cliente en Admin → Facturación. Es una función
// chica y AUTOCONTENIDA (sin `_shared`) a propósito: así se despliega de un
// archivo, sin arrastrar el puente completo de ContaDigital.
//
// ContaDigital guarda el estado por CÓDIGO SAT (`ClaveSATEstado`, p. ej. "YUC")
// y deja el texto `Estado` vacío; la colonia va como "0095-Nombre". Aquí se
// devuelven ambos (código y texto) para que la pantalla los vuelva legibles.
//
// Seguridad: igual que el resto de facturación — exige el JWT del usuario y
// `fn_puede_facturar()` (gerencia o contabilidad). La API Key vive en los
// secrets, nunca en el repo.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const BASES: Record<string, string> = {
  pro: 'https://app.contadigital.mx/dev/pro/api',
  pruebas: 'https://app.contadigital.mx/dev/pruebas/api',
}

const json = (status: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } })

function desenvolver(c: any): any {
  if (c && typeof c === 'object' && 'Codigo' in c) {
    if (c.Codigo !== 0) throw new Error(`ContaDigital ${c.Codigo}: ${c.Mensaje ?? ''}`)
    return c.Resultado
  }
  return c
}
async function cd(base: string, ruta: string, init: RequestInit): Promise<any> {
  const r = await fetch(base + ruta, init)
  const t = await r.text()
  let b: any
  try { b = t ? JSON.parse(t) : null } catch { b = t }
  if (!r.ok) throw new Error(`HTTP ${r.status} en ${ruta}: ${String(t).slice(0, 200)}`)
  return b
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const auth = req.headers.get('Authorization') ?? ''
  const sbUsuario = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
  })
  const { data: puede } = await sbUsuario.rpc('fn_puede_facturar')
  if (!puede) return json(403, { ok: false, error: { codigo: 'sin_permiso', mensaje: 'Solo gerencia o contabilidad pueden ver los clientes' } })

  const apiKey = Deno.env.get('CONTADIGITAL_API_KEY')?.trim()
  const rfc = (Deno.env.get('CONTADIGITAL_RFC') ?? '').trim().toUpperCase()
  const ambiente = (Deno.env.get('CONTADIGITAL_AMBIENTE') ?? 'pro').toLowerCase()
  const base = BASES[ambiente] ?? BASES.pro
  if (!apiKey) return json(503, { ok: false, error: { codigo: 'not_configured', mensaje: 'Falta CONTADIGITAL_API_KEY' }, faltan: ['CONTADIGITAL_API_KEY'] })
  if (!rfc) return json(503, { ok: false, error: { codigo: 'not_configured', mensaje: 'Falta CONTADIGITAL_RFC' }, faltan: ['CONTADIGITAL_RFC'] })

  try {
    const r = desenvolver(await cd(base, '/conectar.json', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ APIKEY: apiKey }),
    }))
    const token = r.Token
    const emp = (r.Empresas ?? []).find((e: any) => (e.RFC ?? '').replace(/\s+/g, '').toUpperCase() === rfc)
    if (!emp) {
      return json(409, { ok: false, error: { codigo: 'empresa_no_alta', mensaje: `El RFC ${rfc} no está dado de alta en ContaDigital.` } })
    }
    const lista = desenvolver(await cd(base, `/clientes.json/${emp.Id}`, { headers: { authorization: `Bearer ${token}` } }))
    const clientes = (lista ?? []).map((c: any) => ({
      id: c.Id, rfc: c.RFC, razonSocial: c.RazonSocial,
      regimenFiscal: c.RegimenFiscal, usoCFDI: c.UsoCFDIDefault, cp: c.CP,
      calle: c.Calle ?? '', noExterior: c.NoExterior ?? '', noInterior: c.NoInterior ?? '',
      colonia: c.Colonia ?? '', municipio: c.Municipio ?? '', localidad: c.Localidad ?? '',
      estado: c.Estado ?? '', claveEstado: c.ClaveSATEstado ?? '', claveMunicipio: c.ClaveSATMunicipio ?? '',
      pais: c.Pais ?? '', email: c.Email ?? '', contacto: c.Contacto ?? '',
    }))
    return json(200, { ok: true, clientes })
  } catch (e) {
    return json(502, { ok: false, error: { codigo: 'contadigital', mensaje: e instanceof Error ? e.message : String(e) } })
  }
})
