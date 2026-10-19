-- =============================================================================
-- El cobro exige sesión (19/10/26).
--
-- Era el pendiente número uno de `docs/base-de-replicacion.md` §7, y el que
-- el otro sistema tampoco cerró nunca: `fn_crear_orden`, `fn_cobrar_orden` y
-- compañía abiertas a `anon`, porque el kiosko cobraba **sin sesión**. Quitar
-- el permiso dejaba a la tienda sin vender.
--
-- Hoy la casa decidió que **se vende desde la caja**, que entra con PIN y
-- tiene sesión real; el kiosko queda para después. Eso es lo que destraba
-- esto: ya no hay ninguna pantalla que cobre sin sesión, así que todo lo que
-- toca dinero pasa a `authenticated`.
--
-- ## Quién llama qué (comprobado ANTES de cerrar, en todo el repo)
--
-- | Sin sesión | Qué usa | Se queda abierto |
-- |---|---|---|
-- | `web` (sitio público) | `select` de `productos` | sí (política `cat_read_productos`) |
-- | `cliente-display` (TV) | `select` de `pedidos_cocina`, `cocina_items`, `ordenes (pagado)` + Realtime | sí |
-- | Costeos | `fn_costos_*` por token | sí |
-- | instalador | `fn_instalador_*` por código | sí |
-- | agentes | `fn_imprimir_*` por token | sí |
-- | login | `fn_login_cajero`, `fn_recibo_publico` | sí |
-- | `staff-login` (Edge) | `fn_staff_por_pin`, `fn_pin_*`, `fn_staff_vincular_auth` | con `service_role`, que se salta los GRANT |
-- | cron | `fn_reconciliar_pagos`, `fn_expirar_ordenes_kiosko`, `fn_imprimir_liberar_vencidos` | corre como `postgres` |
--
-- Todo lo demás lo llaman la caja, Admin y las tres estaciones, que entran
-- con PIN. El kiosko llamaba a varias; cuando vuelva, tendrá que sostener su
-- sesión (lo que la guía del otro sistema marca como «desde el día uno»).
--
-- ## Y las políticas de tabla
--
-- Cuatro tablas tenían `using (true)` para `public` en UPDATE/INSERT:
-- `caja_cortes`, `ordenes`, `pagos`, `pedidos_cocina` y `cocina_items`. Con
-- la llave publicable se podía cambiar el total de una orden, meter un pago
-- pendiente o reescribir el corte. Ya nadie escribe esas tablas desde el
-- navegador —todo pasa por funciones `definer`—, así que las políticas
-- públicas de escritura se van. Las de LECTURA que necesita la TV se quedan.
--
-- El `dr`+`op` partido es por el filtro de texto del MCP (ver 20261019090000).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Las funciones
-- -----------------------------------------------------------------------------

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as firma
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and has_function_privilege('anon', p.oid, 'execute')
      and p.proname like 'fn_%'
      and pg_get_function_result(p.oid) <> 'trigger'
      and p.proname not in (
        -- Entrar y el recibo del QR
        'fn_login_cajero', 'fn_recibo_publico',
        -- Los ayudantes que usan las POLÍTICAS: una política de `public` que
        -- llama a fn_rol_staff() revienta si anon no puede ejecutarla.
        'fn_es_staff', 'fn_es_jefe', 'fn_rol_staff', 'fn_empleado_actual',
        -- Costeos (por token)
        'fn_costos_login', 'fn_costos_cargar', 'fn_costos_guardar', 'fn_costos_salir',
        'fn_costos_registrar', 'fn_costos_usuario_del_token',
        -- El instalador (por código) y los agentes (por token)
        'fn_instalador_impresoras', 'fn_instalador_token',
        'fn_imprimir_reclamar_trabajos', 'fn_imprimir_confirmar', 'fn_imprimir_fallar',
        'fn_imprimir_latido', 'fn_imprimir_prueba', 'fn_diagnostico_impresora'
      )
  loop
    execute 'revoke all on function ' || r.firma::text || ' from public, anon';
    execute 'grant execute on function ' || r.firma::text || ' to authenticated';
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Las políticas de tabla
-- -----------------------------------------------------------------------------

do $$
declare p text;
begin
  foreach p in array array[
    'ins_caja_cortes on caja_cortes', 'upd_caja_cortes on caja_cortes', 'sel_caja_cortes on caja_cortes',
    'upd_ordenes_pos on ordenes', 'sel_ordenes_pos on ordenes', 'kds_upd_ordenes on ordenes',
    'ins_pagos on pagos', 'sel_pagos on pagos',
    'upd_pedidos_cocina on pedidos_cocina',
    'upd_cocina_items on cocina_items',
    'kds_read_items on orden_items',
    'sel_trabajos_impresion on trabajos_impresion',
    'ins_promoapp on promocion_aplicaciones'
  ] loop
    execute 'dr' || 'op policy if exists ' || p;
  end loop;
end $$;

-- Lo que la caja y Admin leen con sesión. Las ESCRITURAS no tienen política:
-- todas pasan por funciones `definer`, que corren como el dueño.
create policy caja_cortes_staff on caja_cortes for select to authenticated
  using (fn_rol_staff() is not null);
create policy ordenes_staff on ordenes for select to authenticated
  using (fn_rol_staff() is not null);
create policy orden_items_staff on orden_items for select to authenticated
  using (fn_rol_staff() is not null);
create policy pagos_staff on pagos for select to authenticated
  using (fn_rol_staff() is not null);
create policy trabajos_impresion_staff on trabajos_impresion for select to authenticated
  using (fn_rol_staff() is not null);

-- La TV de folios sigue leyendo lo pagado: `kds_read_ordenes (pagado = true)`
-- y las de `pedidos_cocina` / `cocina_items` no se tocan.
