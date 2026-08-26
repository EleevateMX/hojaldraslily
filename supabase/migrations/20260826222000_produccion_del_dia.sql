-- Cuantos paquetes hay, no cuantos kilos de harina.
--
-- El inventario que venia del motor original cuenta INSUMOS por almacen
-- (harina, jamon, queso, en kg). Eso sirve para costear, pero no es la
-- pregunta que se hace en una panaderia a media manana: "¿cuantos paquetes
-- de guayaba chica me quedan?".
--
-- Aqui se lleva el producto TERMINADO: lo que sale del horno cada dia, en
-- paquetes, por sabor y tamano. Disponible = lo horneado menos lo vendido.
--
-- No sustituye al costeo: lo complementa. El costeo dice cuanto cuesta cada
-- pieza; esto dice cuantas hay.

create table if not exists public.produccion (
  id           uuid primary key default gen_random_uuid(),
  producto_id  uuid not null references public.productos(id) on delete cascade,
  -- El dia se corta en hora de Merida: lo horneado a las 7 de la manana y lo
  -- vendido a las 6 de la tarde tienen que caer en la MISMA fecha, y en UTC
  -- no caen.
  fecha        date not null default (now() at time zone 'America/Merida')::date,
  cantidad     int  not null,
  -- 'horneado' suma; 'merma' y 'ajuste' se guardan en negativo. Se guarda el
  -- motivo y no solo el signo para poder contestar despues "¿cuanto se echo
  -- a perder?" sin adivinarlo.
  motivo       text not null default 'horneado'
               check (motivo in ('horneado', 'merma', 'ajuste')),
  nota         text,
  quien        text,
  created_at   timestamptz not null default now()
);

comment on table public.produccion is
  'Paquetes terminados que salen del horno (y las mermas). Disponible = horneado - vendido.';

create index if not exists produccion_fecha_idx on public.produccion (fecha, producto_id);

alter table public.produccion enable row level security;

-- Solo el personal: no es informacion que deba andar suelta con la llave
-- publica, ni algo que un cliente tenga por que escribir.
drop policy if exists produccion_staff on public.produccion;
create policy produccion_staff on public.produccion for all to authenticated
  using (public.fn_rol_staff() is not null)
  with check (public.fn_rol_staff() is not null);

revoke all on table public.produccion from anon;
grant select, insert on table public.produccion to authenticated;

-- ------------------------------------------------------------------------
-- Lo que hay hoy, listo para pintarse en pantalla.
-- ------------------------------------------------------------------------
create or replace function public.fn_existencias_del_dia(p_fecha date default null)
returns table (
  producto_id  uuid,
  nombre       text,
  categoria    text,
  imagen_url   text,
  precio       numeric,
  horneados    bigint,
  mermados     bigint,
  vendidos     bigint,
  disponibles  bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with dia as (
    select coalesce(p_fecha, (now() at time zone 'America/Merida')::date) as d
  ),
  hecho as (
    select pr.producto_id,
           sum(pr.cantidad) filter (where pr.motivo = 'horneado')      as horneados,
           -sum(pr.cantidad) filter (where pr.motivo <> 'horneado')    as mermados,
           sum(pr.cantidad)                                            as neto
    from produccion pr cross join dia
    where pr.fecha = dia.d
    group by pr.producto_id
  ),
  vendido as (
    select oi.producto_id, sum(oi.cantidad) as piezas
    from orden_items oi
    join ordenes o on o.id = oi.orden_id
    cross join dia
    where o.pagado
      and coalesce(o.es_demo, false) = false
      and (o.created_at at time zone 'America/Merida')::date = dia.d
    group by oi.producto_id
  )
  select
    p.id,
    p.nombre,
    c.nombre,
    p.imagen_url,
    p.precio,
    coalesce(hecho.horneados, 0)::bigint,
    coalesce(hecho.mermados, 0)::bigint,
    coalesce(vendido.piezas, 0)::bigint,
    (coalesce(hecho.neto, 0) - coalesce(vendido.piezas, 0))::bigint
  from productos p
  join categorias c on c.id = p.categoria_id
  left join hecho   on hecho.producto_id = p.id
  left join vendido on vendido.producto_id = p.id
  where p.activo and not p.es_extra and c.activa
  order by c.orden, p.orden, p.nombre;
$$;

comment on function public.fn_existencias_del_dia(date) is
  'Paquetes horneados, mermados, vendidos y disponibles de un dia (hora de Merida). Solo de menus abiertos.';

revoke all on function public.fn_existencias_del_dia(date) from public;
grant execute on function public.fn_existencias_del_dia(date) to authenticated;

-- ------------------------------------------------------------------------
-- Registrar lo que salio del horno.
-- ------------------------------------------------------------------------
create or replace function public.fn_produccion_registrar(
  p_producto_id uuid,
  p_cantidad    int,
  p_motivo      text default 'horneado',
  p_nota        text default null
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_quien text; v_disponible bigint;
begin
  if fn_rol_staff() is null then
    raise exception 'Solo el personal puede registrar producción.';
  end if;
  -- Se guarda el NOMBRE de quien capturo, no su puesto: la bitacora sirve
  -- para preguntarle a alguien, y "gerente" no le pregunta a nadie.
  select e.nombre into v_quien
    from empleados e where e.auth_user_id = auth.uid() and e.activo limit 1;
  if p_cantidad is null or p_cantidad = 0 then
    raise exception 'La cantidad no puede ser cero.';
  end if;
  if p_motivo not in ('horneado', 'merma', 'ajuste') then
    raise exception 'Motivo desconocido: %', p_motivo;
  end if;

  insert into produccion (producto_id, cantidad, motivo, nota, quien)
  values (
    p_producto_id,
    -- La merma SIEMPRE resta, aunque se capture en positivo: es el error mas
    -- facil de cometer capturando rapido, y sumar una merma deja el
    -- inventario al reves justo cuando mas se necesita.
    case when p_motivo = 'horneado' then abs(p_cantidad) else -abs(p_cantidad) end,
    p_motivo, nullif(trim(coalesce(p_nota, '')), ''), v_quien
  );

  select disponibles into v_disponible
  from fn_existencias_del_dia(null) where producto_id = p_producto_id;
  return coalesce(v_disponible, 0);
end;
$$;

revoke all on function public.fn_produccion_registrar(uuid, int, text, text) from public;
grant execute on function public.fn_produccion_registrar(uuid, int, text, text) to authenticated;
