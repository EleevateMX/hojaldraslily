-- ─────────────────────────────────────────────────────────────────────────
-- TARJETAS FÍSICAS de regalo
-- ─────────────────────────────────────────────────────────────────────────
--
-- La tarjeta es el VEHÍCULO de la venta, no el monedero. Al canjearla, sus
-- mancuernas pasan a la cuenta del cliente y la tarjeta queda muerta.
--
-- Se hizo así, y no con "saldo que vive en el plástico", porque:
--   · Si la pierde después de canjearla, no pierde nada.
--   · Todo el saldo vive en un solo lugar (la cuenta), y no hay dos
--     verdades que puedan desincronizarse.
--   · El saldo se sigue viendo en la app aunque la tarjeta se tire.
--
-- El código NO es secuencial: con lotes numerados, quien compra una tarjeta
-- podría adivinar las de al lado.
create table if not exists tarjetas_regalo (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  mancuernas integer not null check (mancuernas > 0),
  -- 'nueva' (impresa, sin vender) | 'canjeada' | 'anulada'
  estado text not null default 'nueva' check (estado in ('nueva','canjeada','anulada')),
  lote text,
  canjeada_por uuid references clientes(id),
  canjeada_en timestamptz,
  creada_por uuid references empleados(id),
  created_at timestamptz not null default now()
);
create index if not exists ix_tarjetas_estado on tarjetas_regalo (estado, lote);

alter table tarjetas_regalo enable row level security;
-- Nadie las lee directo: se canjean por función. Así no se puede barrer la
-- tabla buscando códigos sin usar.
create policy tarjetas_staff on tarjetas_regalo for select to authenticated
  using (coalesce(fn_es_jefe(), false));

-- Generar un lote para mandar a imprimir.
create or replace function public.fn_generar_tarjetas(
  p_cantidad integer,
  p_mancuernas integer,
  p_lote text default null
)
returns setof tarjetas_regalo
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_lote text := coalesce(nullif(trim(p_lote), ''), to_char(now() at time zone 'America/Merida', 'YYYYMMDD-HH24MI'));
  v_codigo text;
  i integer;
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede generar tarjetas';
  end if;
  if p_cantidad is null or p_cantidad < 1 or p_cantidad > 500 then
    raise exception 'Genera entre 1 y 500 tarjetas por lote';
  end if;
  if p_mancuernas is null or p_mancuernas < 1 then
    raise exception 'Di cuántas mancuernas trae cada tarjeta';
  end if;

  for i in 1..p_cantidad loop
    loop
      -- Sin caracteres que se confundan al teclear (0/O, 1/I/L).
      v_codigo := 'SHKG-' || (
        select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789',
                                 (floor(random() * 31) + 1)::int, 1), '')
        from generate_series(1, 8)
      );
      exit when not exists (select 1 from tarjetas_regalo t where t.codigo = v_codigo);
    end loop;

    return query
    insert into tarjetas_regalo (codigo, mancuernas, lote, creada_por)
    values (v_codigo, p_mancuernas, v_lote, fn_empleado_actual())
    returning *;
  end loop;
end;
$fn$;

-- Canjear una tarjeta a la cuenta del cliente.
create or replace function public.fn_canjear_tarjeta(
  p_codigo text,
  p_cliente_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_tarjeta tarjetas_regalo;
  v_cliente clientes;
  v_saldo integer;
begin
  -- Bloqueo desde el principio: dos personas escaneando la misma tarjeta al
  -- mismo tiempo no pueden cargarla dos veces.
  select * into v_tarjeta from tarjetas_regalo
  where upper(trim(codigo)) = upper(trim(p_codigo)) for update;

  if not found then raise exception 'Esa tarjeta no existe'; end if;
  if v_tarjeta.estado = 'canjeada' then
    raise exception 'Esa tarjeta ya se usó (el %)',
      to_char(v_tarjeta.canjeada_en at time zone 'America/Merida', 'DD/MM/YYYY');
  end if;
  if v_tarjeta.estado = 'anulada' then raise exception 'Esa tarjeta está anulada'; end if;

  -- El cliente: el que se indique (caja) o el de la sesión (su app).
  if p_cliente_id is not null then
    if not coalesce(fn_es_staff(), false) then
      raise exception 'Solo el personal puede cargar la tarjeta a otra cuenta';
    end if;
    select * into v_cliente from clientes where id = p_cliente_id;
  else
    select * into v_cliente from clientes where auth_user_id = auth.uid();
  end if;

  if not found or v_cliente.id is null then
    raise exception 'Primero identifica al cliente';
  end if;

  update tarjetas_regalo
  set estado = 'canjeada', canjeada_por = v_cliente.id, canjeada_en = now()
  where id = v_tarjeta.id;

  update clientes set saldo_mancuernas = saldo_mancuernas + v_tarjeta.mancuernas
  where id = v_cliente.id
  returning saldo_mancuernas into v_saldo;

  insert into saldo_movimientos (cliente_id, mancuernas, tipo, descripcion, empleado_id, saldo_despues)
  values (v_cliente.id, v_tarjeta.mancuernas, 'tarjeta',
          'Tarjeta ' || v_tarjeta.codigo, fn_empleado_actual(), v_saldo);

  return jsonb_build_object(
    'cargadas', v_tarjeta.mancuernas,
    'cliente', v_cliente.nombre,
    'saldo_nuevo', v_saldo,
    'vale_pesos', round(v_saldo::numeric / fn_tasa_mancuernas(), 2)
  );
end;
$fn$;

revoke all on function public.fn_generar_tarjetas(integer, integer, text) from public;
revoke all on function public.fn_canjear_tarjeta(text, uuid) from public;
grant execute on function public.fn_generar_tarjetas(integer, integer, text) to authenticated, service_role;
grant execute on function public.fn_canjear_tarjeta(text, uuid) to authenticated, service_role;