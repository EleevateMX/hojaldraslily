-- Rappi como método de pago
--
-- Un pedido de Rappi se registra para que descuente inventario y dispare la
-- producción, pero el dinero NO está en el cajón: a la tienda le paga la
-- plataforma días después, no el repartidor. Con un método propio `rappi`, el
-- corte lo cuenta por separado y el efectivo esperado lo sigue ignorando —así
-- el cajón cuadra sin tener que mentir sobre cómo se pagó.
--
-- Va en su propia migración (sin usar el valor aquí) porque Postgres no deja
-- USAR un valor de enum recién agregado en la misma transacción que lo agrega;
-- la vista del corte que lo usa va en la migración siguiente.

alter type metodo_pago add value if not exists 'rappi';
