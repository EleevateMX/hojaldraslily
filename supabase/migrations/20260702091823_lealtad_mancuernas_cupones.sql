-- =====================================================================
-- Hojaldras Lily Rewards (aditivo) — mancuernas y cupones.
-- Identificación por teléfono + código QR. No toca app_data/app_users.
-- Reglas del fundamento del cliente:
--   1 mancuerna por cada $10; tope 100 por transacción.
--   Cupón al llegar a 100 mancuernas, vigencia 1 año; máx 5 activos.
--   Cupón de cumpleaños: aparte (generado por cron mensual).
-- =====================================================================

do $$ begin create type tipo_mancuerna as enum ('ganadas','canje','ajuste','promo','proximidad'); exception when duplicate_object then null; end $$;
do $$ begin create type tipo_cupon as enum ('mancuernas','cumpleanos'); exception when duplicate_object then null; end $$;
do $$ begin create type estado_cupon as enum ('activo','usado','expirado','cancelado'); exception when duplicate_object then null; end $$;

-- ---------- clientes: campos de lealtad ----------
alter table clientes add column if not exist