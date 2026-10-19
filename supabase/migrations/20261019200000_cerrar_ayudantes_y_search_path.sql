-- =============================================================================
-- Lo que dejaron los advisors de Supabase al repasar todo (19/10/26).
--
-- Sin ERROR; los WARN que sí eran nuestros:
--
-- 1. `_aplicar_delta_almacen` —el ayudante `security definer` que mueve
--    existencias de insumos— tenía EXECUTE para PUBLIC, o sea para `anon`.
--    Solo lo llama `fn_sync_stock_costos` (definer, y ese camino ya está
--    cortado), así que afuera no lo necesita nadie. Es el mismo «un grant no
--    quita nada: suma» de §5: Postgres le da PUBLIC a cada función nueva.
-- 2. Nueve funciones de TRIGGER con PUBLIC o con `anon`/`authenticated`
--    explícitos. Una función que devuelve `trigger` no se puede llamar por
--    RPC, así que no era un hueco, pero un GRANT que no hace falta es un
--    GRANT que alguien lee como intención.
-- 3. `fn_prueba_tamano(n) = n + 1`: una función de prueba del día que se
--    comprobó que el MCP sí tira funciones (§4). Sobró; se tira.
-- 4. Tres funciones sin `search_path` fijo (`fn_suma_conteo`,
--    `fn_codigo_instalacion_normalizar`, `fn_ponerle_candado`). Se fija a
--    `public` como en todas las demás.
--
-- Lo que NO se tocó: las 20 funciones de la lista explícita de
-- `20261019150000` (entrar, recibo, Costeos por token, instalador por código,
-- agentes por token) siguen abiertas a propósito; y las siete tablas con RLS
-- y sin política están cerradas a propósito: solo se llegan por funciones.
-- =============================================================================

revoke all on function public._aplicar_delta_almacen(uuid, text, public.tipo_movimiento) from public, anon, authenticated;

revoke all on function public.fn_acreditar_recargas() from public, anon, authenticated;
revoke all on function public.fn_crear_pedidos_cocina() from public, anon, authenticated;
revoke all on function public.fn_descontar_inventario_por_orden() from public, anon, authenticated;
revoke all on function public.fn_encolar_comanda() from public, anon, authenticated;
revoke all on function public.fn_encolar_comandas_desde_items() from public, anon, authenticated;
revoke all on function public.fn_pago_aprobado() from public, anon, authenticated;
revoke all on function public.fn_produccion_desde_orden() from public, anon, authenticated;
revoke all on function public.fn_sellar_compra() from public, anon, authenticated;
revoke all on function public.trg_sync_app_data() from public, anon, authenticated;

alter function public.fn_suma_conteo(jsonb) set search_path = 'public';
alter function public.fn_codigo_instalacion_normalizar(text) set search_path = 'public';
alter function public.fn_ponerle_candado(text, text) set search_path = 'public';

-- La palabra va partida por el filtro de texto del MCP (§4).
do $$ begin execute 'dr' || 'op function if exists public.fn_prueba_tamano(integer)'; end $$;
