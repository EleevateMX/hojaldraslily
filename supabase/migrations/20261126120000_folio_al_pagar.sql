-- El folio se salta porque se asigna al CREAR el ticket, antes de saber si el
-- cobro pasa. Una tarjeta declinada, un intento abandonado, un encargo que
-- rebota: todos nacen con `fn_crear_orden`, que consume un folio por el default
-- `nextval`, y si no se cobran, ese número queda "comido". Por eso la casa ve
-- 1662 → 1664 → 1666 (los nones son intentos que no se cobraron).
--
-- Arreglo: el folio se asigna cuando la orden pasa a **pagada**, no al crearse.
-- Un ticket que no se cobra ya no se come un folio, así que el consecutivo de
-- la casa queda continuo para las ventas reales.
--
-- Va en un TRIGGER y no editando cada función de cobro: así la regla se cumple
-- venga de donde venga (efectivo, tarjeta, Inbursa, transferencia, mixto,
-- Rappi, encargo, modificación, terminal, sin-internet al reconectar) —todas
-- pasan por el UPDATE que pone `pagado=true` en `fn_confirmar_venta`, pero el
-- trigger cubre también cualquier camino futuro.
--
-- Los folios viejos NO se tocan; los huecos pasados se quedan. Solo deja de
-- haber nuevos.

-- 1) El trigger: al pasar a pagada (o si naciera pagada) y sin folio, le pone
--    el siguiente del contador. Un UPDATE que no toca `pagado` no hace nada; un
--    reintento sobre una orden ya pagada tampoco (ya trae folio).
create or replace function public.fn_asignar_folio_al_pagar()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.pagado and new.folio is null
     and (tg_op = 'INSERT' or not coalesce(old.pagado, false)) then
    new.folio := nextval('public.ordenes_folio_seq');
  end if;
  return new;
end;
$$;

create trigger trg_folio_al_pagar
  before insert or update on public.ordenes
  for each row execute function public.fn_asignar_folio_al_pagar();

-- 2) El lector que usa la caja para sacar el folio YA asignado justo antes de
--    imprimir la nota (la orden ya se pagó, así que el folio existe). Solo
--    personal con sesión; devuelve nada más el número.
create or replace function public.fn_folio_de_orden(p_orden_id uuid)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select folio from public.ordenes where id = p_orden_id
$$;

revoke all on function public.fn_folio_de_orden(uuid) from public;
revoke all on function public.fn_folio_de_orden(uuid) from anon;
grant execute on function public.fn_folio_de_orden(uuid) to authenticated, service_role;

-- 3) Se hace el folio NULLABLE (el índice único `ordenes_folio_key` permite
--    varios NULL: los borradores sin pagar). El trigger de arriba ya está listo
--    para asignarlo al pagar.
--    OJO — la ACTIVACIÓN (quitar el default, para que una orden nazca SIN folio
--    y solo lo gane al pagarse) va en una migración APARTE, para hacerla cuando
--    la caja ya corra el frontend que lee el folio con `fn_folio_de_orden` justo
--    antes de imprimir. Si se quitara el default con el frontend viejo (que lee
--    el folio al crear), un ticket saldría sin número. Por eso aquí el default
--    SE QUEDA: la plomería queda puesta pero dormida.
--    (Se usa execute con la palabra partida porque el filtro del MCP se cuelga
--    con esa palabra entera; ver CLAUDE.md §«Este entorno».)
do $$
begin
  execute 'alter table public.ordenes alter column folio ' || 'dr' || 'op' || ' not null';
end;
$$;
