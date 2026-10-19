-- Un encargo del sábado no se come el pan del martes.
--
-- Lo reportó la casa: «cuando hay un stock de otro día lo descuenta del stock
-- de hoy, debería descontarlo desde el viernes».
--
-- Las tres funciones de existencias contaban **todo** lo apartado contra el
-- día que se les preguntaba, sin mirar la fecha de entrega. El comentario que
-- estaba escrito en `fn_existencias_por_molde` decía por qué: «apartado sigue
-- estando aunque se entregue el sábado: separar es separar desde que se
-- aparta». Suena razonable y es falso para esta panadería, por una razón que
-- no estaba en el código: **aquí el pan se hornea cada día y se vende del
-- día**. El pan del sábado todavía no existe el martes, así que apartarlo
-- contra el martes descuenta de una charola que no es la suya: el mostrador
-- lee menos pan del que tiene y deja de ofrecer lo que sí puede vender —y el
-- pan que «se reservó» el martes estaría duro el sábado de todos modos.
--
-- La regla, entonces: un encargo pesa sobre el día en que se entrega.
--
--     fecha_entrega <= el día que se pregunta   -> cuenta
--     fecha_entrega > el día que se pregunta    -> todavía no
--     fecha_entrega nula                        -> cuenta hoy
--
-- El `<=` y no el `=` es deliberado: un encargo que se pasó de su día **sigue
-- físicamente apartado** en la mesa de empaque, así que sigue descontando
-- hasta que se cobre o se cancele. Desaparecerlo del conteo el día siguiente
-- sería decir que ese pan está libre cuando está en una bolsa con el nombre
-- de alguien.
--
-- Y la nula cuenta hoy porque «paso más tarde» es hoy. Es lo mismo que hace
-- la cola de encargos, que manda al final los que no traen fecha.
--
-- Las tres tienen la misma firma, así que esto REEMPLAZA y no duplica (§4).
-- Van las tres juntas a propósito: si solo se arregla una, Admin diría una
-- cosa y la caja otra del mismo pan.

-- ---------------------------------------------------------------------------
-- 1. Por molde (Admin → Producción, y la base del catálogo del día)
-- ---------------------------------------------------------------------------

create or replace function public.fn_existencias_por_molde(p_fecha date default null)
returns table(sabor text, imagen_url text, categoria text, cuadros_horneados bigint,
              cuadros_mermados bigint, cuadros_vendidos bigint, cuadros_apartados bigint,
              cuadros_libres bigint, horneados_48 bigint, horneados_24 bigint,
              libres_48 bigint, libres_24 bigint)
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
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
  -- Todo lo que se llevo el pan: lo vendido ese dia y lo apartado PARA ese
  -- dia. Lo que se entrega despues no pesa aqui: su pan todavia no se hornea.
  -- Lo que se paso de su dia sigue pesando, porque sigue en una bolsa con el
  -- nombre de alguien.
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
    cross join dia
    where e.estado = 'apartado' and p.sabor is not null
      and (e.fecha_entrega is null or e.fecha_entrega <= dia.d)
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
$function$;

comment on function public.fn_existencias_por_molde(date) is
  'Cuadros por sabor y por molde del dia que se pide. Lo apartado cuenta solo '
  'si se entrega ese dia o antes: un encargo del sabado no se come el pan del '
  'martes, porque el pan del sabado todavia no se hornea.';
