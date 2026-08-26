# Rewards: de PWA a app en App Store y Play Store

`rewards.hojaldraslily.com` está construida como **app**, no como página:
pestañas fijas abajo, pantalla completa sin barra del navegador, atajos en
el icono y áreas seguras respetadas. Este documento es el runbook para
llevarla a TestFlight y, después, a las tiendas.

---

## 1. Qué tiene hoy

**Cuatro pestañas** (`apps/cliente-pwa/src/App.tsx`):

| Pestaña | Qué muestra |
|---|---|
| **Tarjeta** | El pase con el total canjeable y su QR, las dos bolsas de mancuernas, las tarjetas de sellos, los cupones, los paquetes de recarga y el canje de tarjetas de regalo |
| **Menú** | La carta viva de la barra, leída de la misma base que la caja |
| **Actividad** | Lo que siempre pide, sus compras con las mancuernas de cada una, y el movimiento de puntos |
| **Cuenta** | Datos, teléfono, cómo funciona el programa, contacto y cerrar sesión |

**Un solo viaje de datos.** Todo el expediente llega en una llamada
(`fn_mi_resumen_lealtad`), con el progreso y las estadísticas **ya
calculados en el servidor**. En un celular con la red de la tienda, cuatro
consultas separadas eran cuatro esperas — y la app nativa consume
exactamente la misma función.

**Instalable de verdad.** El manifest declara `standalone`, orientación
vertical, categorías, capturas y dos atajos (*Mi código*, *Menú de hoy*)
que abren directo en su pestaña. Lleva icono **maskable** aparte: Android
recorta a círculo y solo garantiza el 80 % central, así que con Milo a
borde completo le cortaba brazos y pies. iOS no lee el manifest, así que
además tiene sus etiquetas `apple-mobile-web-app-*`.

**Preparada para pantallas con notch.** `viewport-fit=cover` más
`env(safe-area-inset-*)`: la barra de pestañas no queda debajo del
indicador de inicio del iPhone.

### Cómo se instala hoy, sin tiendas

- **Android/Chrome**: menú ⋮ → "Instalar aplicación".
- **iPhone/Safari**: botón compartir → "Agregar a pantalla de inicio".

Queda con su icono, sin barra del navegador y con los atajos al mantener
presionado. Para la mayoría de los negocios esto alcanza y evita el costo
y la burocracia de las tiendas. Lo que **no** da: notificaciones push en
iPhone con el usuario fuera de la app, presencia en las tiendas, y el pase
en Apple Wallet.

---

## 2. Lo que ya está listo en el repo

No hay que reescribir nada: Capacitor envuelve la misma web.

- `apps/cliente-pwa/capacitor.config.ts` — `appId: com.hojaldraslily.rewards`,
  `webDir: dist`.
- `apps/cliente-pwa/src/nativo.ts` — el login de Google para nativo (ver
  §4, es lo único que no se puede reutilizar tal cual).
- `apps/cliente-pwa/assets/` — `icon.png` (1024) y los dos `splash.png`
  (2732×2732) que consume el generador de iconos.
- Comandos: `app:sync`, `app:ios`, `app:android`, `app:iconos`.

**Se empaqueta el `dist`, no se apunta a la web.** Capacitor permite
poner `server.url = https://rewards.hojaldraslily.com` y que la app siempre
traiga la última versión sin pasar por revisión. Es cómodo y es la causa
más común de rechazo: Apple lo lee como "esto es un sitio web envuelto".
Empaquetado obliga a publicar versión por cada cambio, y a cambio pasa.

---

## 3. Llegar a TestFlight (en la Mac)

Todo esto corre en la Mac con Xcode. Requiere Node 20+, pnpm y CocoaPods
(`sudo gem install cocoapods`).

```bash
git clone https://github.com/EleevateMX/ventashake.git
cd ventashake && pnpm install

# La app se compila con estas dos variables METIDAS DENTRO del paquete:
# si falta el .env, la app instalada arranca sin poder hablar con Supabase.
cd apps/cliente-pwa
cp .env.example .env        # y pegar la llave publicable
pnpm build

npx cap add ios             # solo la primera vez
pnpm app:iconos             # genera todos los tamanos desde assets/
pnpm app:ios                # compila, sincroniza y abre Xcode
```

### En Xcode, cuatro cosas

1. **Signing & Capabilities** → elegir el Team de la cuenta de
   desarrollador. *Automatically manage signing* activado.
2. **Bundle Identifier**: `com.hojaldraslily.rewards`. Tiene que ser
   idéntico al `appId` del `capacitor.config.ts` — si no, el login no
   regresa a la app.
3. **Info → URL Types** → botón `+`:
   - *Identifier*: `com.hojaldraslily.rewards`
   - *URL Schemes*: `com.hojaldraslily.rewards`

   **Capacitor no agrega esto solo.** Sin este paso el usuario entra con
   Google, Google termina bien… y el teléfono no sabe a qué app devolver
   el resultado. Se queda en el navegador y parece que falló.
4. **Version / Build**: `1.0` / `1`. El *Build* sube en cada subida a
   TestFlight aunque la versión no cambie.

### Subirla

**Product → Destination → Any iOS Device**, luego **Product → Archive** →
*Distribute App* → *App Store Connect* → *Upload*.

En App Store Connect, antes del primer envío, hay que crear la ficha de la
app con ese mismo bundle id. La compilación aparece en **TestFlight** unos
minutos después (queda "Processing" un rato).

- **Pruebas internas** (hasta 100 personas de tu equipo en App Store
  Connect): **no pasan por revisión**. Es donde vas a probar mañana.
- **Pruebas externas** (hasta 10,000): sí pasan por *Beta App Review*,
  que es más rápida y más laxa que la revisión de publicación.

---

## 4. Lo único que cambia entre web y app: el login

En el navegador, Supabase redirige la página a Google y vuelve con el
código en la URL. Dentro de una app envuelta **no hay a dónde redirigir**:
la vuelta llega como enlace profundo. `src/nativo.ts` lo resuelve:

1. `signInWithOAuth({ skipBrowserRedirect: true })` — Supabase devuelve la
   URL en vez de navegar a ella.
2. Se abre en el **navegador del sistema**, no dentro de la app. Google
   rechaza los login hechos en un WebView, así que este rodeo no es
   opcional.
3. Google vuelve a `com.hojaldraslily.rewards://auth`, el plugin `App` lo
   entrega, se canjea el código por sesión y se cierra el navegador.

Ese código solo se carga con `import()` y solo cuando corre en un
teléfono: en la web no entra al paquete, así que envolver la app no le
costó peso a `rewards.hojaldraslily.com`.

### El paso de Supabase que hay que dar antes de probar

**Authentication → URL Configuration → Redirect URLs**, agregar:

```
com.hojaldraslily.rewards://auth
```

Sin eso, Supabase rechaza la vuelta y el login se queda a medias. No hay
que tocar nada en Google Cloud: Google devuelve a Supabase, y es Supabase
quien devuelve a la app.

---

## 5. Android y Play Store

```bash
npx cap add android
pnpm app:android            # abre Android Studio
```

En `android/app/src/main/AndroidManifest.xml`, dentro de la `<activity>`
principal, el mismo esquema:

```xml
<intent-filter>
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="com.hojaldraslily.rewards" />
</intent-filter>
```

Después *Build → Generate Signed Bundle* (AAB) y subirlo a Play Console.
Cuenta de desarrollador: **$25 USD una sola vez** (Apple son **$99
USD/año**).

> Una vez generadas, **conviene versionar las carpetas `ios/` y
> `android/`**. Ahí viven el URL Type y el intent-filter de arriba: si se
> regeneran desde cero, esos dos ajustes se pierden y el login vuelve a
> romperse sin dar error.

---

## 6. Lo que Apple va a pedir para PUBLICAR (no para TestFlight)

**Borrar la cuenta desde la app.** Guideline 5.1.1(v): si la app deja
crear cuenta, tiene que dejar borrarla desde adentro. **Hoy no existe** y
hay que agregarlo antes de enviar a revisión. Con el monedero de por
medio no es un `delete` a secas — hay que decidir qué pasa con el saldo
comprado, que es dinero del cliente.

**Que no sea "solo un sitio web envuelto"** (Guideline 4.2). Lo natural
aquí, en orden de qué tanto justifica la app:

- **Notificaciones push** — "tu cupón vence en 5 días", "hoy hay Matcha
  Glow". Es la razón más fuerte para tener app, y ya hay dónde
  engancharla: los cupones tienen fecha de vencimiento.
- **Pase en Apple Wallet** con el código del cliente. La pestaña Tarjeta
  ya está dibujada con la anatomía de un pase (titular, dato grande,
  perforación, código abajo), así que el `.pkpass` sería el mismo diseño
  — falta el certificado de firma y quién lo emita.
- **Widget** con las mancuernas en la pantalla de inicio.

**Y además**: política de privacidad publicada en una URL, capturas de
pantalla (las de `apps/cliente-pwa/public/captura-*.png` salen del
tamaño correcto para 6.1"), y la ficha de *App Privacy*.

---

## 7. Qué NO hay que cambiar

- La base y las funciones: `fn_mi_resumen_lealtad`,
  `fn_vincular_cliente_auth`, `fn_cliente_registrar`, `fn_canjear_tarjeta`
  y los cupones sirven igual desde una app nativa.
- El diseño: ya está pensado en vertical, con toques grandes y sin
  depender del cursor.
- La identificación en caja: el código `SHK-XXXXXX` y su QR funcionan
  igual, los lea un lector de la barra o los muestre una app.

---

## 8. Lo que hace que Rewards funcione (y hoy es el cuello de botella)

**El programa depende de que la venta se ligue al cliente.** La mecánica
existe en las dos cajas:

- Kiosko (modo cajero) → botón **"🏋️ Sumar mancuernas a un cliente"** en el
  carrito, junto a "A pagar".
- POS → modal de cliente en el cobro.

Ambos aceptan **código `SHK-` o teléfono**, y un lector de códigos teclea
el código y manda Enter, así que no hay que tocar la pantalla.

Si nadie lo usa, la app se ve preciosa y la tarjeta se queda en cero: al
24/08/26, de 6 clientes registrados, **ninguno tenía compras ligadas** con
~700 ventas hechas. No es un problema de software — es de operación, y se
resuelve con el equipo, no con código.

Se vigila desde **Admin → Diagnóstico** ("Clientes registrados que nunca
compraron"): si ese número crece, es la señal de que no se está pidiendo
el código en caja.
