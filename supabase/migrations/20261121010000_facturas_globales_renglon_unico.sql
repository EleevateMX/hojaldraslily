-- Cómo se arma el CFDI de la global: un solo renglón con el total (true), o un
-- renglón por folio (false). Se guarda para que al TIMBRAR una prefactura se
-- re-arme igual que como se guardó. Por omisión, un solo renglón.
alter table public.facturas_globales
  add column if not exists renglon_unico boolean not null default true;
