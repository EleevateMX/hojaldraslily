
-- Documento único con todo el estado del tablero (catálogos, recetas, inventario, parámetros)
create table if not exists public.app_data (
  id text primary key default 'hojaldraslily',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- Usuarios del candado de acceso (hash SHA-256 calculado en el navegador)
create table if not exists public.app_users (
  username text primary key,
  hash text not null,
  created_at timestamptz not null default now()
);

-- Fila inicial del tablero (la app la llena con los datos por defecto)
insert into public.app_data (id, data) values ('hojaldraslily', '{}'::jsonb)
on conflict (id) do nothing;

-- Seguridad a nivel de fila
alter table public.app_data enable row level security;
alter table public.app_users enable row level security;

-- Políticas: acceso público para uso interno (se accede con la clave anónima)
create policy "app_data_select" on public.app_data for select to anon, authenticated using (true);
create policy "app_data_insert" on public.app_data for insert to anon, authenticated with check (true);
create policy "app_data_update" on public.app_data for update to anon, authenticated using (true) with check (true);

create policy "app_users_select" on public.app_users for select to anon, authenticated using (true);
create policy "app_users_insert" on public.app_users for insert to anon, authenticated with check (true);

-- Realtime para sincronizar dispositivos en vivo
alter publication supabase_realtime add table public.app_data;
