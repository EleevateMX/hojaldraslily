-- `Pasta de guayaba` → `Pasta de Guayaba`.
--
-- Registro de una migración aplicada a la base que se había quedado sin
-- archivo en el repo (CLAUDE.md §6).
--
-- El renombre de insumos de 20260917104000 tiene un candado: no renombra si el
-- nombre nuevo ya existe, para no crear un duplicado. Pero cuando lo único que
-- cambia son las MAYÚSCULAS, el viejo y el nuevo son la misma fila — el
-- candado se dispara contra sí mismo y el insumo se queda con la grafía vieja.
--
-- Aquel archivo ya trae el caso contemplado, así que en una base nueva esto no
-- hace nada. Se conserva porque es lo que se le aplicó a la base de Lily.

update public.insumos set nombre = 'Pasta de Guayaba'
 where lower(nombre) = 'pasta de guayaba' and nombre <> 'Pasta de Guayaba';
