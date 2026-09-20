-- Dos cosas chicas que el otro sistema ya tenía y aquí faltaban.
--
-- ## 1. Mandar una prueba de impresión desde Admin
--
-- `fn_imprimir_prueba` ya existía, pero pide el **token del agente**, que solo
-- está en la PC de la tienda. O sea que para comprobar si una impresora
-- responde había que ir a la tienda, abrir la terminal y correr un comando.
-- Gerencia, desde su teléfono, no podía.
--
-- Ahora puede: misma etiqueta, pedida por id de impresora y autorizada por ser
-- personal. **El agente no se toca**: el payload es el mismo `prueba: true` que
-- ya sabe dibujar desde su versión 1.0. (El motor original hizo esto con un
-- payload nuevo `diagnostico: true`, y le quedó un `raise exception` avisando
-- que el agente de la tienda era viejo y no sabía imprimirlo. Reusar el
-- payload que ya existe evita esa conversación entera.)
--
-- Lo que esta prueba contesta: si la etiqueta sale, la cadena completa sirve
-- —base, cola, agente, red e impresora—. Si no sale pero el trabajo queda
-- marcado como impreso, el problema es físico (papel, tapa, sensor), que es la
-- trampa de CLAUDE.md §2.4.

create or replace function public.fn_imprimir_prueba_staff(p_impresora_id uuid)
returns trabajos_impresion
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_impresora impresoras;
  v_trabajo trabajos_impresion;
begin
  if fn_rol_staff() is null then
    raise exception 'Solo el personal puede mandar una prueba de impresión.';
  end if;

  select * into v_impresora from impresoras where id = p_impresora_id and activa;
  if not found then
    raise exception 'Esa impresora no existe o está apagada.';
  end if;

  -- El MISMO payload que `fn_imprimir_prueba`: el agente ya lo sabe dibujar.
  insert into trabajos_impresion (printer_id, tipo_documento, payload, idempotency_key)
  values (v_impresora.id, 'comanda', jsonb_build_object(
    'prueba', true, 'impresora', v_impresora.nombre, 'hora', now()
  ), gen_random_uuid())
  returning * into v_trabajo;

  return v_trabajo;
end $$;

comment on function public.fn_imprimir_prueba_staff(uuid) is
  'Encola una etiqueta de prueba en una impresora, desde Admin. Si sale papel, la cadena completa sirve.';

revoke all on function public.fn_imprimir_prueba_staff(uuid) from public, anon;
grant execute on function public.fn_imprimir_prueba_staff(uuid) to authenticated;

-- ------------------------------------------------------------------------
-- ## 2. Cerrar sesión en Costeos
--
-- Costeos entra con usuario y contraseña y recibe un token de **12 horas**
-- (`20260826220000`). No había forma de cerrar sesión: quien abría Costeos en
-- una computadora prestada dejaba ahí, hasta doce horas, una sesión que ve
-- **costos, márgenes y proveedores** — justo lo que esa migración cerró para
-- que no lo viera cualquiera con la llave pública.
--
-- Cerrar sesión **vence el token**, no lo borra: así queda el rastro de que
-- ese usuario tuvo una sesión. Un token vencido ya no pasa
-- `fn_costos_usuario_del_token`, que es por donde entra todo lo demás.
-- ------------------------------------------------------------------------

create or replace function public.fn_costos_salir(p_token uuid)
returns void
language sql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
  update app_users
     set token_expira = now()
   where token = p_token and token_expira > now();
$$;

comment on function public.fn_costos_salir(uuid) is
  'Cierra la sesión de Costeos venciendo su token. No borra el token: deja el rastro.';

-- Esta sí la llama `anon`: Costeos es un HTML plano sin sesión de Supabase, y
-- su token es su única credencial. Vencer un token que ya se tiene no le da a
-- nadie nada que no tuviera — y el que no lo tiene, no vence nada.
revoke all on function public.fn_costos_salir(uuid) from public;
grant execute on function public.fn_costos_salir(uuid) to anon, authenticated;
