-- Las piezas sueltas, y los paquetes que dicen de cuantas son.
--
-- El caso que lo pidio: alguien encarga 17 pastelitos. Eso son 3 paquetes de 5
-- y 2 piezas. Hasta hoy la caja solo sabia sumar paquetes, asi que esos 17 se
-- cobraban como 20 (4 paquetes) o como 15 y tres regalados. Pasa poco, pero
-- pasa, y casi siempre en encargos.
--
-- Y el hermano del mismo problema: el Pan de Leche se vende de DOS en DOS y el
-- renglon decia "Pan de leche" a secas. Quien lo compraba no sabia que llevaba
-- dos, quien lo horneaba no sabia cuantos hacer y el conteo no cuadraba con
-- la nota.

-- ---------------------------------------------------------------------------
-- Cuantas piezas trae el renglon
-- ---------------------------------------------------------------------------
-- Es el hermano de `cuadros` para lo que no se corta de un molde. Dos razones
-- para que sea una columna y no se lea del nombre:
--
--   · El nombre es texto que alguien escribe. "5 pzas", "5 pz", "5 piezas":
--     el dia que se escriba distinto, la cuenta se rompe en silencio.
--   · La pantalla necesita saber si este renglon se mide en cuadros o en
--     piezas para no escribir "— cuadros" debajo de un pastelito.
--
-- NULL significa "esto no se cuenta por piezas" (una hojaldra se cuenta en
-- cuadros, un cafe no se cuenta). No es cero: cero seria un paquete vacio.
alter table public.productos add column if not exists piezas int;

alter table public.productos drop constraint if exists productos_piezas_positivas;
alter table public.productos add constraint productos_piezas_positivas
  check (piezas is null or piezas > 0);

comment on column public.productos.piezas is
  'Cuantas piezas trae este renglon: 5 el paquete de pastelitos, 1 la pieza suelta, 2 el Pan de Leche. NULL = no se cuenta por piezas.';

-- ---------------------------------------------------------------------------
-- Los paquetes que ya existian
-- ---------------------------------------------------------------------------
update public.productos set piezas = 5
 where nombre in ('Pastelitos de Jamón y Queso · 5 pzas', 'Pastelitos de Lomo · 5 pzas');

-- Las bolitas no decian de cuantas venia el paquete. Cuestan $110, lo mismo
-- que los pastelitos de jamon y queso de 5, asi que el paquete es de 5 y la
-- pieza $22.
update public.productos
   set nombre = 'Bolitas de Queso Philadelphia · 5 pzas', piezas = 5
 where nombre = 'Bolitas de Queso Philadelphia';

-- El Pan de Leche: dos piezas, y que se lea. El precio no cambia ($60 el
-- paquete, o sea $30 la pieza); lo que cambia es que ahora lo dice.
--
-- Esto ya llega a Rappi solo: `precios_canal` cuelga del id del producto, no
-- del nombre, asi que su precio de plataforma ($75) sigue en su lugar.
update public.productos
   set nombre = 'Pan de leche · 2 pzas', piezas = 2
 where nombre = 'Pan de leche';

-- Y la que nacio pieza en el catalogo de octubre
update public.productos set piezas = 1 where codigo = 'PE-PQ-01';

-- ---------------------------------------------------------------------------
-- Las piezas sueltas
-- ---------------------------------------------------------------------------
-- Una por cada paquete, al precio del paquete entre sus piezas: exacto, sin
-- redondeo, porque 5 x la pieza tiene que dar el paquete. Si no diera, cobrar
-- cinco piezas saldria distinto a cobrar un paquete y la caja tendria dos
-- precios para lo mismo.
with cat as (select id from public.categorias where nombre = 'Bocadillos')
insert into public.productos
  (nombre, codigo, categoria_id, precio, iva_incluido, activo, orden, piezas)
select v.nombre, v.codigo, cat.id, v.precio, true, true, v.orden, 1
from cat, (values
  ('Pastelitos de Jamón y Queso · 1 pza',    'BO-PJQ-01', 22, 13),
  ('Pastelitos de Lomo · 1 pza',             'BO-PLO-01', 28, 14),
  ('Bolitas de Queso Philadelphia · 1 pza',  'BO-BQP-01', 22, 15)
) as v(nombre, codigo, precio, orden)
on conflict (lower(nombre)) where (activo and not es_extra) do nothing;

-- ---------------------------------------------------------------------------
-- Las piezas sueltas no van en Rappi
-- ---------------------------------------------------------------------------
-- Es una herramienta de mostrador para cuadrar un encargo impar, no un
-- producto de plataforma. Y la fila tiene que existir: sin ella se venderia
-- al precio de MOSTRADOR en Rappi, o sea sin comision.
insert into public.precios_canal (producto_id, canal, precio, disponible)
select p.id, 'rappi'::canal_orden, 0, false
from public.productos p
where p.codigo in ('BO-PJQ-01','BO-PLO-01','BO-BQP-01')
on conflict (producto_id, canal) do update
  set disponible = false, precio = 0;
