-- El Pan de Muerto entra a Rappi, con su propia lista.
--
-- Los precios los mando la casa; no salen de ningun porcentaje calculado aqui.
-- Suben entre 21 % y 24 % sobre mostrador, que es el rango de los demas
-- productos de plataforma, pero lo que vale es que son SUYOS:
--
--     Tradicional          80 -> 98     130 -> 158
--     Queso Philadelphia  120 -> 148    230 -> 285
--     Queso de Bola       120 -> 148    230 -> 285
--     Nutella             120 -> 148    230 -> 285
--
-- Las filas ya existian con `disponible = false` desde que se sembro el menu
-- de temporada: estaban asi a proposito, porque un producto SIN fila se vende
-- en la plataforma al precio de MOSTRADOR -- o sea sin comision, perdiendo
-- dinero en cada pedido y sin que nada lo avisara. Aqui solo se les pone el
-- precio y se encienden.
update public.precios_canal pc
   set precio = v.rappi, disponible = true, updated_at = now()
  from public.productos p, (values
    ('TE-PM-TR-CH',  98), ('TE-PM-TR-GR', 158),
    ('TE-PM-QP-CH', 148), ('TE-PM-QP-GR', 285),
    ('TE-PM-QB-CH', 148), ('TE-PM-QB-GR', 285),
    ('TE-PM-NU-CH', 148), ('TE-PM-NU-GR', 285)
  ) as v(codigo, rappi)
 where p.codigo = v.codigo and pc.producto_id = p.id and pc.canal = 'rappi';
