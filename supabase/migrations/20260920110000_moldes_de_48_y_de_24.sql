-- El molde deja de ser uno solo: hay de 48 y de 24.
--
-- Hasta hoy `parametros.cuadros_por_molde` era UN número global (48) y el
-- trigger que sube el inventario lo leía de ahí. Eso obligaba a que toda la
-- panadería horneara en el mismo molde, y no es así: hay moldes de 48 y de 24,
-- y se elige al mandar a hacer según lo que se vaya a vender.
--
-- El tamaño del molde pasa al RENGLÓN de la orden. Dos razones:
--
--   1. Una misma orden puede llevar «2 moldes de 48 de guayaba» y «1 de 24 de
--      jamón». Con un número global eso no se puede escribir.
--   2. El renglón guarda **con qué molde se horneó**, no con cuál se hornea
--      hoy. Si mañana cambian el molde de uso diario, las tandas viejas
--      siguen valiendo lo que valieron — y el inventario histórico no se
--      recalcula solo por cambiar un parámetro.
--
-- `parametros.cuadros_por_molde` se queda, pero pasa a ser **el que viene
-- propuesto** en la pantalla, no la verdad del cálculo.

alter table public.orden_produccion_items
  add column if not exists cuadros_por_molde int;

-- Las tandas que ya existen se hornearon con el molde global de entonces.
update public.orden_produccion_items i
   set cuadros_por_molde = (select coalesce(min(p.cuadros_por_molde), 48) from public.parametros p)
 where i.cuadros_por_molde is null;

alter table public.orden_produccion_items
  alter column cuadros_por_molde set not null;

-- Solo los dos moldes que existen de verdad. Si mañana aparece uno de 12, se
-- agrega aquí a propósito: mejor que la base rechace un número inventado a
-- que el inventario suba una cantidad que nadie horneó.
alter table public.orden_produccion_items
  drop constraint if exists orden_produccion_items_molde_valido;
alter table public.orden_produccion_items
  add constraint orden_produccion_items_molde_valido
  check (cuadros_por_molde in (24, 48));

comment on column public.orden_produccion_items.cuadros_por_molde is
  'Con qué molde se hornea ESTE renglón: 48 o 24. No se lee de parametros: ahí vive solo el que se propone por omisión.';

comment on column public.parametros.cuadros_por_molde is
  'El molde que la pantalla propone por omisión al mandar a hacer. El cálculo usa el del renglón.';

-- ------------------------------------------------------------------------
-- El trigger suma según el molde DEL RENGLÓN.
--
-- Este es el arreglo de fondo: antes leía el global, así que un molde de 24
-- habría entrado al inventario como 48 -- el doble de pan del que salió del
-- horno, y sin que nada lo delatara hasta el conteo.
-- ------------------------------------------------------------------------
create or replace function public.fn_produccion_desde_orden()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_delta int;
begin
  -- `cantidad_hecha` cuenta los moldes que YA SALIERON DEL HORNO. Ese es el
  -- momento en que hay pan de verdad, y por eso es el que mueve inventario.
  v_delta := coalesce(new.cantidad_hecha, 0) - coalesce(old.cantidad_hecha, 0);
  if v_delta = 0 or new.sabor is null then
    return new;
  end if;

  insert into produccion (producto_id, sabor, cantidad, motivo, nota, quien, orden_produccion_item_id)
  values (
    null,
    new.sabor,
    v_delta * new.cuadros_por_molde,
    case when v_delta > 0 then 'horneado' else 'ajuste' end,
    'Orden de producción · molde de ' || new.cuadros_por_molde,
    coalesce(new.terminado_por, 'Producción'),
    new.id
  );
  return new;
end;
$function$;
