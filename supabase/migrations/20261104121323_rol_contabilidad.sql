-- Rol "Contabilidad": un puesto que ve SOLO el apartado de Facturación de
-- Admin y puede timbrar la factura global, pero no toca precios, personal,
-- inventario ni la configuración (eso sigue siendo gerencia, fn_es_jefe).
--
-- Dos piezas de ESQUEMA van aquí (el rol y la función de permiso). La CUENTA
-- en sí —el empleado "Contabilidad" con su PIN— es DATO, igual que Rosa y
-- Lily, y NO vive en una migración: se crea aparte para no dejar un PIN
-- escrito en el repo (que es público).

-- 1. El rol. Guardado con NOT EXISTS y no ON CONFLICT para no depender de que
--    haya un índice único sobre slug.
insert into roles (slug, nombre)
select 'contabilidad', 'Contabilidad'
where not exists (select 1 from roles where slug = 'contabilidad');

-- 2. Quién puede facturar: gerencia (fn_es_jefe) MÁS contabilidad. La Edge
--    Function `contadigital-facturar` pregunta por esto en vez de fn_es_jefe,
--    así contabilidad timbra sin que se le abra nada más. El cajero no entra:
--    su slug no está aquí.
create or replace function fn_puede_facturar()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select fn_es_jefe() or coalesce(fn_rol_staff() = 'contabilidad', false)
$$;

revoke all on function fn_puede_facturar() from public, anon;
grant execute on function fn_puede_facturar() to authenticated, service_role;
