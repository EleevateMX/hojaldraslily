-- ¿Para cuándo estaría listo?
--
-- Cuando gerencia manda a hacer 30 bolitas de queso, la pregunta que sigue --
-- en la caja y en el horno -- es "¿a que hora salen?". Sin eso, la caja no
-- sabe que contestarle a un cliente que espera, y en produccion no hay
-- referencia de si van bien o van tarde.
--
-- El tiempo vive POR PRODUCTO porque no tarda lo mismo una hojaldra chica
-- que una charola grande. Mientras el negocio no pase los tiempos reales, se
-- arranca con un valor por omision y se ajusta desde Costeos/Admin sin tocar
-- codigo: es un dato, no una constante escondida.

alter table public.productos
  add column if not exists minutos_horneado int;

comment on column public.productos.minutos_horneado is
  'Cuanto tarda en salir del horno, en minutos. Null = usar el valor por omision del parametro.';

-- El valor por omision, para lo que todavia no tiene tiempo propio.
insert into public.parametros (id) values ('default')
on conflict (id) do nothing;

alter table public.parametros
  add column if not exists minutos_horneado_default int not null default 45;

comment on column public.parametros.minutos_horneado_default is
  'Minutos que se suponen cuando un producto no tiene su propio tiempo. Se ajusta cuando el negocio pase los reales.';

-- ------------------------------------------------------------------------
-- La orden de produccion, con su hora estimada.
-- ------------------------------------------------------------------------
-- Se calcula, no se guarda: si manana cambia el tiempo de un producto, las
-- ordenes abiertas se recalculan solas. Guardarlo congelaria una estimacion
-- vieja y habria que salir a corregirla a mano.
create or replace function public.fn_ordenes_de_produccion(p_incluir_terminadas boolean default false)
returns table (
  id             uuid,
  folio          bigint,
  estado         text,
  nota           text,
  creada_por     text,
  created_at     timestamptz,
  /** Cuanto se estima que tarda la orden entera: la pieza mas lenta manda. */
  minutos        int,
  listo_estimado timestamptz,
  piezas_pedidas bigint,
  piezas_hechas  bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with p as (select coalesce(min(minutos_horneado_default), 45) as def from parametros)
  select
    op.id, op.folio, op.estado, op.nota, op.creada_por, op.created_at,
    max(coalesce(pr.minutos_horneado, p.def))::int as minutos,
    -- La orden esta lista cuando sale la pieza mas lenta, no la primera:
    -- se hornean en paralelo, no en fila.
    op.created_at + (max(coalesce(pr.minutos_horneado, p.def)) || ' minutes')::interval,
    sum(i.cantidad_pedida)::bigint,
    sum(least(i.cantidad_hecha, i.cantidad_pedida))::bigint
  from ordenes_produccion op
  join orden_produccion_items i on i.orden_id = op.id
  join productos pr on pr.id = i.producto_id
  cross join p
  where p_incluir_terminadas or op.estado in ('pendiente', 'en_proceso')
  group by op.id, op.folio, op.estado, op.nota, op.creada_por, op.created_at
  order by op.created_at desc
  limit 50;
$$;

comment on function public.fn_ordenes_de_produccion(boolean) is
  'Ordenes de produccion con su hora estimada de salida. La estimacion se calcula al vuelo: cambiar el tiempo de un producto recalcula las ordenes abiertas.';

revoke all on function public.fn_ordenes_de_produccion(boolean) from public;
grant execute on function public.fn_ordenes_de_produccion(boolean) to authenticated;
