// Edge Function: staff-login
//
// Canjea el PIN de un empleado por una sesión de verdad de Supabase Auth.
//
// Hasta hoy el PIN era un candado de pantalla: se validaba, se guardaba el
// empleado en memoria del navegador, y la base seguía viendo `anon`. Cualquiera
// con la llave publicable —que vive dentro del frontend desplegado— podía
// llamar a las mismas funciones que la cajera.
//
// Aquí el PIN se valida del lado del servidor (service_role, nunca expuesto) y
// se devuelve un `token_hash` de un solo uso. El navegador lo canjea con
// `verifyOtp` y a partir de ese momento habla con la base como `authenticated`,
// con su `auth.uid()` ligado a su empleado. Recién ahí el RLS puede distinguir
// quién es quién.
//
// El correo es un identificador técnico derivado del id del empleado
// (emp-<uuid>@staff.hojaldraslily.com). No es de nadie y nunca se le escribe:
// existe solo porque Supabase Auth necesita una llave para la cuenta.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

/** Fallos seguidos desde un mismo origen antes de cerrar la puerta. */
const MAX_FALLOS = 8

function responder(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url = Deno.env.get('SUPABASE_URL')
  const servicio = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !servicio) {
    return responder({ ok: false, error: { codigo: 'not_configured', mensaje: 'Falta configuración del servidor.' } }, 500)
  }

  let pin = ''
  try {
    const body = await req.json()
    pin = String(body?.pin ?? '').trim()
  } catch {
    return responder({ ok: false, error: { codigo: 'bad_request', mensaje: 'JSON inválido' } }, 400)
  }
  if (!/^\d{4,6}$/.test(pin)) {
    return responder({ ok: false, error: { codigo: 'bad_request', mensaje: 'El PIN es de 4 a 6 dígitos.' } }, 400)
  }

  const sb = createClient(url, servicio, { auth: { persistSession: false } })

  // Un PIN de 4 dígitos son 10 mil combinaciones: sin freno, un script las
  // prueba todas. El origen se toma de la cabecera del proxy de Supabase.
  const origen =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('cf-connecting-ip') ||
    'desconocido'

  const { data: fallos } = await sb.rpc('fn_pin_fallos_recientes', { p_origen: origen })
  if ((fallos ?? 0) >= MAX_FALLOS) {
    return responder(
      { ok: false, error: { codigo: 'demasiados_intentos', mensaje: 'Demasiados intentos fallidos. Espera 15 minutos.' } },
      429,
    )
  }

  const { data: filas, error: errorPin } = await sb.rpc('fn_staff_por_pin', { p_pin: pin })
  if (errorPin) {
    return responder({ ok: false, error: { codigo: 'error_servidor', mensaje: errorPin.message } }, 500)
  }

  const emp = Array.isArray(filas) ? filas[0] : filas
  if (!emp) {
    await sb.rpc('fn_pin_registrar_intento', { p_origen: origen, p_exito: false })
    // El mismo mensaje para PIN inexistente y para PIN de empleado inactivo:
    // decir cuál de los dos es le regalaría información a quien esté probando.
    return responder({ ok: false, error: { codigo: 'pin_invalido', mensaje: 'PIN incorrecto' } }, 401)
  }

  // La cuenta de Auth se crea la primera vez que ese empleado entra.
  let authUserId: string | null = emp.auth_user_id ?? null
  if (!authUserId) {
    const { data: creado, error: errorCrear } = await sb.auth.admin.createUser({
      email: emp.correo,
      email_confirm: true,
      // Nadie va a usar esta contraseña: se entra por PIN. Se pone una larga y
      // aleatoria para que la cuenta no quede con una débil ni vacía.
      password: crypto.randomUUID() + crypto.randomUUID(),
      user_metadata: { empleado_id: emp.empleado_id, nombre: emp.nombre, rol: emp.rol },
    })
    if (errorCrear || !creado?.user) {
      return responder(
        { ok: false, error: { codigo: 'error_cuenta', mensaje: errorCrear?.message ?? 'No se pudo preparar la cuenta.' } },
        500,
      )
    }
    authUserId = creado.user.id
    const { error: errorVinculo } = await sb.rpc('fn_staff_vincular_auth', {
      p_empleado_id: emp.empleado_id,
      p_auth_user_id: authUserId,
    })
    if (errorVinculo) {
      return responder({ ok: false, error: { codigo: 'error_cuenta', mensaje: errorVinculo.message } }, 500)
    }
  }

  // `generateLink` NO envía correo: solo devuelve el token de un solo uso.
  const { data: enlace, error: errorEnlace } = await sb.auth.admin.generateLink({
    type: 'magiclink',
    email: emp.correo,
  })
  if (errorEnlace || !enlace?.properties?.hashed_token) {
    return responder(
      { ok: false, error: { codigo: 'error_sesion', mensaje: errorEnlace?.message ?? 'No se pudo abrir la sesión.' } },
      500,
    )
  }

  await sb.rpc('fn_pin_registrar_intento', { p_origen: origen, p_exito: true })

  return responder({
    ok: true,
    token_hash: enlace.properties.hashed_token,
    empleado: {
      id: emp.empleado_id,
      nombre: emp.nombre,
      rol: emp.rol,
      sucursal_id: emp.sucursal_id,
    },
  })
})
