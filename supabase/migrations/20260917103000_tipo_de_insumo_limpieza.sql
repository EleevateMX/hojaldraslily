-- Falta un tipo de insumo: limpieza.
--
-- El enum venía del motor original (proteina, shake, alimento, empaque,
-- reventa) y ahí no había nada que no fuera comida o empaque. En la panadería
-- sí: cloro, detergente, cofias, cubrebocas, fibras -- quince renglones del
-- inventario de la casa que no son ni lo uno ni lo otro.
--
-- Va en su propia migración porque Postgres no deja USAR un valor de enum
-- recién agregado dentro de la misma transacción que lo agrega. Es la misma
-- razón por la que 'rappi' tuvo la suya (20260827110000).

alter type public.tipo_insumo add value if not exists 'limpieza';
