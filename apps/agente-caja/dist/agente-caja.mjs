// Hojaldras Lily — agente de tickets de caja. Generado por empaquetar.mjs.
// No editar a mano: se reescribe en cada publicación.

// src/index.ts
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

// ../../packages/ui/src/ticketTipos.ts
var NEGOCIO_DEFAULT = {
  nombre: "Hojaldras Lily",
  slogan: "Tradici\xF3n que une generaciones",
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
  avisos: [
    "Para facturar, env\xEDa tu n\xFAmero de ticket a facturas@hojaldraslily.com",
    "Por higiene NO se hacen cambios de pan"
  ],
  mostrarLogo: true,
  // Apagado: la casa no quiere el nombre de quien atendió en el ticket.
  mostrarCajero: false
};

// ../../packages/ui/src/ticketLineas.ts
var COLUMNAS_80MM = 48;
var COLUMNAS_58MM = 32;
var estilo = (texto, m = {}) => ({ tipo: "estilo", texto, ...m });
function pesos(n) {
  const v = Math.abs(Number(n) || 0);
  const [ent, dec] = v.toFixed(2).split(".");
  return "$" + ent.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + dec;
}
function ultimosCuatro(pan) {
  const digitos = (pan ?? "").replace(/\D/g, "");
  return digitos.length >= 4 ? digitos.slice(-4) : null;
}
function parejasDeVoucher(t) {
  const p = [];
  const pon = (k, v) => {
    if (v && String(v).trim()) p.push([k, String(v).trim()]);
  };
  pon("Afiliaci\xF3n", t.afiliacion);
  pon("Terminal", t.terminalId);
  pon("No. control", t.controlNumber);
  const u4 = ultimosCuatro(t.pan);
  pon("Tarjeta", [t.marca, t.tipo, u4 ? `**** ${u4}` : null].filter(Boolean).join(" "));
  pon("Emisor", t.banco);
  pon("Autorizaci\xF3n", t.autorizacion);
  pon("Referencia", t.referencia);
  pon("Entrada", t.entrada);
  pon("AID", t.aid);
  pon("Aplicaci\xF3n", t.aplicacion);
  pon("TVR", t.tvr);
  pon("TSI", t.tsi);
  return p;
}
function validacionDeVoucher(pin) {
  const v = (pin ?? "").trim();
  if (v === "1") return "nip";
  if (v === "2") return "nada";
  return "firma";
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
  const hayLogo = negocio.mostrarLogo !== false && !!negocio.logoRaster?.datos;
  if (!hayLogo) {
    L.push(estilo(negocio.nombre.toUpperCase().slice(0, Math.floor(ancho / 2)), { ancho: 2, alto: 2, alinear: "centro" }));
  }
  if (negocio.slogan?.trim()) for (const l of envolver(negocio.slogan.trim())) L.push(centrar(l));
  const chico = (t) => estilo(t, { alinear: "centro", fuente: "B" });
  if (negocio.rfc?.trim()) L.push(chico(`RFC: ${negocio.rfc.trim()}`));
  if (negocio.regimen?.trim()) for (const l of envolver(negocio.regimen.trim(), 0, 63)) L.push(chico(l));
  if (negocio.sucursal) L.push(centrar(`Sucursal ${negocio.sucursal}`));
  for (const renglon of (negocio.direccion ?? "").split("\n")) {
    for (const l of envolver(renglon)) L.push(centrar(l.trim()));
  }
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
  const cajero = negocio.mostrarCajero === false ? "" : data.cajero ?? "";
  L.push("FOLIO");
  L.push(estilo(` #${data.folio} `, { ancho: 2, alto: 2, invertido: true }));
  L.push(estilo(fechaTxt, { alinear: "der" }));
  const canalLinea = [data.canal, cajero].filter(Boolean).join(" \xB7 ");
  if (canalLinea) L.push(estilo(canalLinea, { alinear: "der" }));
  if (data.clienteNombre) {
    L.push(regla());
    L.push("ENCARGO PARA");
    for (const l of envolver(data.clienteNombre, 0, Math.floor(ancho / 2))) {
      L.push(estilo(l, { ancho: 2, negrita: true }));
    }
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
  L.push(estilo(parear("TOTAL", pesos(total)), { alto: 2, negrita: true }));
  L.push("");
  if (data.partes?.length) {
    for (const p of data.partes) L.push(parear(p.metodo, pesos(p.monto)));
  } else {
    L.push(parear(data.metodoPago, pesos(total)));
  }
  if (data.referenciaPago && !data.tarjeta) L.push(`Ref. ${data.referenciaPago}`);
  if (data.tarjeta) {
    L.push("");
    L.push(estilo("BANORTE", { negrita: true, alinear: "centro" }));
    for (const [k, v] of parejasDeVoucher(data.tarjeta)) L.push(parear(k, v));
    const validacion = validacionDeVoucher(data.tarjeta.pin);
    if (validacion === "nip") {
      L.push("");
      L.push(estilo("AUTORIZADO CON FIRMA ELECTRONICA", { negrita: true, alinear: "centro" }));
    } else if (validacion === "firma") {
      L.push("");
      L.push("");
      L.push(centrar("_".repeat(Math.min(28, ancho - 4))));
      L.push(centrar("Firma"));
    }
  }
  if (data.recibido != null && data.recibido >= total) {
    L.push(parear("Recibido", pesos(data.recibido)));
    L.push(parear("Cambio", pesos(data.recibido - total)));
  }
  L.push("");
  if (negocio.leyenda) for (const l of envolver(negocio.leyenda)) L.push(estilo(l.trim(), { negrita: true, alinear: "centro" }));
  if (negocio.pieSecundario) {
    const partes = negocio.pieSecundario.split("\xB7").map((x) => x.trim()).filter(Boolean);
    const cabeEntero = negocio.pieSecundario.length <= ancho;
    for (const parte of cabeEntero ? [negocio.pieSecundario] : partes) {
      for (const l of envolver(parte)) L.push(centrar(l.trim()));
    }
  }
  const avisos = lineasDeAvisos(negocio);
  if (avisos.length) {
    L.push(regla());
    for (const a of avisos) for (const l of envolver(a)) L.push(centrar(l.trim()));
  }
  return L;
}
function lineasDeAvisos(negocio) {
  const horario = (negocio.horario ?? "").trim();
  const avisos = (negocio.avisos ?? []).map((a) => a.trim()).filter(Boolean);
  return horario ? [`Horario: ${horario}`, ...avisos] : avisos;
}
function hora(iso) {
  if (!iso) return "";
  const f = new Date(iso);
  if (Number.isNaN(f.getTime())) return "";
  return f.toLocaleString("es-MX", {
    timeZone: "America/Merida",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}
function renglonesDeConteo(raw) {
  if (!raw || typeof raw !== "object") return [];
  const o = raw;
  const out = [];
  const lado = (v, nombre) => {
    if (!v || typeof v !== "object") return;
    Object.entries(v).map(([den, n]) => [Number(den), Math.max(0, Math.trunc(Number(n) || 0))]).filter(([den, n]) => Number.isFinite(den) && den > 0 && n > 0).sort((a, b) => b[0] - a[0]).forEach(([den, n]) => out.push({ etiqueta: `${nombre} $${den}`, piezas: n, subtotal: den * n }));
  };
  lado(o.billetes, "Billete");
  lado(o.monedas, "Moneda");
  return out;
}
function armarCorte(c, negocio, ancho = COLUMNAS_80MM) {
  const { centrar, parear, regla, envolver } = formato(ancho);
  const L = [];
  const n = (v) => Number(v ?? 0);
  L.push(estilo(negocio.nombre.toUpperCase().slice(0, Math.floor(ancho / 2)), { ancho: 2, alto: 2, alinear: "centro" }));
  if (negocio.sucursal) L.push(centrar(`Sucursal ${negocio.sucursal}`));
  L.push("");
  L.push(estilo("CORTE DE CAJA", { negrita: true, alinear: "centro" }));
  if (c.folio != null) L.push(estilo(` #${c.folio} `, { ancho: 2, alto: 2, invertido: true, alinear: "centro" }));
  if (c.caja) L.push(centrar(c.caja));
  L.push(regla("="));
  L.push(parear("Abri\xF3", `${hora(c.abierto_en)}${c.abrio ? " \xB7 " + c.abrio : ""}`));
  L.push(parear("Cerr\xF3", `${hora(c.cerrado_en)}${c.cerro ? " \xB7 " + c.cerro : ""}`));
  L.push(regla());
  L.push(parear(`\xD3rdenes: ${n(c.num_ordenes)}`, ""));
  L.push(parear("Efectivo", pesos(n(c.total_efectivo))));
  if (n(c.total_tarjeta) > 0) L.push(parear("Terminal", pesos(n(c.total_tarjeta))));
  if (n(c.total_inbursa) > 0) L.push(parear("Inbursa", pesos(n(c.total_inbursa))));
  if (n(c.total_transferencia) > 0) L.push(parear("Transferencia", pesos(n(c.total_transferencia))));
  if (n(c.total_clip) > 0) L.push(parear("Clip", pesos(n(c.total_clip))));
  if (n(c.total_cortesia) > 0) L.push(parear("Cortes\xEDa", pesos(n(c.total_cortesia))));
  if (n(c.total_otro) > 0) L.push(parear("Otro", pesos(n(c.total_otro))));
  L.push(parear("TOTAL VENDIDO", pesos(n(c.total_pagado))));
  L.push(regla());
  L.push(parear("Fondo inicial", pesos(n(c.fondo_inicial))));
  L.push(parear("+ Efectivo vendido", pesos(n(c.total_efectivo))));
  L.push(parear("= Deb\xEDa haber", pesos(n(c.efectivo_esperado))));
  L.push(parear("Se cont\xF3", pesos(n(c.efectivo_contado))));
  const cierre = renglonesDeConteo(c.conteo_cierre);
  for (const r of cierre) {
    L.push(parear(`  ${r.etiqueta} x ${r.piezas}`, pesos(r.subtotal)));
  }
  L.push(regla("="));
  const dif = n(c.diferencia);
  const palabra = dif === 0 ? "CUADRA" : dif > 0 ? "SOBRANTE" : "FALTANTE";
  L.push(estilo(parear(palabra, (dif < 0 ? "-" : "") + pesos(Math.abs(dif))), { alto: 2, negrita: true }));
  L.push("");
  if (c.notas) {
    for (const l of envolver(`Notas: ${c.notas}`)) L.push(l);
    L.push("");
  }
  L.push(centrar("Firma: ____________________"));
  L.push("");
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
  /**
   * Tamaño del carácter: 1 o 2 veces de ancho y de alto (GS ! n).
   *
   * Es lo único que el papel tiene para decir «esto es más importante»: no
   * hay color ni tipografías. Con `ancho = 2` caben 24 columnas en vez de
   * 48 — quien arme la línea tiene que saberlo, por eso el ancho viaja en la
   * marca de estilo y no se adivina aquí.
   */
  tamano(ancho = 1, alto = 1) {
    return this.crudo(GS, 33, ancho - 1 << 4 | alto - 1);
  }
  /** Negrita (ESC E n). En térmica es «más calor»: funciona para una línea, no para un párrafo. */
  negrita(encendida) {
    return this.crudo(ESC, 69, encendida ? 1 : 0);
  }
  /**
   * Fuente A (normal, 12 px de ancho) o B (chica, 9 px) con `ESC M n`.
   * La B es para el renglón que debe verse secundario sin dejar de leerse —el
   * RFC y el régimen—: en papel térmico no hay tamaños intermedios, FontB es
   * «lo chiquito». No cambia el número de columnas que se usa para cuadrar,
   * así que se abre y se cierra en la misma línea, como las demás marcas.
   */
  fuente(b) {
    return this.crudo(ESC, 77, b === "B" ? 1 : 0);
  }
  /**
   * Blanco sobre negro (GS B n). El brief del ticket lo dice: gasta mucho
   * calor, sirve para una palabra —el folio— y no para más.
   */
  invertir(encendido) {
    return this.crudo(GS, 66, encendido ? 1 : 0);
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
function esPayloadDeCorte(p) {
  return !!p && typeof p === "object" && p.tipo === "corte" && typeof p.corte_id === "string";
}
function negocioDelTrabajo(payload, porOmision) {
  const n = payload?.negocio;
  if (!n || typeof n !== "object") return porOmision;
  const limpio = Object.fromEntries(
    Object.entries(n).filter(([, v]) => v !== null && v !== void 0)
  );
  return { ...porOmision, ...limpio };
}
function logoDelNegocio(neg) {
  if (neg.mostrarLogo === false) return null;
  const r = neg.logoRaster;
  if (!r || typeof r !== "object") return null;
  const ancho = Number(r.ancho) | 0;
  const alto = Number(r.alto) | 0;
  if (ancho <= 0 || alto <= 0 || typeof r.datos !== "string") return null;
  let datos;
  try {
    datos = new Uint8Array(Buffer.from(r.datos, "base64"));
  } catch {
    return null;
  }
  if (datos.length !== Math.ceil(ancho / 8) * alto) return null;
  return { datos, ancho, alto };
}
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
  const neg = negocioDelTrabajo(trabajo.payload, negocio);
  if (esPayloadDeCorte(trabajo.payload)) {
    const b2 = new ConstructorEscPos().inicializar().alinear(0);
    for (const l of armarCorte(trabajo.payload, neg, ancho)) dibujar(b2, l);
    return b2.cortar().construir();
  }
  if (!esPayloadDeTicket(trabajo.payload)) {
    throw new Error(
      `El trabajo ${trabajo.id} no trae un ticket que se pueda imprimir (falta folio, items o metodoPago).`
    );
  }
  const img = logo ?? logoDelNegocio(neg);
  const b = new ConstructorEscPos().inicializar();
  if (img) b.alinear(1).logo(img);
  b.alinear(0);
  for (const l of armarTicket(trabajo.payload, neg, ancho)) dibujar(b, l);
  return b.cortar().construir();
}
function dibujar(b, l) {
  if (typeof l === "string") {
    b.linea(l);
    return;
  }
  if (l.tipo === "qr") {
    b.alinear(1);
    qr(b, l.contenido);
    b.alinear(0);
    return;
  }
  const alinear = l.alinear === "centro" ? 1 : l.alinear === "der" ? 2 : 0;
  b.alinear(alinear);
  b.tamano(l.ancho ?? 1, l.alto ?? 1);
  if (l.fuente === "B") b.fuente("B");
  if (l.negrita) b.negrita(true);
  if (l.invertido) b.invertir(true);
  b.linea(l.texto);
  if (l.invertido) b.invertir(false);
  if (l.negrita) b.negrita(false);
  if (l.fuente === "B") b.fuente("A");
  b.tamano(1, 1);
  b.alinear(0);
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

// src/windows.ts
import { writeFile, unlink } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
var AYUDANTE = String.raw`
using System;
using System.IO;
using System.Runtime.InteropServices;
public class LilyRaw {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }
  [DllImport("winspool.Drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern bool OpenPrinter(string src, out IntPtr h, IntPtr d);
  [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true)]
  static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern bool StartDocPrinter(IntPtr h, int level, [In] DOCINFO di);
  [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true)]
  static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true)]
  static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true)]
  static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true)]
  static extern bool WritePrinter(IntPtr h, byte[] buf, int n, out int written);
  public static void Send(string printer, byte[] data) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero))
      throw new Exception("No se pudo abrir la impresora '" + printer + "' (codigo " + Marshal.GetLastWin32Error() + ")");
    try {
      var di = new DOCINFO();
      di.pDocName = "Ticket Hojaldras Lily";
      di.pDataType = "RAW";
      if (!StartDocPrinter(h, 1, di)) throw new Exception("StartDocPrinter fallo");
      try {
        if (!StartPagePrinter(h)) throw new Exception("StartPagePrinter fallo");
        int escritos;
        if (!WritePrinter(h, data, data.Length, out escritos)) throw new Exception("WritePrinter fallo");
        if (escritos != data.Length) throw new Exception("Se escribieron " + escritos + " de " + data.Length + " bytes");
        EndPagePrinter(h);
      } finally { EndDocPrinter(h); }
    } finally { ClosePrinter(h); }
  }
}
`;
function imprimirWindows(bytes, nombre) {
  return new Promise((resolve, reject) => {
    const archivo = join(tmpdir(), `lily-ticket-${randomUUID()}.bin`);
    const limpiar = () => {
      void unlink(archivo).catch(() => {
      });
    };
    writeFile(archivo, bytes).then(() => {
      const ps = [
        '$ErrorActionPreference = "Stop"',
        `Add-Type -TypeDefinition @'`,
        AYUDANTE,
        `'@`,
        `[LilyRaw]::Send('${nombre.replace(/'/g, "''")}', [IO.File]::ReadAllBytes('${archivo.replace(/'/g, "''")}'))`
      ].join("\n");
      const b64 = Buffer.from(ps, "utf16le").toString("base64");
      execFile(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", b64],
        { timeout: 2e4, windowsHide: true },
        (err, _stdout, stderr) => {
          limpiar();
          if (err) reject(new Error(`impresora de Windows "${nombre}": ${(stderr || err.message).trim()}`));
          else resolve();
        }
      );
    }).catch((e) => {
      limpiar();
      reject(e);
    });
  });
}

// src/autoactualizar.ts
import { writeFile as writeFile2 } from "node:fs/promises";
import { dirname, join as join2 } from "node:path";
import { fileURLToPath } from "node:url";
var CARPETA_AGENTE = dirname(fileURLToPath(import.meta.url));
var BASE_DEFECTO = "https://raw.githubusercontent.com/EleevateMX/hojaldraslily/main/apps/agente-caja/dist";
var URL_ACTUALIZAR = process.env.AGENTE_ACTUALIZAR_URL?.trim() || BASE_DEFECTO;
async function bajarTexto(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.text();
}
async function revisarActualizacion(versionActual) {
  let publicada;
  try {
    const pkg = JSON.parse(await bajarTexto(`${URL_ACTUALIZAR}/package.json`));
    publicada = String(pkg?.version ?? "").trim();
  } catch {
    return null;
  }
  if (!publicada || publicada === versionActual) return null;
  let codigo;
  try {
    codigo = await bajarTexto(`${URL_ACTUALIZAR}/agente-caja.mjs`);
  } catch {
    return null;
  }
  if (codigo.length < 5e3 || !codigo.includes("Hojaldras Lily")) return null;
  try {
    const pkgNuevo = await bajarTexto(`${URL_ACTUALIZAR}/package.json`);
    await writeFile2(join2(CARPETA_AGENTE, "agente-caja.mjs"), codigo, "utf8");
    await writeFile2(join2(CARPETA_AGENTE, "package.json"), pkgNuevo, "utf8");
  } catch {
    return null;
  }
  return publicada;
}

// src/index.ts
var VERSION = "1.1.2";
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
var WINDOWS = process.env.IMPRESORA_WINDOWS?.trim() || "";
var HOST = WINDOWS ? "" : requerido("IMPRESORA_HOST");
var PUERTO = Number(process.env.IMPRESORA_PUERTO || 9100);
var COPIAS_TICKET = Math.max(1, Math.round(Number(process.env.TICKET_COPIAS || 2)));
var ANCHO = process.env.IMPRESORA_ANCHO?.trim() === "58mm" ? COLUMNAS_58MM : COLUMNAS_80MM;
var AGENTE_ID = process.env.AGENTE_ID?.trim() || "agente-caja-01";
var POLL_MS = Number(process.env.POLL_INTERVALO_SEGUNDOS || 3) * 1e3;
var LATIDO_MS = Number(process.env.LATIDO_INTERVALO_SEGUNDOS || 30) * 1e3;
var sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
var hora2 = () => (/* @__PURE__ */ new Date()).toLocaleTimeString("es-MX", { timeZone: "America/Merida" });
var log = {
  info: (m) => console.log(`[${hora2()}] ${m}`),
  error: (m) => console.error(`[${hora2()}] ERROR  ${m}`)
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
        const uno = construirDocumento(t, datosDelNegocio(), null, ANCHO);
        const copias = t.tipo_documento === "ticket" ? COPIAS_TICKET : 1;
        const bytes = copias > 1 ? Buffer.concat(Array.from({ length: copias }, () => uno)) : uno;
        if (WINDOWS) await imprimirWindows(bytes, WINDOWS);
        else await enviar(bytes, HOST, PUERTO);
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
  const destino = WINDOWS ? `${WINDOWS} (USB/Windows)` : `${HOST}:${PUERTO}`;
  console.log(`  version ${VERSION} \xB7 impresora ${destino} \xB7 ${ANCHO} columnas`);
  console.log("");
  if (WINDOWS) {
    log.info(`imprime por USB a la impresora de Windows "${WINDOWS}"`);
  } else if (await estaViva(HOST, PUERTO)) {
    log.info("la impresora responde");
  } else {
    log.error(`la impresora ${HOST}:${PUERTO} NO responde. Se sigue intentando.`);
    log.error("Revisa que est\xE9 encendida, en red y con su IP fija reservada.");
  }
  await latir();
  setInterval(() => void latir(), LATIDO_MS);
  setInterval(() => void cicloDeImpresion(), POLL_MS);
  const REVISAR_MS = Math.max(5, Number(process.env.ACTUALIZAR_INTERVALO_MIN || 20)) * 60 * 1e3;
  setInterval(() => void revisarYReiniciar(), REVISAR_MS);
  void revisarYReiniciar();
  log.info("esperando tickets\u2026 corre oculto; se actualiza solo");
}
async function revisarYReiniciar() {
  if (imprimiendo) return;
  const nueva = await revisarActualizacion(VERSION);
  if (nueva && !imprimiendo) {
    log.info(`Versi\xF3n ${nueva} descargada (ten\xEDa ${VERSION}). Reiniciando para estrenarla\u2026`);
    process.exit(0);
  }
}
void arrancar();
