-- Kenny pidió dos formas de cobro más (27/10/26): transferencia bancaria y una
-- segunda terminal, "Inbursa". Van como valores nuevos del enum para que el
-- corte las cuadre POR SEPARADO (no mezcladas en 'tarjeta' ni en 'otro').
-- Agregar valores al enum va en su propia migración: Postgres no deja usar un
-- valor de enum en la misma transacción en que se crea.
alter type public.metodo_pago add value if not exists 'transferencia';
alter type public.metodo_pago add value if not exists 'inbursa';
