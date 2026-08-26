# Reporte de impacto del error de costeo de empaques

Análisis pedido en el encargo: qué tanto daño causó el bug de
`comboShake()`/`comboFood()` antes de corregirse. Los hechos y cifras
completas están en `docs/auditoria-costeo-empaques.md` — este documento
resume el impacto específicamente, sin repetir el diagnóstico técnico.

## ¿Costos inflados? Sí, en shakes — confirmado con datos reales

Los 17 shakes capturados en costosshake sumaban **$13.99** de empaque cada
uno (los 9 empaques marcados "shake" del catálogo), sin importar cuál vaso
o tapa usaba cada uno en realidad. Un shake típico de 16oz con 1 vaso + 1
tapa domo debería costear ~$3.43–4.42 de empaque real — estaba cargando
más de 3 veces eso.

## ¿Costos subestimados? Sí, en alimentos

Los 7 alimentos capturados sumaban **$0.00** de empaque (ningún empaque
tenía marcado "alimento"), a pesar de que en la operación real llevan
charola, bolsa, papel encerado o similar. El costo total de cada alimento
estaba **subestimado** por el valor real de su empaque.

## ¿Márgenes y precios sugeridos incorrectos?

Sí, indirectamente. `finishCalc()` usa el costo total (incluido el
empaque, inflado o en cero) para calcular `margen`, `margenPct`, `fc`
(food cost %) y `precio_sugerido`. Ningún shake tenía todavía un precio de
venta capturado en costosshake al momento de esta auditoría, así que
margen/food-cost% no se veían en pantalla para ellos — pero **el precio
sugerido sí se calculaba con el costo inflado**, así que si alguien lo
usó como referencia para fijar un precio de venta nuevo, ese precio ya
venía sesgado al alza.

## ¿Recetas con "todos los vasos" / "todas las tapas"?

No literalmente — el bug no agregaba líneas de receta duplicadas por
vaso/tapa (porque nunca hubo líneas de receta de empaque en costosshake,
solo un número global sumado al costo). El efecto equivalente sí ocurría en
el número final: el resultado era matemáticamente idéntico a como si cada
shake tuviera en su receta los 9 empaques marcados "shake" a la vez.

## ¿Duplicación de empaques?

No en el sentido de filas duplicadas en una base de datos — el bug estaba
en la lógica de la calculadora (`comboShake()`/`comboFood()`), no en datos
duplicados. No hay nada que deduplicar; hay que **asignar correctamente**
lo que cada producto usa (ver `docs/empaques-por-receta.md`).

## ¿Productos sin empaque?

Sí — después de la corrección, **todos** los shakes y alimentos quedan sin
ningún empaque asignado (por diseño: nunca se reasignan automáticamente,
ver `docs/auditoria-costeo-empaques.md` §5). Esto es intencional y
temporal: cada tarjeta de receta en Costeo Shakes/Alimentos muestra un
aviso indicando cuántos productos siguen pendientes y qué empaques solían
sumárseles, para asignarlos uno por uno con criterio.

## ¿Llegó esto a afectar una venta real, el inventario real, o el corte de caja?

**No.** Verificado en vivo contra el esquema real (`productos`, `recetas`,
`insumos`) usado por POS/Kiosko/Cocina: ningún shake ni alimento tenía
líneas de receta de tipo `empaque` antes de esta corrección — el ETL que
sincroniza costosshake hacia el esquema real nunca leyó los checkboxes
globales (el `README.md` de `supabase/seed/` lo describía incorrectamente;
ya se corrigió). Ninguna venta, ningún descuento de inventario, ningún
corte de caja usó jamás el número inflado — el daño estaba contenido
enteramente dentro de la calculadora de costosshake.

## Alcance del impacto real

| Afectado | Impacto |
|---|---|
| Decisiones de precio basadas en "precio sugerido" de shakes | Posible sesgo al alza (costo de empaque 3×+ inflado) |
| Percepción de margen/food-cost de shakes (una vez que se capture precio de venta) | Habría salido peor de lo real |
| Percepción de margen/food-cost de alimentos | Habría salido mejor de lo real (empaque en $0) |
| Ventas reales, inventario real, cortes de caja reales | **Ninguno** — confirmado, nunca contaminados |
| Recetas reales (`recetas`/`productos`) | **Ninguna** — confirmado, 0 líneas de empaque antes de la corrección |

## Siguiente paso

No hay ventas ni movimientos históricos que corregir (no los hubo). El
trabajo pendiente es hacia adelante: asignar los empaques reales a cada
shake y alimento (`docs/empaques-por-receta.md`), y correr
`supabase/seed/sync-app-data.sql` cuando esa captura esté lista para que
el esquema real (y por lo tanto Admin/POS) reciba costos de empaque
correctos por primera vez.
