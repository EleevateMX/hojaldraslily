-- ============================================================================
-- Los extras que llegaron con el motor se ajustan al giro de Hojaldras Lily
-- ============================================================================
-- Al replicar el sistema vinieron los extras semilla del negocio original, que
-- era una barra de proteinas. Los de proteina en polvo (`Doble scoop - MARCA`)
-- no tienen lugar en una panaderia: si se quedan encendidos, el kiosko ofrece
-- "Doble scoop - BIRDMAN FALCON" junto a una hojaldra de guayaba.
--
-- Se apagan, no se borran: `producto_extras` los referencia y borrarlos
-- romperia el historial. Apagados no aparecen en el kiosko ni en la caja.
--
-- Lo que SI se queda porque le sirve a Lily: las leches (van con el cafe),
-- los cafes, las galletas, el agua y las recargas de monedero.
--
-- Nota: los extras estan fuera del sync de Costeos desde
-- `sync_costeos_no_pisa_extras`, asi que este apagado es permanente y no lo
-- revierte el siguiente guardado del tablero de costos.
update productos
   set activo = false
 where activo
   and (nombre ilike 'Doble scoop%');

-- Que quede constancia de cuantos se apagaron, para el registro de la corrida.
do $$
declare n int;
begin
  select count(*) into n from productos where nombre ilike 'Doble scoop%' and not activo;
  raise notice 'Extras de proteina apagados: %', n;
end $$;
