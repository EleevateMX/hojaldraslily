-- Endurecimiento menor encontrado al revisar mcp__Supabase__get_advisors
-- como parte de la validación final de esta ronda: 4 funciones sin
-- `SET search_path` fijo (mutable_search_path). Dos de ellas
-- (fn_validar_transicion_estado_pago_orden/estado_transaccion) no son
-- SECURITY DEFINER, así que el riesgo real es bajo, pero fijar el
-- search_path es buena práctica estándar y elimina el ruido del linter.
-- No cambia ningún comportamiento — mismo cuerpo, solo se agrega la
-- cláusula SET.

create or replace function fn_generar_codigo_corto()
returns text
language sql
set search_path = public
as $$
  select upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
$$;

create or replace function fn_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin NEW.updated_at = now(); return NEW; end;
$$;

create or replace function fn_validar_transicion_estado_pago_orden()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_contexto text;
  v_permitido boolean := false;
begin
  if NEW.estado_pago_orden = OLD.estado_pago_orden then
    return NEW;
  end if;

  v_contexto := coalesce(current_setting('app.transition_context', true), '');

  v_permitido := (OLD.estado_pago_orden, NEW.estado_pago_orden) in (
    ('draft', 'pending_payment'),
    ('draft', 'awaiting_counter_payment'),
    ('draft', 'cancelled'),
    ('pending_payment', 'payment_processing'),
    ('pending_payment', 'paid'),
    ('pending_payment', 'cancelled'),
    ('pending_payment', 'expired'),
    ('pending_payment', 'payment_unknown'),
    ('awaiting_counter_payment', 'payment_processing'),
    ('awaiting_counter_payment', 'paid'),
    ('awaiting_counter_payment', 'cancelled'),
    ('awaiting_counter_payment', 'expired'),
    ('payment_processing', 'paid'),
    ('payment_processing', 'cancelled'),
    ('payment_processing', 'payment_unknown'),
    ('payment_processing', 'expired'),
    ('payment_unknown', 'paid'),
    ('payment_unknown', 'cancelled'),
    ('payment_unknown', 'expired'),
    ('paid', 'refunded_partial'),
    ('paid', 'refunded_full'),
    ('refunded_partial', 'refunded_full')
  );

  if not v_permitido and OLD.estado_pago_orden = 'expired' and v_contexto = 'reconciliation'
     and NEW.estado_pago_orden in ('paid', 'payment_unknown', 'cancelled') then
    v_permitido := true;
  end if;

  if not v_permitido then
    raise exception 'Transición de estado de orden no permitida: % -> % (orden %)',
      OLD.estado_pago_orden, NEW.estado_pago_orden, OLD.id;
  end if;

  return NEW;
end;
$$;

create or replace function fn_validar_transicion_estado_transaccion()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_contexto text;
  v_permitido boolean := false;
begin
  if NEW.estado_transaccion = OLD.estado_transaccion then
    return NEW;
  end if;

  v_contexto := coalesce(current_setting('app.transition_context', true), '');

  v_permitido := (OLD.estado_transaccion, NEW.estado_transaccion) in (
    ('created', 'pending'),
    ('created', 'processing'),
    ('created', 'authorized'),
    ('created', 'declined'),
    ('created', 'cancelled'),
    ('pending', 'processing'),
    ('pending', 'authorized'),
    ('pending', 'declined'),
    ('pending', 'cancelled'),
    ('pending', 'expired'),
    ('pending', 'unknown'),
    ('processing', 'authorized'),
    ('processing', 'declined'),
    ('processing', 'cancelled'),
    ('processing', 'unknown'),
    ('processing', 'expired'),
    ('unknown', 'authorized'),
    ('unknown', 'declined'),
    ('unknown', 'expired'),
    ('authorized', 'refunded_partial'),
    ('authorized', 'refunded_full'),
    ('refunded_partial', 'refunded_full')
  );

  if not v_permitido and OLD.estado_transaccion = 'expired' and v_contexto = 'reconciliation'
     and NEW.estado_transaccion in ('authorized', 'declined', 'unknown') then
    v_permitido := true;
  end if;

  if not v_permitido then
    raise exception 'Transición de estado de pago no permitida: % -> % (pago %)',
      OLD.estado_transaccion, NEW.estado_transaccion, OLD.id;
  end if;

  return NEW;
end;
$$;
