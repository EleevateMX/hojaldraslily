-- ============================================================================
-- Se borran las versiones viejas de las funciones que crean ordenes
-- ============================================================================
-- Agregar un parametro a una funcion NO la reemplaza: crea otra. Al sumarle
-- `p_nombre_cliente` a fn_crear_orden y a fn_crear_orden_kiosko_caja quedaron
-- conviviendo las versiones anteriores, y esas son de ANTES de que el precio
-- se calculara con fn_precio_linea.
--
-- O sea que quien llamara a la version vieja creaba una orden SIN sobreprecios:
-- cambiar de proteina (+$10), doble scoop ($25 a $49), la leche del americano
-- (+$10) y la galleta del paquete (+$10) salian gratis. Y estaban abiertas a
-- cualquiera con la llave publica.
--
-- Hoy el frontend siempre manda `p_nombre_cliente`, asi que PostgREST resolvia
-- a la version buena y nadie lo noto. Pero bastaba una pestana con el bundle
-- viejo en cache —o una llamada directa a la API— para cobrar de menos.
--
-- Se conservan unicamente las versiones vigentes, las que cobran con
-- fn_precio_linea y guardan el nombre del pedido. Un cliente con cache vieja
-- ahora recibe un error claro en vez de una orden mal cobrada, que es
-- justamente lo que se quiere: fallar fuerte antes que cobrar mal.
drop function if exists public.fn_crear_orden(uuid,uuid,canal_orden,jsonb,uuid,uuid,uuid,numeric,boolean);
drop function if exists public.fn_crear_orden(uuid,uuid,canal_orden,jsonb,uuid,uuid,uuid,numeric);
drop function if exists public.fn_crear_orden_kiosko_caja(uuid,uuid,jsonb,uuid,numeric);

do $$
declare n int;
begin
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
  where ns.nspname='public' and p.proname in ('fn_crear_orden','fn_crear_orden_kiosko_caja');
  if n <> 2 then
    raise exception 'Deberian quedar 2 funciones de creacion de orden y quedaron %.', n;
  end if;
  -- Y las dos que quedan tienen que cobrar el sobreprecio.
  if exists (
    select 1 from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
    where ns.nspname='public' and p.proname in ('fn_crear_orden','fn_crear_orden_kiosko_caja')
      and position('fn_precio_linea' in pg_get_functiondef(p.oid)) = 0
  ) then
    raise exception 'Quedo una funcion de orden que no cobra el sobreprecio.';
  end if;
end $$;