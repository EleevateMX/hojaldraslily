# Replicar migraciones al proyecto de Hojaldras Lily (para el agente)

Copia migraciones del proyecto Supabase original `zyjtnaystsporbuzcmqk`
(**SOLO LECTURA**: nunca escribas ahí) al proyecto de Hojaldras Lily
`fzkdgqqvfkogmxdgqsxj`, dejando cada una como archivo en
`/home/user/hojaldraslily/supabase/migrations/VERSION_NAME.sql`.

`supabase/migrations/orden-canonico.txt` tiene 132 líneas `VERSION NAME`
en orden. Te asignan un rango de líneas. **El orden es sagrado**: cada
migración asume que las anteriores ya corrieron. Nunca saltes ni
reordenes.

Carga la herramienta: ToolSearch "select:mcp__Supabase__execute_sql".

## Antes de empezar

En `fzkdgqqvfkogmxdgqsxj`:
`select version from supabase_migrations.schema_migrations order by version;`

La última registrada debe ser justo la línea anterior a tu rango. Si no
lo es, DETENTE y repórtalo: alguien más va atrasado y aplicar lo tuyo
rompería.

## Ciclo por sub-lote (6 versiones consecutivas V1..V6)

### 1. Traer el SQL ya adaptado a la marca (proyecto origen)

```sql
select string_agg(
  version || '|' || name || '|' || encode(convert_to(
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
      'shakeaholic','hojaldraslily'), 'UTF8'), 'base64'),
  E'\n@@@\n' order by version) as paquete
from supabase_migrations.schema_migrations
where version in ('V1','V2','V3','V4','V5','V6');
```

### 2. Escribir los archivos (un solo Bash)

**Truco que ahorra muchísimo**: si el resultado es grande, la herramienta
lo persiste en un archivo en vez de devolverlo inline, y te dice la ruta.
Para forzarlo, agrega una columna de relleno a la consulta del paso 1
(por ejemplo `, repeat('x', 200000) as pad`). Entonces no transcribes
nada: dejas que Python lea el `paquete` desde ese archivo. Si aun así
llega inline, pégalo en el heredoc de abajo.

El valor viene de JSON, así que trae `\n` escapados: hay que quitarlos.

```bash
python3 - <<'PYEOF'
paquete = r"""<pega aquí el valor de paquete, tal cual>"""
import base64, os
dest = "/home/user/hojaldraslily/supabase/migrations"
for bloque in paquete.split("\n@@@\n"):
    bloque = bloque.strip()
    if not bloque:
        continue
    version, nombre, b64 = bloque.split("|", 2)
    sql = base64.b64decode(b64.replace("\\n", "").replace("\n", "")).decode("utf-8")
    ruta = os.path.join(dest, f"{version}_{nombre}.sql")
    open(ruta, "w").write(sql)
    print(version, nombre, len(sql), "bytes", repr(sql[:60]))
PYEOF
```

Revisa la salida: cada línea debe mostrar SQL legible. Si sale basura,
vuelve a pedir esa versión.

### 3. Aplicar el sub-lote (proyecto de Hojaldras Lily)

Concatena EN ORDEN y lee el resultado una sola vez:

```bash
cd /home/user/hojaldraslily/supabase/migrations && cat V1_*.sql V2_*.sql V3_*.sql V4_*.sql V5_*.sql V6_*.sql > /tmp/lote.sql && wc -c /tmp/lote.sql
```

Un solo `mcp__Supabase__execute_sql` en `fzkdgqqvfkogmxdgqsxj` con el
contenido de `/tmp/lote.sql` y, AL FINAL del mismo script:

```sql
insert into supabase_migrations.schema_migrations(version, name, statements) values
  ('V1','NAME1', array['-- replicado; SQL en repo supabase/migrations/']),
  ...
on conflict (version) do nothing;
```

### 4. Ante un error

DETENTE. No proceses más sub-lotes, no improvises arreglos. Reporta la
versión, el error completo y qué sub-lotes sí quedaron aplicados. Todo el
sub-lote se revierte junto (es una transacción), así que el estado queda
consistente.

## Reporte final

Texto plano: rango, versiones aplicadas, error si lo hubo. Solo lo que
las herramientas devolvieron; no inventes resultados.
