-- El horno tiene que ver el pan, no leer su nombre.
--
-- `fn_horno_en_vivo` devolvía el sabor en texto y nada más, así que la
-- pantalla llamaba a `urlDeFoto(null, ...)` y nunca salía una sola imagen.
-- Quien está frente al horno con las manos ocupadas reconoce la guayaba de un
-- vistazo; leer «Pasta de Guayaba y Queso de Bola» a dos metros, no.
--
-- La foto se toma del producto de ese sabor: es la misma que ya se ve en el
-- kiosko y en la caja, así que el pan se ve igual en todas las pantallas.
-- `min(...)` porque los cuatro tamaños de un sabor comparten la foto.

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
  -- La foto del sabor. Va aparte y no dentro de `minutos` porque no todo
  -- sabor tiene tiempo de horneado propio, y un join de más ahí escondía
  -- renglones.
  fotos as (
    select p.sabor, min(p.imagen_url) as imagen_url
      from productos p where p.imagen_url is not null group by p.sabor
  ),
  renglones as (
    select i.id, i.sabor, i.cuadros_por_molde, i.moldes,
           i.moldes_armados, i.moldes_en_horno, i.cantidad_hecha,
           i.horno_entro_en,
           o.folio, o.created_at,
           f.imagen_url,
           coalesce(m.min, v_def) as minutos,
           i.horno_entro_en + make_interval(mins => coalesce(m.min, v_def)) as listo_en,
           (i.moldes_armados - i.cantidad_hecha - i.moldes_en_horno) as esperando
      from orden_produccion_items i
      join ordenes_produccion o on o.id = i.orden_id
      left join minutos m on m.sabor = i.sabor
      left join fotos f on f.sabor = i.sabor
     where o.estado <> 'cancelada'
       and o.fecha >= (now() at time zone 'America/Merida')::date - 1
  )
  select jsonb_build_object(
    'ahora', now(),
    'adentro', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'item_id',    id,
        'folio',      folio,
        'sabor',      sabor,
        'imagen_url', imagen_url,
        'moldes',     moldes_en_horno,
        'molde',      cuadros_por_molde,
        'cuadros',    moldes_en_horno * cuadros_por_molde,
        'entro_en',   horno_entro_en,
        'listo_en',   listo_en,
        'minutos',    minutos,
        'tarde',      listo_en < now()
      ) order by listo_en), '[]'::jsonb)
      from renglones where moldes_en_horno > 0),
    'esperando', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'item_id',    id,
        'folio',      folio,
        'sabor',      sabor,
        'imagen_url', imagen_url,
        'moldes',     esperando,
        'molde',      cuadros_por_molde,
        'cuadros',    esperando * cuadros_por_molde,
        'minutos',    minutos
      ) order by created_at), '[]'::jsonb)
      from renglones where esperando > 0),
    'sin_armar', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'item_id',    id,
        'folio',      folio,
        'sabor',      sabor,
        'imagen_url', imagen_url,
        'moldes',     coalesce(moldes,0) - moldes_armados,
        'molde',      cuadros_por_molde
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

-- `create or replace` conserva los permisos, pero se vuelven a declarar por
-- si algún día esto se aplica sobre una base donde la función no existía.
revoke all on function public.fn_horno_en_vivo() from public, anon;
grant execute on function public.fn_horno_en_vivo() to authenticated;
