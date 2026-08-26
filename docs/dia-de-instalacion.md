# Día de instalación — 3 pantallas

Guía para el montaje en sucursal: **2 pantallas de cocina** (Alimentos y
Bebidas, cada una con su impresora) y **1 kiosko**. Pensada para
imprimirse y seguirse en orden.

## Antes de empezar: qué se hace desde dónde

| Tarea | Quién / dónde |
|---|---|
| Abrir las apps en cada pantalla | En sitio, en cada equipo |
| Instalar el agente de impresión | En sitio, en la PC que tiene las impresoras |
| Conectar y detectar la impresora | En sitio (USB o red local) |
| Registrar impresoras, empleados, precios | Admin (desde cualquier navegador) |
| Diagnóstico en vivo, tokens, cola de impresión | Se puede hacer en remoto contra la base |

> El agente de impresión **tiene que correr en la máquina que tiene las
> impresoras**: es quien habla con el hardware por USB o por la red local.
> Nada externo puede imprimir por él.

## 0. Dos montajes posibles

El sistema no impone cuántas PCs uses. Lo que **siempre** son dos son las
*estaciones* (Alimentos y Bebidas): el ruteo de cada producto a su comanda va
por estación, no por máquina.

### Opción A — una sola PC para toda la cocina (más simple y más barata)

Una PC con **dos monitores** y **las dos impresoras** colgando de ella:

- Monitor 1 → `cocina-alimentos`, Monitor 2 → `cocina-bebidas` (dos ventanas
  del navegador, cada una en pantalla completa en su monitor).
- **Un solo agente** de impresión atiende las dos impresoras. Ya está hecho
  así: el agente levanta **un worker por impresora**, cada uno con su propio
  token y su propia conexión, de modo que si una impresora falla o le revocan
  el token, la otra sigue imprimiendo.
- En Admin se siguen registrando **dos impresoras** (una por estación) y los
  dos tokens se pegan en el mismo `printers.config.json`.

*Contrapartida honesta:* es un único punto de falla. Si esa PC se apaga, se
caen las dos pantallas **y** las dos impresoras. Los pedidos no se pierden
(quedan en la cola de la base y se reimprimen al volver), pero la cocina se
queda a ciegas mientras tanto. Con esta opción el **no-break es más necesario,
no menos**.

### Opción B — una PC por estación

Cada equipo con su pantalla, su impresora y su propio agente. Más caro, pero
una avería solo tumba una estación.

## 0.0 Requisitos por equipo

- **PC de cocina** (una o dos, según la opción): navegador + Node.js 20 o
  superior (para el agente) + las impresoras conectadas (USB o en la red).
- **Kiosko**: solo navegador. No necesita agente ni impresora.
- **Caja**: solo navegador. La impresora de comandas **no** va aquí.
- Todos en la misma red, con internet.

### 0.1 Escaneo previo (para revisarlo juntos)

En cada equipo, antes de instalar nada, corre el escaneo y pégame el
resultado. Es de solo lectura — no instala ni cambia nada — y me dice qué
hardware hay, si falta Node.js, si la impresora está conectada por USB o en
la red, y si el equipo alcanza Supabase:

| Sistema | Cómo |
|---|---|
| Windows | Clic derecho en `scripts/escanear-equipo.ps1` → *Ejecutar con PowerShell*. Deja `hojaldraslily-escaneo.txt` en el Escritorio. |
| Linux / macOS | `bash scripts/escanear-equipo.sh \| tee ~/hojaldraslily-escaneo.txt` |

Si Windows bloquea el script, abre PowerShell en esa carpeta y pega:
`Set-ExecutionPolicy -Scope Process Bypass -Force; .\escanear-equipo.ps1`

> Esto hace falta porque el hardware **solo lo ve la máquina que lo tiene
> enchufado**. Desde fuera no hay forma de detectar una impresora USB ni de
> entrar a tu red local: el escaneo es el puente.

## 1. Estado que ya está listo (no hay que tocarlo)

Verificado en la base de producción:

- Sucursal **Hojaldras Lily Mérida** marcada como producción.
- Estaciones **Alimentos** y **Bebidas** creadas.
- Almacenes **Bodega** y **Kiosko**.
- Caja **Caja Kiosko** activa.
- Kiosko en modo **pagar_en_caja** (el cliente arma su orden y paga en
  caja; el kiosko nunca cobra solo). Expira a los 15 min.
- Empleados: **Cajero 1** y **Gerente** (este último hace falta para
  autorizar descuentos y canjes de cupón).

## 1.5 Asociar cada táctil con su monitor (5 min)

Con varias pantallas táctiles, Windows manda **todo** el toque al monitor
principal hasta que se le dice cuál es cuál. El síntoma es inconfundible: una
pantalla responde y las demás se ven bien pero no reaccionan al dedo.

Primero confirma que Windows ve los digitalizadores:

```powershell
Get-CimInstance Win32_PnPEntity |
  Where-Object { $_.Name -match 'tácti|touch|digitizer' } |
  Select-Object Name,Status | Format-Table -Auto
```

Deben aparecer tantas *"Pantalla táctil compatible con HID"* en `OK` como
pantallas táctiles tengas. Si falta alguna, el problema es el **cable USB del
táctil**: una pantalla táctil necesita dos cables, el de video y uno USB
aparte para el toque. Conectar solo el HDMI da imagen pero no toque.

Si están todas, es solo mapeo:

1. `control /name Microsoft.TabletPCSettings` (o `tabletpc.cpl`).
2. Pestaña **Pantalla** → botón **Configurar…** → **Entrada táctil**.
3. Windows muestra en un monitor: *"Toque esta pantalla con un dedo…"*.
   - Si el mensaje está en la pantalla que quieres asociar, **tócala**.
   - Si está en otra, **Enter** para saltar al siguiente monitor.
4. Repetir hasta cubrir todas.

Con monitores rotados a vertical, al terminar verifica que el dedo caiga donde
debe. Si tocas arriba-izquierda y el clic sale abajo-derecha, la rotación del
táctil no siguió a la del video: usa **Restablecer** en esa misma ventana y
repite el paso 3 con las pantallas ya rotadas.

## 2. Abrir las apps (5 min)

Cada pantalla abre su URL y se deja en pantalla completa (F11):

| Pantalla | URL |
|---|---|
| Cocina Alimentos | `https://shake-cocina-alimentos.pages.dev` |
| Cocina Bebidas (Barra) | `https://shake-cocina-bebidas.pages.dev` |
| Kiosko | `https://shake-kiosko.pages.dev` |
| Caja (POS) | `https://shake-pos.pages.dev` |
| Admin | `https://shake-admin.pages.dev` |

En el POS se entra con PIN. Los PIN temporales se cambian en
**Admin → Empleados** el mismo día (ver §6).

## 3. Impresoras (15 min, lo único con hardware)

1. **Conectar las dos impresoras** y encenderlas.
   - Si son **USB en Windows**: instálalas primero en Windows como impresoras
     normales y anota el **nombre exacto** con que quedan en *Dispositivos e
     impresoras*. Ese nombre es el que usa el agente.
   - Si son **de red**: anota la IP de cada una.
2. **Registrar las dos** en Admin → Impresoras — una por estación, aunque
   cuelguen de la misma PC: nombre, estación (Alimentos o Bebidas), tipo de
   conexión y la IP si aplica. Al guardar, la pantalla muestra **el token del
   agente una sola vez** — cópialo. Son **dos tokens distintos**.
3. **Instalar el agente** en la PC que tiene las impresoras (detalle completo
   en `docs/instalacion-agente-impresion.md`):
   ```bash
   cd agente-impresion
   npm install
   cp .env.example .env                    # ya trae URL y anon key
   cp printers.config.example.json printers.config.json
   ```
4. Pegar los **dos tokens** en `printers.config.json` — es una lista, van las
   dos impresoras en el mismo archivo y las atiende el mismo agente. En
   `interface` va, según cómo esté conectada cada una:

   | Conexión | Valor de `interface` |
   |---|---|
   | Red | `tcp://192.168.1.50:9100` |
   | USB en Windows | `printer:NOMBRE EXACTO EN WINDOWS` |
   | USB en Linux | `/dev/usb/lp0` |

5. **Probar antes de seguir**:
   ```bash
   npm run diagnose -- --imprimir
   ```
   Revisa conexión, autenticación, estación, cola e imprime una prueba
   física. No sigas si algo sale con ✘.
6. Dejarlo corriendo: `npm run start` (o como servicio para que arranque
   solo). Verifica `http://localhost:7777/status`: deben aparecer **las dos**
   impresoras.

Si elegiste la **opción B** (una PC por estación), repite los pasos 3-6 en el
segundo equipo con **su** token. **Cada impresora lleva su propio token** —
nunca se reutiliza el de la otra.

## 4. Prueba de punta a punta (10 min)

Con las 3 pantallas abiertas y el agente corriendo:

1. **Kiosko**: armar una orden con **un alimento y una bebida** y enviarla.
   Anota el folio que muestra.
2. **POS → Pendientes**: aparece la orden. Cóbrala en efectivo.
3. Al cobrar, verifica en cadena:
   - La comanda del alimento **se imprime sola** en la cocina de
     Alimentos y aparece en su pantalla.
   - La de la bebida, en Barra. Cada estación ve **solo lo suyo**.
   - El inventario bajó (Admin → Inventario).
   - La venta aparece en el corte de caja.
4. Avanzar estados en el KDS: Pendiente → Preparando → Listo → Entregar.
5. **Prueba de descuento**: en el POS aplica un descuento — debe pedir el
   PIN del Gerente. Con el PIN del cajero debe rechazarlo.
6. **Prueba de resistencia**: apaga una impresora a media venta. El pedido
   debe seguir viéndose normal en el KDS (no se pierde). Reimprime desde
   Admin cuando la enciendas.

## 5. Qué revisar si algo no sale

| Síntoma | Dónde mirar |
|---|---|
| No imprime | `npm run diagnose` en ese equipo; Admin → Impresoras (¿conectada?) |
| La orden no llega al KDS | Admin → Sistema: pedidos sin comanda, órdenes esperando caja |
| El kiosko no muestra productos | El producto necesita **precio** en costosshake para estar activo |
| Descuento no deja aplicar | Falta el PIN de un empleado con rol Gerente o Administrador |

Admin → **Sistema** es el tablero único: pagos pendientes, órdenes
atoradas, impresoras desconectadas, comandas fallidas y ventas sin
movimiento de inventario.

## 6. Pendientes de captura (sin esto no se ve en pantalla)

Estos no son fallas del sistema: son datos que faltan por capturar en
costosshake y que hacen que el producto no aparezca.

- **Los 17 shakes no tienen precio de venta** → no aparecen en el menú.
  Es lo más importante a capturar antes de vender.
- **Precio de scoop** (pestaña Proteínas): vacío en las 122 proteínas.
- **Precio de bote** (`precioBote`): vacío — sin él no se venden los
  suplementos de reventa.
- **Extras**: en Admin → Extras hay que ponerle precio de venta a cada
  ingrediente que se quiera ofrecer (el sistema ya muestra su costo real).
- **Cambiar los PIN temporales** en Admin → Empleados.

## 7. Google / lealtad

El botón de Google en la app de Rewards está **deshabilitado del lado de
Supabase**, no es un error del código: falta crear las credenciales en
Google Cloud. Hoy la app avisa amablemente en vez de mandar al cliente a
una pantalla de error. Pasos en `docs/configurar-google-auth.md`.

Mientras tanto, la lealtad **sí funciona sin Google**: en caja se
identifica al cliente por teléfono o QR, y desde ahí se dan de alta
clientes nuevos, se acumulan mancuernas y se canjean cupones.
