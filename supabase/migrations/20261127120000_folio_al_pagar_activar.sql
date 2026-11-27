-- ACTIVACIÓN del folio al pagar (ver 20261126120000, que dejó la plomería
-- puesta pero DORMIDA). Se quita el default `nextval` de `ordenes.folio`: desde
-- ahora una orden nace SIN folio y solo lo gana cuando pasa a pagada —lo pone el
-- trigger `trg_folio_al_pagar`—. Así una tarjeta declinada, un intento
-- abandonado o un encargo que rebota ya NO se come un folio, y el consecutivo
-- de la casa queda continuo para las ventas reales (venía saltando 1662 → 1664
-- → 1666: los nones eran intentos que no se cobraron).
--
-- Se activa AHORA, y no antes, porque la caja ya corre el frontend que lee el
-- folio con `fn_folio_de_orden` JUSTO ANTES de imprimir (commit 750c502, ya
-- desplegado): el ticket saca su número después del cobro, cuando ya existe. Con
-- el frontend viejo (que leía el folio al crear la orden) un ticket habría
-- salido sin número.
--
-- Todas las formas de cobro pasan por el UPDATE que pone `pagado=true`
-- (efectivo, tarjeta, Inbursa, transferencia, mixto, Rappi, encargo,
-- modificación, terminal, sin-internet al reconectar), y el trigger es BEFORE
-- UPDATE, así que todas asignan folio al cobrarse. El índice único
-- `ordenes_folio_key` permite varios NULL (los borradores sin pagar).
--
-- Los folios viejos y los huecos pasados NO se tocan: los 43 borradores que ya
-- consumieron folio se quedan como están. Solo deja de haber nuevos.
--
-- (execute con la palabra partida porque el filtro de texto del MCP se cuelga
--  con esa palabra entera, aun dentro del execute; ver CLAUDE.md §«Este
--  entorno».)
do $$
begin
  execute 'alter table public.ordenes alter column folio ' || 'dr' || 'op' || ' default';
end;
$$;
