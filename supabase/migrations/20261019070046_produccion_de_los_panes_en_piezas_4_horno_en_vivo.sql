-- (Parte de «Mandar a hacer TODOS los panes». El por qué completo está en
--  20261019070006_produccion_de_los_panes_en_piezas_1_columna.sql; se aplicó
--  en cinco pasos porque el MCP de Supabase no traga bloques grandes de una
--  sola vez, y el registro de la base guarda uno por paso.)

-- ---------------------------------------------------------------------------
-- 4. El horno, con las dos unidades
-- ---------------------------------------------------------------------------
-- `cuadros` y `molde` salen en **null** para los renglones de pieza, y cada
-- entrada dice su `unidad`. Así la pantalla escribe «3 piezas» y no «3 moldes
-- de 48», que es el mismo defecto que ya había tenido el Horno diciendo
-- «3 moldes de 48 · 3 moldes» (§4).

create or replace function public.fn_horno_en_vivo()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
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
  fotos as (
    select p.sabor, min(p.imagen_url) as imagen_url
      from productos p where p.imagen_url is not null group by p.sabor
  ),
  -- Lo que se cuenta en piezas guarda el NOMBRE del producto en `sabor`, no un
  -- sabor de hojaldra, asi que su foto se busca por nombre. Sin esto, la mesa
  -- y el horno veian las roscas sin foto — el mismo defecto que ya habia
  -- dejado a Produccion sin pintar una sola imagen (§4).
  fotos_nombre as (
    select p.nombre, min(p.imagen_url) as imagen_url
      from productos p where p.imagen_url is not null group by p.nombre
  ),
  minutos_nombre as (
    select p.nombre, min(p.minutos_horneado) as min
      from productos p where p.minutos_horneado is not null group by p.nombre
  ),
  renglones as (
    select i.id, i.sabor, i.cuadros_por_molde, i.moldes, i.unidad,
           i.moldes_armados, i.moldes_en_horno, i.cantidad_hecha,
           i.horno_entro_en,
           o.folio, o.created_at,
           coalesce(f.imagen_url, fn2.imagen_url) as imagen_url,
           coalesce(m.min, mn.min, v_def) as minutos,
           i.horno_entro_en + make_interval(mins => coalesce(m.min, mn.min, v_def)) as listo_en,
           (i.moldes_armados - i.cantidad_hecha - i.moldes_en_horno) as esperando
      from orden_produccion_items i
      join ordenes_produccion o on o.id = i.orden_id
      left join minutos m on m.sabor = i.sabor
      left join fotos f on f.sabor = i.sabor
      left join fotos_nombre fn2 on fn2.nombre = i.sabor
      left join minutos_nombre mn on mn.nombre = i.sabor
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
        'unidad',     unidad,
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
        'unidad',     unidad,
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
        'molde',      cuadros_por_molde,
        'unidad',     unidad
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
end $function$;
