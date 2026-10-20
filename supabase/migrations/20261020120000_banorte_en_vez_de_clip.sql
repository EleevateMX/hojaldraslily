-- Banorte en vez de Clip.
--
-- La casa lo decidió el 20/10/26: la terminal es la de Banorte (Interredes
-- Remotas, vía TPV Solutions) y Clip no entra. Tres cosas en la base:
--
-- 1. Se apaga el cron `clip-barrer-pendientes`. Corría cada dos minutos
--    contra una Edge Function que nunca se desplegó (404) y antes de eso
--    contra una extensión que no existía (~40,000 fallos callados). Sin
--    terminal Clip no hay cobros pendientes que barrer. Si un día vuelve
--    Clip, se vuelve a programar con `20260826070000` como modelo.
--
-- 2. `pagos.proveedor_payload`: la respuesta cruda de la terminal, tal cual
--    llegó. Hay `clip_payload`, pero guardar una respuesta de Banorte en una
--    columna que se llama Clip es la clase de cosa que a los seis meses nadie
--    entiende. Se guarda CRUDA y antes de interpretarla: si la lectura del
--    resultado tuviera un error, el dato original sigue ahí para cuadrar
--    con el banco (y el voucher se imprime de aquí).
--
-- 3. `terminal_intentos`: cada vez que la caja manda un cobro a la pinpad
--    queda un renglón ANTES de llamar, con la clave de idempotencia y el
--    número de control que va a la API. Es lo que hace que un doble toque
--    no cobre dos veces (el segundo encuentra el intento y lo devuelve) y
--    lo que deja huella si la Edge Function muere a media llamada: un
--    intento en `procesando` sin `pago_id` es «la terminal pudo haber
--    cobrado y la venta no está registrada», y se cuadra contra la API por
--    su número de control. Con Clip esto vivía en `pagos` con estado
--    `pendiente`, y ahí estorbaba: la idempotencia de `fn_cobrar_orden`
--    encontraba ese renglón y devolvía un pago sin confirmar la venta.
select cron.unschedule('clip-barrer-pendientes');

alter table public.pagos add column if not exists proveedor_payload jsonb;

comment on column public.pagos.proveedor_payload is
  'Respuesta cruda del proveedor de la terminal (Banorte/Interredes), tal cual llegó. Fuente del voucher.';

create table if not exists public.terminal_intentos (
  idempotency_key uuid primary key,
  orden_id        uuid references public.ordenes(id),
  encargo_id      uuid references public.encargos(id),
  empleado_id     uuid references public.empleados(id),
  control_number  text not null unique,
  monto           numeric not null check (monto > 0),
  -- procesando → aprobado | rechazado | sin_respuesta | anulado | error
  estado          text not null default 'procesando',
  resultado       jsonb,
  pago_id         uuid references public.pagos(id),
  detalle         text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.terminal_intentos is
  'Un renglón por cobro mandado a la pinpad de Banorte, escrito antes de llamar. Idempotencia y rastro.';

alter table public.terminal_intentos enable row level security;

-- Solo lo escribe la Edge Function (service_role se salta RLS). El personal
-- con sesión lo puede leer, para Diagnóstico.
create policy terminal_intentos_leer_staff on public.terminal_intentos
  for select to authenticated using (public.fn_es_staff());

create index if not exists terminal_intentos_orden_idx on public.terminal_intentos (orden_id);
create index if not exists terminal_intentos_estado_idx on public.terminal_intentos (estado) where estado = 'procesando';
