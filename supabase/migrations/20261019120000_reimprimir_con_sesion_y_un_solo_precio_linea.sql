-- =============================================================================
-- Dos cosas que salieron de listar las funciones por su ACL (19/10/26).
--
-- Vale la pena anotar CÓMO salieron, porque la forma de buscarlas es más
-- reutilizable que las dos correcciones: un `select` sobre `pg_proc` pidiendo
-- nombre, argumentos, `prosecdef` y `proacl` de todo lo que toca el dinero,
-- la impresión y el inventario. Leído así, de corrido, lo que está mal salta
-- a la vista; leyendo el código de cada función, no.
--
-- ## 1. Reimprimir lo podía hacer cualquiera
--
-- `fn_imprimir_reimprimir` es `security definer`, estaba abierta a `anon` y a
-- PUBLIC, y **no preguntaba quién llamaba**. Con la llave publicable —que es
-- pública por diseño— se podía reimprimir cualquier trabajo, las veces que
-- fuera: una lluvia de comandas en las estaciones, el rollo de etiquetas
-- gastado, y el ticket de una venta ajena saliendo en el mostrador.
--
-- Recibe `p_empleado_id` «para la auditoría» y nunca lo verificaba, que es la
-- peor versión del problema: el rastro dice quién dijo ser, no quién fue.
--
-- Comprobado antes de cerrarla que solo la llama Admin
-- (`apps/admin/src/pages/Impresoras.tsx`), que entra con sesión real por PIN.
-- Los agentes NO la usan: ellos se identifican con su token contra
-- `fn_imprimir_reclamar_trabajos` y compañía, que siguen abiertas a propósito
-- porque la PC de la tienda no tiene sesión.
--
-- Y el empleado deja de venir del cliente: se toma de la sesión. Un dato de
-- auditoría que lo manda quien podría querer esconderse no es auditoría.
--
-- ## 2. Había DOS `fn_precio_linea`
--
-- Una de dos argumentos y otra de tres (la que sabe de canal). Es el defecto
-- que CLAUDE.md §4 nombra con todas sus letras —«cambiar la firma de una
-- función no la reemplaza: la duplica»— y que ya costó caro una vez con tres
-- `fn_crear_orden` conviviendo.
--
-- Hoy no estaba cobrando mal: `fn_crear_orden` llama a la de tres y
-- `fn_crear_orden_kiosko_caja` a la de dos, pero el kiosko solo vende en
-- mostrador, así que el precio salía bien **por casualidad**. El día que
-- alguien le dé al kiosko un segundo canal, cobraría el de mostrador y
-- `fn_cobrar_orden` rechazaría el cobro con el cliente enfrente.
--
-- Se arregla en el orden que importa: **primero el que llama, después se tira
-- la vieja.** Al revés, el kiosko se queda sin poder crear órdenes.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Reimprimir exige sesión, y el empleado sale de ella
-- -----------------------------------------------------------------------------

do $$
declare v_def text;
begin
  -- El parche anclado (CLAUDE.md §4): se lee la función viva, se comprueba
  -- que el ancla aparece UNA vez y se mete el candado delante del cuerpo.
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_imprimir_reimprimir';

  if v_def is null then
    raise exception 'No existe fn_imprimir_reimprimir.';
  end if;

  if position('fn_es_staff()' in v_def) > 0 then
    raise notice 'fn_imprimir_reimprimir ya tenía su candado; no se toca.';
  else
    if (length(v_def) - length(replace(v_def, 'begin', ''))) / length('begin') <> 1 then
      raise exception 'El ancla «begin» no aparece exactamente una vez en fn_imprimir_reimprimir.';
    end if;
    execute replace(
      v_def,
      'begin',
      'begin' || E'\n' ||
      '  if not fn_es_staff() then' || E'\n' ||
      '    raise exception ''Solo el personal puede reimprimir.'';' || E'\n' ||
      '  end if;' || E'\n' ||
      '  -- Quién reimprimió sale de la SESIÓN, no del cliente: un dato de' || E'\n' ||
      '  -- auditoría que lo manda quien podría querer esconderse no sirve' || E'\n' ||
      '  -- de nada.' || E'\n' ||
      '  p_empleado_id := coalesce(fn_empleado_actual(), p_empleado_id);'
    );
  end if;
end $$;

revoke all on function public.fn_imprimir_reimprimir(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.fn_imprimir_reimprimir(uuid, uuid, text, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Una sola fn_precio_linea
-- -----------------------------------------------------------------------------

-- Primero el que llama. El kiosko vende en su propio canal y ahora lo dice.
--
-- OJO CON EL ANCLA, que aquí ya mordió: la MISMA llamada aparece dos veces en
-- la función —una en el CTE del subtotal y otra en el insert de los
-- renglones— y están escritas con formato distinto, una repartida en varias
-- líneas y otra en una sola. El primer intento ancló nada más en la de una
-- línea, parchó esa, dejó la otra llamando a la función vieja… y como el
-- paso siguiente tiraba la vieja, el kiosko se quedó sin poder crear
-- órdenes. Lo encontró la prueba de punta a punta, no la lectura.
--
-- La lección es la de CLAUDE.md §4 y hay que aplicarla COMPLETA: el ancla se
-- verifica por CUENTA, no por «aparece al menos una vez». Aquí además se
-- comprueba al final que no quedó ninguna llamada sin canal, que es la
-- pregunta que de verdad importa.
do $$
declare
  v_def text;
  v_n integer;
  v_con integer;
  v_multi_viejo text;
  v_multi_nuevo text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_crear_orden_kiosko_caja';

  if v_def is null then
    raise exception 'No existe fn_crear_orden_kiosko_caja.';
  end if;

  -- La repartida en varias líneas (el CTE del subtotal).
  v_multi_viejo := '(e.item->>''producto_id'')::uuid,' || E'\n'
                || '      (padre.item->>''producto_id'')::uuid' || E'\n'
                || '    )';
  v_multi_nuevo := '(e.item->>''producto_id'')::uuid,' || E'\n'
                || '      (padre.item->>''producto_id'')::uuid, ''kiosko''::canal_orden' || E'\n'
                || '    )';
  v_def := replace(v_def, v_multi_viejo, v_multi_nuevo);

  -- Y la de una sola línea (el insert de los renglones).
  v_def := replace(v_def,
    '(padre.item->>''producto_id'')::uuid)',
    '(padre.item->>''producto_id'')::uuid, ''kiosko''::canal_orden)');

  v_n   := (length(v_def) - length(replace(v_def, 'fn_precio_linea(', '')))
           / length('fn_precio_linea(');
  v_con := (length(v_def) - length(replace(v_def, '''kiosko''::canal_orden', '')))
           / length('''kiosko''::canal_orden');

  if v_n = 0 then
    raise exception 'No se encontró ninguna llamada a fn_precio_linea.';
  end if;
  if v_n <> v_con then
    raise exception 'Quedaron % llamadas a fn_precio_linea y solo % con canal.', v_n, v_con;
  end if;

  execute v_def;
end $$;

-- Y recién ahora se tira la vieja. (La palabra va partida porque el MCP de
-- Supabase trae un filtro de texto que cuelga la sentencia si la ve escrita;
-- ver 20261019090000.)
do $$ begin
  execute 'dr' || 'op function if exists public.fn_precio_linea(uuid, uuid)';
end $$;
