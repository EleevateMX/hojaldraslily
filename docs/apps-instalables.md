# Las apps se instalan

**Ocho de las nueve apps son instalables**: el navegador ofrece *Instalar*, y
quedan con su icono en el escritorio o en la pantalla del teléfono, abriendo a
pantalla completa sin barra de direcciones. La décima, `costos`, es un HTML
plano sin empaquetador y se queda fuera a propósito.

No es un `.exe`. No hay nada que descargar de ningún lado, nada que firmar y
nada que pagar: son dos archivos estáticos más (`manifest.webmanifest` y
`sw.js`) junto a los que ya se publican. La base de datos sigue siendo el
mismo Supabase; esto no la toca.

## Cómo se instala

| Dónde | Cómo |
|---|---|
| Chrome / Edge en la PC | El icono de instalar en la barra de direcciones, o menú → *Instalar* |
| Android | Chrome → menú → *Instalar aplicación* |
| iPhone / iPad | Safari → Compartir → *Añadir a pantalla de inicio* |

## Qué suma de verdad, y qué no

Lo que **sí**:

- **El teléfono de la dueña.** Admin con su icono, a pantalla completa. Es lo
  que hacía falta para «consultar el estado del negocio» sin abrir el
  navegador y buscar la dirección.
- **Abre sin internet.** Con la conexión intermitente, la pantalla abre y
  muestra la app —diciendo que no hay conexión— en vez del dinosaurio de
  Chrome. En una panadería con tres pantallas colgadas, es la diferencia
  entre esperar y llamar por teléfono.
- **Iconos que se distinguen.** En la PC de la tienda se instalan cuatro o
  cinco, y con el mismo icono la barra de tareas es una fila de hojaldras
  idénticas. Cada app lleva un acento de la marca: Kiosko carmín, Caja
  morado, Horno dorado, Almacén lila, Admin cacao, Pantalla verde.

Lo que **no**, y conviene no prometerlo:

- **No vende sin internet.** El dinero se calcula en el servidor y el
  inventario vive en la base (ver CLAUDE.md §2.2). Lo que se guarda es el
  *programa*, no los *datos*. Sin conexión la app abre y no puede cobrar.
- **No reemplaza al agente de impresión.** Un navegador no puede hablar TSPL
  por TCP con las etiquetadoras. `agente-impresion/` sigue siendo necesario y
  sigue siendo lo único que de verdad se instala en la PC.
- **En la PC de la tienda casi no cambia nada.** `scripts/pantallas.ps1` ya
  abre cada pantalla con `--app=`, que es una ventana sin barra. Lo que suma
  ahí es el icono y el arranque sin internet, no la pantalla completa.

## Cómo está hecho

Un plugin de Vite, `@lily/pwa`, que se le pone a cada app en su
`vite.config.ts`:

```ts
pwaDeLily({
  nombre: 'Hojaldras Lily · Caja',
  corto: 'Caja',
  descripcion: 'Arma el pedido, cobra y manda las comandas.',
})
```

Es un plugin y no ocho archivos JSON escritos a mano por dos razones:

1. **El color.** Un manifest a mano es un lugar más donde la identidad se
   desvía sola, que es la trampa de CLAUDE.md §2.5 — y ya había pasado: los
   dos manifests que existían traían el verde oscuro del motor original
   (`#14241D`, `#1A2E26`), no el carmín de Lily. El plugin **lee
   `packages/brand/tokens.css`**. Si cambia el token, cambia el manifest sin
   que nadie se acuerde de copiarlo.
2. **El `base`.** La misma app se publica en la raíz de su dominio
   (`caja.hojaldraslily.com/`) y bajo un subdirectorio en la vitrina
   (`/hojaldraslily/app/pos/`). `start_url`, `scope` y las rutas de los
   iconos cambian con el `base`, y un JSON a mano no puede. Un manifest con
   el `scope` equivocado **no instala y no dice por qué**.

Los iconos también se generan, por lo mismo:

```bash
node scripts/generar-iconos-pwa.mjs
```

Sale del arte de `packages/brand/assets/hojaldra.png` y de los colores de
`tokens.css`. Los que traía el motor original son la prueba de para qué sirve
esto: traen la crema vieja (`#F8EDD5`) y el coral viejo (`#C4463C`), de antes
de que la marca fuera carmín.

## La actualización: quién decide cuándo

Activar una versión nueva **recarga la pestaña**. Eso en el kiosko a media
venta le borra el carrito al cliente — la trampa de CLAUDE.md §4, que ya
costó una vez con la señal de «actualizar pantallas» del Admin.

Así que el service worker nuevo **espera**:

| App | Cuándo pasa a la versión nueva |
|---|---|
| Producción, Horno, Empaque, Admin, Pantalla, Web | De inmediato: no hay nada a medias que perder |
| **Kiosko** | Cuando está en el catálogo y sin carrito — la misma condición que ya usa para la señal de recarga, no una segunda |
| **Caja** | Cuando el ticket está vacío y no está en el cobro (ahí se está hablando con la terminal) |

## Lo que NO se guarda en la caché

Nada de Supabase. Ni catálogo, ni precios, ni órdenes.

El service worker ignora todo lo que no sea del mismo origen. Un precio
servido de una caché vieja es justo la manera de que `fn_cobrar_orden`
rechace el cobro por no cuadrar el importe, con el cliente enfrente — la
misma lección de §2.2 aplicada un piso más abajo. La caché es para el
programa, no para los datos.

## Cómo se comprobó

No de palabra: contra Chromium de verdad
(`Page.getInstallabilityErrors`, que es el mismo criterio con el que Chrome
decide si ofrece instalar).

- Las **ocho** apps: cero errores de instalabilidad. La comprobación quedó
  guardada en `scripts/verificar-instalables.mjs` — antes se hizo a mano y a
  la siguiente app hubo que volver a escribirla.
- Con el servidor apagado, la app **abre** y el `#root` está ahí.
- La caché guarda solo el casco (el HTML y los `assets/` con hash). Nada de
  otro origen.
- Tres visitas seguidas: instalación nueva → **no** se recarga; ya instalada
  sin novedad → **no** se recarga; llega versión nueva → **sí** se recarga.

Los dos bugs que salieron de probarlo en serio, y que a ojo no se veían:

- **La recarga espuria.** El service worker llama a `clients.claim()` al
  activarse, y eso dispara `controllerchange` también en la **primera**
  instalación, cuando no hay ninguna versión vieja que reemplazar. La primera
  visita a cada app se recargaba sola, siempre. Ahora solo se recarga si
  fuimos nosotros los que pedimos el cambio.
- **La actualización que instaló otra pestaña.** El vigía volvía a preguntar
  «¿ya es seguro?» pero nunca volvía a **mirar** si había una versión
  esperando. Si `updatefound` no llegó a esta pestaña —porque la
  actualización la encontró otra, y en la PC de la tienda la Caja y el Admin
  están abiertos al mismo tiempo— se quedaba con la versión vieja para
  siempre, esperando un evento que ya había pasado.

Las dos están cubiertas en `packages/pwa/src/registrar.test.ts`, con un
service worker falso: un navegador de verdad no deja decir «ahora llega una
versión nueva, pero justo cuando hay un carrito abierto».
