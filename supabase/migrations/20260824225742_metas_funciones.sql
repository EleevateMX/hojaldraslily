-- Acredita mancuernas por una meta. Interna: nadie la llama de fuera.
--
-- Pasa por `mancuernas_movimientos` como cualquier otro punto, para que el
-- saldo siga siendo reconstruible. Un insert suelto en `clientes.mancuernas`
-- daria el mismo numero y dejaria un hueco en la historia.
create or replace function fn_meta_acreditar(p_cumplida_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_c misiones_cumplidas;
  v_m misiones;
begin
  select * into v_c from misiones_cumplidas where id = p_cumplida_id for update;
  if not found then raise exception 'No existe ese cumplimiento'; end if;
  if v_c.estado = 'acreditada' and v_c.mancuernas > 0 then return 0; end if;

  select * into v_m from misiones where id = v_c.mision_id;

  update clientes set mancuernas = mancuernas + v_m.mancuernas where id = v_c.cliente_id;

  insert into mancuernas_movimientos (cliente_id, puntos, tipo, descripcion)
  values (v_c.cliente_id, v_m.mancuernas, 'promo', 'Meta: ' || v_m.nombre);

  update misiones_cumplidas
     set estado = 'acreditada', mancuernas = v_m.mancuernas
   where id = p_cumplida_id;

  return v_m.mancuernas;
end;
$$;
revoke execute on function fn_meta_acreditar(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Lo que ve el cliente: el catalogo con SU estado en cada meta.
-- ---------------------------------------------------------------------------
create or replace function fn_mis_metas()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_cliente clientes;
begin
  select * into v_cliente from clientes where auth_user_id = auth.uid();
  if not found then return '[]'::jsonb; end if;

  return (
    select coalesce(jsonb_agg(x order by (x->>'orden')::int), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'clave', m.clave,
        'nombre', m.nombre,
        'descripcion', m.descripcion,
        'tipo', m.tipo,
        'mancuernas', m.mancuernas,
        'pide_texto', m.pide_texto,
        'orden', m.orden,
        'veces', coalesce(u.veces, 0),
        'pendiente', coalesce(u.pendiente, false),
        -- Puede cobrarse ahora mismo?
        'disponible', case
          when coalesce(u.pendiente, false) then false
          when m.limite_total is not null and coalesce(u.veces, 0) >= m.limite_total then false
          when m.repetir_dias is null then coalesce(u.veces, 0) = 0
          else coalesce(u.ultima, date '1900-01-01')
               <= (now() at time zone 'America/Merida')::date - m.repetir_dias
        end,
        'ultima', to_char(u.ultima, 'DD/MM/YYYY')
      ) as x
      from misiones m
      left join lateral (
        select count(*) filter (where c.estado = 'acreditada')::int as veces,
               bool_or(c.estado = 'pendiente') as pendiente,
               max(c.dia) filter (where c.estado = 'acreditada') as ultima
        from misiones_cumplidas c
        where c.mision_id = m.id and c.cliente_id = v_cliente.id
      ) u on true
      where m.activo
    ) t
  );
end;
$$;
grant execute on function fn_mis_metas() to authenticated;

-- ---------------------------------------------------------------------------
-- Las automaticas: el servidor comprueba el hecho, no el cliente lo declara.
-- ---------------------------------------------------------------------------
create or replace function fn_meta_automatica(p_clave text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_cliente clientes;
  v_m       misiones;
  v_veces   int;
  v_ultima  date;
  v_hoy     date := (now() at time zone 'America/Merida')::date;
  v_id      uuid;
  v_dadas   int;
begin
  select * into v_cliente from clientes where auth_user_id = auth.uid();
  if not found then return jsonb_build_object('acreditada', false, 'motivo', 'sin_cliente'); end if;

  select * into v_m from misiones where clave = p_clave and activo and tipo = 'automatica';
  if not found then return jsonb_build_object('acreditada', false, 'motivo', 'no_existe'); end if;

  -- La condicion de cada meta automatica. Se comprueba AQUI, en el
  -- servidor: si el cliente pudiera decir "ya complete mi perfil", la meta
  -- seria un boton de regalarse mancuernas.
  if v_m.clave = 'perfil_completo'
     and coalesce(length(regexp_replace(coalesce(v_cliente.telefono, ''), '\D', '', 'g')), 0) < 10 then
    return jsonb_build_object('acreditada', false, 'motivo', 'falta_telefono');
  end if;

  select count(*) filter (where estado = 'acreditada')::int,
         max(dia) filter (where estado = 'acreditada')
    into v_veces, v_ultima
    from misiones_cumplidas
   where mision_id = v_m.id and cliente_id = v_cliente.id;

  if v_m.limite_total is not null and v_veces >= v_m.limite_total then
    return jsonb_build_object('acreditada', false, 'motivo', 'ya_cumplida');
  end if;
  if v_m.repetir_dias is null and v_veces > 0 then
    return jsonb_build_object('acreditada', false, 'motivo', 'ya_cumplida');
  end if;
  if v_m.repetir_dias is not null
     and coalesce(v_ultima, date '1900-01-01') > v_hoy - v_m.repetir_dias then
    return jsonb_build_object('acreditada', false, 'motivo', 'todavia_no');
  end if;

  begin
    insert into misiones_cumplidas (cliente_id, mision_id, estado, dia)
    values (v_cliente.id, v_m.id, 'pendiente', v_hoy)
    returning id into v_id;
  exception when unique_violation then
    -- El indice unico por dia atrapo un segundo intento del mismo dia:
    -- dos toques rapidos al abrir la app no acreditan dos veces.
    return jsonb_build_object('acreditada', false, 'motivo', 'ya_hoy');
  end;

  v_dadas := fn_meta_acreditar(v_id);

  return jsonb_build_object(
    'acreditada', true,
    'mancuernas', v_dadas,
    'nombre', v_m.nombre
  );
end;
$$;
grant execute on function fn_meta_automatica(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Las de evidencia: el cliente manda la captura, gerencia decide.
-- ---------------------------------------------------------------------------
create or replace function fn_meta_enviar_evidencia(p_clave text, p_url text, p_nota text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_cliente clientes;
  v_m       misiones;
  v_veces   int;
  v_ultima  date;
  v_hoy     date := (now() at time zone 'America/Merida')::date;
  v_id      uuid;
begin
  select * into v_cliente from clientes where auth_user_id = auth.uid();
  if not found then raise exception 'Primero entra a tu cuenta'; end if;

  select * into v_m from misiones where clave = p_clave and activo and tipo = 'evidencia';
  if not found then raise exception 'Esa meta no esta disponible'; end if;

  -- Igual que con la foto: solo se acepta una imagen de nuestro propio
  -- almacenamiento. Una URL cualquiera convertiria el panel de gerencia en
  -- un visor de lo que sea que alguien quiera cargarle.
  if p_url is null or (
       p_url not like 'https://fzkdgqqvfkogmxdgqsxj.supabase.co/storage/v1/object/public/evidencias/%'
   and p_url not like 'https://fzkdgqqvfkogmxdgqsxj.supabase.co/storage/v1/object/public/evidencias/%') then
    raise exception 'La captura tiene que subirse desde la app';
  end if;

  if exists (select 1 from misiones_cumplidas
              where mision_id = v_m.id and cliente_id = v_cliente.id and estado = 'pendiente') then
    raise exception 'Ya tienes una captura esperando revision para esta meta';
  end if;

  select count(*) filter (where estado = 'acreditada')::int,
         max(dia) filter (where estado = 'acreditada')
    into v_veces, v_ultima
    from misiones_cumplidas
   where mision_id = v_m.id and cliente_id = v_cliente.id;

  if v_m.limite_total is not null and v_veces >= v_m.limite_total then
    raise exception 'Esta meta ya la cumpliste';
  end if;
  if v_m.repetir_dias is not null
     and coalesce(v_ultima, date '1900-01-01') > v_hoy - v_m.repetir_dias then
    raise exception 'Todavia no puedes repetir esta meta';
  end if;

  insert into misiones_cumplidas (cliente_id, mision_id, estado, evidencia_url, nota, dia)
  values (v_cliente.id, v_m.id, 'pendiente', p_url, nullif(trim(p_nota), ''), v_hoy)
  returning id into v_id;

  return jsonb_build_object('enviada', true, 'mancuernas', v_m.mancuernas);
end;
$$;
grant execute on function fn_meta_enviar_evidencia(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Gerencia: la bandeja y el veredicto.
-- ---------------------------------------------------------------------------
create or replace function fn_metas_por_revisar()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not coalesce(fn_es_staff(), false) then
    raise exception 'Solo el personal puede ver esto';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'cliente', cl.nombre,
      'codigo', cl.codigo,
      'foto', cl.foto_url,
      'meta', m.nombre,
      'mancuernas', m.mancuernas,
      'evidencia', c.evidencia_url,
      'nota', c.nota,
      'fecha', to_char(c.created_at at time zone 'America/Merida', 'DD/MM/YYYY HH24:MI')
    ) order by c.created_at), '[]'::jsonb)
    from misiones_cumplidas c
    join misiones m on m.id = c.mision_id
    join clientes cl on cl.id = c.cliente_id
    where c.estado = 'pendiente'
  );
end;
$$;
grant execute on function fn_metas_por_revisar() to authenticated;

create or replace function fn_meta_revisar(p_id uuid, p_aprobar boolean, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_c misiones_cumplidas;
  v_dadas int := 0;
begin
  if not coalesce(fn_es_staff(), false) then
    raise exception 'Solo el personal puede revisar metas';
  end if;

  select * into v_c from misiones_cumplidas where id = p_id for update;
  if not found then raise exception 'No existe esa solicitud'; end if;
  if v_c.estado <> 'pendiente' then
    raise exception 'Esa solicitud ya se habia revisado';
  end if;

  if p_aprobar then
    v_dadas := fn_meta_acreditar(p_id);
    update misiones_cumplidas
       set revisada_por = fn_empleado_actual(), revisada_en = now(), motivo = nullif(trim(p_motivo), '')
     where id = p_id;
  else
    update misiones_cumplidas
       set estado = 'rechazada', revisada_por = fn_empleado_actual(),
           revisada_en = now(), motivo = nullif(trim(p_motivo), '')
     where id = p_id;
  end if;

  return jsonb_build_object('aprobada', p_aprobar, 'mancuernas', v_dadas);
end;
$$;
grant execute on function fn_meta_revisar(uuid, boolean, text) to authenticated;

-- El bucket de las capturas. NO es publico de lectura para cualquiera con
-- la URL adivinada: son capturas de perfiles de gente.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidencias', 'evidencias', true, 5242880,
        array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do update
  set public = true, file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic'];

drop policy if exists "evidencias subo la mia" on storage.objects;
create policy "evidencias subo la mia" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'evidencias' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "evidencias lectura" on storage.objects;
create policy "evidencias lectura" on storage.objects
  for select using (bucket_id = 'evidencias');