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
> **No se ha podido probar aquí** contra el DLL real ni contra la pinpad
> (no los tenemos). Está escrito fiel al manual (Anexos III, IV y V). Dos
> cosas se confirman en el primer arranque y se ajustan en `.env` sin tocar
> código: `GETTER_STYLE` (cómo leer los resultados) y que el importe salga
> con el punto decimal correcto.

## Instalación (una vez, en la PC de la tienda)

1. Instala **Node.js** (si no está ya por el agente de tickets).
2. Copia el archivo **`PINPAD.TPV`** que da Banorte/TPV Solutions dentro de
   esta carpeta.
   - Importante: Node tiene que ser de la **misma arquitectura** que el DLL.
     Si el DLL es de 32 bits, usa Node de 32 bits; si es de 64, de 64.
3. Copia `.env.example` a **`.env`** y llena los datos:
   - `PINPAD_IP`: la IP de la pinpad en la red de la tienda (la ves en la
     pinpad: menú Configurar → Reporte de parámetros, clave `86279`).
   - `PAYWORKS_USER`, `PAYWORKS_PASSWORD`, `PAYWORKS_GROUP`: las de Banorte.
   - Deja `PAYWORKS_MODE=AUT` para probar sin cobrar.
4. Abre una terminal en esta carpeta y corre `npm install`.

## Probar desde una PC Windows cualquiera (sin ir a la tienda)

Sirve cualquier PC con Windows, **con una condición: tiene que estar en el
mismo WiFi que la pinpad** (el mismo del que, desde la Mac, el `nc` dio
«success»). Si está en otra red, no la alcanza.

Pasos:

1. Copia esta carpeta (`agente-banorte`) a la PC Windows.
2. Pon el `PINPAD.TPV` real dentro de la carpeta.
3. Doble clic en **`probar.bat`**. Te pregunta la IP de la pinpad, el usuario
   y la contraseña de Payworks (el group puede ir vacío para esta prueba) y
   hace la **carga de llave**, que no cobra. Si sale `APROBADA`, la terminal
   conecta y quedó con llave.

### Si solo tienes una Mac: Windows en una máquina virtual

Como la Mac ya está en el WiFi de la pinpad, puedes correr Windows dentro de
la Mac y la VM alcanza la pinpad por esa misma red. Receta corta con **UTM**
(gratis):

1. Instala **UTM** (`mac.getutm.app`) o Parallels.
2. En un Mac con chip Apple (M1/M2/M3), baja **Windows 11 ARM** (UTM tiene un
   asistente que lo descarga). En un Mac Intel, Windows x64.
3. En la red de la VM elige **Bridged** (puente), no NAT: así la VM aparece
   como un equipo más en el WiFi y puede ver la pinpad.
4. Dentro de Windows: instala Node.js LTS (`nodejs.org`), copia esta carpeta y
   el `PINPAD.TPV`, y doble clic en `probar.bat`.

> Nota de arquitectura: el `PINPAD.TPV` tiene que ser de la misma plataforma
> que el Windows de la VM. Casi siempre el DLL de Banorte es x86 (32 bits) y
> corre en Windows x64 sin problema; en Windows ARM podría no cargar. Si
> `probar.bat` dice que no pudo cargar el DLL, usa un Windows x64 (VM en Mac
> Intel, o la PC de la tienda).

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
  la pinpad, que la pinpad esté en la misma red, la arquitectura de Node, y
  que `PINPAD.TPV` esté en esta carpeta.
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
