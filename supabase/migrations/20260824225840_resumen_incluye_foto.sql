-- La foto entra al mismo viaje de datos que todo lo demas. Pedirla aparte
-- seria una segunda espera en el celular justo para pintar la cara.
do $mig$
declare
  d text := pg_get_functiondef('fn_mi_resumen_lealtad()'::regprocedure);
  ancla text := $a$'nombre', v_cliente.nombre,$a$;
begin
  if (length(d) - length(replace(d, ancla, ''))) / length(ancla) <> 1 then
    raise exception 'El ancla del nombre no aparece exactamente 1 vez';
  end if;
  d := replace(d, ancla, $a$'nombre', v_cliente.nombre,
      'foto', v_cliente.foto_url,
      'foto_propia', v_cliente.foto_propia,$a$);
  execute d;
end
$mig$;