-- Una prueba del monedero lo destapó: al recargar $200 el cliente recibía
-- 2,200 mancuernas compradas Y ADEMÁS 20 de lealtad. Es pagar el bono dos
-- veces — el bono de la recarga ya ES el premio.
--
-- Las mancuernas de lealtad premian CONSUMO. Comprar saldo no es consumo:
-- es mover dinero de un bolsillo al otro. Se premiará cuando ese saldo se
-- gaste en un producto de verdad.
--
-- Se resta del total la parte que corresponde a recargas, en vez de excluir
-- la orden entera: así una compra mixta (un shake + una recarga) sigue
-- dando mancuernas por el shake.
create or replace function public.fn_acumular_mancuernas()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  gana integer;
  saldo integer;
  activos integer;
  v_recargas numeric := 0;
  v_base numeric;
begin
  if NEW.pagado = true and OLD.pagado is distinct from true and NEW.cliente_id is not null and not NEW.es_demo then

    select coalesce(sum(oi.precio_unitario * oi.cantidad), 0)
    into v_recargas
    from orden_items oi
    join paquetes_saldo ps on ps.producto_id = oi.producto_id
    where oi.orden_id = NEW.id;

    v_base := greatest(0, NEW.total - v_recargas);

    gana := least(100, floor(v_base / 10.0)::int);
    if gana > 0 then
      update clientes set mancuernas = mancuernas + gana where id = NEW.cliente_id returning mancuernas into saldo;
      insert into mancuernas_movimientos (cliente_id, puntos, tipo, orden_id, descripcion)
        values (NEW.cliente_id, gana, 'ganadas', NEW.id, 'Compra folio ' || NEW.folio);
      loop
        select count(*) into activos from cupones where cliente_id = NEW.cliente_id and estado='activo' and tipo<>'cumpleanos';
        exit when saldo < 100 or activos >= 5;
        insert into cupones (cliente_id, tipo, vence_en) values (NEW.cliente_id, 'mancuernas', now() + interval '1 year');
        update clientes set mancuernas = mancuernas - 100 where id = NEW.cliente_id returning mancuernas into saldo;
        insert into mancuernas_movimientos (cliente_id, puntos, tipo, orden_id, descripcion)
          values (NEW.cliente_id, -100, 'canje', NEW.id, 'Cupón generado por 100 mancuernas');
      end loop;
    end if;
  end if;
  return NEW;
end;
$function$;