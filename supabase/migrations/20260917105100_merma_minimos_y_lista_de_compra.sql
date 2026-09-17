-- Merma, minimos y lista de compra: el resto del inventario que se lleva.
--
-- Continua 20260917105000, que trajo el conteo fisico y la entrada de
-- mercancia. Aqui va lo que cierra el ciclo: apuntar lo que se tira, decir de
-- cuanto para abajo hay que volver a comprar, y la lista que sale de esos dos
-- numeros. Mas la auditoria del motor original, adaptada.

-- ------------------------------------------------------------------------
-- La merma, con su motivo.
--
-- La tabla `mermas` existe desde el motor original y allá tiene cero filas en
-- producción: nunca hubo por dónde llenarla. Se tira comida todos los días;
-- si no se apunta, la diferencia aparece en el siguiente conteo como un
-- faltante sin explicación y el conteo pierde credibilidad.
-- ------------------------------------------------------------------------
create or replace function public.fn_inventario_merma(
  p_insumo_id  uuid,
  p_cantidad   numeric,
  p_motivo     text default null,
  p_almacen_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_almacen uuid;
  v_quien   text;
  v_nombre  text;
begin
  if not fn_es_staff() then
    raise exception 'Solo el personal puede registrar merma';
  end if;

  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La merma tiene que ser mayor que cero';
  end if;

  select nombre into v_nombre from insumos where id = p_insumo_id;
  if v_nombre is null then
    raise exception 'No encuentro ese insumo';
  end if;

  select id into v_almacen from almacenes
   where case when p_almacen_id is null then nombre = 'Bodega' else id = p_almacen_id end
   limit 1;
  if v_almacen is null then
    raise exception 'No encuentro el almacen';
  end if;

  select nombre into v_quien from empleados where auth_user_id = auth.uid() limit 1;

  insert into mermas (insumo_id, almacen_id, cantidad, motivo)
  values (p_insumo_id, v_almacen, p_cantidad,
          coalesce(nullif(trim(p_motivo), ''), 'Sin motivo')
          || coalesce(' - ' || v_quien, ''));

  insert into inventario_movimientos
    (insumo_id, almacen_id, cantidad, tipo, nota)
  values (p_insumo_id, v_almacen, -p_cantidad, 'merma'::tipo_movimiento,
          coalesce(nullif(trim(p_motivo), ''), 'Merma')
          || coalesce(' - ' || v_quien, ''));

  insert into inventario_stock (almacen_id, insumo_id, stock_actual)
  values (v_almacen, p_insumo_id, -p_cantidad)
  on conflict (almacen_id, insumo_id)
  do update set stock_actual = inventario_stock.stock_actual - p_cantidad;

  return jsonb_build_object('insumo', v_nombre, 'cantidad', p_cantidad, 'quien', v_quien);
end $$;

comment on function public.fn_inventario_merma(uuid, numeric, text, uuid) is
  'Apunta merma: la tabla mermas, el movimiento y la existencia, de una vez.';

-- ------------------------------------------------------------------------
-- El mínimo de cada cosa: de cuánto para abajo hay que volver a comprar.
-- ------------------------------------------------------------------------
create or replace function public.fn_inventario_minimo(
  p_insumo_id  uuid,
  p_minimo     numeric,
  p_almacen_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_almacen uuid;
begin
  if not fn_es_staff() then
    raise exception 'Solo el personal puede mover los minimos';
  end if;

  select id into v_almacen from almacenes
   where case when p_almacen_id is null then nombre = 'Bodega' else id = p_almacen_id end
   limit 1;
  if v_almacen is null then
    raise exception 'No encuentro el almacen';
  end if;

  insert into inventario_stock (almacen_id, insumo_id, stock_actual, stock_minimo)
  values (v_almacen, p_insumo_id, 0, greatest(0, coalesce(p_minimo, 0)))
  on conflict (almacen_id, insumo_id)
  do update set stock_minimo = greatest(0, coalesce(p_minimo, 0));
end $$;

-- ------------------------------------------------------------------------
-- La lista de compra.
--
-- Lo único que el inventario puede contestar ANTES de que algo se acabe.
-- Agrupada como se compra, y con cuánto falta para llegar al mínimo, que es
-- el número que se anota en el pedido al proveedor.
-- ------------------------------------------------------------------------
create or replace function public.fn_inventario_lista_de_compra(p_almacen_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_almacen uuid;
  v_res     jsonb;
begin
  if not fn_es_staff() then
    raise exception 'Solo el personal puede ver la lista de compra';
  end if;

  select id into v_almacen from almacenes
   where case when p_almacen_id is null then nombre = 'Bodega' else id = p_almacen_id end
   limit 1;
  if v_almacen is null then
    raise exception 'No encuentro el almacen';
  end if;

  with faltantes as (
    select coalesce(ic.nombre, 'Otros') as grupo,
           i.id, i.nombre, i.unidad, i.presentacion, i.proveedor,
           s.stock_actual, s.stock_minimo,
           greatest(0, s.stock_minimo - s.stock_actual) as faltan,
           (s.stock_actual <= 0) as agotado
    from inventario_stock s
    join insumos i on i.id = s.insumo_id
    left join insumo_categorias ic on ic.id = i.categoria_id
    where s.almacen_id = v_almacen and i.activo
      and s.stock_minimo > 0 and s.stock_actual <= s.stock_minimo
  )
  select jsonb_build_object(
    'almacen',  (select nombre from almacenes where id = v_almacen),
    'items',    (select count(*) from faltantes),
    'agotados', (select count(*) from faltantes where agotado),
    'grupos', (
      select coalesce(jsonb_agg(g order by g->>'grupo'), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'grupo', grupo,
          'items', jsonb_agg(jsonb_build_object(
            'insumo_id',    id,
            'nombre',       nombre,
            'presentacion', presentacion,
            'unidad',       unidad,
            'proveedor',    proveedor,
            'hay',          stock_actual,
            'minimo',       stock_minimo,
            'faltan',       faltan,
            'agotado',      agotado
          ) order by agotado desc, nombre)
        ) as g
        from faltantes group by grupo
      ) x)
  ) into v_res;

  return v_res;
end $$;

comment on function public.fn_inventario_lista_de_compra(uuid) is
  'Lo que esta en su minimo o abajo, con cuanto falta. Agrupado como se compra.';

-- ------------------------------------------------------------------------
-- Los huecos: qué se vende sin descontar nada. Del motor original.
--
-- Se le quitaron las partes que allá miraban scoops y botes de proteína, y se
-- le dejó lo que aquí aplica. Lleva ventana de tiempo a propósito: un
-- indicador que no puede volver a verde deja de leerse (CLAUDE.md, 4).
-- ------------------------------------------------------------------------
create or replace function public.fn_inventario_huecos(p_dias integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_desde timestamptz := now() - make_interval(days => greatest(1, coalesce(p_dias, 30)));
  v_res   jsonb;
begin
  if not fn_es_jefe() then
    raise exception 'Solo gerencia puede ver los huecos de inventario';
  end if;

  select jsonb_build_object(
    'desde', v_desde,
    'dias',  greatest(1, coalesce(p_dias, 30)),

    'sin_receta', (
      select coalesce(jsonb_agg(x order by x.piezas desc), '[]'::jsonb) from (
        select p.id, p.nombre, coalesce(c.nombre, 'sin categoria') as categoria,
               p.precio, sum(oi.cantidad) as piezas
        from orden_items oi
        join ordenes o   on o.id = oi.orden_id
        join productos p on p.id = oi.producto_id
        left join categorias c on c.id = p.categoria_id
        where o.pagado and not o.es_demo and o.created_at >= v_desde
          and not p.es_extra
          and not exists (select 1 from recetas r where r.producto_id = p.id)
        group by p.id, p.nombre, c.nombre, p.precio
        limit 60
      ) x),

    'resumen', (
      select jsonb_build_object(
        'piezas_sin_descontar', coalesce(sum(oi.cantidad) filter (
          where not exists (select 1 from recetas r where r.producto_id = oi.producto_id)), 0),
        'piezas_totales', coalesce(sum(oi.cantidad), 0))
      from orden_items oi join ordenes o on o.id = oi.orden_id
      where o.pagado and not o.es_demo and o.created_at >= v_desde),

    'nunca_contados', (
      select count(*) from inventario_stock s
      join insumos i on i.id = s.insumo_id
      where i.activo and s.contado_at is null),

    'conteo_viejo', (
      select count(*) from inventario_stock s
      join insumos i on i.id = s.insumo_id
      where i.activo and s.contado_at < now() - interval '30 days'),

    'sin_minimo', (
      select count(*) from inventario_stock s
      join insumos i on i.id = s.insumo_id
      where i.activo and s.stock_minimo <= 0),

    'catalogo', (
      select jsonb_build_object(
        'insumos', count(*),
        'sin_producto_que_los_use', count(*) filter (
          where not exists (select 1 from recetas r where r.insumo_id = i.id)),
        'sin_un_solo_movimiento', count(*) filter (
          where not exists (select 1 from inventario_movimientos m where m.insumo_id = i.id)))
      from insumos i where i.activo)
  ) into v_res;

  return v_res;
end $$;

comment on function public.fn_inventario_huecos(integer) is
  'Audita el inventario: que se vende sin descontar, que nunca se ha contado.';

-- ------------------------------------------------------------------------
-- Permisos. Todas son DEFINER y cada una revisa por dentro quien la llama:
-- el GRANT abre la puerta, la funcion pide la credencial.
-- ------------------------------------------------------------------------
grant execute on function public.fn_inventario_resumen(uuid)          to authenticated;
grant execute on function public.fn_inventario_contar(jsonb, uuid)    to authenticated;
grant execute on function public.fn_inventario_entrada(jsonb, text, uuid) to authenticated;
grant execute on function public.fn_inventario_merma(uuid, numeric, text, uuid) to authenticated;
grant execute on function public.fn_inventario_minimo(uuid, numeric, uuid) to authenticated;
grant execute on function public.fn_inventario_lista_de_compra(uuid)  to authenticated;
grant execute on function public.fn_inventario_huecos(integer)        to authenticated;
