-- El inventario deja de convertir los moldes de 24 en moldes de 48 (2/2).
--
-- La mitad anterior guardo en cada movimiento DE QUE MOLDE salio. Esta lo usa:
-- tres funciones nuevas que llevan los dos moldes por separado y nunca
-- convierten uno en otro.
--
-- ---------------------------------------------------------------------------
-- POR QUE SON FUNCIONES NUEVAS Y NO LAS DE SIEMPRE ARREGLADAS
-- ---------------------------------------------------------------------------
-- Las tres de antes devuelven otra forma (`fn_existencias_por_sabor` trae
-- `cuadros_por_molde` y `moldes_horneados`, que son justo los numeros que
-- mienten), y en Postgres eso solo se cambia con `drop function`. En el
-- entorno desde el que se aplico esto, CUALQUIER `DROP` se queda colgado -- se
-- comprobo creando una funcion de prueba vacia y tratando de tirarla, con
-- `statement_timeout` puesto: ni aplico ni fallo. No es un bloqueo de la base
-- (pg_stat_activity vacio): es la herramienta.
--
-- Asi que se dejaron en pie, marcadas OBSOLETA en su `comment`, y nadie las
-- lee ya. **Quedan por tirar** cuando se pueda ejecutar DROP:
--
--     drop function public.fn_paquetes_del_dia(date);
--     drop function public.fn_horneada_registrar(text,integer,text,text);
--     drop function public.fn_existencias_por_sabor(date);   -- al final:
--         fn_horno_sacar, fn_produccion_avanzar y fn_horneada_registrar
--         todavia le piden `cuadros_libres`, que sigue siendo correcto.
--
-- De paso los nombres nuevos dicen mejor lo que contestan: ya no es "por
-- sabor" sino "por molde", y ya no son solo "paquetes" porque ahi entran las
-- roscas y los panes, que no vienen en paquete.

-- ---------------------------------------------------------------------------
-- 1. Las existencias, con los dos moldes separados
-- ---------------------------------------------------------------------------
-- QUE MOLDE PAGA CADA PAQUETE. Son tres reglas, y el orden importa:
--
--   1. Un paquete de 48 sale SOLO de un molde de 48. No se pega una hojaldra
--      grande con dos moldes de 24. Va primero porque es el unico que no
--      tiene alternativa.
--   2. Los de 6 y 12 salen de los de 48, que es el molde que se corta; y de
--      los de 24 cuando los de 48 se acaban.
--   3. Un paquete de 24 sale de un molde de 24 completo si lo hay, y si no,
--      de medio molde de 48. Va al final: al reves, un encargo de diez Chicas
--      se comeria los moldes de 48 y dejaria parados los de 24 que se
--      hornearon justo para el.
--
-- Son las reglas que dicto la casa, tal cual. Comprobadas contra la base con
-- 13 asserts: 10 moldes de 24 se leen como 10 de 24; con 240 cuadros de 24 y
-- 96 de 48 salen 2 Grandes (no 7), 14 Chicas y 28 Mini; una Chica baja los de
-- 24, una Mini baja los de 48, y con 36 cuadros de 48 ya no se ofrece ninguna
-- Grande.
create or replace function public.fn_existencias_por_molde(p_fecha date default null)
returns table (
  sabor text, imagen_url text, categoria text,
  cuadros_horneados bigint, cuadros_mermados bigint,
  cuadros_vendidos bigint, cuadros_apartados bigint, cuadros_libres bigint,
  horneados_48 bigint, horneados_24 bigint,
  libres_48 bigint, libres_24 bigint
)
language sql stable security invoker
set search_path = public, pg_temp
as $CUERPO$
  with dia as (select coalesce(p_fecha, (now() at time zone 'America/Merida')::date) as d),
  sabores as (
    select distinct p.sabor, c.nombre as categoria
    from productos p join categorias c on c.id = p.categoria_id
    where p.activo and not p.es_extra and c.activa and p.cuadros is not null
  ),
  foto as (
    select p.sabor, min(p.imagen_url) as imagen_url
    from productos p where p.sabor is not null group by p.sabor
  ),
  -- Lo que salio del horno, partido por el molde del que salio. La merma va
  -- en negativo dentro del mismo neto: una hojaldra quemada de un molde de 24
  -- baja los de 24, no los de 48.
  --
  -- Los movimientos sin molde son los apuntados a mano antes de que existiera
  -- la columna. Se cuentan contra los de 48, que es el molde que se corta:
  -- es la suposicion que menos descuadra, y queda dicha aqui.
  hecho as (
    select pr.sabor,
      coalesce(sum(pr.cantidad) filter (where pr.motivo = 'horneado'), 0) as horneados,
      coalesce(-sum(pr.cantidad) filter (where pr.motivo <> 'horneado'), 0) as mermados,
      coalesce(sum(pr.cantidad) filter (where coalesce(pr.cuadros_por_molde,48) = 48), 0) as neto_48,
      coalesce(sum(pr.cantidad) filter (where pr.cuadros_por_molde = 24), 0) as neto_24,
      coalesce(sum(pr.cantidad) filter (where pr.motivo = 'horneado'
                 and coalesce(pr.cuadros_por_molde,48) = 48), 0) as h48,
      coalesce(sum(pr.cantidad) filter (where pr.motivo = 'horneado'
                 and pr.cuadros_por_molde = 24), 0) as h24
    from produccion pr cross join dia
    where pr.fecha = dia.d and pr.sabor is not null
    group by pr.sabor
  ),
  -- Todo lo que se llevo el pan: lo vendido hoy y lo apartado. Lo apartado va
  -- sin filtro de fecha, porque apartado sigue estando aunque se entregue el
  -- sabado: separar es separar desde que se aparta.
  salidas as (
    select p.sabor, coalesce(p.cuadros,0) as paq,
           oi.cantidad * coalesce(p.cuadros,0) as cuadros, true as es_venta
    from orden_items oi
    join productos p on p.id = oi.producto_id
    join ordenes o on o.id = oi.orden_id
    cross join dia
    where o.pagado and coalesce(o.es_demo,false) = false
      and (o.created_at at time zone 'America/Merida')::date = dia.d
      and p.sabor is not null
    union all
    select p.sabor, coalesce(p.cuadros,0), ei.cantidad * coalesce(p.cuadros,0), false
    from encargo_items ei
    join productos p on p.id = ei.producto_id
    join encargos e on e.id = ei.encargo_id
    where e.estado = 'apartado' and p.sabor is not null
  ),
  -- Y repartido en tres cubetas segun DE QUE MOLDE se corta cada paquete.
  consumo as (
    select s.sabor,
      coalesce(sum(s.cuadros) filter (where s.es_venta), 0) as vendidos,
      coalesce(sum(s.cuadros) filter (where not s.es_venta), 0) as apartados,
      coalesce(sum(s.cuadros) filter (where s.paq >= 48), 0) as d48,
      coalesce(sum(s.cuadros) filter (where s.paq = 24), 0) as d24,
      coalesce(sum(s.cuadros) filter (where s.paq > 0 and s.paq < 24), 0) as dch
    from salidas s group by s.sabor
  ),
  -- `greatest(..., 0)` es para que una bolsa ya sobregirada no "preste"
  -- capacidad que no tiene. Las bolsas si pueden quedar en negativo, y eso es
  -- informacion: significa que se vendio pan que no se horneo.
  p1 as (
    select s.sabor,
           coalesce(h.neto_48,0) - coalesce(c.d48,0) as p48,
           coalesce(h.neto_24,0) as p24,
           coalesce(c.dch,0) as dch, coalesce(c.d24,0) as d24
    from sabores s
    left join hecho h on h.sabor = s.sabor
    left join consumo c on c.sabor = s.sabor
  ),
  p2 as (
    select sabor,
           p48 - least(greatest(p48,0), dch) as p48,
           p24 - (dch - least(greatest(p48,0), dch)) as p24,
           d24
    from p1
  ),
  p3 as (
    select sabor,
           p48 - (d24 - least(greatest(p24,0), d24)) as libres_48,
           p24 - least(greatest(p24,0), d24) as libres_24
    from p2
  )
  select
    s.sabor, foto.imagen_url, s.categoria,
    coalesce(hecho.horneados,0)::bigint,
    coalesce(hecho.mermados,0)::bigint,
    coalesce(consumo.vendidos,0)::bigint,
    coalesce(consumo.apartados,0)::bigint,
    (p3.libres_48 + p3.libres_24)::bigint,
    coalesce(hecho.h48,0)::bigint,
    coalesce(hecho.h24,0)::bigint,
    p3.libres_48::bigint,
    p3.libres_24::bigint
  from sabores s
  join p3 on p3.sabor = s.sabor
  left join foto    on foto.sabor = s.sabor
  left join hecho   on hecho.sabor = s.sabor
  left join consumo on consumo.sabor = s.sabor
  order by s.categoria, s.sabor;
$CUERPO$;

-- ---------------------------------------------------------------------------
-- 2. Y cuantos paquetes alcanzan de verdad
-- ---------------------------------------------------------------------------
-- Dos cambios, y el primero es un error que llevaba ahi desde el principio:
--
--   · Un paquete de 48 solo se cuenta contra los moldes de 48. Antes se
--     contaba contra todos los cuadros libres, asi que la caja ofrecia una
--     Grande teniendo solo dos moldes de 24 -- y no hay forma de hacerla.
--   · Los demas se cuentan contra cada bolsa POR SEPARADO y se suman. Con 6
--     cuadros libres de 48 y 6 de 24 no sale un paquete de 12: los cuadros no
--     se pegan entre moldes.
--
-- Y entran los que NO se llevan en cuadros: las roscas, las trenzas, la
-- Hojaldra de Corazon, los pastelitos, el pan. Se hornean para el pedido, asi
-- que no tienen existencia que contar -- `paquetes_posibles` va en NULL, que
-- es "no se lleva inventario", no "quedan cero". Sin esto no se podian meter
-- en un encargo, que es justo para lo que existen.
create or replace function public.fn_catalogo_del_dia(p_fecha date default null)
returns table (
  producto_id uuid, nombre text, sabor text, categoria text,
  cuadros int, piezas int, precio numeric, imagen_url text,
  cuadros_libres bigint, paquetes_posibles bigint, vendidos bigint
)
language sql stable security invoker
set search_path = public, pg_temp
as $CUERPO$
  with dia as (select coalesce(p_fecha, (now() at time zone 'America/Merida')::date) as d),
  ex as (select * from fn_existencias_por_molde(p_fecha)),
  vendido as (
    select oi.producto_id, sum(oi.cantidad) as paquetes
    from orden_items oi
    join ordenes o on o.id = oi.orden_id
    cross join dia
    where o.pagado and coalesce(o.es_demo,false) = false
      and (o.created_at at time zone 'America/Merida')::date = dia.d
    group by oi.producto_id
  )
  select
    p.id, p.nombre, p.sabor, c.nombre, p.cuadros, p.piezas, p.precio, p.imagen_url,
    case when p.cuadros is null then null else coalesce(ex.cuadros_libres, 0) end,
    case
      when p.cuadros is null or p.cuadros <= 0 then null
      when p.cuadros >= 48 then (greatest(0, coalesce(ex.libres_48,0)) / p.cuadros)::bigint
      else (greatest(0, coalesce(ex.libres_48,0)) / p.cuadros
          + greatest(0, coalesce(ex.libres_24,0)) / p.cuadros)::bigint
    end,
    coalesce(vendido.paquetes, 0)::bigint
  from productos p
  join categorias c on c.id = p.categoria_id
  left join ex      on ex.sabor = p.sabor
  left join vendido on vendido.producto_id = p.id
  where p.activo and not p.es_extra and c.activa
  order by c.orden, p.orden, p.nombre;
$CUERPO$;

-- ---------------------------------------------------------------------------
-- 3. Apuntar a mano, diciendo el molde
-- ---------------------------------------------------------------------------
-- `fn_horneada_registrar` no preguntaba de que molde, asi que lo apuntado a
-- mano volvia a ser una bolsa sola. Aqui el molde es OBLIGATORIO, y esa es
-- toda la diferencia.
create or replace function public.fn_horneada_de_molde(
  p_sabor   text,
  p_cuadros integer,
  p_molde   integer,
  p_motivo  text default 'horneado',
  p_nota    text default null
)
returns bigint
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $CUERPO$
declare v_quien text; v_libres bigint;
begin
  if fn_rol_staff() is null then
    raise exception 'Solo el personal puede registrar producción.';
  end if;
  if p_cuadros is null or p_cuadros = 0 then
    raise exception 'La cantidad no puede ser cero.';
  end if;
  if p_motivo not in ('horneado', 'merma', 'ajuste') then
    raise exception 'Motivo desconocido: %', p_motivo;
  end if;
  if p_molde is null or p_molde not in (24, 48) then
    raise exception 'Hay que decir de que molde: 24 o 48 (llegó %).', coalesce(p_molde::text, 'nada');
  end if;

  select e.nombre into v_quien
    from empleados e where e.auth_user_id = auth.uid() and e.activo limit 1;

  insert into produccion (producto_id, sabor, cantidad, motivo, nota, quien, cuadros_por_molde)
  values (
    null, p_sabor,
    -- La merma SIEMPRE resta, aunque se capture en positivo: es el error mas
    -- facil de cometer capturando rapido.
    case when p_motivo = 'horneado' then abs(p_cuadros) else -abs(p_cuadros) end,
    p_motivo, nullif(trim(coalesce(p_nota, '')), ''), v_quien, p_molde
  );

  select case when p_molde = 48 then libres_48 else libres_24 end into v_libres
    from fn_existencias_por_molde(null) where sabor = p_sabor;
  return coalesce(v_libres, 0);
end;
$CUERPO$;

-- ---------------------------------------------------------------------------
-- 4. Permisos
-- ---------------------------------------------------------------------------
-- Un grant no quita nada: SUMA. Postgres le da EXECUTE a PUBLIC por omision en
-- cada funcion nueva, asi que hay que revocar primero.
revoke all on function public.fn_existencias_por_molde(date) from public, anon;
revoke all on function public.fn_catalogo_del_dia(date) from public, anon;
revoke all on function public.fn_horneada_de_molde(text,integer,integer,text,text) from public, anon;
grant execute on function public.fn_existencias_por_molde(date) to authenticated;
grant execute on function public.fn_catalogo_del_dia(date) to authenticated;
grant execute on function public.fn_horneada_de_molde(text,integer,integer,text,text) to authenticated;

comment on function public.fn_existencias_por_molde(date) is
  'Cuadros por sabor, con los moldes de 48 y de 24 llevados por separado. Nunca convierte unos en otros: 10 moldes de 24 son 10 de 24, no 5 de 48.';
comment on function public.fn_catalogo_del_dia(date) is
  'Lo que hoy se puede vender y cuanto alcanza. Un paquete de 48 solo sale de moldes de 48; paquetes_posibles NULL = se hornea al pedido.';
comment on function public.fn_horneada_de_molde(text,integer,integer,text,text) is
  'Apunta cuadros a mano diciendo DE QUE MOLDE salieron. Sustituye a fn_horneada_registrar, que no lo preguntaba.';

-- Las tres de antes quedan marcadas, porque este entorno no puede tirarlas.
comment on function public.fn_existencias_por_sabor(date) is
  'OBSOLETA: sus columnas cuadros_por_molde y moldes_horneados dividen todo entre el molde global, asi que 10 moldes de 24 salen como 5 de 48. Usar fn_existencias_por_molde.';
comment on function public.fn_paquetes_del_dia(date) is
  'OBSOLETA: cuenta un paquete de 48 contra todos los cuadros, asi que ofrece una Grande teniendo dos moldes de 24. Usar fn_catalogo_del_dia.';
comment on function public.fn_horneada_registrar(text,integer,text,text) is
  'OBSOLETA: no dice de que molde salieron los cuadros. Usar fn_horneada_de_molde.';
