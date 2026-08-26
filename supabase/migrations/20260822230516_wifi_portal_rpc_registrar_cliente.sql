-- Portal WiFi Hojaldras Lily
-- Registro de invitado desde el portal cautivo + emision del cupon de bienvenida.
-- Se ejecuta SOLO server-side (service_role). La anon key nunca toca esta funcion.

create index if not exists idx_clientes_email_lower
  on public.clientes (lower(email)) where email is not null;

create or replace function public.registrar_cliente_wifi(
  p_nombre    text,
  p_apellido  text,
  p_email     text,
  p_dias_vig  integer default 30,
  p_beneficio text default '10% de descuento en tu proxima compra'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email     text;
  v_nombre    text;
  v_cliente   public.clientes%rowtype;
  v_cupon     public.cupones%rowtype;
  v_es_nuevo  boolean := false;
  v_cupon_new boolean := false;
begin
  v_email := lower(btrim(coalesce(p_email, '')));
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then
    return jsonb_build_object('ok', false, 'error', 'email_invalido');
  end if;

  v_nombre := btrim(regexp_replace(
    btrim(coalesce(p_nombre,'')) || ' ' || btrim(coalesce(p_apellido,'')), '\s+', ' ', 'g'));
  if length(v_nombre) < 2 then
    return jsonb_build_object('ok', false, 'error', 'nombre_invalido');
  end if;

  -- Dedupe por email (no hay unique en la columna, se resuelve aqui)
  select * into v_cliente from public.clientes
   where lower(email) = v_email
   order by created_at asc limit 1;

  if not found then
    insert into public.clientes (nombre, email, notas)
    values (v_nombre, v_email, 'Alta desde portal WiFi Hojaldras Lily')
    returning * into v_cliente;
    v_es_nuevo := true;
  end if;

  -- Un solo cupon de bienvenida vigente por cliente
  select * into v_cupon from public.cupones
   where cliente_id = v_cliente.id
     and tipo = 'bienvenida'
     and estado = 'activo'
     and vence_en > now()
   order by generado_en desc limit 1;

  if not found then
    -- Solo se emite si nunca ha tenido uno (no se re-regala al volver)
    if not exists (select 1 from public.cupones
                    where cliente_id = v_cliente.id and tipo = 'bienvenida') then
      insert into public.cupones (cliente_id, tipo, beneficio, vence_en)
      values (v_cliente.id, 'bienvenida', p_beneficio, now() + (p_dias_vig || ' days')::interval)
      returning * into v_cupon;
      v_cupon_new := true;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'es_nuevo', v_es_nuevo,
    'cliente', jsonb_build_object(
      'id', v_cliente.id,
      'nombre', v_cliente.nombre,
      'codigo', v_cliente.codigo,
      'mancuernas', v_cliente.mancuernas),
    'cupon', case when v_cupon.id is null then null else jsonb_build_object(
      'codigo', v_cupon.codigo,
      'beneficio', v_cupon.beneficio,
      'vence_en', v_cupon.vence_en,
      'recien_emitido', v_cupon_new) end
  );
end;
$$;

revoke all on function public.registrar_cliente_wifi(text,text,text,integer,text) from public, anon, authenticated;
grant execute on function public.registrar_cliente_wifi(text,text,text,integer,text) to service_role;

notify pgrst, 'reload schema';