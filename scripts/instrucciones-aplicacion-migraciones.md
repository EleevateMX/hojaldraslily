# Aplicación de migraciones desde los archivos del repo (para el agente)

Objetivo: aplicar al proyecto Supabase `fzkdgqqvfkogmxdgqsxj` las
migraciones que ya están como archivos en
`/home/user/hojaldraslily/supabase/migrations/VERSION_NAME.sql`,
EN ORDEN ESTRICTO de versión, sin volver a aplicar las ya registradas.

Carga la herramienta con ToolSearch: "select:mcp__Supabase__execute_sql".
Nunca toques el proyecto `zyjtnaystsporbuzcmqk`.

## Paso 0 — qué falta

En `fzkdgqqvfkogmxdgqsxj`:

```sql
select version from supabase_migrations.schema_migrations order by version;
```

Compara contra las líneas de tu rango en
`/home/user/hojaldraslily/supabase/migrations/orden-canonico.txt`
(formato `VERSION NAME`). Las versiones de tu rango que ya estén
registradas se saltan. Las pendientes se procesan en orden.

## Por cada sub-lote de hasta 6 pendientes consecutivas

1. Con Bash: `cat` de los archivos del sub-lote EN ORDEN en un solo
   comando, para tener el SQL completo (los archivos ya están adaptados a
   la marca; no los edites).
2. Un solo mcp__Supabase__execute_sql en `fzkdgqqvfkogmxdgqsxj` con:
   - el SQL de los archivos concatenado en orden, y AL FINAL:
   - `insert into supabase_migrations.schema_migrations(version, name, statements) values ('V','NAME', array['-- replicado; SQL en repo supabase/migrations/']), ... on conflict (version) do nothing;`
     (una fila por migración del sub-lote)
3. Si execute_sql devuelve error: DETENTE (no proceses más) y reporta la
   versión/sub-lote y el error completo, sin improvisar arreglos.

## Reporte final

Texto plano: rango, versiones aplicadas, versiones saltadas por ya
registradas, error si lo hubo. Solo lo que las herramientas devolvieron.
