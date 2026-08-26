-- Costeos amable, parte 1: el precio ES la intención de venta.
--
-- Hoy un renglón de proteins solo se vuelve producto vendible si el sabor
-- termina en "- B" (scoop) o "- R" (bote): una convención escondida que
-- nadie recuerda. La clienta capturó 19 productos nuevos con su precio y
-- no aparecieron por no saber el ritual.
--
-- Nueva regla (compatible con lo viejo):
--   vende scoop = sufijo "- B"  O  precioScoop > 0
--   vende bote  = sufijo "- R"  O  precioBote  > 0
-- Y el nombre visible SIEMPRE pierde el sufijo (adiós "... - R" en el
-- kiosko). Además, lo nuevo de scoops/suplementos se archiva solo en su
-- categoría por tipo, como hizo la migración de categorización.
do $mig$
declare
  v_def text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_sync_app_data';

  -- P1: nombre del bote sin sufijo.
  v_old := $a$union all select 5, trim(x->>'marca')||' - '||trim(x->>'sabor'),$a$;
  v_new := $a$union all select 5, trim(x->>'marca')||' - '||trim(regexp_replace(x->>'sabor', '\s*-\s*[BR]$', '')),$a$;
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'Ancla P1 no es única; abortando';
  end if;
  v_def := replace(v_def, v_old, v_new);

  -- P2: condición del bote — sufijo O precio de bote.
  v_old := $a$    where x->>'sabor' ilike '%- R'
      and (coalesce(trim(x->>'marca'),'')<>'' or coalesce(trim(x->>'sabor'),'')<>'')$a$;
  v_new := $a$    where (x->>'sabor' ilike '%- R' or coalesce(nullif(x->>'precioBote','')::numeric,0) > 0)
      and (coalesce(trim(x->>'marca'),'')<>'' or coalesce(trim(x->>'sabor'),'')<>'')$a$;
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'Ancla P2 no es única; abortando';
  end if;
  v_def := replace(v_def, v_old, v_new);

  -- P3: condición del scoop — sufijo O precio de scoop.
  v_old := $a$    where x->>'sabor' ilike '%- B'
      and (coalesce(trim(x->>'marca'),'')<>'' or coalesce(trim(x->>'sabor'),'')<>'')$a$;
  v_new := $a$    where (x->>'sabor' ilike '%- B' or coalesce(nullif(x->>'precioScoop','')::numeric,0) > 0)
      and (coalesce(trim(x->>'marca'),'')<>'' or coalesce(trim(x->>'sabor'),'')<>'')$a$;
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'Ancla P3 no es única; abortando';
  end if;
  v_def := replace(v_def, v_old, v_new);

  -- P4: el nombre del scoop también limpia cualquier sufijo (una fila -R
  -- con precio de scoop genera el scoop con nombre limpio). Aparece en el
  -- catálogo candidato y en las recetas: 2 veces.
  v_old := $a$'Scoop '||trim(x->>'marca')||' - '||trim(regexp_replace(x->>'sabor', '\s*-\s*B$', ''))$a$;
  v_new := $a$'Scoop '||trim(x->>'marca')||' - '||trim(regexp_replace(x->>'sabor', '\s*-\s*[BR]$', ''))$a$;
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 2 then
    raise exception 'Ancla P4 debía aparecer 2 veces (cand y recetas); abortando';
  end if;
  v_def := replace(v_def, v_old, v_new);

  -- P5: recetas del bote — mismo join que la nueva regla de nombres.
  v_old := $a$join productos pr on lower(pr.nombre)=lower(trim(x->>'marca')||' - '||trim(x->>'sabor')) and pr.es_extra=false and pr.es_combo=false$a$;
  v_new := $a$join productos pr on lower(pr.nombre)=lower(trim(x->>'marca')||' - '||trim(regexp_replace(x->>'sabor', '\s*-\s*[BR]$', ''))) and pr.es_extra=false and pr.es_combo=false$a$;
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'Ancla P5 no es única; abortando';
  end if;
  v_def := replace(v_def, v_old, v_new);

  v_old := $a$  where x->>'sabor' ilike '%- R'
    and not exists (select 1 from recetas r where r.producto_id=pr.id)$a$;
  v_new := $a$  where (x->>'sabor' ilike '%- R' or coalesce(nullif(x->>'precioBote','')::numeric,0) > 0)
    and not exists (select 1 from recetas r where r.producto_id=pr.id)$a$;
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'Ancla P6 no es única; abortando';
  end if;
  v_def := replace(v_def, v_old, v_new);

  v_old := $a$  where x->>'sabor' ilike '%- B'
    and not exists (select 1 from recetas r where r.producto_id=pr.id)$a$;
  v_new := $a$  where (x->>'sabor' ilike '%- B' or coalesce(nullif(x->>'precioScoop','')::numeric,0) > 0)
    and not exists (select 1 from recetas r where r.producto_id=pr.id)$a$;
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'Ancla P7 no es única; abortando';
  end if;
  v_def := replace(v_def, v_old, v_new);

  -- P8: al final, archivar lo nuevo en su categoría por tipo. Solo toca lo
  -- que está sin categoría o en las genéricas viejas.
  v_old := 'end ' || '$function' || '$';
  v_new := $a$  update productos p set categoria_id = (
    select c.id from categorias c where c.nombre =
      case when p.nombre ilike 'Scoop %' then
        case
          when p.nombre ilike '%creatin%' then 'Scoops - Creatinas'
          when p.nombre ilike '%bcaa%' or p.nombre ilike '%amino%' then 'Scoops - BCAAs'
          when p.nombre ilike '%colageno%' or p.nombre ilike '%colágeno%' or p.nombre ilike '%collagen%' then 'Scoops - Colágeno'
          when p.nombre ilike '%c4%' or p.nombre ilike '%pre%entren%' or p.nombre ilike '% pw %' or p.nombre ilike '% pw)%'
            or p.nombre ilike '%psychotic%' or p.nombre ilike '%nitraflex%' or p.nombre ilike '%legend%' or p.nombre ilike '%thavage%' then 'Scoops - Pre-entrenos'
          when p.marca ilike 'birdman%' and p.nombre not ilike '%falcon%' and p.nombre not ilike '%fitmingo%' and p.nombre not ilike '%peacock%' then 'Scoops - Birdman'
          else 'Scoops - Proteínas'
        end
      else
        case
          when p.nombre ilike '%creatin%' then 'Suplementos - Creatinas'
          when p.nombre ilike '%bcaa%' or p.nombre ilike '%amino%' then 'Suplementos - BCAAs'
          when p.nombre ilike '%colageno%' or p.nombre ilike '%colágeno%' or p.nombre ilike '%collagen%' then 'Suplementos - Colágeno'
          when p.nombre ilike '%c4%' or p.nombre ilike '%pre%entren%' or p.nombre ilike '% pw %' or p.nombre ilike '% pw)%'
            or p.nombre ilike '%psychotic%' or p.nombre ilike '%nitraflex%' or p.nombre ilike '%legend%' or p.nombre ilike '%thavage%' then 'Suplementos - Pre-entrenos'
          when p.marca ilike 'birdman%' and p.nombre not ilike '%falcon%' and p.nombre not ilike '%fitmingo%' and p.nombre not ilike '%peacock%' then 'Suplementos Birdman'
          else 'Suplementos - Proteínas'
        end
      end)
  where p.activo and not p.es_extra and not p.es_combo
    and exists (select 1 from _prod d where lower(d.nombre) = lower(p.nombre) and d.cat in ('Scoops','Suplementos'))
    and (p.categoria_id is null
         or p.categoria_id in (select id from categorias where nombre in ('Scoops','Suplementos')));
$a$ || 'end ' || '$function' || '$';
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'Ancla P8 no es única; abortando';
  end if;
  v_def := replace(v_def, v_old, v_new);

  execute v_def;
end $mig$;