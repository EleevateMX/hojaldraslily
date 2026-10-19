-- =============================================================================
-- Contar el cajón por denominación, y cerrar la caja de verdad (19/10/26).
--
-- ## Dos problemas de un tiro
--
-- **El primero**: el corte recibía **un número** de efectivo contado. «Faltan
-- $340» es un dato con el que nadie puede hacer nada; «falta un billete de
-- $200 y tres de $50» es una frase con la que alguien se acuerda de algo.
--
-- **El segundo, más serio**: abrir y cerrar caja eran un `insert` y un
-- `update` **directos a la tabla desde el navegador**. `caja_cortes` es una
-- de las tres que el kiosko y las estaciones escriben sin sesión, así que
-- cualquiera con la llave publicable —que viaja en el JavaScript de las nueve
-- apps— podía abrir un turno, cerrarlo, o escribir el `efectivo_contado` que
-- se le antojara. Eso último es **falsear el corte**: el número contra el que
-- se compara el cajón.
--
-- ## El efectivo contado lo calcula el SERVIDOR
--
-- Es la regla de `fn_cobrar_orden` aplicada al conteo. La caja manda el
-- desglose —cuántos billetes de cada cuál— y el servidor suma. Si el total
-- viajara desde la pantalla, el desglose y el número podrían no coincidir, y
-- entonces hay dos verdades y ninguna sirve.
--
-- `efectivo_contado` se queda como columna porque `vw_corte_resumen` la lee
-- para sacar la diferencia; lo que cambia es **quién la escribe**.
--
-- ## El $20 existe como billete Y como moneda
--
-- Por eso el jsonb va `{"billetes": {...}, "monedas": {...}}` y no plano. Un
-- conteo indexado solo por denominación hace que las dos filas escriban la
-- misma casilla. La lección es de la tienda hermana, que la aprendió con
-- diez cortes ya guardados y sin forma de saber cómo se repartía ese 20;
-- aquí se empieza con la forma buena. Ver `packages/utils/src/efectivo.ts`.
-- =============================================================================

alter table caja_cortes add column if not exists conteo_apertura jsonb;
alter table caja_cortes add column if not exists conteo_cierre jsonb;

comment on column caja_cortes.conteo_apertura is
  'Desglose del fondo inicial: {"billetes":{"500":2},"monedas":{"10":3}}. El $20 existe como billete y como moneda, por eso van separados.';
comment on column caja_cortes.conteo_cierre is
  'Desglose de lo contado al cerrar. `efectivo_contado` es su suma, calculada en el servidor.';

/**
 * Cuánto dinero es un desglose. La MISMA cuenta que hace `sumaConteo` en
 * `@lily/utils`, escrita dos veces a propósito: la de allá es para que la
 * pantalla enseñe el total mientras se teclea, y la de aquí es la que vale.
 * Si cambia una, cambia la otra.
 */
create or replace function public.fn_suma_conteo(p_conteo jsonb)
returns numeric
language sql
immutable
as $$
  -- `jsonb_typeof(...) = 'object'` y no `coalesce`: si el JSON trae
  -- `"monedas": null`, el `->` devuelve un jsonb **null de JSON**, que NO es
  -- NULL de SQL — así que el coalesce no lo sustituye y `jsonb_each_text`
  -- revienta con «cannot call jsonb_each_text on a non-object». La pantalla
  -- puede mandar eso perfectamente, y el cajero se quedaría sin poder cerrar
  -- el turno. Lo encontró la prueba, no la lectura.
  select coalesce(sum(
    (den)::numeric * greatest(0, floor(coalesce(piezas, '0')::numeric))
  ), 0)
  from (
    select key as den, value as piezas
    from jsonb_each_text(case when jsonb_typeof(p_conteo->'billetes') = 'object'
                              then p_conteo->'billetes' else '{}'::jsonb end)
    union all
    select key, value
    from jsonb_each_text(case when jsonb_typeof(p_conteo->'monedas') = 'object'
                              then p_conteo->'monedas' else '{}'::jsonb end)
  ) t
  where den ~ '^[0-9]+$'
$$;

/**
 * Abre el turno.
 *
 * Exige personal. Antes era un `insert` desde el navegador: cualquiera con
 * la llave publicable podía abrir turnos.
 */
create or replace function public.fn_abrir_caja(
  p_caja_id uuid,
  p_conteo jsonb default null,
  p_fondo numeric default null
)
returns caja_cortes
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_corte caja_cortes;
  v_fondo numeric;
begin
  if not fn_es_staff() then
    raise exception 'Solo el personal puede abrir la caja.';
  end if;
  if not exists (select 1 from cajas where id = p_caja_id) then
    raise exception 'Esa caja no existe.';
  end if;

  -- Con desglose manda el desglose; sin desglose, el número suelto. Lo
  -- segundo existe para no obligar a contar moneda por moneda un fondo que
  -- siempre es el mismo, pero lo primero es lo que se quiere.
  v_fondo := case
    when p_conteo is not null then fn_suma_conteo(p_conteo)
    else greatest(0, coalesce(p_fondo, 0))
  end;

  insert into caja_cortes (caja_id, empleado_apertura_id, fondo_inicial, conteo_apertura)
  values (p_caja_id, fn_empleado_actual(), v_fondo, p_conteo)
  returning * into v_corte;

  return v_corte;
end;
$$;

/**
 * Cierra el turno contra lo que hay en el cajón.
 *
 * El `efectivo_contado` NO viaja desde la pantalla: se calcula aquí desde el
 * desglose. Es la misma regla que `fn_cobrar_orden` — el dinero lo calcula el
 * servidor.
 */
create or replace function public.fn_cerrar_caja(
  p_corte_id uuid,
  p_conteo jsonb default null,
  p_notas text default null,
  p_efectivo numeric default null
)
returns caja_cortes
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_corte caja_cortes;
  v_contado numeric;
begin
  if not fn_es_staff() then
    raise exception 'Solo el personal puede cerrar la caja.';
  end if;

  select * into v_corte from caja_cortes where id = p_corte_id for update;
  if not found then
    raise exception 'Ese corte no existe.';
  end if;
  -- Cerrar dos veces no vuelve a escribir el conteo: el segundo cierre
  -- traería el cajón de después de contar, y el corte ya se firmó con el
  -- de antes.
  if v_corte.estado <> 'abierta' then
    raise exception 'Ese turno ya está cerrado.';
  end if;

  v_contado := case
    when p_conteo is not null then fn_suma_conteo(p_conteo)
    else greatest(0, coalesce(p_efectivo, 0))
  end;

  update caja_cortes set
    estado = 'cerrada',
    cerrado_en = now(),
    efectivo_contado = v_contado,
    conteo_cierre = p_conteo,
    empleado_cierre_id = fn_empleado_actual(),
    notas = nullif(trim(coalesce(p_notas, '')), '')
  where id = p_corte_id
  returning * into v_corte;

  return v_corte;
end;
$$;

revoke all on function public.fn_abrir_caja(uuid, jsonb, numeric) from public, anon;
revoke all on function public.fn_cerrar_caja(uuid, jsonb, text, numeric) from public, anon;
revoke all on function public.fn_suma_conteo(jsonb) from public, anon;
grant execute on function public.fn_abrir_caja(uuid, jsonb, numeric) to authenticated;
grant execute on function public.fn_cerrar_caja(uuid, jsonb, text, numeric) to authenticated;
grant execute on function public.fn_suma_conteo(jsonb) to authenticated;

-- OJO, lo que queda pendiente y hay que hacer junto: la tabla `caja_cortes`
-- SIGUE escribible por `anon` (el kiosko abre turno sin sesión). Estas dos
-- funciones son el camino bueno, pero mientras el permiso de tabla siga
-- abierto, el camino viejo también existe. Se cierra cuando el kiosko
-- sostenga su sesión — ver `docs/base-de-replicacion.md` §7, pendiente 1.
