-- Modo "cajero": el kiosko lo opera el cajero para levantar el pedido frente
-- al cliente, con la misma pantalla que después usará el cliente solo.
--
-- A diferencia de 'pagar_en_caja' (que deja la orden esperando a que alguien
-- la cobre en el POS), aquí el cajero cobra en el mismo acto y la comanda sale
-- de inmediato. NO se salta el cobro: se registra el método de pago, el
-- empleado que cobró y el corte abierto, porque si no el corte de caja no
-- cuadra al cierre del día.
alter type modo_pago_kiosko add value if not exists 'cajero';