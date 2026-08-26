# Replicación de migraciones (instrucciones para el agente)

Objetivo: copiar migraciones del proyecto Supabase de producción
`zyjtnaystsporbuzcmqk` (SOLO LECTURA: nunca escribas ahí) al proyecto
nuevo `fzkdgqqvfkogmxdgqsxj`, y dejar cada una como archivo en
`/home/user/hojaldraslily/supabase/migrations/VERSION_NAME.sql`.

El archivo `/home/user/hojaldraslily/supabase/migrations/orden-canonico.txt`
tiene 132 líneas `VERSION NAME` en orden. Te asignan un rango de líneas.
Procesa el rango en sub-lotes de 6 consecutivas, EN ORDEN ESTRICTO.

Carga las herramientas con ToolSearch: "select:mcp__Supabase__execute_sql".

## Por cada sub-lote (6 versiones consecutivas V1..V6)

### 1. Traer el SQL ya adaptado, en base64 (proyecto zyjtnaystsporbuzcmqk)

```sql
select version, name, encode(convert_to(
replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
  array_to_string(statements, E'\n'),
  'zyjtnaystsporbuzcmqk','fzkdgqqvfkogmxdgqsxj'),
  'api.shakeaholic.mx','fzkdgqqvfkogmxdgqsxj.supabase.co'),
  'rewards.shakeaholic.mx','rewards.hojaldraslily.com'),
  'shakeaholic.mx','hojaldraslily.com'),
  '@shakeaholicmx','@hojaldraslily'),
  'shakeaholicmx','hojaldraslily'),
  'Shakeaholic Mérida','Hojaldras Lily Mérida'),
  'SHAKEAHOLIC','HOJALDRAS LILY'),
  'Shakeaholic','Hojaldras Lily'),
  'shakeaholic','hojaldraslily'), 'UTF8'), 'base64') as b64
from supabase_migrations.schema_migrations
where version in ('V1','V2','V3','V4','V5','V6')
order by version;
```

### 2. Escribir los archivos (un solo Bash por sub-lote)

Para cada fila, con un heredoc: guarda el b64 en un temporal, quita los
saltos escapados y decodifica:

```bash
cat > /tmp/m.b64 <<'B64EOF'
<pega aquí el b64 de la fila, tal cual>
B64EOF
sed 's/\\n//g' /tmp/m.b64 | tr -d '\n' | base64 -d > /home/user/hojaldraslily/supabase/migrations/VERSION_NAME.sql
head -2 /home/user/hojaldraslily/supabase/migrations/VERSION_NAME.sql
```

(El `head -2` es la única verificación: debe verse SQL legible. Si sale
basura binaria, el b64 quedó mal pegado: reintenta esa fila.)

Al final del sub-lote concatena en orden:

```bash
cat archivo1.sql archivo2.sql ... > /tmp/lote.sql && wc -c /tmp/lote.sql
```

### 3. Aplicar el sub-lote (proyecto fzkdgqqvfkogmxdgqsxj)

Lee /tmp/lote.sql y ejecútalo con mcp__Supabase__execute_sql en el
proyecto `fzkdgqqvfkogmxdgqsxj`, agregando AL FINAL del mismo script:

```sql
insert into supabase_migrations.schema_migrations(version, name, statements) values
  ('V1','NAME1', array['-- replicado; SQL en repo supabase/migrations/']),
  ('V2','NAME2', array['-- replicado; SQL en repo supabase/migrations/']),
  ...
on conflict (version) do nothing;
```

### 4. Si algo falla

Si execute_sql devuelve error: DETENTE (no proceses más sub-lotes) y
reporta la versión/lote que falló y el error completo. No improvises
arreglos.

## Reporte final

Texto plano: rango procesado, número de migraciones aplicadas, lista de
versiones OK, error si lo hubo. Solo lo que las herramientas devolvieron.
