-- =====================================================================
-- Cierre de seguridad adicional, encontrado en la re-verificación
-- exhaustiva pedida para esta ronda ("no des por hecho que las
-- correcciones anteriores cubren todo"). Verificado contra el código real
-- de las 8 apps (grep de todos los `.from('clientes')`/`.from('cupones')`/
-- `.from('mancuernas_movimientos')`) antes de cerrar nada, para no romper
-- ningún flujo legítimo:
--
--   1. `clientes.mancuernas` era editable directo por `anon` (policy de
--      UPDATE sin restricción de columna) — cualquiera con la anon key
--      podía auto-otorgarse mancuernas con un PATCH directo. NINGÚN
--      consumidor real del código actualiza esa columna directo (solo
--      `desactivarCliente` toca `activo`) — se restringe la columna sin
--      afectar nada existente.
--   2. `clientes` INSERT no exigía `mancuernas = 0` — se podía registrar
--      un cliente con saldo pre-cargado. Ningún alta real (registrarCliente,
--      vincularClienteAuth) manda `mancuernas` — usan el default (0).
--   3. `cupones` INSERT directo estaba abierto — cualquiera podía crearse
--      un cupón 'activo' gratis. Ningún flujo del código inserta cupones
--      directo (solo el trigger fn_acumular_mancuernas, SECURITY DEFINER,
--      que no está sujeto a esta policy).
--   4. `mancuernas_movimientos` INSERT directo estaba abierto — sin
--      ningún consumidor real (es un ledger de solo lectura para la app;
--      solo el trigger escribe ahí).
--
-- `productos.precio` y `caja_cortes` (corte de caja) SÍ tienen
-- consumidores legítimos de escritura directa hoy (Admin edita precios;
-- el cajero cierra su corte) — cerrarlos requiere una RPC dedicada y
-- pruebas contra esos flujos reales, que no se improvisan en esta pasada.
-- Quedan documentados como deuda A3 en docs/auditoria-produccion.md,
-- igual que antes — no se tocan aquí para no arriesgar romperlos.
-- ======================================================================

drop policy if exists upd_clientes on clientes;
create policy upd_clientes on clientes
  for update using (true);
revoke update on clientes from anon, authenticated;
grant update (activo) on clientes to anon, authenticated;

drop policy if exists ins_clientes on clientes;
create policy ins_clientes on clientes
  for insert
  with check (mancuernas = 0);

drop policy if exists ins_cupones on cupones;
-- Sin policy de insert: RLS bloquea todo INSERT directo de anon/authenticated.
-- fn_acumular_mancuernas (SECURITY DEFINER) sigue pudiendo crear cupones.

drop policy if exists ins_mancuernas on mancuernas_movimientos;
-- Mismo criterio: es un ledger, solo lo escribe el trigger.
