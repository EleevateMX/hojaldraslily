-- Que no puedan existir dos productos activos con el mismo nombre.
--
-- Es lo que vio la clienta: dos tarjetas identicas de "Milo's Chapata
-- Pick" una junto a la otra en el kiosko. El sync ya intentaba evitarlo
-- (`where not exists ... lower(nombre)`), pero eso es una ESPERANZA, no
-- una garantia: basta que dos guardados se crucen, o que un renombre pase
-- por un estado intermedio, para que las dos filas queden creadas. Y una
-- vez creadas nada las vuelve a juntar.
--
-- Ojo con lo que NO cuenta como duplicado, y por eso el indice va acotado:
--   · el gemelo EXTRA (hay un "Espresso" vendible y un "Espresso" extra;
--     son cosas distintas y el sync los distingue con `not es_extra`),
--   · el scoop y el bote de una misma proteina, que COMPARTEN clave pero
--     tienen nombres distintos ("Scoop X" y "X"),
--   · los productos apagados, que son historia y deben poder repetirse.

-- 1. Limpiar lo que ya esta duplicado. Ninguno tiene ventas -- se
--    comprobo antes de tocar nada -- asi que se apaga el sobrante. Apagar
--    y no borrar: si alguno resulta ser el bueno, se vuelve a prender.
with ranking as (
  select p.id, lower(p.nombre) as n,
         row_number() over (
           partition by lower(p.nombre)
           order by
             -- Gana el que mas cosas cuelgan de el; en empate, el mas viejo.
             (select count(*) from recetas r where r.producto_id = p.id) +
             (select count(*) from producto_extras pe where pe.producto_id = p.id) +
             (select count(*) from combo_items ci where ci.combo_id = p.id) desc,
             p.created_at asc
         ) as puesto
  from productos p
  where p.activo and not p.es_extra
)
update productos p set activo = false
from ranking r
where p.id = r.id and r.puesto > 1
  and not exists (select 1 from orden_items oi where oi.producto_id = p.id);

-- 2. Y que ya no pueda repetirse.
create unique index if not exists productos_un_nombre_activo
  on productos (lower(nombre))
  where activo and not es_extra;

-- 3. El sync deja de poder crear el duplicado.
--
--    Sin esto, el indice haria FALLAR el guardado entero de Costeos, y
--    dejar a la tienda sin poder guardar es peor que el duplicado que se
--    intenta evitar. Con `do nothing`, la fila de mas simplemente no se
--    crea y el guardado sigue.
do $mig$
declare
  d text := pg_get_functiondef('fn_sync_app_data()'::regprocedure);
  ancla text := 'from _prod d where not exists (select 1 from productos p where lower(p.nombre)=lower(d.nombre) and not p.es_extra);';
  veces int;
begin
  veces := (length(d) - length(replace(d, ancla, ''))) / length(ancla);
  if veces <> 1 then
    raise exception 'El ancla del insert de productos aparece % veces, no 1', veces;
  end if;

  d := replace(d, ancla,
    'from _prod d where not exists (select 1 from productos p where lower(p.nombre)=lower(d.nombre) and not p.es_extra)
  on conflict (lower(nombre)) where (activo and not es_extra) do nothing;');

  execute d;
end
$mig$;

comment on index productos_un_nombre_activo is
  'Dos productos activos no pueden llamarse igual: eso salia como dos '
  'tarjetas identicas en el kiosko. No aplica a los extras (hay un '
  '"Espresso" vendible y otro extra) ni a los apagados (son historia).';