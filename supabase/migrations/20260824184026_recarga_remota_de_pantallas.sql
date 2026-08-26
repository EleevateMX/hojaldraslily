-- Botón "actualizar pantallas" del Admin: gerencia manda una señal y las
-- pantallas de la tienda (kiosko, barra, cocina, folios) se recargan solas
-- por Realtime — sin que nadie camine a picarles F5.
create table if not exists senales_pantallas (
  id uuid primary key default gen_random_uuid(),
  -- 'kiosko' | 'barra' | 'cocina' | 'pantalla' | 'todas'
  pantalla text not null,
  accion text not null default 'recargar',
  pedido_por uuid,
  creado_en timestamptz not null default now()
);

alter table senales_pantallas enable row level security;

-- Las pantallas (anon o personal) solo ESCUCHAN; nadie escribe directo.
create policy senales_leer on senales_pantallas
  for select to anon, authenticated using (true);

-- Escribir solo vía RPC con candado de gerencia.
create or replace function public.fn_pantallas_recargar(p_pantalla text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede recargar las pantallas';
  end if;
  if p_pantalla not in ('kiosko', 'barra', 'cocina', 'pantalla', 'todas') then
    raise exception 'Pantalla desconocida: %', p_pantalla;
  end if;
  insert into senales_pantallas (pantalla, pedido_por)
  values (p_pantalla, fn_empleado_actual());
  -- La tabla es un timbre, no una bitácora: se barre sola.
  delete from senales_pantallas where creado_en < now() - interval '1 day';
end;
$fn$;

revoke all on function public.fn_pantallas_recargar(text) from public;
grant execute on function public.fn_pantallas_recargar(text) to authenticated, service_role;

alter publication supabase_realtime add table senales_pantallas;