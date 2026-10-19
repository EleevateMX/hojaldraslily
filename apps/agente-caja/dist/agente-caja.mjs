// Hojaldras Lily — agente de tickets de caja. Generado por empaquetar.mjs.
// No editar a mano: se reescribe en cada publicación.

// src/index.ts
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

// ../../packages/ui/src/ticketTipos.ts
var NEGOCIO_DEFAULT = {
  nombre: "Hojaldras Lily",
  sucursal: "Miguel Alem\xE1n",
  direccion: "Calle 29-A #183 por Av. 22\nCol. Miguel Alem\xE1n, M\xE9rida, Yuc.",
  telefono: "999 926 71 51",
  // Vacío, NO un guion: `'—'` es texto, así que la plantilla lo daba por
  // bueno e imprimía «RFC —» en el papel, a la vista del cliente. Vacío no se
  // imprime nada, que es lo honesto mientras no esté el dato.
  rfc: "",
  // Decía «Consérvelo en refrigeración», que venía de la heladería del motor
  // original: una hojaldra no se refrigera. Es el mismo caso que el bloque de
  // los puntos que ya se quitó del pie del ticket.
  leyenda: "\xA1Gracias por su compra!",
  pieSecundario: "Encarga con 2 d\xEDas de anticipaci\xF3n \xB7 999 926 71 51",
  // Los tres avisos que pidió la casa. El HORARIO todavía NO está aquí a
  // propósito: no me lo dieron, y un horario inventado impreso en el papel es
  // peor que no tenerlo — el cliente llega a una tienda cerrada. En cuanto lo
  // digan, se agrega como un renglón más de este arreglo y ya.
  avisos: ["Solicita tu factura", "Por higiene NO se hacen cambios de pan"],
  mostrarLogo: true,
  // Apagado: la casa no quiere el nombre de quien atendió en el ticket.
  mostrarCajero: false
};

// ../../packages/ui/src/ticketLineas.ts
var COLUMNAS_80MM = 48;
var COLUMNAS_58MM = 32;
function pesos(n) {
  const v = Math.abs(Number(n) || 0);
  const [ent, dec] = v.toFixed(2).split(".");
  return "$" + ent.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + dec;
}
function formato(ancho) {
  const W = ancho;
  const centrar = (s) => s.length >= W ? s.slice(0, W) : " ".repeat(Math.floor((W - s.length) / 2)) + s;
  const parear = (izq, der) => {
    const hueco = W - izq.length - der.length;
    if (hueco >= 1) return izq + " ".repeat(hueco) + der;
    return izq.slice(0, Math.max(0, W - der.length - 1)) + " " + der;
  };
  const regla = (c = "-") => c.repeat(W);
  const envolver = (texto, sangria = 0, ancho2 = W) => {
    const max = Math.max(1, ancho2 - sangria);
    const out = [];
    let linea = "";
    const cerrar = () => {
      if (linea) {
        out.push(" ".repeat(sangria) + linea);
        linea = "";
      }
    };
    for (const palabra of texto.split(/\s+/).filter(Boolean)) {
      if (palabra.length > max) {
        cerrar();
        for (const trozo of palabra.match(new RegExp(`.{1,${max}}`, "g")) ?? []) {
          out.push(" ".repeat(sangria) + trozo);
        }
        continue;
      }
      if (!linea) linea = palabra;
      else if ((linea + " " + palabra).length <= max) linea += " " + palabra;
      else {
        cerrar();
        linea = palabra;
      }
    }
    cerrar();
    return out;
  };
  return { W, centrar, parear, regla, envolver };
}
function subtotalDe(items) {
  return items.reduce((s, i) => s + i.cantidad * i.precioUnitario, 0);
}
function totalDe(data) {
  const sub = subtotalDe(data.items);
  return Math.max(0, sub - (data.descuento ?? 0) - (data.anticipo ?? 0));
}
function armarTicket(data, negocio, ancho = COLUMNAS_80MM) {
  const { centrar, parear, regla, envolver } = formato(ancho);
  const L = [];
  L.push(centrar(negocio.nombre.toUpperCase()));
  if (negocio.sucursal) L.push(centrar(negocio.sucursal));
  for (const renglon of (negocio.direccion ?? "").split("\n")) {
    for (const l of envolver(renglon)) L.push(centrar(l.trim()));
  }
  if (negocio.telefono) L.push(centrar(`Tel. ${negocio.telefono}`));
  if (negocio.rfc?.trim()) L.push(centrar(`RFC: ${negocio.rfc.trim()}`));
  L.push("");
  const f = data.fecha instanceof Date ? data.fecha : new Date(data.fecha);
  const fechaTxt = f.toLocaleString("es-MX", {
    timeZone: "America/Merida",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
  const aLaDerecha = (izq, der) => der ? parear(izq, der) : izq;
  const cajero = negocio.mostrarCajero === false ? "" : data.cajero ?? "";
  L.push(aLaDerecha(`Folio: ${data.folio}`, cajero ? `Caja: ${cajero}` : ""));
  L.push(aLaDerecha(fechaTxt, data.canal ?? ""));
  if (data.clienteNombre) {
    for (const l of envolver(`Para: ${data.clienteNombre}`)) L.push(l);
  }
  L.push(regla("="));
  L.push(parear("CANT DESCRIPCION", "IMPORTE"));
  L.push(regla());
  for (const it of data.items) {
    const importe = it.cantidad * it.precioUnitario;
    const prefijo = `${String(it.cantidad).padEnd(4)} `;
    const imp = pesos(importe);
    const disponible = ancho - imp.length - 1 - prefijo.length;
    if (it.nombre.length <= disponible) {
      L.push(parear(prefijo + it.nombre, imp));
    } else {
      const trozos = envolver(it.nombre, 0, Math.max(1, disponible));
      trozos.forEach((t, i) => {
        L.push(i === 0 ? prefijo + t : " ".repeat(prefijo.length) + t);
      });
      L.push(parear("", imp));
    }
    if (it.cantidad > 1) {
      L.push(`${" ".repeat(prefijo.length)}@ ${pesos(it.precioUnitario)} c/u`);
    }
    if (it.personalizacion) {
      for (const l of envolver(`* ${it.personalizacion}`, prefijo.length)) L.push(l);
    }
  }
  L.push(regla());
  const sub = subtotalDe(data.items);
  const desc = data.descuento ?? 0;
  const anticipo = data.anticipo ?? 0;
  const total = totalDe(data);
  const hayRestas = desc > 0 || anticipo > 0;
  if (hayRestas) L.push(parear("Subtotal", pesos(sub)));
  if (desc > 0) L.push(parear("Descuento", "-" + pesos(desc)));
  if (anticipo > 0) L.push(parear("Anticipo ya pagado", "-" + pesos(anticipo)));
  if (hayRestas) L.push(regla("="));
  L.push(parear("TOTAL", pesos(total)));
  L.push("");
  if (data.partes?.length) {
    for (const p of data.partes) L.push(parear(p.metodo, pesos(p.monto)));
  } else {
    L.push(parear(data.metodoPago, pesos(total)));
  }
  if (data.referenciaPago) L.push(`Ref. ${data.referenciaPago}`);
  if (data.recibido != null && data.recibido >= total) {
    L.push(parear("Recibido", pesos(data.recibido)));
    L.push(parear("Cambio", pesos(data.recibido - total)));
  }
  L.push("");
  if (negocio.leyenda) for (const l of envolver(negocio.leyenda)) L.push(centrar(l.trim()));
  if (negocio.pieSecundario) {
    const partes = negocio.pieSecundario.split("\xB7").map((x) => x.trim()).filter(Boolean);
    const cabeEntero = negocio.pieSecundario.length <= ancho;
    for (const parte of cabeEntero ? [negocio.pieSecundario] : partes) {
      for (const l of envolver(parte)) L.push(centrar(l.trim()));
    }
  }
  const avisos = (negocio.avisos ?? []).map((a) => a.trim()).filter(Boolean);
  if (avisos.length) {
    L.push(regla());
    for (const a of avisos) for (const l of envolver(a)) L.push(centrar(l.trim()));
  }
  return L;
}

// src/escpos.ts
var ESC = 27;
var GS = 29;
var ConstructorEscPos = class {
  partes = [];
  /**
   * Bytes crudos.
   *
   * Es **público** a propósito. En el original era privado y quien necesitaba
   * mandar una secuencia que la clase no cubría —el QR nativo— tenía que
   * llegar a `partes` con un cast (`b as unknown as { partes: number[] }`).
   * Un cast para saltarse el propio encapsulamiento es una señal de que la
   * puerta debía estar abierta: aquí lo está, y el QR no necesita trucos.
   */
  crudo(...b) {
    this.partes.push(...b);
    return this;
  }
  /** Reinicia la impresora y fija la pagina de codigos. */
  inicializar() {
    this.crudo(ESC, 64);
    this.crudo(ESC, 116, 16);
    return this;
  }
  /** 0 izquierda, 1 centro, 2 derecha. */
  alinear(a) {
    return this.crudo(ESC, 97, a);
  }
  texto(s) {
    this.partes.push(...Buffer.from(s, "latin1"));
    return this;
  }
  linea(s = "") {
    return this.texto(s).crudo(10);
  }
  avanzar(n = 1) {
    return this.crudo(ESC, 100, Math.max(0, Math.min(255, n)));
  }
  /**
   * Corte parcial, dejando una pestaña para que el ticket no caiga al piso.
   *
   * El avance previo NO es decorativo. En esta clase de impresoras la
   * guillotina esta entre 15 y 20 mm por encima del cabezal, asi que si se
   * corta sin avanzar lo suficiente, la cuchilla cae sobre las ultimas
   * lineas impresas y el ticket sale mutilado. A ~3.5 mm por linea, seis
   * lineas son ~21 mm: cubre la separacion con margen.
   */
  cortar(lineasDeAvance = 6) {
    return this.avanzar(lineasDeAvance).crudo(GS, 86, 1);
  }
  chicharra(veces = 1) {
    return this.crudo(ESC, 66, Math.min(9, veces), 3);
  }
  /**
   * Imagen raster (GS v 0).
   *
   * Se manda en bloques de filas y no de una sola vez: el buffer de estas
   * impresoras es chico, y un raster de 576 puntos de ancho por 300 de alto
   * entero la deja imprimiendo basura a media imagen.
   */
  logo(img, filasPorBloque = 64) {
    const bytesPorFila = Math.ceil(img.ancho / 8);
    for (let y0 = 0; y0 < img.alto; y0 += filasPorBloque) {
      const filas = Math.min(filasPorBloque, img.alto - y0);
      this.crudo(
        GS,
        118,
        48,
        0,
        bytesPorFila & 255,
        bytesPorFila >> 8 & 255,
        filas & 255,
        filas >> 8 & 255
      );
      const desde = y0 * bytesPorFila;
      this.partes.push(...img.datos.subarray(desde, desde + filas * bytesPorFila));
    }
    return this;
  }
  construir() {
    return Buffer.from(this.partes);
  }
};

// src/render.ts
function esPayloadDeTicket(p) {
  if (!p || typeof p !== "object") return false;
  const d = p;
  return (typeof d.folio === "number" || typeof d.folio === "string") && Array.isArray(d.items) && typeof d.metodoPago === "string";
}
function esPayloadDePrueba(p) {
  return !!p && typeof p === "object" && p.prueba === true;
}
function construirPrueba(p, ancho) {
  const b = new ConstructorEscPos().inicializar().alinear(1);
  const centrar = (s) => s.length >= ancho ? s.slice(0, ancho) : " ".repeat(Math.floor((ancho - s.length) / 2)) + s;
  b.linea("=".repeat(ancho));
  b.linea(centrar("PRUEBA DE IMPRESION"));
  b.linea("=".repeat(ancho));
  b.linea();
  if (p.impresora) b.linea(centrar(p.impresora));
  b.linea(centrar(new Date(p.hora ?? Date.now()).toLocaleString("es-MX", { timeZone: "America/Merida" })));
  b.linea();
  b.linea(centrar("Si lees esto, la cadena completa sirve:"));
  b.linea(centrar("base, cola, agente, red e impresora."));
  b.linea();
  b.linea(centrar("Acentos: \xE1\xE9\xED\xF3\xFA \xF1\xD1 \xBF? \xA1! \xB0"));
  return b.cortar().construir();
}
function construirDocumento(trabajo, negocio, logo, ancho = COLUMNAS_80MM) {
  if (esPayloadDePrueba(trabajo.payload)) return construirPrueba(trabajo.payload, ancho);
  if (!esPayloadDeTicket(trabajo.payload)) {
    throw new Error(
      `El trabajo ${trabajo.id} no trae un ticket que se pueda imprimir (falta folio, items o metodoPago).`
    );
  }
  const b = new ConstructorEscPos().inicializar();
  if (logo) b.alinear(1).logo(logo).linea();
  b.alinear(0);
  for (const l of armarTicket(trabajo.payload, negocio, ancho)) {
    if (typeof l === "string") {
      b.linea(l);
      continue;
    }
    b.alinear(1);
    qr(b, l.contenido);
    b.alinear(0);
  }
  return b.cortar().construir();
}
function qr(b, contenido) {
  const datos = Buffer.from(contenido, "latin1");
  const n = datos.length + 3;
  b.crudo(29, 40, 107, 4, 0, 49, 65, 50, 0);
  b.crudo(29, 40, 107, 3, 0, 49, 67, 6);
  b.crudo(29, 40, 107, 3, 0, 49, 69, 49);
  b.crudo(29, 40, 107, n & 255, n >> 8 & 255, 49, 80, 48);
  b.crudo(...datos);
  b.crudo(29, 40, 107, 3, 0, 49, 81, 48);
  b.crudo(10);
}

// src/socket.ts
import net from "node:net";
function enviar(datos, host, puerto, timeoutMs = 1e4) {
  return new Promise((resolve, reject) => {
    const s = new net.Socket();
    let listo = false;
    const fallar = (e) => {
      if (!listo) {
        listo = true;
        s.destroy();
        reject(e);
      }
    };
    s.setTimeout(timeoutMs);
    s.on("timeout", () => fallar(new Error(`Timeout hablando con ${host}:${puerto}`)));
    s.on("error", (e) => fallar(new Error(`${host}:${puerto} \u2014 ${e.message}`)));
    s.on("connect", () => {
      s.write(datos, () => {
        const espera = Math.min(8e3, Math.max(500, Math.ceil(datos.length / 20)));
        setTimeout(() => s.end(), espera);
      });
    });
    s.on("close", () => {
      if (!listo) {
        listo = true;
        resolve();
      }
    });
    s.connect(puerto, host);
  });
}
function estaViva(host, puerto, timeoutMs = 3e3) {
  return new Promise((resolve) => {
    const s = new net.Socket();
    const cerrar = (v) => {
      s.destroy();
      resolve(v);
    };
    s.setTimeout(timeoutMs);
    s.on("timeout", () => cerrar(false));
    s.on("error", () => cerrar(false));
    s.on("connect", () => cerrar(true));
    s.connect(puerto, host);
  });
}

// src/index.ts
var VERSION = "1.0.0";
function requerido(clave) {
  const v = process.env[clave]?.trim();
  if (!v) {
    console.error(`Falta ${clave} en el .env. Copia .env.example y llenalo.`);
    process.exit(1);
  }
  return v;
}
var SUPABASE_URL = requerido("SUPABASE_URL");
var SUPABASE_ANON_KEY = requerido("SUPABASE_ANON_KEY");
var TOKEN = requerido("IMPRESORA_TOKEN");
var HOST = requerido("IMPRESORA_HOST");
var PUERTO = Number(process.env.IMPRESORA_PUERTO || 9100);
var ANCHO = process.env.IMPRESORA_ANCHO?.trim() === "58mm" ? COLUMNAS_58MM : COLUMNAS_80MM;
var AGENTE_ID = process.env.AGENTE_ID?.trim() || "agente-caja-01";
var POLL_MS = Number(process.env.POLL_INTERVALO_SEGUNDOS || 3) * 1e3;
var LATIDO_MS = Number(process.env.LATIDO_INTERVALO_SEGUNDOS || 30) * 1e3;
var sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
var hora = () => (/* @__PURE__ */ new Date()).toLocaleTimeString("es-MX", { timeZone: "America/Merida" });
var log = {
  info: (m) => console.log(`[${hora()}] ${m}`),
  error: (m) => console.error(`[${hora()}] ERROR  ${m}`)
};
function datosDelNegocio() {
  return NEGOCIO_DEFAULT;
}
var imprimiendo = false;
async function cicloDeImpresion() {
  if (imprimiendo) return;
  imprimiendo = true;
  try {
    const { data, error } = await sb.rpc("fn_imprimir_reclamar_trabajos", {
      p_token: TOKEN,
      p_agente: AGENTE_ID,
      p_limite: 5
    });
    if (error) {
      log.error(`reclamando: ${error.message}`);
      return;
    }
    const trabajos = data ?? [];
    for (const t of trabajos) {
      try {
        const bytes = construirDocumento(t, datosDelNegocio(), null, ANCHO);
        await enviar(bytes, HOST, PUERTO);
        const { error: e } = await sb.rpc("fn_imprimir_confirmar", {
          p_token: TOKEN,
          p_trabajo_id: t.id
        });
        if (e) log.error(`confirmando ${t.id}: ${e.message}`);
        else log.info(`impreso ${t.tipo_documento} ${t.id.slice(0, 8)}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error(`imprimiendo ${t.id.slice(0, 8)}: ${msg}`);
        await sb.rpc("fn_imprimir_fallar", {
          p_token: TOKEN,
          p_trabajo_id: t.id,
          p_error: msg.slice(0, 500)
        });
      }
    }
  } finally {
    imprimiendo = false;
  }
}
async function latir() {
  const { error } = await sb.rpc("fn_imprimir_latido", { p_token: TOKEN, p_version: VERSION });
  if (error) log.error(`latido: ${error.message}`);
}
async function arrancar() {
  console.log("");
  console.log("  Hojaldras Lily \u2014 agente de tickets de caja");
  console.log(`  version ${VERSION} \xB7 impresora ${HOST}:${PUERTO} \xB7 ${ANCHO} columnas`);
  console.log("");
  if (await estaViva(HOST, PUERTO)) {
    log.info("la impresora responde");
  } else {
    log.error(`la impresora ${HOST}:${PUERTO} NO responde. Se sigue intentando.`);
    log.error("Revisa que est\xE9 encendida, en red y con su IP fija reservada.");
  }
  await latir();
  setInterval(() => void latir(), LATIDO_MS);
  setInterval(() => void cicloDeImpresion(), POLL_MS);
  log.info("esperando tickets\u2026 deja esta ventana abierta");
}
void arrancar();
