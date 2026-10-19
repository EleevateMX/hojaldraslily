-- =============================================================================
-- El camino del pan avisa en vivo (19/10/26).
--
-- «Al sacarlo del horno se actualiza como a los 10 s»: las cuatro pantallas
-- (caja, producción, horno, empaque) se releen cada 10 s, y ese poll se queda
-- como red. Pero quien saca una charola grita «ya salió la guayaba» y el
-- cajero mira su pantalla AHÍ, no en diez segundos. Con estas tablas en la
-- publicación de Realtime, `suscribirProduccion` (packages/supabase) recibe el
-- cambio y relee de inmediato.
--
-- Realtime respeta RLS igual que una consulta: las cuatro tablas tienen
-- política `authenticated` y las pantallas entran con PIN, así que nadie sin
-- sesión recibe nada. `anon` no tiene política en ninguna de las cuatro.
-- =============================================================================

alter publication supabase_realtime add table
  public.ordenes_produccion,
  public.orden_produccion_items,
  public.produccion,
  public.encargos;
