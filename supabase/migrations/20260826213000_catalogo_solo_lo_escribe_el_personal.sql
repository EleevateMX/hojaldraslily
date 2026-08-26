-- El catalogo solo lo escribe el personal.
--
-- Hallazgo, verificado contra la base antes de tocar nada: la llave publicable
-- (que es publica por diseno: vive en el bundle de las 9 apps) podia ESCRIBIR
-- el catalogo. Las politicas de estas tablas eran `for update using (true)`
-- para el rol `public` -- que incluye a `anon` -- y `anon` ademas tenia el
-- GRANT de UPDATE. Con las dos cosas juntas, cualquiera que abriera la consola
-- del navegador podia:
--
--   update productos set precio = 1;
--
-- Se comprobo en esta base: una pieza de $790 quedo en $1 y se restauro.
--
-- Eso NO es una fuga de datos, es peor de lo que parece: rompe la garantia de
-- "el dinero se calcula en el servidor" (CLAUDE.md, 2.2). fn_crear_orden si
-- recalcula el total desde productos.precio -- pero si el precio de la tabla
-- ya viene alterado, el servidor cobra $1 y todo cuadra. La defensa estaba un
-- piso mas abajo de donde se creia.
--
-- El arreglo: escribir el catalogo exige ser personal (fn_rol_staff()), no
-- basta con `authenticated`, porque un cliente de lealtad tambien lo es
-- (CLAUDE.md, 5). Leer no cambia: el menu sigue siendo publico.
--
-- Se usa "es personal" y no fn_es_jefe() a proposito: cierra igual el agujero
-- (ni anon ni un cliente de Rewards tienen rol) sin arriesgar dejar sin
-- trabajar a un cajero que hoy si entra a Inventario desde Admin. Apretar de
-- mas aqui se paga con una tienda que no puede operar.
--
-- NO se tocan las tablas que las pantallas sin sesion necesitan escribir para
-- que la tienda funcione (pedidos_cocina, cocina_items y caja_cortes: el
-- kiosko y las estaciones corren como anon). Quedan anotadas como lo
-- siguiente a cerrar, y se cierran haciendo que esas pantallas abran sesion
-- real -- no quitandoles el permiso, que seria dejar la tienda tirada.

do $$
declare
  t text;
  -- Solo tablas que hoy escribe UNICAMENTE Admin (con sesion de staff) o los
  -- triggers SECURITY DEFINER de Costeos, que no pasan por RLS. Verificado
  -- app por app antes de escribir esta migracion.
  tablas text[] := array[
    'productos', 'categorias', 'insumos', 'recetas', 'combo_items',
    'promociones', 'parametros', 'lotes', 'inventario_stock',
    'inventario_movimientos', 'mermas', 'transferencias', 'transferencia_items'
  ];
  pol record;
begin
  foreach t in array tablas loop
    if to_regclass('public.' || t) is null then
      raise notice 'no existe la tabla %, se salta', t;
      continue;
    end if;

    -- Fuera las politicas de escritura abiertas de par en par.
    for pol in
      select policyname, cmd from pg_policies
      where schemaname = 'public' and tablename = t
        and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
    loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;

    execute format($f$
      create policy %I on public.%I for insert to authenticated
      with check (public.fn_rol_staff() is not null)
    $f$, 'ins_' || t || '_staff', t);

    execute format($f$
      create policy %I on public.%I for update to authenticated
      using (public.fn_rol_staff() is not null)
      with check (public.fn_rol_staff() is not null)
    $f$, 'upd_' || t || '_staff', t);

    execute format($f$
      create policy %I on public.%I for delete to authenticated
      using (public.fn_rol_staff() is not null)
    $f$, 'del_' || t || '_staff', t);
  end loop;
end $$;
