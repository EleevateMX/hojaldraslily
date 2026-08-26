drop policy if exists ins_pagos on pagos;
create policy ins_pagos on pagos
  for insert
  with check (estado <> 'aprobado');

drop policy if exists upd_pagos on pagos;

drop policy if exists ins_ordenes on ordenes;
drop policy if exists ins_orden_items on orden_items;

revoke update (pagado, total, metodo_pago) on ordenes from anon, authenticated;

revoke select (pin_hash) on empleados from anon, authenticated;