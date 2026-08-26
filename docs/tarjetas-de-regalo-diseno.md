# Tarjetas de regalo: qué mandar a diseñar

Machote para pegar en Claude Design (o dárselo a un diseñador). Está
escrito con los datos reales del sistema para que lo que salga se pueda
imprimir y funcione al escanearlo — no es una maqueta bonita que después
no empata con la base.

---

## 1. Lo que el sistema ya define (no inventar)

| Dato | Valor | De dónde sale |
|---|---|---|
| Código | `SHKG-XXXXXXXX` | `fn_generar_tarjetas` |
| Alfabeto | `ABCDEFGHJKMNPQRSTUVWXYZ23456789` | sin O/0 ni I/1/L: se confunden al teclear |
| QR | el mismo código, texto plano | lo lee el lector de la barra |
| Tasa | 10 mancuernas = $1 | `fn_tasa_mancuernas()` |
| Denominaciones | $200 → 2,200 · $500 → 5,750 · $1,000 → 12,000 | `paquetes_saldo` |

**Los códigos no son secuenciales a propósito.** Con lotes numerados, quien
compra una tarjeta podría adivinar las de al lado. Eso obliga a una cosa en
el diseño: **el código va tapado** (raspable o dentro del sobre sellado),
porque quien lo vea puede canjearlo.

---

## 2. El prompt

> Diseña un set de **tarjetas de regalo físicas** y su **sobre** para
> Hojaldras Lily, un protein bar en Mérida, México.
>
> **Marca** (los valores exactos, de `packages/brand/tokens.css`): verde
> `#2C4A3E`, verde profundo `#1A2E26`, tinta `#14241D`, crema `#E8E6CC`,
> crema suave `#F2EFD9`; acento amarillo plátano `#F0C649` y, si hace
> falta un segundo, fresa `#E04E5C` o menta `#88C0A0` — **uno por
> superficie, nunca varios**. Tipografías: **Bagel Fat One** para títulos
> y cifras grandes, **DM Sans** para el cuerpo, **DM Mono** para el código
> y las etiquetas en versalitas. Bagel Fat One solo tiene un peso: no
> pedirle negritas. La mascota es **Milo**: un vaso de
> batido con brazos y piernas, cara sonriente, cargando una mancuerna,
> dibujado con línea de un solo grosor en crema sobre verde. El programa
> de lealtad se llama **Mancuernas**.
>
> **Formato.** Tarjeta tamaño credencial: **85.6 × 54 mm**, esquinas
> redondeadas de 3 mm, más **3 mm de sangrado** por lado y marcas de
> corte. Diseñar **frente y vuelta por separado**, en CMYK, a 300 dpi.
>
> **Frente.** Milo grande, el logotipo Hojaldras Lily, y la denominación como
> el dato más visible. Tres versiones que se distingan de un vistazo desde
> un metro de distancia: **$200**, **$500** y **$1,000**. Que se
> diferencien por color de acento y por el número, no solo por el número.
> Debajo, en letra chica: `2,200 mancuernas`, `5,750 mancuernas`,
> `12,000 mancuernas` respectivamente.
>
> **Vuelta.** Sobre fondo crema:
> - Un **QR de 22 × 22 mm** con zona blanca alrededor, abajo a la derecha.
> - El código en monoespaciada, grande y legible, con el formato
>   `SHKG-XXXXXXXX`, **cubierto por un panel raspable plateado**.
> - Tres líneas de instrucciones, numeradas:
>   1. Entra a rewards.hojaldraslily.com
>   2. Raspa y escanea el código
>   3. Tu saldo queda en tu cuenta, no en la tarjeta
> - Al pie, en letra chica: "No caduca · No se cambia por efectivo ·
>   Válida solo en Hojaldras Lily The Harbor, Mérida".
> - Espacio en blanco para un campo `Para: ______` escrito a mano.
>
> **El sobre.** Formato para tarjeta de 85.6 × 54 mm, con solapa. Verde
> profundo por fuera con Milo en crema y la palabra "Mancuernas"; por
> dentro, forro con un patrón de mancuernas pequeñas en tono sobre tono.
> En la solapa, un sello circular de 30 mm para pegar con la cara de Milo,
> pensado para imprimirse como etiqueta adhesiva aparte.
>
> **Tono.** Cálido y de barrio, no corporativo ni de lujo. Es un regalo
> entre amigos del gimnasio, no una gift card de tienda departamental.
>
> Entrega: frente, vuelta y sobre como artboards separados, con las
> tres denominaciones.

---

## 3. Lo que hay que revisar cuando vuelva el diseño

- **El QR mide al menos 20 mm** y tiene margen blanco alrededor. Más chico
  o pegado al borde, el lector de la barra falla y el cajero termina
  tecleando el código a mano.
- **El código se lee sin dudar**: nada de tipografías donde la `S` y el `5`
  se parezcan. El alfabeto ya evita O/0 e I/1/L; el diseño no debe
  reintroducir la confusión.
- **El código va tapado.** Si se imprime a la vista, cualquiera que pase
  frente al exhibidor puede fotografiarlo y canjearlo.
- **Sangrado de 3 mm y marcas de corte**, o la imprenta va a cortar dentro
  del diseño.
- **CMYK, no RGB.** El verde de marca en RGB se apaga bastante al
  imprimirse; conviene pedirle a la imprenta una prueba de color antes del
  tiraje completo.

---

## 4. Cómo se generan los códigos del tiraje

Con sesión de gerencia:

```sql
select codigo, mancuernas
from fn_generar_tarjetas(50, 2200, 'NAVIDAD-2026');
```

50 tarjetas de 2,200 mancuernas, lote identificable. Devuelve la lista
lista para mandar a imprenta con su QR. Repetir por denominación —
`5750` y `12000` — con su propio nombre de lote.

Un lote impreso pero no vendido no vale nada hasta que alguien lo canjea:
las tarjetas nacen en estado `nueva` y solo se convierten en saldo al
canjearse.
