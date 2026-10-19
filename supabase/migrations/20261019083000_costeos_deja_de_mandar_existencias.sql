-- Costeos deja de ser dueño de la existencia.
--
-- Viene del veredicto ⛔ de `docs/plantilla-para-otra-tienda.md` §9.3 (el
-- repo de Shakeaholic): «el modelo de Costeos: un documento JSON que manda la
-- DIFERENCIA contra su último número. Casi todos los bugs caros de inventario
-- salieron de ahí: entradas contadas dos veces, 630 insumos fantasma, una
-- pestaña vieja que deshacía ventas, recetas que no se reapuntan al
-- renombrar, productos partidos en dos».
--
-- Lily heredó ese camino entero y **armado**:
--
--     app_data  →  trg_sync_app_data()
--                    ├─ fn_sync_app_data()      catálogo  (se queda)
--                    └─ fn_sync_stock_costos()  existencia (se va)
--                         └─ _aplicar_delta_almacen()
--                              → inventario_movimientos: nuevo − anterior
--                              → costos_stock_sync.ultimo_valor = nuevo
--
-- Lo que hacía valioso arreglarlo HOY: medido antes de tocar nada,
-- `costos_stock_sync` ya tenía **50 renglones sembrados** pero el camino
-- llevaba **0 movimientos** generados, de 6 en todo el inventario. O sea que
-- estaba cargado y sin disparar. El día que alguien capture existencias en
-- Costeos —que es justo lo que falta para abrir— habría DOS dueños del mismo
-- número: Costeos por diferencias y Admin por movimientos (conteo, merma,
-- «llegó mercancía»). Reconciliar eso después es el trabajo que en
-- Shakeaholic lleva tres meses de parches (`entradas_sin_doble_conteo.sql`,
-- el reinicio que pone en cero tres cosas a la vez, la marca que impide que
-- una pestaña vieja vuelva a subir sus números).
--
-- **No se copia ninguno de esos parches.** Se corta el camino.
--
-- Qué se queda: el catálogo. Costeos sigue mandando productos, insumos y
-- recetas, que es para lo que sirve. Lo que deja de mandar es cuánto hay.
--
-- Qué NO se tira: `fn_sync_stock_costos`, `_aplicar_delta_almacen` y
-- `costos_stock_sync` quedan en su sitio, marcadas OBSOLETA en su `comment`.
-- Las migraciones de este repo son aditivas y el MCP de Supabase no ejecuta
-- `DROP` (§4). El orden para tirarlas, el día que se pueda:
--   1. fn_sync_stock_costos()
--   2. _aplicar_delta_almacen(uuid, text, tipo_movimiento)
--   3. costos_stock_sync
--
-- La otra mitad de este cambio vive en `apps/costos/index.html`: se quitó el
-- botón «✓ Aplicar conteo a existencias», que prometía «sobrescribe el stock
-- del sistema con lo contado». Dejarlo habría sido peor que quitarlo — se
-- toca, no pasa nada, y nadie se entera. Una falla callada es peor que una
-- ruidosa.
--
-- Cómo se comprobó, y qué NO se pudo comprobar: la llamada ya no está (la
-- única línea `perform` que queda es la del catálogo). La prueba de
-- comportamiento —guardar en Costeos y mirar que no nazca ningún movimiento—
-- **no se puede correr desde el MCP**: `fn_sync_app_data` usa tablas
-- temporales con `drop table`, y eso cuelga la herramienta igual que un DROP.
-- Que es, palabra por palabra, la trampa nº 1 de la §6 de ese mismo
-- documento. Queda para probarse en la tienda: guardar en Costeos y
-- comprobar que `inventario_movimientos` no crece.

create or replace function public.trg_sync_app_data()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- El catalogo SI lo manda Costeos: productos, insumos y recetas. Eso es lo
  -- que lo hace util y no se toca.
  perform fn_sync_app_data();

  -- La EXISTENCIA ya no. Aqui iba `perform fn_sync_stock_costos()`, que
  -- mandaba la DIFERENCIA contra el ultimo numero que Costeos recordaba
  -- (`costos_stock_sync.ultimo_valor`) en vez de registrar un movimiento.
  -- Ver el comentario de la migracion.
  return new;
end $function$;

comment on function public.fn_sync_stock_costos() is
  'OBSOLETA desde 2026-10-19. Mandaba la EXISTENCIA desde el documento de '
  'Costeos como una diferencia contra su ultimo valor. Ya no la llama nadie: '
  '`trg_sync_app_data` dejo de invocarla. La existencia solo cambia por '
  '`inventario_movimientos`. No se tira porque las migraciones son aditivas; '
  'para tirarla hay que tirar antes `_aplicar_delta_almacen`.';

comment on function public._aplicar_delta_almacen(uuid, text, tipo_movimiento) is
  'OBSOLETA desde 2026-10-19. Solo la llamaba `fn_sync_stock_costos`. Tirar '
  'esta primero y despues `costos_stock_sync`.';

comment on table public.costos_stock_sync is
  'OBSOLETA desde 2026-10-19. Guardaba el ultimo numero que Costeos creia '
  'tener de cada insumo, para poder mandar la diferencia. Se conserva como '
  'rastro: sus 50 renglones dicen que el camino llego a estar sembrado. '
  'Nadie la lee ni la escribe.';
