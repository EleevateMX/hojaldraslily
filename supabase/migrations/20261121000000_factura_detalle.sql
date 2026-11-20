-- Detalle de una factura/prefactura global para verla SIN PIERDE desde Admin:
-- sus renglones (concepto + importe, extraídos de lo que ContaDigital guardó),
-- y los identificadores de ContaDigital (Id interno, serie/folio, estatus, UUID,
-- FolioOriginal) para poder ubicarla en su portal. Solo personal.
create or replace function public.fn_factura_detalle(p_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare v jsonb;
begin
  if not fn_es_staff() then
    raise exception 'Solo el personal puede ver las facturas' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'id_contadigital', f.respuesta->'Resultado'->>'Id',
    'serie',           coalesce(nullif(f.serie, ''), f.respuesta->'Resultado'->>'Serie'),
    'folio_cfdi',      f.folio_cfdi,
    'estatus_cd',      f.respuesta->'Resultado'->>'Estatus',
    'uuid',            nullif(f.uuid, ''),
    'folio_original',  f.folio_original,
    'tipo',            f.tipo,
    'periodo_desde',   f.periodo_desde,
    'periodo_hasta',   f.periodo_hasta,
    'total',           f.total,
    'num_folios',      f.num_folios,
    'comentario',      f.comentario,
    'pdf_link',        f.pdf_link,
    'xml_link',        f.xml_link,
    'mensaje',         f.mensaje,
    'renglones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'concepto', p->>'Comentarios',
        'importe',  (p->>'Importe')::numeric
      ) order by ord)
      from jsonb_array_elements(f.respuesta->'Resultado'->'Productos') with ordinality as t(p, ord)
    ), '[]'::jsonb)
  ) into v
  from facturas_globales f
  where f.id = p_id;
  return v;
end;
$function$;

revoke all on function public.fn_factura_detalle(uuid) from public;
revoke all on function public.fn_factura_detalle(uuid) from anon;
grant execute on function public.fn_factura_detalle(uuid) to authenticated;
