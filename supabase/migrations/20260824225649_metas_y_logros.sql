-- Metas: mancuernas por hacer algo que no cuesta producto.
--
-- El programa de lealtad solo premia comprar. Estas metas premian volver a
-- abrir la app, dejar una resena, completar el perfil: cosas que valen
-- mucho para el negocio y cuestan centavos, porque la mancuerna vale $0.10.
--
-- Dos clases, y la diferencia importa:
--
--   'automatica' -- el servidor comprueba el hecho (abrir la app hoy,
--                   tener telefono guardado). Se acredita sola.
--   'evidencia'  -- el cliente manda una captura y GERENCIA aprueba. Sin
--                   ese candado, una resena de 100 mancuernas la cobra
--                   cualquiera subiendo una imagen del rollo.

create table if not exists misiones (
  id           uuid primary key default gen_random_uuid(),
  clave        text unique not null,
  nombre       text not null,
  descripcion  text not null,
  tipo         text not null check (tipo in ('automatica','evidencia')),
  mancuernas   integer not null check (mancuernas > 0),
  -- Cada cuantos dias se puede volver a cobrar. NULL = una sola vez.
  repetir_dias integer check (repetir_dias is null or repetir_dias > 0),
  -- Tope de veces en la vida del cliente. NULL = sin tope.
  limite_total integer check (limite_total is null or limite_total > 0),
  pide_texto   text,
  orden        integer not null default 0,
  activo       boolean not null default true,
  created_at   timestamptz not null default now()
);

create table if not exists misiones_cumplidas (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references clientes(id) on delete cascade,
  mision_id     uuid not null references misiones(id) on delete cascade,
  estado        text not null default 'acreditada'
                check (estado in ('pendiente','acreditada','rechazada')),
  mancuernas    integer not null default 0,
  evidencia_url text,
  nota          text,
  motivo        text,
  revisada_por  uuid references empleados(id),
  revisada_en   timestamptz,
  -- El dia en zona de Merida. Se guarda aparte en vez de calcularlo: una
  -- columna generada no puede usar `at time zone`, y sin el dia no hay
  -- forma de impedir que la meta diaria se cobre dos veces.
  dia           date not null default (now() at time zone 'America/Merida')::date,
  created_at    timestamptz not null default now()
);

-- El candado de "una vez al dia": dos toques seguidos al abrir la app no
-- pueden acreditar dos veces.
create unique index if not exists misiones_una_por_dia
  on misiones_cumplidas (cliente_id, mision_id, dia)
  where estado <> 'rechazada';

create index if not exists misiones_cumplidas_cliente
  on misiones_cumplidas (cliente_id, created_at desc);

create index if not exists misiones_pendientes
  on misiones_cumplidas (estado, created_at) where estado = 'pendiente';

alter table misiones enable row level security;
alter table misiones_cumplidas enable row level security;

drop policy if exists "misiones las ve cualquiera con sesion" on misiones;
create policy "misiones las ve cualquiera con sesion" on misiones
  for select to authenticated using (activo);

drop policy if exists "misiones las edita gerencia" on misiones;
create policy "misiones las edita gerencia" on misiones
  for all to authenticated using (fn_es_jefe()) with check (fn_es_jefe());

drop policy if exists "cumplidas veo las mias" on misiones_cumplidas;
create policy "cumplidas veo las mias" on misiones_cumplidas
  for select to authenticated using (
    fn_es_staff()
    or cliente_id in (select id from clientes where auth_user_id = auth.uid())
  );

-- Nadie escribe aqui a mano: todo pasa por las funciones de abajo, que son
-- las que acreditan mancuernas. Un insert directo daria puntos sin dejar
-- movimiento, y el saldo dejaria de poder reconstruirse.

-- El catalogo de arranque. Barato a proposito: 1 mancuerna = $0.10, asi que
-- abrir la app todos los dias del ano cuesta $36.50 en producto.
insert into misiones (clave, nombre, descripcion, tipo, mancuernas, repetir_dias, limite_total, pide_texto, orden)
values
  ('visita_diaria', 'Pasa a saludar',
   'Abre la app una vez al dia y te llevas 1 mancuerna.',
   'automatica', 1, 1, null, null, 10),

  ('perfil_completo', 'Deja tu telefono',
   'Con tu telefono te encontramos en caja aunque no traigas el celular.',
   'automatica', 25, null, 1, null, 20),

  ('resena_google', 'Cuentanos como te fue',
   'Deja tu resena en Google y manda la captura. Te damos 100 mancuernas ($10).',
   'evidencia', 100, null, 1,
   'Sube la captura de tu resena publicada', 30),

  ('historia_instagram', 'Presume tu shake',
   'Sube una historia con tu shake etiquetando @hojaldraslily y manda la captura.',
   'evidencia', 50, 7, null,
   'Sube la captura de tu historia', 40)
on conflict (clave) do nothing;