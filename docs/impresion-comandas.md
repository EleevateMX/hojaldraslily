# Impresión automática de comandas

Arquitectura y flujo del sistema de impresión de comandas de Cocina/Barra.
Sustituye el diálogo de impresión del navegador (que solo se usa para el
**ticket de venta**, no para comandas) por una cola persistente + un
agente local que habla directo con la impresora térmica.

## Por qué una cola y no "imprimir directo desde Realtime"

Si el KDS mandara a imprimir apenas ve el pedido por Realtime: una
impresora apagada, sin papel, o un navegador cerrado se llevarían la
comanda sin dejar rastro. Con una cola persistente en la base:

- El trabajo de impresión **existe en la base** en cuanto se paga la
  orden, independiente de si el KDS o el agente están prendidos.
- Un agente que arranca después de un corte de luz **encuentra el
  trabajo pendiente y lo imprime** — no se perdió nada.
- Un fallo de impresión queda **registrado con su error**, se reintenta
  solo, y si se agotan los intentos, el staff lo ve y reimprime a mano.
- Dos agentes (por error de configuración, o dos procesos del mismo
  agente) **nunca imprimen la misma comanda dos veces** — el reclamo es
  atómico (`FOR UPDATE SKIP LOCKED`).

## Flujo completo

```
Se paga una orden (POS o kiosko)
   │
   ▼
trg_crear_pedidos_cocina crea 1 fila en pedidos_cocina POR ESTACIÓN
(alimentos → Cocina, bebidas → Barra) + sus cocina_items
   │
   ▼
trg_encolar_comandas_desde_items (AFTER INSERT en cocina_items,
por statement, con tabla de transición) arma el payload de la comanda
(folio, estación, hora, cajero, cliente, items+personalización) y
encola UN trabajo en trabajos_impresion por cada pedido_cocina nuevo,
con printer_id resuelto de `impresoras.cocina_id`
   │
   ▼
El agente local de ESA impresora (agente-impresion/, ver
docs/instalacion-agente-impresion.md) lo reclama de forma atómica
(fn_imprimir_reclamar_trabajos), imprime por ESC/POS, y confirma
(fn_imprimir_confirmar) o falla (fn_imprimir_fallar → reintento con
backoff, o 'failed' tras agotar los intentos)
   │
   ▼
Cocina/Barra/Admin ven el estado en vivo (Realtime sobre
trabajos_impresion) y pueden reimprimir manualmente en cualquier momento
```

**Por qué el trigger está en `cocina_items` y no en `pedidos_cocina`:**
`fn_crear_pedidos_cocina()` primero inserta TODOS los `pedidos_cocina` de
la orden y **después**, en una instrucción aparte, inserta sus
`cocina_items`. Un trigger sobre `pedidos_cocina` se dispararía antes de
que existieran los items — la comanda saldría vacía. Se detectó con una
prueba en vivo durante el desarrollo (ver `docs/auditoria-produccion.md`)
y se corrigió moviendo el encolado a un trigger *statement-level* sobre
`cocina_items`, con tabla de transición (`REFERENCING NEW TABLE`), que
agrupa por `pedido_id` y encola una comanda por cada pedido que recibió
items en ese `INSERT`.

## Estados de un trabajo (`trabajos_impresion.estado`)

| Estado | Significado |
|---|---|
| `pending` | Recién encolado, nadie lo ha tomado |
| `claimed` | Un agente lo reclamó, va a imprimir |
| `printing` | (reservado para impresión por partes; hoy el agente pasa de `claimed` a `printed`/`retry` directo) |
| `printed` | Se imprimió y el agente lo confirmó |
| `retry` | Falló, está esperando su próximo intento (`next_retry_at`) |
| `failed` | Agotó `max_intentos` (5 por defecto) — requiere reimpresión manual |
| `cancelled` | (reservado; no se usa automáticamente hoy) |

Backoff de reintentos: 30s, 1min, 2min, 4min, 8min (exponencial,
`30 * 2^intentos` segundos).

## Idempotencia — por qué nunca se duplica una comanda

- `trabajos_impresion.idempotency_key` = `pedidos_cocina.id` para la
  comanda original (único por orden+estación) — si el trigger llegara a
  correr dos veces para el mismo pedido, el segundo insert choca con el
  índice único y no crea un trabajo repetido.
- El reclamo (`fn_imprimir_reclamar_trabajos`) usa
  `FOR UPDATE SKIP LOCKED`: si dos agentes piden trabajos al mismo tiempo
  para la misma impresora, cada fila solo la toma uno de los dos.
- Un trabajo `claimed`/`printing` cuyo `claim_expires_at` venció (el
  agente murió a medio proceso) se libera automáticamente — tanto al
  reclamar de nuevo (la condición de elegibilidad lo incluye) como por un
  cron cada minuto (`fn_imprimir_liberar_vencidos`, respaldo si ningún
  agente vuelve a preguntar por esa impresora en horas).
- Reimprimir (`fn_imprimir_reimprimir`) **crea un trabajo nuevo** (con
  `copia_de` apuntando al original y `numero_copia` incrementado) — nunca
  reencola ni muta el trabajo original, así que el historial de qué se
  imprimió y cuándo queda completo.

## Seguridad del agente

El agente local **no usa la anon key general ni el `service_role`**. Cada
impresora tiene su propio `agente_token` (UUID, generado al crearla en
Admin). Todas las RPCs que llama el agente
(`fn_imprimir_reclamar_trabajos`, `fn_imprimir_confirmar`,
`fn_imprimir_fallar`, `fn_imprimir_latido`, `fn_imprimir_prueba`) resuelven
la impresora **por ese token**, nunca por un `printer_id` que el llamante
pudiera inventarse — así un token de una impresora (o sucursal) jamás
puede ver ni reclamar trabajos de otra. Revocar el acceso de una estación
es tan simple como desactivar esa impresora en Admin (o rotar su token
insertando una nueva fila).

## Contenido de la comanda

Ver `agente-impresion/src/comanda.ts` para el formato exacto. Reglas:

- **Sin precios** (es una comanda de preparación, no un ticket de venta).
- Nombre del negocio + estación + **folio grande** primero (lo primero
  que se ve al arrancar el papel).
- Fecha/hora, tipo de pedido (kiosko/caja), cajero/dispositivo, cliente
  si hay.
- Cada línea: cantidad + producto en negritas; la **personalización va en
  su propia línea, en mayúsculas, con flecha (`>>`)** — más énfasis visual
  que el nombre del producto, para que nunca se pase por alto.
- Marca `*** REIMPRESIÓN ***` y el número de copia cuando no es la
  primera.
- Corte automático y buzzer configurables por impresora.

## Reimpresión y auditoría

Cocina, Barra y Admin pueden reimprimir cualquier comanda. Cada
reimpresión queda en `impresion_auditoria` con: quién (si había sesión de
empleado — Cocina/Barra no tienen login individual, así que ahí queda sin
nombre), cuándo, motivo (se pide con un prompt), a qué trabajo original
corresponde. La tabla `trabajos_impresion` conserva el número de copia de
cada reimpresión.

## Qué pasa si la impresora falla

Una falla de impresión **nunca**:
- cancela la venta,
- revierte el pago,
- impide el descuento de inventario (ya ocurrió al pagar, no depende de
  la impresión),
- elimina el pedido del KDS.

El pedido sigue visible y operable en Cocina/Barra aunque su comanda
nunca se haya podido imprimir — solo aparece el indicador "⚠ No se
imprimió — Reimprimir" en la tarjeta, y en Admin (página Impresoras) sale
listado con su error y un botón de reimpresión. Ver
`docs/recuperacion-fallas.md` para el resto de escenarios de falla del
sistema.
