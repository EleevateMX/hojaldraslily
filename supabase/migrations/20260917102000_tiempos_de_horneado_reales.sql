-- Los tiempos de horneado que pasó el negocio.
--
-- La columna `minutos_horneado` se creó en 20260827113000 y quedó en null
-- para todo: el sistema usaba 45 minutos para absolutamente todo, que era el
-- valor de arranque puesto "mientras el negocio pasa los tiempos reales".
--
-- Ya los pasó (hoja Inventario, tabla TIEMPO DE HORNEADO) y no son 45: la
-- base real es 50, la Fiesta tarda 75 -- media hora más que lo que el timer
-- venía prometiendo -- y el pan de leche y la pata de canela salen en 35.
--
-- Eso importa porque el timer de la caja es lo que la cajera le contesta a un
-- cliente que espera. Prometer una Fiesta en 45 minutos cuando tarda 75 es
-- mandar a alguien a esperar media hora de más en la banqueta.

-- La base deja de ser 45: la hoja dice que casi todo tarda 50.
update public.parametros set minutos_horneado_default = 50;

-- Lo que no tarda lo de siempre. Solo tres excepciones, y por eso viven como
-- excepciones: lo demás hereda el default y no hay que mantenerlo.
update public.productos set minutos_horneado = 75 where sabor = 'Fiesta';
update public.productos set minutos_horneado = 35 where nombre = 'Pan de leche';
update public.productos set minutos_horneado = 35 where nombre = 'Pata de Canela';
