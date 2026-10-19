-- «Diez jamón y queso y cinco fiestas antes de las 12.»
--
-- Eso es lo que la casa pidió, y era lo que no se podía decir: una orden de
-- producción traía QUÉ y CUÁNTO, pero no PARA CUÁNDO. La mesa la recibía sin
-- forma de saber si era para la hora de la salida de la escuela o para las
-- cinco de la tarde, y el único orden posible era el de captura — o sea el
-- orden en que gerencia se acordó de las cosas.
--
-- Se guarda como **texto libre**, igual que `encargos.hora_entrega`, y se lee
-- con la misma tolerancia (`minutosDeHora`): llega «12:00», «12», «12 pm» y
-- lo que no se entiende se va al final en vez de inventarle una hora.
--
-- `null` es «sin hora», **no medianoche**. Una orden sin hora no es una orden
-- urgentísima: es una que no la lleva.
--
-- Va en una función aparte y no como parámetro de
-- `fn_produccion_mandar_a_hacer` por dos razones. La primera es la trampa del
-- repo: cambiarle la firma a una función **no la reemplaza, la duplica**
-- (§4), y aquí no se puede hacer `drop function` porque el MCP de Supabase no
-- ejecuta DROP. La segunda es que de todos modos hacía falta: gerencia mueve
-- la hora de una orden **ya mandada** («mejor pásalo a las 11»), y eso no
-- cabe en la función que la crea.

alter table public.ordenes_produccion
  add column if not exists hora_objetivo text;

comment on column public.ordenes_produccion.hora_objetivo is
  'A que hora tiene que estar lista esta orden. Texto libre, leido con '
  'tolerancia por `minutosDeHora` igual que `encargos.hora_entrega`: nulo '
  'significa "sin hora", no medianoche.';

create or replace function public.fn_produccion_fijar_hora(
  p_orden_id uuid,
  p_hora text
) returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_estado text; v_hora text;
begin
  if fn_rol_staff() is null then
    raise exception 'Solo el personal puede cambiar la hora de una orden.';
  end if;

  select estado into v_estado from ordenes_produccion where id = p_orden_id for update;
  if v_estado is null then
    raise exception 'Esa orden de produccion no existe.';
  end if;
  if v_estado = 'cancelada' then
    raise exception 'Esa orden esta cancelada.';
  end if;

  -- Vacio borra la hora y la deja en null. Null es «sin hora», que NO es lo
  -- mismo que medianoche: a un dato que no esta dicho no se le inventa uno.
  v_hora := nullif(trim(coalesce(p_hora, '')), '');

  update ordenes_produccion
     set hora_objetivo = v_hora, updated_at = now()
   where id = p_orden_id;

  return v_hora;
end;
$function$;

comment on function public.fn_produccion_fijar_hora(uuid, text) is
  'Pone (o quita) la hora a la que esa orden tiene que estar lista. Va aparte '
  'de fn_produccion_mandar_a_hacer porque cambiarle la firma la duplicaria, y '
  'porque gerencia tambien mueve la hora de una orden ya mandada.';

revoke all on function public.fn_produccion_fijar_hora(uuid, text) from public;
revoke all on function public.fn_produccion_fijar_hora(uuid, text) from anon;
grant execute on function public.fn_produccion_fijar_hora(uuid, text) to authenticated;
