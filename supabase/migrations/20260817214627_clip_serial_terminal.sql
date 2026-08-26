-- Número de serie de la terminal Clip que recibe los cobros del sistema
-- (API de PinPad: el campo serial_number_pos). Vive en la configuración
-- del kiosko por sucursal; no es secreto (viene impreso en el aparato),
-- pero sí es configuración: cambiar de terminal no debe requerir deploy.
alter table configuracion_kiosko add column if not exists clip_serial_pos text;