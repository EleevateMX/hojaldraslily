-- Hoy se perdió tiempo preguntando "¿ya quedó actualizado el agente de la
-- tienda?" sin forma de saberlo desde aquí: la etiqueta salía con el
-- formato viejo y no se distinguía "no lo instalaron" de "lo instalaron y
-- algo más falla". Ahora el agente reporta su versión en cada latido y se
-- ve en Admin.
alter table impresoras add column if not exists agente_version text;

-- Parámetro con DEFAULT: el agente viejo (que llama sin versión) sigue
-- funcionando igual, solo que deja la versión en null.
create or replace function public.fn_imprimir_latido(p_token uuid, p_version text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update impresoras
  set ultima_conexion = now(),
      agente_version = coalesce(nullif(trim(p_version), ''), agente_version)
  where agente_token = p_token and activa;
end;
$function$;

-- La firma vieja de un parámetro dejaría dos funciones conviviendo: se va.
drop function if exists public.fn_imprimir_latido(uuid);