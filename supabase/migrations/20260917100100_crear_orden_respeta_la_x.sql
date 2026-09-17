-- Que la caja no pueda cobrar en Rappi algo que no va en Rappi.
--
-- `fn_producto_va_en_canal` ya contesta la pregunta; falta que alguien la
-- haga antes de armar la orden. Va en `fn_crear_orden` y no en la pantalla
-- porque la pantalla es un consejo y el servidor es la regla: el mismo motivo
-- por el que el total se recalcula aqui y no se cree el que manda el cliente.
--
-- Se parchea con ancla (CLAUDE.md, seccion 4): se lee la definicion viva, se
-- verifica que el ancla aparezca EXACTAMENTE una vez y solo entonces se
-- reemplaza. Si el ancla no cuadra, la migracion falla ruidosamente en vez de
-- dejar una funcion a medias.

do $mig$
declare
  v_def   text;
  v_ancla text;
  v_nuevo text;
  v_veces int;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_crear_orden';

  if v_def is null then
    raise exception 'No encuentro fn_crear_orden';
  end if;

  v_ancla :=
    '    if not exists (select 1 from productos where id = v_producto_id and activo = true) then' || E'\n' ||
    '      raise exception ''Producto % no existe o no esta activo'', v_producto_id;' || E'\n' ||
    '    end if;';

  v_veces := (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla);
  if v_veces <> 1 then
    raise exception 'El ancla aparece % veces en fn_crear_orden, esperaba 1. Aborto para no corromperla.', v_veces;
  end if;

  v_nuevo := v_ancla || E'\n' ||
    '    if not fn_producto_va_en_canal(v_producto_id, p_canal) then' || E'\n' ||
    '      raise exception ''% no se vende en %'',' || E'\n' ||
    '        (select nombre from productos where id = v_producto_id), p_canal;' || E'\n' ||
    '    end if;';

  execute replace(v_def, v_ancla, v_nuevo);
end
$mig$;
