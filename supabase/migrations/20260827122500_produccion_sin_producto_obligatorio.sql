-- Lo que sale del horno tiene SABOR, no producto.
--
-- Registro de una migración aplicada a la base que se había quedado sin
-- archivo en el repo (CLAUDE.md §6). Idempotente: se puede volver a correr.
--
-- `produccion.producto_id` venía NOT NULL del motor original, donde todo lo
-- que se producía era un producto del catálogo. Aquí no: se hornea **por
-- sabor**, en moldes, y el tamaño del paquete se decide en el mostrador
-- (CLAUDE.md §2.0). El trigger que sube la producción no tiene un producto que
-- poner, y el NOT NULL lo hacía fallar.
--
-- Así que el obligatorio se mueve al campo que sí siempre existe: `sabor`.

alter table public.produccion alter column producto_id drop not null;
alter table public.produccion alter column sabor      set  not null;

comment on column public.produccion.producto_id is
  'Opcional: solo cuando lo horneado corresponde a un producto puntual del catálogo.';
comment on column public.produccion.sabor is
  'El sabor horneado. Es lo obligatorio: se hornea por sabor, no por paquete.';
