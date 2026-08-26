-- Las recargas de monedero no son producto: son dinero. No tienen receta
-- porque no hay nada que preparar ni insumo que descontar.
--
-- El Diagnostico las estaba listando como "productos que se venden sin
-- receta", que es una alerta que nunca va a poder ponerse en verde. Y un
-- indicador que no puede volver a verde deja de leerse -- ya paso con
-- "comandas que fallaron: 21", que contaba historia de julio
-- irreimprimible y hacia que nadie mirara ese numero.
do $mig$
declare
  d text := pg_get_functiondef('fn_diagnostico_sistema()'::regprocedure);
  ancla text := 'from productos p';
  veces int;
begin
  veces := (length(d) - length(replace(d, ancla, ''))) / length(ancla);
  if veces < 1 then
    raise exception 'El ancla "from productos p" no aparece en la funcion';
  end if;

  d := replace(d,
    'from productos p',
    'from productos p
        left join paquetes_saldo pq on pq.producto_id = p.id');

  -- Y que la condicion excluya justamente esos.
  if position('where p.activo' in d) = 0 then
    raise exception 'No encontre la condicion del catalogo sin receta';
  end if;
  d := replace(d, 'where p.activo', 'where p.activo and pq.id is null');

  execute d;
end
$mig$;