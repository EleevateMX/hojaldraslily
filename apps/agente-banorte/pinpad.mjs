// El puente con el DLL PINPAD.TPV de Banorte (Interredes, camino directo).
//
// Es el OTRO camino de Interredes, el que NO pasa por la API de TPV Solutions:
// el DLL habla directo a la pinpad por su IP en el puerto 1818 (o por un
// puerto COM), y se autentica con el usuario motor de Payworks. No necesita
// el login de la API. Por eso TPV Solutions dice, con razón, que «con las
// credenciales que les dimos funciona por DLL».
//
// El precio de este camino: el DLL es una librería de WINDOWS. Node no llama
// un DLL directo, así que se usa koffi (FFI). Este agente corre en la PC de
// la tienda, igual que el de tickets y el de etiquetas.
//
// TODO lo que sabe este archivo salió del manual de Interredes, Anexos III,
// IV y V. Las firmas son las del Anexo IV (VB.NET: `__cdecl`, cadenas ANSI);
// los comandos y modos, del Anexo V. **No se ha podido probar contra el DLL
// real ni contra la pinpad** —no los tenemos aquí—, así que los dos puntos
// que el manual deja ambiguos se dejan configurables para ajustarlos en el
// primer arranque sin tocar código:
//
//   1. Cómo leen los getters. El Anexo IV muestra DOS familias: `PPVBGet*`
//      que reciben un buffer (StringBuilder, estilo .NET) y `PPGet*` que
//      devuelven el char* (estilo Delphi/C). Por defecto usamos el de buffer
//      (`GETTER_STYLE=buffer`), que es el que viene con firma explícita; si
//      el DLL solo exporta los que devuelven, se cambia a `GETTER_STYLE=return`.
//   2. El importe. `PPSetTransactionAmount` recibe un `float` (Single). Va en
//      PESOS con centavos como decimales (43.01 = $43.01). Si el primer
//      cobro de prueba sale con el monto corrido, se revisa aquí.

import koffi from 'koffi'

/** Cada campo de la respuesta que sabemos leer, con su getter del DLL. */
const CAMPOS_RESPUESTA = {
  paywResult: 'PaywResult',
  paywCode: 'PaywCode',
  text: 'Text',
  affiliation: 'Affiliation',
  controlNumber: 'ControlNumber',
  authCode: 'AuthCode',
  authResult: 'AuthResult',
  cardType: 'CardType',
  cardBrand: 'CardBrand',
  issuingBank: 'IssuingBank',
  pan: 'Pan',
  bin: 'Bin',
  appPrefName: 'AppPrefName',
  appLabel: 'AppLabel',
  appId: 'AppID',
  tvr: 'TVR',
  entryMode: 'EntryMode',
  cardExpireDate: 'CardExpireDate',
  custReqDate: 'CustReqDate',
  authReqDate: 'AuthReqDate',
  custRespDate: 'CustRespDate',
  authRespDate: 'AuthRespDate',
}

/** Comandos válidos de `PPSetCommand` (Anexo V). */
export const COMANDOS = {
  OBTENER_LLAVE: 'OBTENER_LLAVE',
  VENTA: 'VENTA',
  CANCELACION: 'CANCELACION',
  DEVOLUCION: 'DEVOLUCION',
  VERIFICACION: 'VERIFICACION',
  CIERRE_LOTE: 'CIERRE_LOTE',
}

const BUF = 256 // los campos del Anexo IV se declaran con StringBuilder(100); 256 va holgado.

/**
 * Carga el DLL y arma las funciones. Devuelve un objeto con las operaciones
 * de alto nivel. `cfg` trae la ruta del DLL, cómo conectar y las credenciales.
 */
export function abrirPinpad(cfg) {
  const lib = koffi.load(cfg.dllPath)

  // --- Setters (void, __cdecl) ---
  const PPSetCommPort = lib.func('void __cdecl PPSetCommPort(const char *)')
  const PPSetIPAddressPort = lib.func('void __cdecl PPSetIPAddressPort(const char *, const char *)')
  const PPSetUser = lib.func('void __cdecl PPSetUser(const char *)')
  const PPSetPassword = lib.func('void __cdecl PPSetPassword(const char *)')
  const PPSetCommand = lib.func('void __cdecl PPSetCommand(const char *)')
  const PPSetControlNumber = lib.func('void __cdecl PPSetControlNumber(const char *)')
  const PPSetTransactionAmount = lib.func('void __cdecl PPSetTransactionAmount(float)')
  const PPSetMode = lib.func('void __cdecl PPSetMode(const char *)')
  const PPSetGroup = lib.func('void __cdecl PPSetGroup(const char *)')
  const PPSetPaywReference = lib.func('void __cdecl PPSetPaywReference(const char *)')
  const PPSetAuthCode = lib.func('void __cdecl PPSetAuthCode(const char *)')
  const PPSetCustomerRef5 = seguro(lib, 'void __cdecl PPSetCustomerRef5(const char *)')
  const PPSendTxn = lib.func('void __cdecl PPSendTxn(int)')

  // --- Getters, en los dos estilos del Anexo IV ---
  const getters = {}
  for (const [clave, sufijo] of Object.entries(CAMPOS_RESPUESTA)) {
    if (cfg.getterStyle === 'return') {
      // Estilo Delphi/C: `const char * PPGet<Sufijo>()`
      getters[clave] = seguro(lib, `const char * __cdecl PPGet${sufijo}()`)
    } else {
      // Estilo .NET: `void PPVBGet<Sufijo>(char *buffer)`, el DLL lo rellena.
      getters[clave] = seguro(lib, `void __cdecl PPVBGet${sufijo}(char *)`)
    }
  }

  function leerRespuesta() {
    const out = {}
    for (const [clave, fn] of Object.entries(getters)) {
      if (!fn) { out[clave] = null; continue }
      try {
        if (cfg.getterStyle === 'return') {
          out[clave] = (fn() ?? '').toString().trim() || null
        } else {
          const buf = Buffer.alloc(BUF)
          fn(buf)
          out[clave] = buf.toString('latin1').replace(/\0.*$/s, '').trim() || null
        }
      } catch {
        out[clave] = null
      }
    }
    return out
  }

  function conectar() {
    if (cfg.com) {
      PPSetCommPort(cfg.com)
    } else {
      PPSetIPAddressPort(cfg.ip, String(cfg.port || '1818'))
    }
  }

  /** Lo común a toda transacción: credenciales de Payworks, modo, grupo, folio. */
  function base(comando, controlNumber) {
    conectar()
    PPSetUser(cfg.user)
    PPSetPassword(cfg.password)
    // El `group` no va en la carga de llave (el ejemplo del manual no lo
    // trae); sí en venta/cancelación. Se manda solo si está puesto.
    if (cfg.group) PPSetGroup(cfg.group)
    PPSetMode(cfg.mode)
    PPSetCommand(comando)
    PPSetControlNumber(controlNumber)
    // El manual exige que customerRef5 lleve siempre este valor; si el DLL no
    // exporta el setter, no pasa nada (es más para la API).
    if (PPSetCustomerRef5) { try { PPSetCustomerRef5('PaxInterredAPI') } catch { /* opcional */ } }
  }

  function enviar() {
    PPSendTxn(Number(cfg.timeout || 90))
    const r = leerRespuesta()
    const bruto = (r.paywResult || '?').toUpperCase()[0]
    const resultado = ['A', 'D', 'R', 'T'].includes(bruto) ? bruto : '?'
    return { resultado, aprobado: resultado === 'A', campos: r }
  }

  return {
    /** Carga de llaves: la primera operación con una pinpad nueva. No cobra. */
    cargarLlave(controlNumber) {
      base(COMANDOS.OBTENER_LLAVE, controlNumber)
      return enviar()
    },
    /** Venta: el importe aparece en la pinpad y el cliente pone la tarjeta. */
    venta(controlNumber, montoPesos) {
      base(COMANDOS.VENTA, controlNumber)
      PPSetTransactionAmount(Number(montoPesos))
      return enviar()
    },
    /** Cancelación del día: pide la referencia y la autorización de la venta. */
    cancelar(controlNumber, montoPesos, paywReference, authCode) {
      base(COMANDOS.CANCELACION, controlNumber)
      PPSetTransactionAmount(Number(montoPesos))
      PPSetPaywReference(paywReference)
      PPSetAuthCode(authCode)
      return enviar()
    },
    /** Verificación por número de control: ¿qué pasó con esa operación? */
    verificar(controlNumber) {
      base(COMANDOS.VERIFICACION, controlNumber)
      return enviar()
    },
    /** Cierre de lote del grupo. */
    cerrarLote(controlNumber) {
      base(COMANDOS.CIERRE_LOTE, controlNumber)
      return enviar()
    },
  }
}

/**
 * Declara una función del DLL sin reventar si ese símbolo no existe en esta
 * versión del DLL. Devuelve null si no está, para que el llamador decida.
 */
function seguro(lib, prototipo) {
  try {
    return lib.func(prototipo)
  } catch {
    return null
  }
}

/** Número de control: ≤ 30 alfanuméricos, único por afiliación. */
export function numeroDeControl(prefijo = 'L') {
  return `${prefijo}${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1e4)}`.slice(0, 30)
}

/**
 * La respuesta del DLL, traducida a la misma forma del voucher que ya usa el
 * ticket (Anexo VII). Así el papel se pinta igual venga de la API o del DLL.
 */
export function voucherDesde(campos) {
  return {
    afiliacion: campos.affiliation ?? null,
    controlNumber: campos.controlNumber ?? null,
    autorizacion: campos.authCode ?? null,
    referencia: campos.authResult ?? null, // paywReference; el DLL lo entrega aquí según afiliación
    terminalId: null,
    marca: campos.cardBrand ?? null,
    tipo: campos.cardType ?? null,
    banco: campos.issuingBank ?? null,
    pan: campos.pan ?? null,
    entrada: campos.entryMode ?? null,
    pin: null, // la validación de PIN sale del voucher del DLL; se ajusta al certificar
    aid: campos.appId ?? null,
    aplicacion: campos.appPrefName ?? campos.appLabel ?? null,
    tvr: campos.tvr ?? null,
    tsi: null,
  }
}
