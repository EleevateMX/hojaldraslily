-- Dos detalles de la tarjeta del cliente:
--
-- 1) "Cliente desde August 2026". `to_char(..., 'TMMonth')` traduce según
--    `lc_time`, que en este servidor es C — así que devolvía inglés en una
--    app que está toda en español. Se resuelve con una tabla de doce
--    nombres en vez de depender de una variable de entorno del servidor.
--
-- 2) Las tarjetas de sellos salían alfabéticas (alimento antes que bebida).
--    Esto es una barra de shakes: la de bebidas va primero.
do $mig$
declare
  d text := pg_get_functiondef('fn_mi_resumen_lealtad()'::regprocedure);
  ancla_mes text := $a$to_char(v_cliente.created_at at time zone 'America/Merida', 'TMMonth YYYY')$a$;
  nuevo_mes text := $a$(array['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'])[extract(month from v_cliente.created_at at time zone 'America/Merida')::int]
      || ' ' || to_char(v_cliente.created_at at time zone 'America/Merida', 'YYYY')$a$;
  ancla_orden text := $a$) order by cs.tipo), '[]'::jsonb)$a$;
  nuevo_orden text := $a$) order by cs.tipo desc), '[]'::jsonb)$a$;
begin
  -- Si el ancla no aparece exactamente una vez, la función ya no es la que
  -- creemos: abortar es mejor que parchear a ciegas.
  if (length(d) - length(replace(d, ancla_mes, ''))) / length(ancla_mes) <> 1 then
    raise exception 'El ancla del mes aparece % veces, no 1',
      (length(d) - length(replace(d, ancla_mes, ''))) / length(ancla_mes);
  end if;
  if (length(d) - length(replace(d, ancla_orden, ''))) / length(ancla_orden) <> 1 then
    raise exception 'El ancla del orden de sellos no aparece exactamente 1 vez';
  end if;

  d := replace(d, ancla_mes, nuevo_mes);
  d := replace(d, ancla_orden, nuevo_orden);
  execute d;
end
$mig$;