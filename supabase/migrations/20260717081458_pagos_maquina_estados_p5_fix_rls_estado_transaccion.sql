drop policy if exists ins_pagos on pagos;
create policy ins_pagos on pagos
  for insert
  with check (
    estado <> 'aprobado'
    and estado_transaccion not in ('authorized', 'refunded_partial', 'refunded_full')
  );