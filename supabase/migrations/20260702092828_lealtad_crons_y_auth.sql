-- =====================================================================
-- Lealtad: enlace con Auth (PWA Google) + jobs programados (pg_cron).
-- Aditivo. No toca app_data/app_users.
-- =====================================================================

-- Enlace cliente <-> usuario de Supabase Auth (registro por Google en la PWA)
alter table clientes add column if not exists auth_user_id uuid unique;

-- ---------- funciones para los jobs ----------
create or replace function fn_expirar_cupones()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update cupones set estado='expirado'
   where estado='activo' and vence_en < now();
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Reactivación: +5 mancuernas a clientes con >30 días sin comprar
-- (con al menos 1 compra histórica) y sin reactivación en los últimos 30 días.
create or replace function fn_reactivacion()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer := 0; r record;
begin
  for r in
    select c.id from clientes c
    where c.activo
      and exists (select 1 from ordenes o where o.cliente_id=c.id and o.pagado=true)
      and not exists (select 1 from ordenes o where o.cliente_id=c.id and o.pagado=true and o.created_at >= now() - interval '30 days')
      and not exists (select 1 from mancuernas_movimientos m where m.cliente_id=c.id and m.tipo='promo' and m.descripcion='Reactivación' and m.created_at >= now() - interval '30 days')
  loop
    update clientes set mancuernas = mancuernas + 5 where id = r.id;
    insert into mancuernas_movimientos (cliente_id, puntos, tipo, descripcion)
      values (r.id, 5, 'promo', 'Reactivación');
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- ---------- pg_cron ----------
create extension if not exists pg_cron;

-- idempotente: cron.schedule hace upsert por nombre de job
select cron.schedule('cupones-cumpleanos', '0 6 1 * *', $$select public.fn_generar_cupones_cumpleanos()$$);
select cron.schedule('cupones-expirar',    '0 5 * * *', $$select public.fn_expirar_cupones()$$);
select cron.schedule('lealtad-reactivacion','0 6 * * 1', $$select public.fn_reactivacion()$$);