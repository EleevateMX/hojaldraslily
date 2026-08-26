-- Bitacora del portal WiFi: registros de invitados y trafico crudo del gateway
-- Reyee (para deducir el contrato de su API "Cloud Integration").
create table if not exists public.portal_eventos (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null,
  cliente_id  uuid references public.clientes(id),
  mac         text,
  ip          text,
  ssid        text,
  datos       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists idx_portal_eventos_created on public.portal_eventos (created_at desc);
create index if not exists idx_portal_eventos_tipo    on public.portal_eventos (tipo, created_at desc);

alter table public.portal_eventos enable row level security;

-- Sin politicas: nadie llega por anon/authenticated. Solo service_role, que
-- por definicion pasa por encima de RLS. A diferencia de `clientes`, aqui no
-- se abre lectura publica: guarda MACs, IPs y headers.
revoke all on public.portal_eventos from anon, authenticated;

notify pgrst, 'reload schema';