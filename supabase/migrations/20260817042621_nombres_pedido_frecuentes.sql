-- Chips de nombres en la pantalla de pago (modo cajero).
--
-- No hay tabla nueva: cada venta ya guarda ordenes.nombre_cliente, así que
-- los nombres "se almacenan solos". Esta función solo los resume: los más
-- usados primero, agrupando mayúsculas/minúsculas ("pedro" y "Pedro" son el
-- mismo botón) y filtrando lo que no parece nombre (demos, números, textos
-- larguísimos).
create or replace function public.fn_nombres_pedido_frecuentes(p_limite int default 30)
returns table (nombre text, veces bigint)
language sql
stable
security definer
set search_path = public
as $$
  select initcap(min(trim(o.nombre_cliente))) as nombre, count(*) as veces
  from ordenes o
  where o.nombre_cliente is not null
    and not o.es_demo
    and length(trim(o.nombre_cliente)) between 2 and 20
    and trim(o.nombre_cliente) ~ '^[[:alpha:]áéíóúüñÁÉÍÓÚÜÑ. ]+$'
  group by lower(trim(o.nombre_cliente))
  order by count(*) desc, max(o.created_at) desc
  limit greatest(coalesce(p_limite, 30), 1)
$$;

revoke all on function public.fn_nombres_pedido_frecuentes(int) from public;
grant execute on function public.fn_nombres_pedido_frecuentes(int) to anon, authenticated, service_role;