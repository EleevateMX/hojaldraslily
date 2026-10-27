-- El corte suma por método; agrego las dos columnas nuevas al FINAL (CREATE OR
-- REPLACE VIEW solo deja añadir columnas al final). `to_jsonb(r)` en
-- fn_corte_payload las mete solas al papel. `efectivo_esperado` sigue contando
-- SOLO efectivo: transferencia e inbursa NO van en el cajón.
-- create or replace view borra las reloptions: hay que re-declarar
-- security_invoker=true o la vista queda insegura en silencio.
create or replace view public.vw_corte_resumen with (security_invoker=true) as
 SELECT cc.id AS corte_id,
    cc.caja_id,
    ca.nombre AS caja,
    cc.estado,
    cc.abierto_en,
    cc.cerrado_en,
    cc.fondo_inicial,
    cc.efectivo_contado,
    count(DISTINCT o.id) AS num_ordenes,
    COALESCE(sum(p.monto) FILTER (WHERE p.metodo = 'efectivo'::metodo_pago), 0::numeric) AS total_efectivo,
    COALESCE(sum(p.monto) FILTER (WHERE p.metodo = 'tarjeta'::metodo_pago), 0::numeric) AS total_tarjeta,
    COALESCE(sum(p.monto) FILTER (WHERE p.metodo = 'clip'::metodo_pago), 0::numeric) AS total_clip,
    COALESCE(sum(p.monto) FILTER (WHERE p.metodo = 'cortesia'::metodo_pago), 0::numeric) AS total_cortesia,
    COALESCE(sum(p.monto) FILTER (WHERE p.metodo = 'otro'::metodo_pago), 0::numeric) AS total_otro,
    COALESCE(sum(p.monto), 0::numeric) AS total_pagado,
    cc.fondo_inicial + COALESCE(sum(p.monto) FILTER (WHERE p.metodo = 'efectivo'::metodo_pago), 0::numeric) AS efectivo_esperado,
    cc.efectivo_contado - (cc.fondo_inicial + COALESCE(sum(p.monto) FILTER (WHERE p.metodo = 'efectivo'::metodo_pago), 0::numeric)) AS diferencia,
    COALESCE(sum(p.monto) FILTER (WHERE p.metodo = 'transferencia'::metodo_pago), 0::numeric) AS total_transferencia,
    COALESCE(sum(p.monto) FILTER (WHERE p.metodo = 'inbursa'::metodo_pago), 0::numeric) AS total_inbursa
   FROM caja_cortes cc
     JOIN cajas ca ON ca.id = cc.caja_id
     LEFT JOIN ordenes o ON o.corte_id = cc.id AND o.es_demo = false
     LEFT JOIN vw_pagos_por_metodo p ON p.orden_id = o.id AND p.estado = 'aprobado'::estado_pago
  GROUP BY cc.id, ca.nombre;
