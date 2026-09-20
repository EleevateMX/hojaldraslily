# El camino del pan: C → P → H → E

Cuatro pantallas táctiles, una por mesa. El pan pasa por las cuatro en ese
orden y **ninguna puede hacer el trabajo de la siguiente**.

```
   C  caja  ──manda a hacer──▶  P  producción  ──moldes armados──▶  H  horno
   ▲                                                                   │
   └───────────────  qué se está horneando y a qué hora sale  ──────────┘
                                                                        │
                                                          sale del horno│
                                                                        ▼
                                          E  empaque  ──entrega y cobra──▶ caja
```

## Qué marca cada una

| | Pantalla | Quién la usa | Qué marca |
|---|---|---|---|
| **C** | Caja (`caja.hojaldraslily.com`) | Quien cobra, y gerencia | Manda a hacer: cuántos moldes de cada sabor, **de 48 o de 24** |
| **P** | Producción (`produccion...`) | Los panaderos | Cuántos moldes lleva **armados** |
| **H** | Horno (`horno...`) | Quien hornea | Cuántos **metió** y cuántos **sacó** |
| **E** | Empaque (`empaque...`) | Quien empaca y entrega | Qué queda **empacado**, y entrega y cobra |

Todas entran con **PIN**. No son pantallas anónimas: lo que marcan mueve el
inventario y el dinero del día, y cuando algo no cuadra hay que poder
preguntar quién lo marcó.

## Las tres reglas que no se negocian

**1. El inventario sube cuando el pan SALE DEL HORNO, no antes.**

Un molde armado es masa, no es pan. Si se contara al armarlo, la caja podría
vender una hojaldra que sigue cruda. Antes producción marcaba «hecho» y eso
entraba directo — funcionaba porque producción y horno eran la misma persona;
con el horno en su propia mesa deja de serlo.

**2. Apartar no es vender, y empacar tampoco.**

Un encargo separa la mercancía, pero sigue contada hasta que se cobra: si el
cliente no llega, nunca se fue nada. Marcarlo **empacado** solo dice «ya está
en su caja, con su nombre». Lo único que descuenta del inventario y mete el
dinero al corte es **Entregar y cobrar**.

**3. Los encargos son lo primero.**

Por eso la pantalla de Empaque no abre con una lista de clientes, sino con
**qué hay que empacar sumado por producto**: quien empaca va al mostrador y
corta paquetes, así que lo que necesita es *«ocho Fiesta de 24»*, no ocho
tarjetas para sumar a mano. La cola va por **hora de entrega**, y lo ya
empacado baja a una repisa compacta para que arriba solo quede trabajo.

## Cómo se ve cada pantalla

### P — Producción

Un renglón por sabor. Dice cuántos moldes se pidieron, de qué tamaño, y
cuántos van. Tres botones grandes: **+1**, **+2** y **Ya está** (que salta
directo al número pedido, que es lo que se hace nueve de cada diez veces) y
un **−** para corregir.

El **−** no baja de lo que ya se fue al horno: si tres moldes están adentro,
no se puede decir que solo se armaron dos.

### H — Horno

Tres columnas, que son las tres preguntas de quien está parado frente al
horno:

1. **En el horno** — qué hay adentro y cuánto le falta, con su reloj. Lo que
   se pasó de su hora se pinta distinto.
2. **Listo para entrar** — lo que producción ya armó y espera turno.
3. **Producción lo está armando** — lo que todavía no llega.

El reloj corre **en la pantalla**, no en el servidor: se pide la hora de
salida una vez y aquí se cuenta. Así el número baja cada segundo sin machacar
la base, y si se cae el internet el reloj sigue andando — que es justo cuando
más falta hace.

**Sacar del horno es lo que sube el pan al inventario.** Desde ese momento la
caja puede venderlo.

### E — Empaque

Arriba, **qué hay que empacar** en números grandes, por producto. Debajo, los
encargos por empacar con todo su detalle —qué lleva cada caja— y su hora.
Cada uno tiene un solo botón: **Ya está empacado**.

Cobrar no está ahí a propósito: se cobra cuando el cliente llega, y para
entonces el encargo ya bajó a **Listos, esperando al cliente**. Dos botones en
la mesa de empaque es cobrar por error.

### C — Caja

Es el puesto de mando. En la cabecera hay **un botón, Producción**, y detrás
un cajón que se abre encima de la venta con todo lo que está pasando atrás:

1. **En el horno** — qué se hornea y a qué hora sale, con su foto
2. **Producción** — qué está armado esperando turno y qué siguen armando
3. **Encargos de hoy** — quién pasa, a qué hora y **si su caja ya está lista**
4. **Lo que queda** — en moldes y cuartos, por sabor
5. **Mandar a hacer** — solo gerencia

El botón dice **una sola cosa**, la más urgente: *«3 se pasó de su hora»*,
*«2 encargos por empacar»* o *«5 en el horno»*. Si dijera las tres cifras
siempre, nadie leería ninguna.

Se abre **encima** de la caja, no en otra página: con un ticket a medias,
navegar a otro lado es la forma más fácil de perder una venta.

En la caja también se **aparta** un encargo y se **cobra** al entregarlo, se
vende por Rappi con el interruptor, y se cobra **una parte en efectivo y otra
con tarjeta** con «Una parte y otra parte».

## Moldes de 48 y de 24

El tamaño va **por renglón**, no en un ajuste global: en una misma hornada
caben tres moldes de 48 de guayaba y dos de 24 de queso. Se elige al mandar a
hacer, en Admin → Producción o en Caja → Encargos.

Los **tamaños de paquete no son inventarios separados**. De 192 cuadros de
guayaba salen 15 paquetes de 12 *o* 7 de 24 *o* 3 de 48: es el mismo pan
contado distinto, y vender uno baja los otros. Por eso se hornea por sabor y
se corta conforme se vende — no se comprometen a un tamaño hasta que alguien
lo pide.

## Si algo se ve raro

| Se ve | Qué pasa |
|---|---|
| El horno dice «vacío» pero se mandó a hacer | Producción todavía no arma. Sale en la tercera columna del Horno |
| Producción no deja bajar un número | Esos moldes ya están en el horno o ya salieron |
| Un encargo no aparece en Empaque | Ya se cobró, o se canceló. Lo cobrado sale de la lista |
| La caja no deja cobrar un encargo | El total que ve la caja no cuadra con el del servidor. Recargar la caja |
| Dice «se pasó 20 min tarde» | El pan lleva más de su tiempo dentro. El tiempo de cada pan se configura en el catálogo |
