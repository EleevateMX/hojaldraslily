-- Los chips del kiosko salen por `orden`: las familias de bebida van juntas,
-- pegadas a Shakes, en el orden que dicto la sucursal. Lo demas se recorre.
update categorias set orden = case nombre
  when 'Shakes'           then 1
  when 'Collagen Drinks'  then 2
  when 'Amino Refreshers' then 3
  when 'Hydration Drinks' then 4
  when 'Café'             then 5
  when 'Tés'              then 6
  when 'Kombuchas'        then 7
  when 'Alimentos'        then 10
  when 'Bebidas'          then 11
  when 'Snacks'           then 12
  when 'Combos'           then 13
  when 'Suplementos'      then 14
  when 'Scoops'           then 15
  else orden
end
where nombre in ('Shakes','Collagen Drinks','Amino Refreshers','Hydration Drinks',
                 'Café','Tés','Kombuchas','Alimentos','Bebidas','Snacks',
                 'Combos','Suplementos','Scoops');