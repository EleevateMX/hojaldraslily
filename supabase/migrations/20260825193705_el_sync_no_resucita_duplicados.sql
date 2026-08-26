-- La causa real de los productos duplicados en el kiosko.
--
-- El sync actualiza asi:
--
--   update productos p set ..., activo = (d.precio > 0), ...
--   from _prod d where lower(p.nombre) = lower(d.nombre) and not p.es_extra;
--
-- Empata por NOMBRE, sin limitar a una fila. Cuando hay dos productos con
-- el mismo nombre, les pega a los DOS -- y como pone `activo = precio > 0`,
-- vuelve a PRENDER el duplicado que alguien habia apagado.
--
-- Eso convierte el problema en permanente: apagar el duplicado a mano no
-- sirve de nada, porque el siguiente guardado en Costeos lo revive. Es
-- exactamente lo que la clienta vio como dos tarjetas identicas de
-- "Milo's Chapata Pick", y lo que habria vuelto a pasar con las que apague
-- hace un rato.
--
-- El arreglo: el update toca UNA sola fila por nombre -- la activa, o la
-- mas vieja si ninguna lo esta. Las demas se quedan como esten.
do $mig$
declare
  d text := pg_get_functiondef('fn_sync_app_data()'::regprocedure);
  ancla text := 'from _prod d where lower(p.nombre)=lower(d.nombre) and not p.es_extra;';
  veces int;
begin
  veces := (length(d) - length(replace(d, ancla, ''))) / length(ancla);
  if veces <> 1 then
    raise exception 'El ancla del update de productos aparece % veces, no 1', veces;
  end if;

  d := replace(d, ancla,
    'from _prod d where lower(p.nombre)=lower(d.nombre) and not p.es_extra
    -- Una sola fila por nombre: la activa, o la mas vieja si ninguna lo
    -- esta. Sin esto, el update prende de nuevo los duplicados apagados.
    and p.id = (select q.id from productos q
                 where lower(q.nombre) = lower(d.nombre) and not q.es_extra
                 order by q.activo desc, q.created_at asc
                 limit 1);');

  execute d;
end
$mig$;

-- Y ahora si, apagar los duplicados sin que nada los reviva.
with ranking as (
  select p.id,
         row_number() over (
           partition by lower(p.nombre)
           order by
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