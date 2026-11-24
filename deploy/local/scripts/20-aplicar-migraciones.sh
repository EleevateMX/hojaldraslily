#!/usr/bin/env bash
# Aplica las migraciones de supabase/migrations/ a la base LOCAL, en orden.
#
# Requiere que el Supabase self-hosted ya esté arriba: las migraciones usan
# roles (anon/authenticated/service_role) y esquemas (auth/storage) que crea el
# stack, más las extensiones pg_net y pg_cron (habilítalas antes — la
# replicación/instalación no las trae solas; ver CLAUDE.md §4).
#
# Prefiere la CLI de Supabase (registra en supabase_migrations.schema_migrations,
# que es el invariante del repo). Si no está, cae a un loop con psql que lleva
# su propio registro para ser idempotente.
set -euo pipefail

AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(cd "$AQUI/../../.." && pwd)"
: "${DATABASE_URL:?Define DATABASE_URL (p.ej. postgres://postgres:PASS@localhost:5432/postgres)}"

cd "$RAIZ"

if command -v supabase >/dev/null 2>&1; then
	echo "==> supabase db push (CLI) contra la base local…"
	supabase db push --db-url "$DATABASE_URL"
	echo "Migraciones al día (schema_migrations)."
	exit 0
fi

echo "==> CLI de supabase no encontrada; aplicando con psql (loop idempotente)…"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c \
	"create schema if not exists supabase_migrations;
	 create table if not exists supabase_migrations.schema_migrations (version text primary key, inserted_at timestamptz default now());"

aplicadas=0
for f in supabase/migrations/*.sql; do
	version="$(basename "$f" .sql | cut -d_ -f1)"
	ya="$(psql "$DATABASE_URL" -tAc "select 1 from supabase_migrations.schema_migrations where version = '$version'")"
	if [ "$ya" = "1" ]; then
		continue
	fi
	echo "==> $(basename "$f")"
	# Cada migración en UNA transacción; si una falla, se detiene todo.
	psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q --single-transaction -f "$f"
	psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c \
		"insert into supabase_migrations.schema_migrations(version) values ('$version') on conflict do nothing"
	aplicadas=$((aplicadas + 1))
done

total="$(ls supabase/migrations/*.sql | wc -l | tr -d ' ')"
filas="$(psql "$DATABASE_URL" -tAc 'select count(*) from supabase_migrations.schema_migrations')"
echo
echo "Aplicadas ahora: $aplicadas · Archivos: $total · Filas en schema_migrations: $filas"
echo "(El conteo archivos↔filas debe cuadrar — invariante del repo, CLAUDE.md.)"
