-- ============================================================================
-- Barrido automatico de los cobros que quedaron a medias
-- ============================================================================
-- Un cobro tiene dos avisos: el webhook de Clip y el sondeo del kiosko (120 s).
-- Si los dos fallan —se cayo la red, la cajera cerro la pantalla, el webhook
-- nunca llego— el pago se queda en `pending` para siempre. Con dinero real ese
-- es el peor estado posible: el cliente pago y el sistema no se entero, asi que
-- la venta no se confirma, no entra al corte y no descuenta inventario.
--
-- `fn_reconciliar_pagos` no puede arreglarlo —es SQL, no puede llamar a Clip—,
-- por eso el barrido vive en una Edge Function y esto solo la despierta.
--
-- Sobre la llave que va en la cabecera: es la ANON, no la de servicio. La
-- funcion exige un JWT valido del proyecto y la anon lo es; ademas ya es
-- publica —vive dentro del frontend desplegado y del workflow del repo—, asi
-- que ponerla aqui no filtra nada. La de servicio SI seria un problema: queda
-- legible en cron.job para siempre.
--
-- Que alguien mas dispare el barrido no hace dano: la funcion solo LEE la
-- verdad de Clip y sincroniza. No puede crear cobros ni mover dinero.
select cron.unschedule('clip-barrer-pendientes')
where exists (select 1 from cron.job where jobname = 'clip-barrer-pendientes');

select cron.schedule(
  'clip-barrer-pendientes',
  '*/2 * * * *',
  $cron$
  select net.http_post(
    url := 'https://fzkdgqqvfkogmxdgqsxj.supabase.co/functions/v1/clip-barrer-pendientes',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5anRuYXlzdHNwb3JidXpjbXFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNzMxNDksImV4cCI6MjA5Njg0OTE0OX0.USpCrgpCLMXcpWhA60mKmgMchrxCR3_kybIPIyas7iA'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $cron$
);

select jobname, schedule, active from cron.job where jobname = 'clip-barrer-pendientes';