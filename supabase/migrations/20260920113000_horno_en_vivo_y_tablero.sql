-- Lo que el horno le contesta a todos los demas.
--
-- Es la flecha H -> C del camino C -> P -> H -> E: la caja pregunta "¿a que
-- hora salen?" mientras esta cobrando, y la respuesta no puede ser ir a
-- preguntarle a alguien al horno.
--
-- Contesta TRES cosas, no una, porque son tres preguntas distintas:
--   adentro   -- lo que se esta horneando, con su reloj (lo que mas tarde
--                en salir va primero: es lo que hay que vigilar)
--   esperando -- lo que produccion ya armo y espera turno para entrar
--   sin_armar -- lo pedido que produccion todavia no toca. La caja lo mira
--                para saber que ESO no va a estar pronto.
--
-- La ventana es de ayer en adelante: una orden de la semana pasada no dice
-- nada del horno de hoy, y un tablero que nunca se vacia deja de leerse
-- (la leccion de los indicadores, CLAUDE.md §4).

create or replace function public.fn_horno_en_vivo()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_res jsonb; v_def int;
begin
  if fn_rol_staff() is null then
    raise exception 'Solo el personal puede ver el horno.';
  end if;

  select coalesce(min(minutos_horneado_default), 50) into v_def from parametros;

  with minutos as (
    select p.sabor, min(p.minutos_horneado) as min
      from productos p where p.minutos_horneado is not null group by p.sabor
  ),
  renglones as (
    select i.id, i.sabor, i.cuadros_por_molde, i.moldes,
           i.moldes_armados, i.moldes_en_horno, i.cantidad_hecha,
           i.horno_entro_en,
           o.folio, o.created_at,
           coalesce(m.min, v_def) as minutos,
           i.horno_entro_en + make_interval(mins => coalesce(m.min, v_def)) as listo_en,
           (i.moldes_armados - i.cantidad_hecha - i.moldes_en_horno) as esperando
      from orden_produccion_items i
      join ordenes_produccion o on o.id = i.orden_id
      left join minutos m on m.sabor = i.sabor
     where o.estado <> 'cancelada'
       and o.fecha >= (now() at time zone 'America/Merida')::date - 1
  )
  select jsonb_build_object(
    'ahora', now(),
    -- Lo que está DENTRO del horno, con su reloj. Lo que más tarde en salir,
    -- primero: es lo que hay que vigilar.
    'adentro', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'item_id',   id,
        'folio',     folio,
        'sabor',     sabor,
        'moldes',    moldes_en_horno,
        'molde',     cuadros_por_molde,
        'cuadros',   moldes_en_horno * cuadros_por_molde,
        'entro_en',  horno_entro_en,
        'listo_en',  listo_en,
        'minutos',   minutos,
        'tarde',     listo_en < now()
      ) order by listo_en), '[]'::jsonb)
      from renglones where moldes_en_horno > 0),
    -- Armado por producción y esperando turno para entrar.
    'esperando', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'item_id', id,
        'folio',   folio,
        'sabor',   sabor,
        'moldes',  esperando,
        'molde',   cuadros_por_molde,
        'cuadros', esperando * cuadros_por_molde,
        'minutos', minutos
      ) order by created_at), '[]'::jsonb)
      from renglones where esperando > 0),
    -- Pedido pero que producción todavía no arma. La caja lo ve para saber
    -- que eso no va a estar pronto.
    'sin_armar', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'item_id', id,
        'folio',   folio,
        'sabor',   sabor,
        'moldes',  coalesce(moldes,0) - moldes_armados,
        'molde',   cuadros_por_molde
      ) order by created_at), '[]'::jsonb)
      from renglones where coalesce(moldes,0) - moldes_armados > 0),
    'resumen', (
      select jsonb_build_object(
        'en_horno',  coalesce(sum(moldes_en_horno), 0),
        'esperando', coalesce(sum(greatest(esperando,0)), 0),
        'sin_armar', coalesce(sum(greatest(coalesce(moldes,0) - moldes_armados, 0)), 0),
        'tarde',     count(*) filter (where moldes_en_horno > 0 and listo_en < now()))
      from renglones)
  ) into v_res;

  return v_res;
end $$;

comment on function public.fn_horno_en_vivo() is
  'Que hay en el horno, que espera y que falta armar. La usan la pantalla del horno, la caja y Admin.';

-- Revoke Y grant, en ese orden. Postgres le da EXECUTE a PUBLIC por omision
-- en cada funcion nueva, asi que otorgarle a `authenticated` no cierra nada
-- (CLAUDE.md §5).
grant execute on function public.fn_horno_en_vivo() to authenticated;
revoke all on function public.fn_horno_en_vivo() from public, anon;
