-- Portal WiFi Hojaldras Lily: nuevo tipo de cupon para el registro de bienvenida.
-- Aditivo: no altera cupones existentes (tabla vacia al momento de aplicar).
alter type tipo_cupon add value if not exists 'bienvenida';