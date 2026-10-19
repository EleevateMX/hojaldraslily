-- =============================================================================
-- El código de instalación de un solo uso (19/10/26).
--
-- ## Por qué existe
--
-- La migración anterior (`20261019090000`) cerró cinco funciones de
-- impresoras que estaban abiertas a `anon` y a PUBLIC. Estaba bien cerrarlas
-- —con la llave publicable cualquiera podía rotar el token de una impresora
-- y quedarse con todas las comandas de la tienda— pero dejó cojo al
-- instalador: `scripts/instalar-agente-impresion.ps1` corre en la PC de la
-- tienda, **sin sesión**, y llama a `fn_admin_impresoras` y
-- `fn_rotar_token_impresora` con la llave publicable y nada más.
--
-- Esa es exactamente la razón por la que en el otro sistema seguían
-- abiertas, y el remedio que su propia guía manda escribir: **Admin genera
-- un código de instalación y el instalador lo pide.** La puerta deja de
-- estar abierta de par en par y pasa a abrirse cuando alguien, adentro de
-- Admin, decide abrirla.
--
-- ## «Un solo uso» quiere decir UNA INSTALACIÓN, no una llamada
--
-- Instalar son varias llamadas: una para listar las impresoras y una por
-- cada token. Un código que muriera en la primera no serviría para nada. Lo
-- que se acota es la **ventana**:
--
--   * nace con 30 minutos de vida;
--   * al primer uso se le recorta a 20 minutos más, que es de sobra para
--     terminar una instalación y poco para guardárselo;
--   * tiene tope de llamadas (40), por si alguien lo usa de llave;
--   * se puede revocar desde Admin.
--
-- Se dice así en voz alta porque llamarle «de un solo uso» y que aguante
-- cuarenta llamadas sería mentirle al que lo lea después.
--
-- ## El alfabeto del código
--
-- Lo teclea una persona en una PC de tienda, leyéndolo de una pantalla.
-- Fuera `O` y `0`, `I`, `L` y `1`: la confusión no se ve al escribirla, se
-- ve cuando el instalador dice «código inválido» y nadie sabe si es el
-- código o la red.
-- =============================================================================

create table if not exists codigos_instalacion (
  codigo text primary key,
  creado_por uuid references empleados(id),
  created_at timestamptz not null default now(),
  expira_en timestamptz not null,
  primer_uso_en timestamptz,
  usos integer not null default 0,
  agente_id text,
  revocado_en timestamptz
);

alter table codigos_instalacion enable row level security;
revoke all on codigos_instalacion from anon, authenticated, public;

create index if not exists codigos_instalacion_vivos_idx
  on codigos_instalacion (expira_en) where revocado_en is null;

/** Normaliza lo tecleado: mayúsculas, sin guiones ni espacios. */
create or replace function public.fn_codigo_instalacion_normalizar(p_codigo text)
returns text
language sql
immutable
as $$
  select upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'))
$$;

/**
 * Genera el código. Solo gerencia: dar de alta una impresora es una
 * decisión de la casa, y el token que sale de aquí vale por todas las
 * comandas de la tienda.
 */
create or replace function public.fn_codigo_instalacion_crear()
returns table (codigo text, expira_en timestamptz)
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_alfabeto text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_codigo text := '';
  v_i integer;
begin
  if not fn_es_jefe() then
    raise exception 'Solo gerencia puede generar un código de instalación.';
  end if;

  for v_i in 1..12 loop
    v_codigo := v_codigo || substr(v_alfabeto, 1 + floor(random() * length(v_alfabeto))::int, 1);
  end loop;

  -- Los vivos de antes se revocan: dos códigos buenos al mismo tiempo es
  -- uno que alguien anotó y nadie recuerda.
  --
  -- Con alias SIEMPRE. Los parámetros de salida de esta función se llaman
  -- `codigo` y `expira_en`, igual que dos columnas de la tabla, y adentro
  -- del cuerpo le tapan el nombre a la columna: sin el alias, este `where`
  -- compara la columna contra la VARIABLE (nula) y Postgres lo rechaza con
  -- «column reference is ambiguous». Salió al probarlo, no al leerlo.
  update codigos_instalacion ci
     set revocado_en = now()
   where ci.revocado_en is null and ci.expira_en > now();

  insert into codigos_instalacion (codigo, creado_por, expira_en)
  values (v_codigo, fn_empleado_actual(), now() + interval '30 minutes');

  return query
  select v_codigo,
         (select c.expira_en from codigos_instalacion c where c.codigo = v_codigo);
end;
$$;

/**
 * Lo que de verdad valida. Es `definer` y privada a propósito: el
 * instalador nunca la llama, la llaman las dos funciones de abajo.
 *
 * El mensaje de error NO distingue «no existe» de «ya venció». Saber cuál de
 * los dos es le sirve a quien está probando códigos y a nadie más.
 */
create or replace function public.fn_codigo_instalacion_usar(p_codigo text, p_agente text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_fila codigos_instalacion;
  v_norm text := fn_codigo_instalacion_normalizar(p_codigo);
begin
  if v_norm = '' then
    raise exception 'Falta el código de instalación. Pídelo en Admin → Impresoras.';
  end if;

  select * into v_fila from codigos_instalacion where codigo = v_norm for update;

  if not found
     or v_fila.revocado_en is not null
     or v_fila.expira_en <= now()
     or v_fila.usos >= 40 then
    raise exception 'El código de instalación no sirve o ya venció. Genera otro en Admin → Impresoras.';
  end if;

  update codigos_instalacion
     set usos = usos + 1,
         agente_id = coalesce(agente_id, nullif(trim(p_agente), '')),
         primer_uso_en = coalesce(primer_uso_en, now()),
         -- Al estrenarlo, la ventana se cierra antes: 20 minutos alcanzan
         -- para terminar la instalación y no para guardárselo.
         expira_en = case
           when primer_uso_en is null then least(expira_en, now() + interval '20 minutes')
           else expira_en
         end
   where codigo = v_norm;
end;
$$;

/**
 * Las impresoras, para el instalador. **Nunca** el token: para eso está la
 * otra. Trae `rol` porque el instalador tiene que separar las etiquetadoras
 * (que van a `printers.config.json`) de la térmica del mostrador (que va al
 * `.env` de otro programa).
 */
create or replace function public.fn_instalador_impresoras(p_codigo text, p_agente text default null)
returns table (
  id uuid, nombre text, rol text, tipo_conexion tipo_conexion_impresora,
  ip text, puerto integer, nombre_dispositivo text, ancho_papel ancho_papel,
  copias integer, corte_automatico boolean, buzzer boolean,
  -- El latido, para que el instalador no diga LISTO antes de que el
  -- servidor vea viva a la impresora. «Instalé y me fui» es como se queda
  -- una PC configurada y muda sin que nadie se entere hasta la primera
  -- comanda perdida.
  ultima_conexion timestamptz, conectada boolean
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform fn_codigo_instalacion_usar(p_codigo, p_agente);
  return query
  select i.id, i.nombre, i.rol, i.tipo_conexion, i.ip, i.puerto,
         i.nombre_dispositivo, i.ancho_papel, i.copias, i.corte_automatico, i.buzzer,
         i.ultima_conexion,
         (i.ultima_conexion is not null and i.ultima_conexion > now() - interval '2 minutes')
  from impresoras i
  where i.activa
  order by i.rol desc, i.nombre;
end;
$$;

/**
 * El token de UNA impresora, rotándolo.
 *
 * No se puede leer el que ya había: no viaja nunca en ninguna lista, porque
 * es lo único que prueba la identidad de una impresora ante la cola. «Verlo»
 * es siempre generar uno nuevo, y por eso el instalador reescribe la
 * configuración completa en vez de conservar la vieja.
 */
create or replace function public.fn_instalador_token(
  p_codigo text,
  p_impresora_id uuid,
  p_agente text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_token uuid;
begin
  perform fn_codigo_instalacion_usar(p_codigo, p_agente);

  update impresoras set agente_token = gen_random_uuid()
   where id = p_impresora_id and activa
  returning agente_token into v_token;

  if v_token is null then
    raise exception 'Esa impresora no existe o está apagada.';
  end if;
  return v_token;
end;
$$;

-- Las dos del instalador SÍ las puede llamar `anon`: la PC de la tienda no
-- tiene sesión. Quien las protege es el código, no el rol.
revoke all on function public.fn_instalador_impresoras(text, text) from public;
revoke all on function public.fn_instalador_token(text, uuid, text) from public;
grant execute on function public.fn_instalador_impresoras(text, text) to anon, authenticated;
grant execute on function public.fn_instalador_token(text, uuid, text) to anon, authenticated;

-- Las de adentro, no.
revoke all on function public.fn_codigo_instalacion_crear() from public, anon;
revoke all on function public.fn_codigo_instalacion_usar(text, text) from public, anon;
revoke all on function public.fn_codigo_instalacion_normalizar(text) from public, anon;
grant execute on function public.fn_codigo_instalacion_crear() to authenticated;
