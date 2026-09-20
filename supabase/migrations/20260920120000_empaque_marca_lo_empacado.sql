-- La E del camino C -> P -> H -> E: empacar es un paso, no un adorno.
--
-- Hasta aquí el encargo tenía dos momentos, apartarlo y cobrarlo, y entre los
-- dos no había nada. Pero entre los dos está el trabajo: alguien corta los
-- paquetes, los mete en su caja y los deja listos con el nombre del cliente.
--
-- Sin apuntarlo pasan dos cosas, las dos malas:
--   - dos empacadores empacan el mismo encargo, porque la lista se ve igual
--     antes y después;
--   - y nadie puede contestar «¿cuánto falta por empacar?», que es la única
--     pregunta que se hace en esa mesa.
--
-- Va como FECHA y no como bandera: un «sí» no dice cuándo, y a las seis de la
-- tarde la diferencia entre «se empacó temprano» y «se acaba de empacar»
-- importa. Es la misma razón por la que `inventario_stock.contado_at` guarda
-- la fecha aunque no haya diferencia.
--
-- Empacar NO descuenta ni cobra nada. Lo único que descuenta sigue siendo
-- `fn_encargo_cobrar`: apartar no es vender, y empacar tampoco.

alter table public.encargos
  add column if not exists empacado_at  timestamptz,
  add column if not exists empacado_por text;

comment on column public.encargos.empacado_at is
  'Cuándo quedó empacado y listo para entregar. Nulo = todavía está por empacar. No cobra ni descuenta nada.';
comment on column public.encargos.empacado_por is
  'Quién lo empacó. Se toma de la sesión, no se escribe a mano.';

-- Lo que la pantalla de Empaque lee todo el tiempo: los que faltan, por hora
-- de entrega. Parcial, porque un encargo empacado ya no se busca.
create index if not exists encargos_por_empacar_idx
  on public.encargos (fecha_entrega, hora_entrega)
  where empacado_at is null and estado = 'apartado';

create or replace function public.fn_encargo_empacar(
  p_encargo_id uuid,
  p_empacado   boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_quien text; v_fila encargos%rowtype;
begin
  if fn_rol_staff() is null then
    raise exception 'Solo el personal puede marcar el empaque.';
  end if;

  select * into v_fila from encargos where id = p_encargo_id for update;
  if v_fila.id is null then
    raise exception 'Ese encargo no existe.';
  end if;
  -- Un encargo cancelado no se empaca. Uno ya cobrado tampoco: si se entregó,
  -- marcarlo ahora solo ensucia la cuenta de «cuánto falta».
  if v_fila.estado <> 'apartado' then
    raise exception 'El encargo #% está %, ya no se empaca.', v_fila.folio, v_fila.estado;
  end if;

  select e.nombre into v_quien
    from empleados e where e.auth_user_id = auth.uid() and e.activo limit 1;

  -- Idempotente en el sentido que importa en una pantalla táctil: se manda el
  -- ESTADO al que se quiere llegar, no un alternar. Dos toques seguidos por
  -- nervios dejan el encargo empacado, no empacado-y-desempacado.
  update encargos
     set empacado_at  = case when p_empacado then coalesce(empacado_at, now()) else null end,
         empacado_por = case when p_empacado then coalesce(empacado_por, v_quien) else null end,
         updated_at   = now()
   where id = p_encargo_id
   returning * into v_fila;

  return jsonb_build_object(
    'folio',        v_fila.folio,
    'empacado_at',  v_fila.empacado_at,
    'empacado_por', v_fila.empacado_por);
end $$;

comment on function public.fn_encargo_empacar(uuid, boolean) is
  'Marca (o desmarca) un encargo como empacado. No cobra ni mueve inventario.';

-- Revoke Y grant, en ese orden: Postgres le da EXECUTE a PUBLIC por omisión en
-- cada función nueva, así que otorgar no cierra nada (CLAUDE.md §5).
revoke all on function public.fn_encargo_empacar(uuid, boolean) from public, anon;
grant execute on function public.fn_encargo_empacar(uuid, boolean) to authenticated;
