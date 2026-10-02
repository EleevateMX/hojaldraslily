-- El inventario deja de convertir los moldes de 24 en moldes de 48 (1/2).
--
-- Lo que reporto la casa: se mandan a hacer 10 hojaldras de 24 cuadros, y el
-- inventario no dice "10 de 24" sino "5 de 48". No es un error de redondeo: es
-- que el inventario solo guardaba CUADROS, y el molde con el que se dividian
-- era `parametros.cuadros_por_molde` -- UN numero global, 48 para toda la
-- casa. 240 cuadros entre 48 son 5. La cuenta estaba bien; la pregunta estaba
-- mal.
--
-- El dato que faltaba ya existia a un paso: cada renglon de produccion guarda
-- su `cuadros_por_molde` desde que hay moldes de 24. Lo que no se guardaba era
-- en el MOVIMIENTO, que es lo que el inventario lee. Al apuntarlo, los cuadros
-- dejan de ser una bolsa sola y pasan a ser dos.
--
-- Esta mitad guarda el dato. La otra (20261002121000) lo usa.

alter table public.produccion add column if not exists cuadros_por_molde int;

alter table public.produccion drop constraint if exists produccion_molde_valido;
alter table public.produccion add constraint produccion_molde_valido
  check (cuadros_por_molde is null or cuadros_por_molde in (24, 48));

comment on column public.produccion.cuadros_por_molde is
  'De que molde salieron estos cuadros: 48 o 24. NULL = no se sabe (lo apuntado a mano antes de que existiera la columna); el calculo lo cuenta contra los de 48, que es el molde que se corta.';

-- Lo que vino de una orden si sabe su molde: se copia del renglon.
update public.produccion pr
   set cuadros_por_molde = i.cuadros_por_molde
  from public.orden_produccion_items i
 where i.id = pr.orden_produccion_item_id
   and pr.cuadros_por_molde is null;

-- Lo apuntado a mano se queda en NULL a proposito. Ponerle 48 "porque era el
-- global" seria inventarle un dato a un movimiento viejo; NULL dice la verdad,
-- que es que no se sabe, y el calculo ya sabe que hacer con eso.

-- ---------------------------------------------------------------------------
-- El trigger lo apunta
-- ---------------------------------------------------------------------------
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

  insert into produccion (producto_id, sabor, cantidad, motivo, nota, quien,
                          orden_produccion_item_id, cuadros_por_molde)
  values (
    null,
    new.sabor,
    v_delta * new.cuadros_por_molde,
    case when v_delta > 0 then 'horneado' else 'ajuste' end,
    'Orden de producción · molde de ' || new.cuadros_por_molde,
    coalesce(new.terminado_por, 'Producción'),
    new.id,
    -- Antes esto solo iba en la nota, o sea en texto que nadie puede sumar.
    new.cuadros_por_molde
  );
  return new;
end;
$function$;
