-- Lealtad: cerrar las escrituras antes de abrir el login de Google.
-- Ver supabase/migrations/lealtad_cierre_escrituras.sql para el detalle.

create or replace function fn_cliente_registrar(
  p_nombre            text,
  p_telefono          text default null,
  p_email             text default null,
  p_notas             text default null,
  p_fecha_nacimiento  date default null,
  p_sabor_favorito    text default null
) returns clientes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tel text := nullif(trim(p_telefono), '');
  v_row clientes;
begin
  if nullif(trim(p_nombre), '') is null then
    raise exception 'El nombre del cliente es obligatorio.';
  end if;

  if v_tel is not null then
    select * into v_row from clientes where telefono = v_tel and activo limit 1;
    if found then
      raise exception 'Ya existe un cliente con el teléfono %: "%".', v_tel, v_row.nombre;
    end if;
  end if;

  insert into clientes (nombre, telefono, email, notas, fecha_nacimiento, sabor_favorito)
  values (
    trim(p_nombre), v_tel, nullif(trim(p_email), ''), nullif(trim(p_notas), ''),
    p_fecha_nacimiento, nullif(trim(p_sabor_favorito), '')
  )
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function fn_cliente_actualizar(
  p_id       uuid,
  p_nombre   text,
  p_telefono text default null,
  p_email    text default null,
  p_notas    text default null
) returns clientes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tel text := nullif(trim(p_telefono), '');
  v_row clientes;
begin
  if nullif(trim(p_nombre), '') is null then
    raise exception 'El nombre del cliente es obligatorio.';
  end if;

  if v_tel is not null and exists (
    select 1 from clientes where telefono = v_tel and activo and id <> p_id
  ) then
    raise exception 'Ya hay otro cliente con el teléfono %.', v_tel;
  end if;

  update clientes
     set nombre   = trim(p_nombre),
         telefono = v_tel,
         email    = nullif(trim(p_email), ''),
         notas    = nullif(trim(p_notas), '')
   where id = p_id
  returning * into v_row;

  if not found then
    raise exception 'El cliente no existe.';
  end if;
  return v_row;
end;
$$;

create or replace function fn_cliente_desactivar(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update clientes set activo = false where id = p_id;
  if not found then
    raise exception 'El cliente no existe.';
  end if;
end;
$$;

create or replace function fn_vincular_cliente_auth(p_nombre text default null)
returns clientes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := nullif(lower(trim(coalesce(auth.jwt() ->> 'email', ''))), '');
  v_nom   text := nullif(trim(p_nombre), '');
  v_row   clientes;
begin
  if v_uid is null then
    raise exception 'Se requiere iniciar sesión.' using errcode = '28000';
  end if;

  select * into v_row from clientes where auth_user_id = v_uid;
  if found then
    return v_row;
  end if;

  if v_email is not null then
    update clientes
       set auth_user_id = v_uid,
           nombre       = coalesce(v_nom, nombre)
     where id = (
       select id from clientes
        where lower(email) = v_email and auth_user_id is null and activo
        order by created_at
        limit 1
     )
    returning * into v_row;
    if found then
      return v_row;
    end if;
  end if;

  insert into clientes (auth_user_id, nombre, email)
  values (v_uid, coalesce(v_nom, v_email, 'Cliente'), v_email)
  returning * into v_row;

  return v_row;
end;
$$;

create unique index if not exists clientes_auth_user_id_uniq
  on clientes (auth_user_id) where auth_user_id is not null;

create or replace function fn_canjear_cupon(
  p_cupon_id uuid,
  p_orden_id uuid default null
) returns cupones
language plpgsql
security definer
set search_path = public
as $$
declare v_row cupones;
begin
  update cupones
     set estado      = 'usado',
         usado_en    = now(),
         orden_id_uso = p_orden_id
   where id = p_cupon_id
     and estado = 'activo'
     and vence_en >= now()
  returning * into v_row;

  if found then
    return v_row;
  end if;

  select * into v_row from cupones where id = p_cupon_id;
  if not found then
    raise exception 'El cupón no existe.';
  elsif v_row.estado <> 'activo' then
    raise exception 'El cupón ya fue usado o está cancelado.';
  else
    raise exception 'El cupón está vencido.';
  end if;
end;
$$;

drop policy if exists upd_clientes on clientes;
drop policy if exists ins_clientes on clientes;
drop policy if exists upd_cupones  on cupones;

revoke insert, update, delete, truncate, references, trigger
  on clientes, cupones, mancuernas_movimientos
  from anon, authenticated;

drop policy if exists sel_clientes   on clientes;
drop policy if exists sel_cupones    on cupones;
drop policy if exists sel_mancuernas on mancuernas_movimientos;

create policy sel_clientes_caja on clientes
  for select to anon using (true);
create policy sel_clientes_propio on clientes
  for select to authenticated using (auth_user_id = auth.uid());

create policy sel_cupones_caja on cupones
  for select to anon using (true);
create policy sel_cupones_propio on cupones
  for select to authenticated using (
    exists (select 1 from clientes c where c.id = cupones.cliente_id and c.auth_user_id = auth.uid())
  );

create policy sel_mancuernas_caja on mancuernas_movimientos
  for select to anon using (true);
create policy sel_mancuernas_propio on mancuernas_movimientos
  for select to authenticated using (
    exists (select 1 from clientes c where c.id = mancuernas_movimientos.cliente_id and c.auth_user_id = auth.uid())
  );

revoke execute on function fn_cliente_registrar(text, text, text, text, date, text)
  from public, anon, authenticated;
revoke execute on function fn_cliente_actualizar(uuid, text, text, text, text)
  from public, anon, authenticated;
revoke execute on function fn_cliente_desactivar(uuid) from public, anon, authenticated;
revoke execute on function fn_vincular_cliente_auth(text) from public, anon, authenticated;
revoke execute on function fn_canjear_cupon(uuid, uuid) from public, anon, authenticated;

grant execute on function fn_cliente_registrar(text, text, text, text, date, text) to anon, authenticated;
grant execute on function fn_cliente_actualizar(uuid, text, text, text, text)      to anon, authenticated;
grant execute on function fn_cliente_desactivar(uuid)                              to anon, authenticated;
grant execute on function fn_canjear_cupon(uuid, uuid)                             to anon, authenticated;

grant execute on function fn_vincular_cliente_auth(text) to authenticated;