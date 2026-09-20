# Cómo va el POS de Hojaldras Lily

Corte al 20 de septiembre de 2026. Todos los números de aquí salen de
consultar la base real (`fzkdgqqvfkogmxdgqsxj`), no de suponer.

---

## En una línea

**El sistema está completo y funcionando; lo que falta para abrir no es
código.** Nueve apps compilan, 175 migraciones aplicadas, el indicador de
salud en ceros, y una venta ya corrió de punta a punta contra esta base.

---

## Las nueve apps

Cuatro de ellas son el camino del pan, **C → P → H → E**: la caja manda a
hacer, producción arma los moldes, el horno los mete y los saca, y empaque
los deja listos en su caja.

| App | Para qué | Estado |
|---|---|---|
| `kiosko` | El cliente arma su pedido en la barra | Listo. Instalable |
| `pos` | **C** — Caja: cobrar, turnos, encargos, corte, y ver el horno | Listo. Instalable |
| `produccion` | **P** — cuántos moldes van armados (de 48 o de 24) | Listo. Instalable |
| `horno` | **H** — qué está adentro, cuánto le falta, qué espera turno | Listo. Instalable |
| `empaque` | **E** — qué hay que empacar, y cobro al entregar | Listo. Instalable |
| `admin` | Ventas, producción, inventario, la tienda a distancia | Listo. Instalable |
| `cliente-display` | TV de folios | Listo. Instalable |
| `web` | La página pública | Listo |
| `costos` | Costeo e inventario (HTML plano) | Listo, **falta capturar datos** |

Las nueve pasan el criterio de instalación de Chrome sin un solo error, y
abren aunque se caiga el internet. Ver `docs/apps-instalables.md`.

## Lo que hay dentro, contado

| | |
|---|---|
| Productos activos | **66** en 11 categorías |
| Precios de Rappi | **23** con precio propio, **42** marcados con "X" (no van en plataforma) |
| Insumos | **112** activos, en 8 grupos, con su presentación |
| Renglones de existencia | **112** — ninguno invisible |
| Recetas | 55 |
| Empleados | 2 (gerencia y caja — son los de demostración) |
| Migraciones aplicadas | **175**, y las 175 tienen su archivo en el repo |
| Edge Functions | 7 desplegadas (6 de Clip + `staff-login`) |

**Salud del sistema, ahora mismo:** pagos pendientes 0 · pagos desconocidos 0 ·
órdenes esperando caja 0 · órdenes expiradas 0 · trabajos de impresión
fallidos 0 · pedidos sin comanda 0 · ventas sin movimiento de inventario 0.

---

## Comparación contra Shakeaholic

Se comparó tabla por tabla y función por función contra la base del otro
negocio (**de solo lectura**, nunca se le escribió nada).

### Lo que Lily tiene y Shakeaholic no

Seis tablas y veinte funciones, todas del giro de panadería: `encargos`,
`encargo_items`, `ordenes_produccion`, `orden_produccion_items`,
`produccion`, `precios_canal`; más el conteo físico de inventario, la lista
de compra, la merma con motivo, los cuadros por sabor y la "X" de Rappi.

### Lo que Shakeaholic tiene y Lily no

**Nada de esto está roto.** Se verificó de la única forma que vale: se
listaron **todas** las funciones que el código llama (`.rpc(...)`) y **todas**
las tablas y vistas que lee o escribe, y se comprobaron una por una contra la
base de Lily.

- **34 de 34** funciones que el código invoca: existen.
- **7 de 7** vistas (`vw_*`): existen, y **las siete** con
  `security_invoker = true` — la trampa de CLAUDE.md §4 está respetada.
- Tablas referidas por el código: todas existen.

Las siete tablas que solo están allá:

| Tabla | Por qué no está aquí |
|---|---|
| `_respaldo_pruebas_28jul`, `_respaldo_pruebas_30jul` | Respaldos sueltos de una prueba de julio. Basura, no se copia |
| `costos_sesiones` | **Aquí se resolvió distinto**: el token de Costeos vive en `app_users` (`token`, `token_expira`). Mismo resultado, una tabla menos |
| `app_data_senales` | Se quitó a propósito: al cerrar `app_data` a `anon`, Realtime dejó de avisar «actualizado desde otro dispositivo» (CLAUDE.md §5) |
| `observacion_alcance` | Segmentar avisos por sucursal/pantalla. Lily tiene una sola tienda |
| `reportes_soporte` | Sistema de tickets de soporte |
| `ventas_en_espera_vistazo` | Pantalla de «ventas en espera» de aquel negocio |

Y de las 36 funciones que no se trajeron, la mayoría **no aplican**: son de
scoops, botes de proteína y marcas de suplemento (`fn_clase_extra`,
`fn_marca_de_extra`, `fn_extra_bebida_defecto`, `fn_extra_vender_solo`), de
soporte (`fn_reportar_soporte`, `fn_anotar_reporte`, `fn_cerrar_reporte`,
`fn_priorizar_reporte`, `fn_es_soporte`), o del alcance de observaciones.

### Lo que sí valdría la pena traer, y no está

Tres cosas, ninguna urgente, en orden de lo que más se va a extrañar:

1. **Pago mixto** (`fn_cobrar_mixto_iniciar`, `fn_cobrar_mixto_cancelar`,
   `fn_mixto_aprobar_efectivo`, `fn_cobrar_orden_dividido`). Hoy la caja
   cobra **todo en efectivo o todo en terminal** — fue una decisión pedida,
   para que el flujo sea simple. Pero una hojaldra grande de $790 que alguien
   quiere pagar con $400 en efectivo y el resto con tarjeta **hoy no se
   puede**. Vale la pena decidirlo antes de abrir, no después.
2. **Diagnóstico de impresión** (`fn_imprimir_calibrar`,
   `fn_imprimir_prueba_staff`, `fn_imprimir_diagnostico_staff`,
   `fn_reintentar_impresiones`). Sirven el día de la instalación, para
   calibrar la etiquetadora y reintentar lo que falló sin entrar a la base.
3. **Salir de Costeos** (`fn_costos_salir`). El token dura 12 h y no hay botón
   para cerrar sesión antes. En una tablet compartida eso importa.

---

## Lo que falta para abrir (nada es código)

1. **Decidir la terminal.** Clip está escrito y probado; le faltan tres
   secretos. Si es Banorte, ver `docs/banorte-que-pedir.md`.
2. **Cloudflare Pages y dominios** — se crean solos en el primer push a `main`
   con los secretos puestos.
3. **Costos, recetas y proveedores en Costeos.** La lista de precios y el
   inventario ya son los reales; falta **cuánto cuesta** cada insumo, **qué
   lleva** cada pan y **a quién** se le compra. Sin recetas, la venta no
   descuenta materia prima: hay que contar a mano.
   Y **los mínimos**: solo 1 de 112 insumos tiene mínimo puesto, así que la
   lista de compra sale casi vacía.
4. **PIN del personal.** Los dos empleados que hay son de demostración, y los
   PIN están a la vista en la portada de la vitrina a propósito. **Cambiarlos
   antes de la primera venta real.**
5. **Impresoras.** Hay **0 registradas**. Se dan de alta en Admin →
   Impresoras el día de la instalación.
6. **Menú de temporada.** Pan de muerto y rosca de reyes están sembrados en
   ceros y apagados, tal como venían en la hoja del negocio.

---

## Dos cosas sueltas que conviene saber

- **`apps/cocina-alimentos` y `apps/cocina-bebidas` siguen en el disco** pero
  **no están en git**: son sobras locales (un `.env` y un `dist/`) de cuando
  se quitaron las pantallas de comanda por estación. No afectan a nada — no
  entran al build ni al despliegue — pero si alguien clona el repo no las va a
  ver, y si mira esta carpeta sí. Se pueden borrar sin consecuencia.
- **El registro de migraciones ya está completo, y hubo que corregirlo.**
  Había 165 aplicadas en la base y 162 archivos en el repo: faltaban tres
  (`encargo_cobrar_usa_la_fila_de_la_orden`,
  `produccion_sin_producto_obligatorio`, `insumo_con_la_grafia_de_la_hoja`).

  Se escribieron primero **deduciéndolas del estado vivo** de la base, y **dos
  de las tres salieron mal**. Al poder leer el SQL que corrió de verdad
  (`supabase_migrations.schema_migrations.statements`) se vio qué faltaba:

  - `produccion_sin_producto_obligatorio` no traía el relleno de `sabor` desde
    el producto ni el borrado de las filas que no se podían rellenar. Sin esos
    dos pasos, el `set not null` **falla** en cualquier base que tenga
    capturas viejas — o sea, justo al reconstruir.
  - `encargo_cobrar_usa_la_fila_de_la_orden` no traía
    `revoke all ... from public`. La función es SECURITY DEFINER, así que una
    base reconstruida habría quedado con esa puerta abierta.

  Ya están los tres idénticos a lo aplicado, comparado SQL contra SQL.
  **La lección**: deducir una migración del estado final no reproduce el
  camino. El estado dice cómo quedó, no qué hubo que hacer para llegar —y es
  el camino lo que hay que volver a recorrer.

---

## Cómo se verificó todo esto

Nada de lo de arriba es de memoria:

- Las tablas y funciones, comparadas con un `diff` real entre las dos bases.
- Las llamadas del código (`.rpc` y `.from`), extraídas del repo y
  comprobadas una por una contra Lily.
- `security_invoker` de las siete vistas, consultado en `pg_class.reloptions`.
- La salud del sistema, con `fn_salud_sistema()`.
- Los conteos, con una sola consulta a la base.
- Los permisos de cada función, leídos de `pg_proc.proacl`, y probados en las
  dos direcciones: con sesión de gerencia (cuenta y lee) y como `anon`
  (rechazado).
