-- ============================================================================
-- El barrido de cobros de Clip usa la llave de Hojaldras Lily
-- ============================================================================
-- Al replicar el sistema, `cron_barrer_cobros_pendientes` se trajo el job tal
-- cual: la URL de la Edge Function si se adapto (es texto plano), pero el JWT
-- anon del header viaja como base64 y ahi el reemplazo de texto no alcanza.
-- El job quedaba llamando a la funcion de Lily con la llave del proyecto
-- original: la funcion habria rechazado cada barrido, y el barrido es la
-- tercera red de seguridad para que no se pierda un cobro con tarjeta
-- (webhook + sondeo del kiosko + este barrido cada 2 minutos).
--
-- La llave anon es publica por diseno (vive dentro del frontend desplegado);
-- lo que protege el cobro es RLS y la validacion contra Clip, no esta llave.
select cron.unschedule('clip-barrer-pendientes');

select cron.schedule(
  'clip-barrer-pendientes',
  '*/2 * * * *',
  $cron$
  select net.http_post(
    url := 'https://fzkdgqqvfkogmxdgqsxj.supabase.co/functions/v1/clip-barrer-pendientes',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6a2RncXF2ZmtvZ214ZGdxc3hqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3MTAxMzgsImV4cCI6MjEwMzI4NjEzOH0.9QiYq8_Ue9egUun6aSNAf3o15AVgg3EzvhHRHHoBhKU'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $cron$
);
