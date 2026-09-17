-- Un inventario que alguien pueda llevar de verdad.
--
-- Lo que hay hoy en el motor original (revisado contra la base de producción
-- del otro negocio) son dos funciones: `fn_inventario_entrada`, que recibe
-- mercancía, y `fn_inventario_huecos`, que audita lo que no descuenta. Eso se
-- trae tal cual porque sirve y ya está probado con tienda abierta.
--
-- Pero ahí el inventario tiene 1,631 insumos SIN UN SOLO GRUPO -- todos con
-- `categoria_id` en null -- y no existe ninguna forma de decir "conté y hay
-- ocho sacos". Solo se puede sumar lo que entra y confiar en que las recetas
-- resten bien. Después de 27,783 movimientos, nadie ha podido preguntar
-- "¿cuánto DEBERÍA haber contra cuánto HAY?", porque la pregunta no tiene
-- dónde escribirse. Un inventario que solo suma se despega de la realidad y
-- deja de leerse -- la misma lección del indicador que no puede volver a
-- verde (CLAUDE.md, 4).
--
-- Lo que se agrega aquí, y que allá no existe:
--
--   1. CONTEO FÍSICO. Se escribe lo que se contó, no la diferencia. El
--      sistema calcula el ajuste y lo deja apuntado con su motivo. Pedirle a
--      alguien que calcule "+3 / -2" mientras cuenta sacos es pedirle que
--      haga la resta dos veces y se equivoque una.
--   2. CUÁNDO SE CONTÓ. Un número sin fecha no se puede creer. Contar y
--      encontrar que estaba bien TAMBIÉN es información, así que la fecha se
--      mueve aunque no haya diferencia.
--   3. LISTA DE COMPRA. Lo que está en su mínimo o abajo, agrupado como lo
--      compra el negocio. Es la única pregunta que el inventario contesta
--      antes de que algo se acabe, en vez de después.
--   4. MERMA con motivo, que la tabla `mermas` ya esperaba y nadie llenaba.
--
-- Todo se cuenta en la PRESENTACIÓN (sacos, cubetas, cartones), no en gramos:
-- ver 20260917104000.

-- ------------------------------------------------------------------------
-- Cuándo se contó, y quién.
-- ------------------------------------------------------------------------
alter table public.inventario_stock
  add column if not exists contado_at  timestamptz,
  add column if not exists contado_por text;

comment on column public.inventario_stock.contado_at is
  'Última vez que alguien contó esto físicamente. Null = nunca se ha contado.';

-- ------------------------------------------------------------------------
-- El resumen: lo que ve la pantalla de inventario.
--
-- Va agrupado por el grupo de la hoja del negocio (Materia prima, Limpieza,
-- Bolsas...) porque así está escrito el inventario en papel, y una pantalla
-- que no se parece al papel obliga a traducir.
-- ------------------------------------------------------------------------
create or replace function public.fn_inventario_resumen(p_almacen_id uuid default null)
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
    raise exception 'Solo el personal puede ver el inventario';
  end if;

  select id into v_almacen from almacenes
   where case when p_almacen_id is null then nombre = 'Bodega' else id = p_almacen_id end
   limit 1;
  if v_almacen is null then
    raise exception 'No encuentro el almacen';
  end if;

  with filas as (
    select
      coalesce(ic.nombre, 'Otros')            as grupo,
      i.id, i.nombre, i.unidad, i.presentacion,
      s.stock_actual, s.stock_minimo, s.contado_at, s.contado_por,
      -- Tres estados y no un semáforo de cinco: "se acabó", "ya casi" y
      -- "hay". Más matices no cambian lo que hay que hacer.
      case
        when s.stock_actual <= 0                                   then 'agotado'
        when s.stock_minimo > 0 and s.stock_actual <= s.stock_minimo then 'bajo'
        else 'ok'
      end as estado
    from inventario_stock s
    join insumos i   on i.id = s.insumo_id
    left join insumo_categorias ic on ic.id = i.categoria_id
    where s.almacen_id = v_almacen and i.activo
  )
  select jsonb_build_object(
    'almacen_id', v_almacen,
    'almacen',    (select nombre from almacenes where id = v_almacen),
    'total',      (select count(*) from filas),
    'agotados',   (select count(*) from filas where estado = 'agotado'),
    'bajos',      (select count(*) from filas where estado = 'bajo'),
    'sin_contar', (select count(*) from filas where contado_at is null),
    'contado_al_dia', (select count(*) from filas where contado_at >= now() - interval '7 days'),
    'grupos', (
      select coalesce(jsonb_agg(g order by g->>'grupo'), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'grupo',    grupo,
          'total',    count(*),
          'agotados', count(*) filter (where estado = 'agotado'),
          'bajos',    count(*) filter (where estado = 'bajo'),
          'items', jsonb_agg(jsonb_build_object(
            'insumo_id',    id,
            'nombre',       nombre,
            'unidad',       unidad,
            'presentacion', presentacion,
            'stock',        stock_actual,
            'minimo',       stock_minimo,
            'estado',       estado,
            'contado_at',   contado_at,
            'contado_por',  contado_por
          ) order by nombre)
        ) as g
        from filas group by grupo
      ) x)
  ) into v_res;

  return v_res;
end $$;

comment on function public.fn_inventario_resumen(uuid) is
  'El inventario de un almacen, agrupado como lo tiene escrito el negocio.';

-- ------------------------------------------------------------------------
-- El conteo físico.
--
-- Se manda lo CONTADO, no la diferencia: [{"insumo_id": "...", "contado": 8}]
-- La resta la hace el servidor, que es quien sabe cuánto creía que había.
-- ------------------------------------------------------------------------
create or replace function public.fn_inventario_contar(
  p_lineas     jsonb,
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
  v_ref     uuid := gen_random_uuid();
  v_res     jsonb;
begin
  if not fn_es_staff() then
    raise exception 'Solo el personal puede contar el inventario';
  end if;

  select id into v_almacen from almacenes
   where case when p_almacen_id is null then nombre = 'Bodega' else id = p_almacen_id end
   limit 1;
  if v_almacen is null then
    raise exception 'No encuentro el almacen';
  end if;

  select nombre into v_quien from empleados where auth_user_id = auth.uid() limit 1;

  -- Se agrupa por insumo antes de tocar nada: si alguien manda el mismo
  -- renglón dos veces, gana el último conteo y el upsert no choca consigo
  -- mismo -- el mismo cuidado que ya tenía la entrada de mercancia.
  with crudas as (
    select (l->>'insumo_id')::uuid as insumo_id,
           (l->>'contado')::numeric as contado,
           ord
    from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) with ordinality as t(l, ord)
  ),
  lineas as (
    select distinct on (c.insumo_id) c.insumo_id, greatest(0, c.contado) as contado
    from crudas c
    join insumos i on i.id = c.insumo_id
    where c.contado is not null
    order by c.insumo_id, c.ord desc
  ),
  antes as (
    select l.insumo_id, l.contado,
           coalesce(s.stock_actual, 0) as habia,
           l.contado - coalesce(s.stock_actual, 0) as diferencia
    from lineas l
    left join inventario_stock s
      on s.insumo_id = l.insumo_id and s.almacen_id = v_almacen
  ),
  -- El ajuste queda apuntado como movimiento: el conteo es un hecho del
  -- almacen, no una corrección silenciosa del número.
  mov as (
    insert into inventario_movimientos
      (insumo_id, almacen_id, cantidad, tipo, referencia_id, nota)
    select a.insumo_id, v_almacen, a.diferencia, 'ajuste'::tipo_movimiento, v_ref,
           'Conteo fisico' || coalesce(' - ' || v_quien, '')
    from antes a
    where a.diferencia <> 0
    returning insumo_id
  ),
  -- La fecha de conteo se mueve SIEMPRE, aunque no haya diferencia: contar y
  -- encontrar que estaba bien es justo lo que hace creíble al inventario.
  guardado as (
    insert into inventario_stock
      (almacen_id, insumo_id, stock_actual, contado_at, contado_por)
    select v_almacen, a.insumo_id, a.contado, now(), v_quien from antes a
    on conflict (almacen_id, insumo_id) do update
      set stock_actual = excluded.stock_actual,
          contado_at   = excluded.contado_at,
          contado_por  = excluded.contado_por
    returning insumo_id
  )
  select jsonb_build_object(
    'referencia', v_ref,
    'almacen',    (select nombre from almacenes where id = v_almacen),
    'quien',      v_quien,
    'contados',   count(*),
    'cuadraron',  count(*) filter (where a.diferencia = 0),
    'ajustados',  count(*) filter (where a.diferencia <> 0),
    'diferencias', coalesce(jsonb_agg(jsonb_build_object(
        'insumo',      i.nombre,
        'habia',       a.habia,
        'conte',       a.contado,
        'diferencia',  a.diferencia
      ) order by abs(a.diferencia) desc) filter (where a.diferencia <> 0), '[]'::jsonb)
  ) into v_res
  from antes a join insumos i on i.id = a.insumo_id;

  return coalesce(v_res, jsonb_build_object('contados', 0, 'ajustados', 0,
                                            'diferencias', '[]'::jsonb));
end $$;

comment on function public.fn_inventario_contar(jsonb, uuid) is
  'Conteo fisico: se manda lo contado, el servidor calcula y apunta el ajuste.';

-- ------------------------------------------------------------------------
-- Recibir mercancía. Del motor original, con el destino por omisión movido a
-- Bodega: aquí la harina y la manteca llegan al almacén, no a la barra.
-- ------------------------------------------------------------------------
create or replace function public.fn_inventario_entrada(
  p_lineas           jsonb,
  p_origen           text default 'compra',
  p_almacen_destino  uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_destino uuid;
  v_bodega  uuid;
  v_ref     uuid := gen_random_uuid();
  v_quien   text;
  v_nota    text;
  v_res     jsonb;
begin
  if not fn_es_staff() then
    raise exception 'Solo el personal puede cargar inventario';
  end if;

  if p_origen not in ('bodega', 'compra') then
    raise exception 'Origen desconocido: %', p_origen;
  end if;

  select id into v_destino from almacenes
   where case when p_almacen_destino is null then nombre = 'Bodega'
              else id = p_almacen_destino end
   limit 1;
  if v_destino is null then
    raise exception 'No encuentro el almacen de destino';
  end if;

  if p_origen = 'bodega' then
    select id into v_bodega from almacenes where nombre = 'Bodega' limit 1;
    if v_bodega is null then
      raise exception 'No encuentro la bodega';
    end if;
    if v_bodega = v_destino then
      raise exception 'Un traspaso de la bodega a la bodega no mueve nada';
    end if;
  end if;

  select nombre into v_quien from empleados where auth_user_id = auth.uid() limit 1;

  v_nota := case when p_origen = 'bodega' then 'Traspaso desde bodega'
                 else 'Entrada de mercancia' end
            || coalesce(' - ' || v_quien, '');

  with crudas as (
    select (l->>'insumo_id')::uuid as insumo_id,
           coalesce((l->>'piezas')::numeric, 0) as piezas
    from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) l
  ),
  lineas as (
    select c.insumo_id, sum(c.piezas) as piezas
    from crudas c join insumos i on i.id = c.insumo_id
    group by c.insumo_id having sum(c.piezas) > 0
  ),
  mov_destino as (
    insert into inventario_movimientos
      (insumo_id, almacen_id, cantidad, tipo, referencia_id, nota)
    select l.insumo_id, v_destino, l.piezas,
           (case when p_origen = 'bodega' then 'traspaso' else 'compra' end)::tipo_movimiento,
           v_ref, v_nota
    from lineas l returning insumo_id
  ),
  -- Y sale de la bodega, si de ahí vino. Este es el renglón que en el motor
  -- original había que agregarle: sin él, un traspaso creaba mercancía.
  mov_origen as (
    insert into inventario_movimientos
      (insumo_id, almacen_id, cantidad, tipo, referencia_id, nota)
    select l.insumo_id, v_bodega, -l.piezas, 'traspaso'::tipo_movimiento, v_ref,
           'Traspaso hacia ' || (select nombre from almacenes where id = v_destino)
           || coalesce(' - ' || v_quien, '')
    from lineas l where p_origen = 'bodega' returning insumo_id
  ),
  stock_destino as (
    insert into inventario_stock (almacen_id, insumo_id, stock_actual)
    select v_destino, l.insumo_id, l.piezas from lineas l
    on conflict (almacen_id, insumo_id)
    do update set stock_actual = inventario_stock.stock_actual + excluded.stock_actual
    returning insumo_id
  ),
  stock_origen as (
    insert into inventario_stock (almacen_id, insumo_id, stock_actual)
    select v_bodega, l.insumo_id, -l.piezas from lineas l where p_origen = 'bodega'
    on conflict (almacen_id, insumo_id)
    do update set stock_actual = inventario_stock.stock_actual + excluded.stock_actual
    returning insumo_id
  )
  select jsonb_build_object(
    'referencia', v_ref, 'origen', p_origen, 'quien', v_quien,
    'lineas', count(*), 'piezas', coalesce(sum(l.piezas), 0),
    'detalle', coalesce(jsonb_agg(jsonb_build_object(
        'insumo', i.nombre, 'piezas', l.piezas) order by i.nombre), '[]'::jsonb)
  ) into v_res
  from lineas l join insumos i on i.id = l.insumo_id;

  return coalesce(v_res, jsonb_build_object('lineas', 0, 'piezas', 0,
                                            'detalle', '[]'::jsonb));
end $$;

comment on function public.fn_inventario_entrada(jsonb, text, uuid) is
  'Recibe mercancia (compra) o la trae de bodega. Apunta movimiento y existencia.';
