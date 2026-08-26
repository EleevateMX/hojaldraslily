-- Guardar y publicar dejan de ser lo mismo.
--
-- Hasta ahora, guardar en Costeos sincronizaba el catalogo y el siguiente
-- que abriera el kiosko veia los cambios. Eso obliga a que quien costea no
-- se equivoque nunca a media captura: cualquier nombre a medio escribir o
-- precio en borrador ya estaba en la barra.
--
-- Ahora hay dos momentos. Guardar sigue guardando (y sincroniza el
-- catalogo, que es lo que permite seguir costeando con datos reales), pero
-- el kiosko sigue mostrando lo ultimo PUBLICADO hasta que alguien confirme.
-- Y antes de confirmar se ve exactamente que va a cambiar: altas, bajas,
-- renombres y precios.

create table if not exists catalogo_publicaciones (
  id           uuid primary key default gen_random_uuid(),
  snapshot     jsonb not null,
  publicado_en timestamptz not null default now(),
  publicado_por text
);

create index if not exists catalogo_publicaciones_cuando
  on catalogo_publicaciones (publicado_en desc);

alter table catalogo_publicaciones enable row level security;

drop policy if exists "publicaciones las ve el personal" on catalogo_publicaciones;
create policy "publicaciones las ve el personal" on catalogo_publicaciones
  for select to authenticated using (fn_es_staff());

-- La foto del catalogo tal como lo veria el cliente ahora mismo.
--
-- Solo lo que se ve en la barra: nombre, precio, categoria y si esta
-- prendido. El costo, el margen y los insumos NO entran -- esto se compara
-- y se muestra en pantalla, y esos numeros no salen de Costeos.
create or replace function fn_catalogo_snapshot()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'productos', (
      select coalesce(jsonb_object_agg(p.id::text, jsonb_build_object(
        'nombre', p.nombre,
        'precio', p.precio,
        'activo', p.activo,
        'categoria', c.nombre,
        'es_combo', p.es_combo,
        'es_extra', p.es_extra
      )), '{}'::jsonb)
      from productos p left join categorias c on c.id = p.categoria_id
    ),
    'combos', (
      select coalesce(jsonb_object_agg(ci.combo_id::text, ci.piezas), '{}'::jsonb)
      from (
        select combo_id, sum(cantidad)::int as piezas
        from combo_items group by combo_id
      ) ci
    ),
    'extras', (
      select coalesce(jsonb_object_agg(pe.producto_id::text, pe.cuantos), '{}'::jsonb)
      from (
        select producto_id, count(*)::int as cuantos
        from producto_extras group by producto_id
      ) pe
    )
  );
$$;
revoke execute on function fn_catalogo_snapshot() from public, anon, authenticated;

-- Que cambio desde la ultima publicacion.
--
-- Se compara contra la foto guardada, no contra "hace un rato": si alguien
-- guardo el lunes y publica el jueves, tiene que ver los tres dias de
-- cambios juntos, no solo el ultimo.
create or replace function fn_catalogo_cambios()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_ahora jsonb := fn_catalogo_snapshot();
  v_antes jsonb;
  v_fecha timestamptz;
  v_prod_antes jsonb;
  v_prod_ahora jsonb := v_ahora -> 'productos';
begin
  select snapshot, publicado_en into v_antes, v_fecha
  from catalogo_publicaciones order by publicado_en desc limit 1;

  -- Primera vez: no hay con que comparar. Decirlo tal cual es mejor que
  -- listar el catalogo entero como si todo fuera nuevo.
  if v_antes is null then
    return jsonb_build_object(
      'primera_vez', true,
      'hay_cambios', true,
      'desde', null,
      'altas', '[]'::jsonb, 'bajas', '[]'::jsonb,
      'renombres', '[]'::jsonb, 'precios', '[]'::jsonb,
      'encendidos', '[]'::jsonb, 'apagados', '[]'::jsonb,
      'combos', '[]'::jsonb
    );
  end if;

  v_prod_antes := v_antes -> 'productos';

  return jsonb_build_object(
    'primera_vez', false,
    'desde', to_char(v_fecha at time zone 'America/Merida', 'DD/MM/YYYY HH24:MI'),

    'altas', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'nombre', n.value ->> 'nombre',
        'precio', (n.value ->> 'precio')::numeric,
        'categoria', n.value ->> 'categoria'
      ) order by n.value ->> 'nombre'), '[]'::jsonb)
      from jsonb_each(v_prod_ahora) n
      where v_prod_antes -> n.key is null and (n.value ->> 'activo')::boolean
    ),

    'bajas', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'nombre', a.value ->> 'nombre',
        'categoria', a.value ->> 'categoria'
      ) order by a.value ->> 'nombre'), '[]'::jsonb)
      from jsonb_each(v_prod_antes) a
      where v_prod_ahora -> a.key is null and (a.value ->> 'activo')::boolean
    ),

    -- El renombre se detecta por id, que es justo lo que hace que un
    -- renombre sea un renombre y no un alta+baja.
    'renombres', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'antes', a.value ->> 'nombre',
        'ahora', v_prod_ahora -> a.key ->> 'nombre'
      ) order by a.value ->> 'nombre'), '[]'::jsonb)
      from jsonb_each(v_prod_antes) a
      where v_prod_ahora -> a.key is not null
        and (a.value ->> 'nombre') is distinct from (v_prod_ahora -> a.key ->> 'nombre')
    ),

    'precios', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'nombre', v_prod_ahora -> a.key ->> 'nombre',
        'antes', (a.value ->> 'precio')::numeric,
        'ahora', (v_prod_ahora -> a.key ->> 'precio')::numeric
      ) order by v_prod_ahora -> a.key ->> 'nombre'), '[]'::jsonb)
      from jsonb_each(v_prod_antes) a
      where v_prod_ahora -> a.key is not null
        and (a.value ->> 'precio')::numeric
            is distinct from (v_prod_ahora -> a.key ->> 'precio')::numeric
    ),

    'encendidos', (
      select coalesce(jsonb_agg(v_prod_ahora -> a.key ->> 'nombre'
                                order by v_prod_ahora -> a.key ->> 'nombre'), '[]'::jsonb)
      from jsonb_each(v_prod_antes) a
      where v_prod_ahora -> a.key is not null
        and not (a.value ->> 'activo')::boolean
        and (v_prod_ahora -> a.key ->> 'activo')::boolean
    ),

    'apagados', (
      select coalesce(jsonb_agg(v_prod_ahora -> a.key ->> 'nombre'
                                order by v_prod_ahora -> a.key ->> 'nombre'), '[]'::jsonb)
      from jsonb_each(v_prod_antes) a
      where v_prod_ahora -> a.key is not null
        and (a.value ->> 'activo')::boolean
        and not (v_prod_ahora -> a.key ->> 'activo')::boolean
    ),

    'combos', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'nombre', coalesce(v_prod_ahora -> c.key ->> 'nombre', v_prod_antes -> c.key ->> 'nombre'),
        'antes', (v_antes -> 'combos' -> c.key)::text,
        'ahora', (v_ahora -> 'combos' -> c.key)::text
      )), '[]'::jsonb)
      from jsonb_each(coalesce(v_ahora -> 'combos', '{}'::jsonb)) c
      where (v_antes -> 'combos' -> c.key) is distinct from (v_ahora -> 'combos' -> c.key)
    )
  ) || jsonb_build_object('hay_cambios', v_antes is distinct from v_ahora);
end;
$$;
grant execute on function fn_catalogo_cambios() to anon, authenticated;

-- Publicar: guardar la foto nueva y tocar el timbre de las pantallas.
--
-- Se acepta gerencia con sesion real (Admin) o la clave del encargado
-- (Costeos, que no tiene sesion de Supabase). La clave se valida AQUI y no
-- en el navegador: esto cambia lo que ve y lo que paga el cliente, y una
-- comprobacion en el navegador la salta cualquiera con la consola abierta.
create or replace function fn_catalogo_publicar(p_clave text default null, p_quien text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ok boolean := coalesce(fn_es_jefe(), false);
  v_clave text;
  v_cambios jsonb;
  v_pantalla text;
begin
  if not v_ok then
    select clave_compras into v_clave from parametros where id = 'default';
    if v_clave is null or nullif(trim(coalesce(p_clave, '')), '') is null
       or trim(p_clave) <> trim(v_clave) then
      raise exception 'Clave incorrecta';
    end if;
  end if;

  v_cambios := fn_catalogo_cambios();

  insert into catalogo_publicaciones (snapshot, publicado_por)
  values (fn_catalogo_snapshot(),
          coalesce(nullif(trim(p_quien), ''),
                   (select e.nombre from empleados e where e.id = fn_empleado_actual()),
                   'Costeos'));

  -- El timbre para cada pantalla. Se manda directo a la tabla y no por
  -- fn_pantallas_recargar porque esa exige sesion de gerencia, y aqui ya
  -- se comprobo el permiso de la otra forma.
  foreach v_pantalla in array array['kiosko','barra','cocina','pantalla'] loop
    insert into senales_pantallas (pantalla, pedido_por)
    values (v_pantalla, fn_empleado_actual());
  end loop;
  delete from senales_pantallas where creado_en < now() - interval '1 day';

  return v_cambios || jsonb_build_object('publicado', true);
end;
$$;
grant execute on function fn_catalogo_publicar(text, text) to anon, authenticated;