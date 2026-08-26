# Guía de hardware — sucursal Hojaldras Lily

El software son webs estáticas que corren en un navegador y hablan con
Supabase. Por eso el hardware es sencillo: pantallas + PCs baratas + red
estable + la terminal Clip que ya tienes. Aquí va lo que necesitas por
estación, en dos niveles: **mínimo viable** y **recomendado**. Precios
aproximados en MXN (referencia 2026, varían).

## Resumen por estación

| Estación | App | Equipo mínimo | Recomendado |
|---|---|---|---|
| Kiosko cliente (autocobro) | `kiosko` | Tablet Android 10"+ en base | Monitor touch 21.5" + mini-PC |
| Caja / cajero | `pos` | Laptop o mini-PC + monitor | + cajón de dinero + impresora ticket + lector QR |
| Cocina + Barra (comparten TV) | `cocina-*` (vista combinada) | **1 Smart TV 24-32"** + Fire TV Stick | Mini-PC + monitor 24" |
| Comanda cocina | (impresión) | Impresora térmica 80 mm | + puente ESC/POS |
| Comanda barra | (impresión) | Impresora térmica 80 mm | + puente ESC/POS |
| Pantalla de folios (cliente) | `cliente-display` | Smart TV + Fire TV Stick | Monitor/TV dedicada |
| Cobro con tarjeta | (Clip) | **Clip Stand 2 (ya lo tienes)** | Clip Stand 2 / Pin Pad |
| Red | — | Módem del ISP | Router + **respaldo 4G/LTE con failover** |
| Energía | — | — | **No-break (UPS)** en caja, kiosko y router |

## Detalle y ejemplos

### 1. Kiosko de autocobro (la PC touch del cliente)
Es la pantalla donde el cliente arma su pedido y paga con Clip.
- **Mínimo**: una **tablet Android 10"–13"** en un pedestal/base con
  chapa (ej. Samsung Galaxy Tab A, ~$3,500–5,000) abriendo Chrome en la URL
  del kiosko. Suficiente para empezar.
- **Recomendado**: **monitor touch capacitivo 21.5"** (~$3,500–6,000) + un
  **mini-PC** (Intel N100, 8 GB RAM, ~$3,000–4,500) en modo kiosco. Más
  cómodo para el cliente y más robusto para uso continuo.
- Accesorios: base/pedestal de piso o mostrador; opcional **lector QR** para
  que el cliente escanee su código Rewards.

### 2. Caja (cajero)
- **Mínimo**: cualquier **laptop** o **mini-PC + monitor** con Chrome.
- **Recomendado** para operar rápido:
  - **Lector de código QR/barras USB** (~$400–800): identifica clientes y
    canjea cupones al instante (funciona como teclado, sin drivers).
  - **Impresora térmica de tickets 58/80 mm** (~$1,200–2,500) para el
    comprobante y el número de folio. *Nota:* hoy la impresión se hace con
    el diálogo de impresión del navegador; el corte automático ESC/POS es
    una integración posterior.
  - **Cajón de dinero** (se conecta a la impresora térmica, ~$700–1,500)
    para el efectivo.

### 3. Pantalla de cocina y barra (KDS) — una sola TV compartida
Muestra los pedidos en tiempo real y el operador avanza el estado
(pendiente → preparando → listo → entregado). **Cocina y barra comparten la
misma TV**: se usa la *vista combinada de cocina* (una app/vista que en un
solo monitor lista alimentos + bebidas, cada tarjeta rotulada con su estación).
- **Mínimo/costo bajo**: **una Smart TV 24-32"** + **Amazon Fire TV Stick** o
  un **Android TV Box** con navegador apuntando a la URL. (~$3,500–5,500).
- **Recomendado**: **mini-PC** (N100) + **monitor 24"** montado en pared, en
  modo kiosco con autoarranque. Más estable para todo el día.
- Para marcar **"Listo"** en la TV compartida: pantalla **táctil** o un
  **mouse/teclado inalámbrico** junto a las estaciones.
- *Alternativa* si se prefieren dos pantallas separadas: una TV por estación
  con `cocina-alimentos` y `cocina-bebidas` (las dos apps ya existentes).
- **Nota (planeado):** la *vista combinada* en una sola TV es una vista nueva
  aún por construir; hoy existen las dos apps separadas. Ver `pendientes.md`.

#### 3b. Comandas impresas por estación (impresoras térmicas) — LISTO
Cada estación imprime la comanda de su pedido para **pegarla o llevarla con
la orden**: **cocina** imprime los alimentos y **barra** los shakes/bebidas,
ruteado por la categoría del producto. **Ya implementado y funcional** (cola
persistente + agente local ESC/POS, no depende del navegador) — ver
`docs/impresion-comandas.md` para cómo funciona y
`docs/instalacion-agente-impresion.md` para instalar el agente en cada
sucursal.
- **1 impresora térmica 80 mm en cocina** + **1 en barra** (~$1,200–2,500 c/u).
- Con la impresora de tickets de la **caja**, son **3 impresoras** en total.
- Cada impresora necesita un equipo (mini-PC/laptop) en la misma red
  corriendo el agente local — puede ser el mismo mini-PC del KDS si tiene
  puerto de red/USB libre, o uno aparte.

### 4. Pantalla de folios para el cliente (display)
- **Smart TV** o monitor colgado a la vista del público con `cliente-display`
  (muestra "en preparación" y "listo"). Fire TV Stick o mini-PC.

### 5. Cobro con tarjeta — Clip
- **Clip Stand 2 (el que ya tienes)**: el cajero/cliente cobra en la terminal
  y confirma en la app con la referencia (modo manual). No requiere conectar
  la app a la terminal.
- Si a futuro quieres que el POS **mande el monto solo** a la terminal,
  necesitarías un **Clip Pin Pad** (terminal con integración por API); el
  Stand 2 no expone ese API. Ver `integracion-clip.md`.

### 6. Red e internet (crítico)
Todo depende de internet (las apps hablan con Supabase). Sin red, no hay
ventas mientras dure la caída.
- **Router** decente + **respaldo 4G/LTE con failover automático** (ej. un
  router con SIM de respaldo, ~$1,500–3,500). Muy recomendable en un negocio.
- WiFi estable para tablets/Fire Sticks; cable de red para las PCs fijas.

### 7. Energía
- **No-break (UPS)** de ~600–1000 VA (~$1,200–2,500) para **caja, kiosko y
  router**: evita que un apagón corte una venta o reinicie las pantallas.

## Ejemplo de arranque (1 sucursal, presupuesto ajustado)

| Concepto | Aprox. MXN |
|---|---|
| Kiosko: monitor touch 21.5" + mini-PC N100 | $8,000 |
| Caja: mini-PC + monitor + lector QR USB | $6,500 |
| Impresora térmica (caja) + cajón de dinero | $3,000 |
| Cocina + barra: 1 Smart TV 24" + Fire Stick (compartida) | $4,500 |
| 2× impresora térmica de comandas (cocina + barra) | $4,000 |
| Display folios: Smart TV + Fire Stick | $4,500 |
| Router con respaldo 4G | $2,500 |
| 2× No-break | $4,000 |
| **Total aproximado** | **~$37,000** |
| Clip Stand 2 | (ya lo tienes) |

Versión súper económica (tablets + Smart TVs + una laptop existente) puede
bajar a ~$15,000–20,000. Se puede crecer por etapas: arranca con kiosko +
caja + una pantalla de cocina, y agrega las demás después.

## Notas de configuración
- Cada dispositivo solo necesita **Chrome/Chromium en modo kiosco** apuntando
  a la URL de su app (ver `despliegue.md`, sección 7) y quedar en autoarranque.
- No se instala nada más: las actualizaciones del software son automáticas al
  desplegar (solo se refresca la página).
