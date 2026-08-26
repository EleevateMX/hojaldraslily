# Configurar "Entrar con Google" (lealtad)

El botón de Google en el kiosko y en la app de Rewards **hoy está apagado
del lado de Supabase**. No es un error del código: faltan las credenciales
de Google Cloud. Mientras no existan, la app avisa con un mensaje amable en
vez de mandar al cliente a una pantalla de error.

Esto lo tienes que hacer tú (o quien sea dueño de la cuenta de Google del
negocio): son credenciales de una cuenta Google, nadie más puede crearlas
por ti. Toma unos 15 minutos y se hace **una sola vez**.

> **La lealtad ya funciona sin Google.** En caja se identifica al cliente
> por teléfono o QR, se dan de alta clientes nuevos, se acumulan mancuernas
> y se canjean cupones. Google solo agrega la comodidad de que el cliente
> entre solo desde su celular.

El lado del sistema ya quedó listo y probado para este momento:

- Al entrar con Google, el cliente **queda ligado a su ficha de lealtad** y
  desde ahí sus compras acumulan. Si ya lo habían dado de alta en caja con
  ese mismo correo, se reclama esa ficha: conserva sus mancuernas y cupones.
- Las tablas de lealtad quedaron **cerradas a escritura directa**. Antes,
  cualquiera con la anon key podía regalarse mancuernas o reactivar un cupón
  usado — y eso se vuelve alcanzable desde la calle justo cuando Rewards se
  abre al público. Detalle y pruebas en `docs/flujo-lealtad.md`.

## Si vas a conectar tu dominio, hazlo ANTES

Google valida los orígenes carácter por carácter, así que las URLs que
registres aquí tienen que ser las definitivas. Si configuras Google con los
`*.pages.dev` y después conectas `hojaldraslily.com`, hay que volver a entrar a
Google Cloud y a Supabase a agregar las nuevas.

Orden que se hace una sola vez:

1. Conectar el dominio (`docs/despliegue-godaddy.md`).
2. Esperar a que el hosting marque el dominio como **Active** y sirva por
   HTTPS.
3. Recién entonces seguir esta guía, usando el dominio propio.

> **Dato importante:** la app de Rewards **solo** tiene entrada por Google.
> No hay acceso por correo, teléfono ni contraseña. Mientras Google no esté
> encendido, el cliente puede abrir `hojaldraslily.com` pero no puede entrar a
> ver sus mancuernas. (En caja sí funciona todo: se identifica por teléfono
> o QR.)

## Datos que vas a necesitar a la mano

| Dato | Valor |
|---|---|
| URL de redirección (la que pide Google) | `https://fzkdgqqvfkogmxdgqsxj.supabase.co/auth/v1/callback` |
| Orígenes autorizados | Las URLs reales del kiosko y de Rewards (ver §2) |

## 1. Crear las credenciales en Google Cloud

1. Entra a <https://console.cloud.google.com/> con la cuenta de Google del
   negocio.
2. Arriba a la izquierda, crea un proyecto (por ejemplo **Hojaldras Lily**) o
   selecciona el que ya uses.
3. Ve a **APIs y servicios → Pantalla de consentimiento de OAuth**:
   - Tipo de usuario: **Externo**.
   - Nombre de la app: `Hojaldras Lily`.
   - Correo de asistencia y de contacto: el del negocio.
   - Logo (opcional): el de Hojaldras Lily — es lo que ve el cliente al entrar.
   - Guarda. **Publica la app** (botón *Publicar aplicación*); si la dejas
     en modo *Prueba*, solo podrán entrar los correos que agregues a mano.
4. Ve a **APIs y servicios → Credenciales → Crear credenciales → ID de
   cliente de OAuth**:
   - Tipo de aplicación: **Aplicación web**.
   - Nombre: `Hojaldras Lily Web`.
   - **Orígenes de JavaScript autorizados**: agrega una línea por cada app
     que muestre el botón de Google (§2).
   - **URI de redirección autorizados**: agrega **exactamente** esta, sin
     barra al final:
     ```
     https://fzkdgqqvfkogmxdgqsxj.supabase.co/auth/v1/callback
     ```
     Esta es la única que va aquí. No pongas las URLs de tus apps en este
     campo: quien recibe la respuesta de Google es Supabase, y Supabase es
     quien luego regresa al cliente a tu app.
5. Al guardar, Google te muestra el **ID de cliente** y el **Secreto de
   cliente**. Cópialos (el secreto se puede volver a ver después desde la
   misma pantalla).

## 2. Qué poner en "Orígenes de JavaScript autorizados"

Solo el dominio, sin ruta ni barra final. Las apps que usan Google son el
**kiosko** y **Rewards** (cliente-pwa):

```
https://shake-kiosko.pages.dev
https://shake-cliente-pwa.pages.dev
```

Cuando conectes el dominio propio (ver `docs/despliegue-godaddy.md`), agrega
también los definitivos, sin quitar los anteriores:

```
https://kiosko.tudominio.com
https://rewards.tudominio.com
```

> Verifica las URLs reales en el panel de Cloudflare Pages antes de
> copiarlas: si el proyecto se llamó distinto, el subdominio `.pages.dev`
> también cambia y Google rechazará el login con `redirect_uri_mismatch`.

## 3. Pegar las credenciales en Supabase

1. Entra a <https://supabase.com/dashboard> → proyecto **ventashake**.
2. **Authentication → Sign In / Providers → Google**.
3. Activa el interruptor y pega:
   - **Client ID (for OAuth)** → el ID de cliente de Google.
   - **Client Secret (for OAuth)** → el secreto.
4. Guarda.
5. En **Authentication → URL Configuration**, en **Redirect URLs**, agrega
   las URLs a las que Supabase puede devolver al cliente ya autenticado:
   ```
   https://shake-kiosko.pages.dev/auth/callback
   https://shake-cliente-pwa.pages.dev
   ```
   (y sus equivalentes con dominio propio cuando lo tengas). Si falta esta
   parte, Google autentica bien pero el cliente se queda en una página en
   blanco de Supabase en vez de regresar a la app.

## 4. Comprobar que quedó

No hace falta desplegar nada ni tocar el código: las apps preguntan por el
estado del proveedor cada vez que cargan.

1. Abre el kiosko → **Lealtad** → el botón de Google debe entrar en vez de
   mostrar el aviso de "no disponible".
2. Entra con una cuenta de Google cualquiera y confirma que te regresa a la
   app ya identificado.

Comprobación rápida sin abrir la app — esta URL es pública y dice qué
proveedores están encendidos:

```bash
curl -s https://fzkdgqqvfkogmxdgqsxj.supabase.co/auth/v1/settings \
  -H "apikey: <VITE_SUPABASE_ANON_KEY>" | grep -o '"google":[a-z]*'
```

Debe responder `"google":true`. Es exactamente lo que consulta la app antes
de redirigir (`proveedorAuthHabilitado` en
`packages/supabase/src/queries/auth.ts`).

## 5. Si algo falla

| Mensaje | Causa | Arreglo |
|---|---|---|
| `Unsupported provider: provider is not enabled` | El interruptor de Google sigue apagado en Supabase | §3, paso 3 |
| `redirect_uri_mismatch` | La URI de redirección en Google no coincide carácter por carácter | §1, paso 4 — sin barra final, con `https` |
| Entra pero se queda en pantalla en blanco de Supabase | Falta la URL de la app en **Redirect URLs** | §3, paso 5 |
| `Acceso bloqueado: la app no completó la verificación` | La pantalla de consentimiento quedó en modo *Prueba* | §1, paso 3 — publicar la app |

Google puede pedir verificación de la app si usas alcances sensibles. Aquí
solo se piden correo y perfil básico, que **no** requieren verificación:
si aparece la advertencia de "app no verificada", es señal de que la
pantalla de consentimiento quedó sin publicar.
