# Agente de Banorte por DLL (Interredes, camino directo)

Este es el **segundo** camino de Interredes, el que **no** pasa por la API de
TPV Solutions. El DLL `PINPAD.TPV` que da Banorte habla directo a la pinpad
por su IP (puerto 1818) y se autentica con el **usuario motor de Payworks**
—el mismo que ya nos dieron—. Por eso TPV Solutions dice, con razón, que
«con esas credenciales funciona por DLL».

Sirve para **probar que la terminal conecta y cobra sin esperar el alta de
la API**, y así presionar el trámite del login de la API con evidencia.

> **Dónde corre:** en la PC de la tienda (Windows). El DLL es de Windows, así
> que esto no funciona en el teléfono ni en la tableta ni en la nube. Es como
> el agente de tickets: un programa local.
>
> **El DLL real ya llegó** (23/10/26, kit `DLL_REMOTAS.zip` de Banorte) y sus
> funciones **coinciden exactamente** con las que este agente llama: 74
> símbolos `PP*`, en las dos familias de getters. El kit trae dos builds:
> **`Pinpad.dll`** (64 bits, el que conviene con el Node normal) y
> **`Pinpad.tpv`** (32 bits). Falta probar contra la **pinpad** (no la
> tenemos aquí): dos cosas de comportamiento se confirman en el primer
> arranque y se ajustan en `.env` sin tocar código —`GETTER_STYLE` (cómo leer
> los resultados) y que el importe salga con el punto decimal correcto—.
>
> Los binarios **no van en el repo** (son de Banorte y el repo es público):
> los pone la casa en esta carpeta, en la PC de la tienda.

## Instalación (una vez, en la PC de la tienda)

1. Instala **Node.js** (si no está ya por el agente de tickets). El normal es
   de **64 bits**, que es justo el que va con `Pinpad.dll`.
2. Instala el **Microsoft Visual C++ Redistributable (x64)**:
   <https://aka.ms/vs/17/release/vc_redist.x64.exe>. El DLL lo necesita
   (`MSVCP140.dll`, `VCRUNTIME140.dll`); sin él, Windows no lo carga.
3. Copia el **`Pinpad.dll`** (64 bits) del kit de Banorte dentro de esta
   carpeta. Si tu Node fuera de 32 bits, usa `Pinpad.tpv` y pon esa ruta en
   `DLL_PATH`. La regla: Node y DLL, **la misma arquitectura**.
4. Copia `.env.example` a **`.env`** y llena los datos:
   - `PINPAD_IP`: la IP de la pinpad en la red de la tienda (la ves en la
     pinpad: botón verde ×2 → 1 Configurar, clave `26813` → 3 Reporte de
     parámetros, clave `86279`).
   - `PAYWORKS_USER`, `PAYWORKS_PASSWORD`, `PAYWORKS_GROUP`: las de Banorte.
   - Deja `PAYWORKS_MODE=AUT` para probar sin cobrar.
5. Abre una terminal en esta carpeta y corre `npm install`.

## Probar desde una PC Windows cualquiera (sin ir a la tienda)

Sirve cualquier PC con Windows, **con una condición: tiene que estar en el
mismo WiFi que la pinpad** (el mismo del que, desde la Mac, el `nc` dio
«success»). Si está en otra red, no la alcanza.

Pasos:

1. Copia esta carpeta (`agente-banorte`) a la PC Windows.
2. Pon **`Pinpad.dll`** (64 bits) dentro de la carpeta. Instala también el
   **VC++ Redistributable x64** (link arriba) si no estaba.
3. Doble clic en **`probar.bat`**. Detecta solo el `.dll` (o el `.tpv`), te
   pregunta la IP de la pinpad, el usuario y la contraseña de Payworks (el
   group puede ir vacío para esta prueba) y hace la **carga de llave**, que no
   cobra. Si sale `APROBADA`, la terminal conecta y quedó con llave.

### Si solo tienes una Mac: Windows en una máquina virtual

Como la Mac ya está en el WiFi de la pinpad, puedes correr Windows dentro de
la Mac y la VM alcanza la pinpad por esa misma red. Receta corta con **UTM**
(gratis):

1. Instala **UTM** (`mac.getutm.app`) o Parallels.
2. En un Mac con chip Apple (M1/M2/M3), baja **Windows 11 ARM** (UTM tiene un
   asistente que lo descarga). En un Mac Intel, Windows x64.
3. En la red de la VM elige **Bridged** (puente), no NAT: así la VM aparece
   como un equipo más en el WiFi y puede ver la pinpad.
4. Dentro de Windows: instala Node.js LTS (`nodejs.org`) y el VC++
   Redistributable, copia esta carpeta y el DLL, y doble clic en `probar.bat`.

> Nota de arquitectura (importante en Mac con chip Apple): el Windows 11 ARM
> **no corre nativamente** el `Pinpad.dll` de 64 bits x64. Windows ARM sí
> emula x86 (32 bits), así que el camino ahí es **`Pinpad.tpv` (32 bits) con
> un Node de 32 bits**. Lo más simple, ya que tienes una **PC Windows x64 real
> a la mano**, es usar esa con `Pinpad.dll` y el Node normal, y dejar la VM
> solo para emergencias.

## Probar por línea de comandos (si prefieres la consola)

En orden, del más inofensivo al que mueve dinero:

```bat
node index.mjs llave          REM carga de llaves: no cobra, prueba la conexión
node index.mjs venta 10.00    REM una venta de $10; en modo AUT NO cobra
node index.mjs verificar L...  REM consulta una operación por su número de control
```

- Si **`llave`** sale `APROBADA`, la pinpad conectó y responde: eso es lo que
  queremos demostrar.
- Si sale `SIN RESPUESTA` o un error de carga del DLL, revisa: IP y puerto de
  la pinpad, que la pinpad esté en la misma red, la arquitectura de Node, el
  VC++ Redistributable instalado, y que `Pinpad.dll` esté en esta carpeta.
- La primera vez que una venta en AUT salga aprobada, revisa en el detalle
  que el **monto** y los campos del voucher se lean bien; si el monto sale
  corrido (×100), avisa para ajustar una línea.

## Dejarlo escuchando (para que la caja le pida cobros)

```bat
node index.mjs serve
```

Levanta un servidor local (`http://localhost:8099`) con `POST /llave`,
`/venta {monto}`, `/verificar {controlNumber}` y `/cancelar`. Es para pruebas
desde la misma red. **No se expone a internet**: el DLL cobra.

La integración final con la caja (que vive en la nube) **no** debería ser por
este puerto —una página en HTTPS no puede llamar a un `http://` local sin
tropezar con el navegador—. Lo correcto, el día que el DLL sea el camino
elegido, es el mismo modelo del agente de tickets: una **cola** en la base
que este agente consulta, hace el cobro y responde. Eso se arma cuando se
confirme que vamos por DLL y no por la API.

## Qué hace cada archivo

- `pinpad.mjs` — el puente con el DLL: las firmas de las funciones (Anexo IV),
  los comandos (Anexo V) y la lectura de la respuesta.
- `index.mjs` — la línea de comandos y el servidor local.
- `.env` — la configuración (no va al repo).
