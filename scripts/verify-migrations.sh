#!/usr/bin/env bash
#
# Run every migration against a throwaway Postgres, then assert what they do.
#
# Until this existed, a migration was verified by the owner running it on the
# live database and seeing whether the shop still worked. That is a bad place
# to find out about a typo, and a worse one to find out that a security trigger
# does not fire. This needs no Supabase project and no network: it stubs the
# handful of Supabase objects the migrations touch (auth.uid(), the roles, the
# realtime publication, the storage tables) and throws the database away after.
#
# Needs a local postgres server binary — the Debian/Ubuntu `postgresql` package.
# Nothing else.
#
#   ./scripts/verify-migrations.sh
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
PORT="${PGPORT:-5433}"
SOCK="${PGSOCK:-/tmp}"

BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
if [ -n "$BIN" ]; then export PATH="$BIN:$PATH"; fi
command -v initdb >/dev/null || { echo "No postgres server found. Install the postgresql package."; exit 1; }

# initdb refuses to run as root, which is how CI and most containers run. A
# throwaway data directory owned by the postgres user is the least surprising
# way through that.
AS=""
DATA="${PGDATA_DIR:-}"
if [ "$(id -u)" = "0" ]; then
  AS="postgres"
  DATA="${DATA:-/var/lib/postgresql/migration-check}"
  id -u postgres >/dev/null 2>&1 || { echo "Running as root but there is no postgres user."; exit 1; }
else
  DATA="${DATA:-$(mktemp -d)/pg}"
fi

run() { if [ -n "$AS" ]; then su "$AS" -c "export PATH='$PATH'; $1"; else bash -c "$1"; fi; }

cleanup() {
  run "pg_ctl -D '$DATA' stop -m immediate" >/dev/null 2>&1 || true
  rm -rf "$DATA"
}
trap cleanup EXIT

rm -rf "$DATA"; mkdir -p "$DATA"
[ -n "$AS" ] && chown "$AS" "$DATA"

echo "▸ starting a throwaway postgres on $PORT"
run "initdb -D '$DATA' -U postgres --auth=trust" >/dev/null
run "pg_ctl -D '$DATA' -o '-p $PORT -k $SOCK' -l '$DATA/log' start" >/dev/null
for _ in $(seq 1 20); do
  psql -h "$SOCK" -p "$PORT" -U postgres -tAc 'select 1' >/dev/null 2>&1 && break
  sleep 0.5
done

psql -h "$SOCK" -p "$PORT" -U postgres -q -c 'create database pepperpan'
PSQL="psql -h $SOCK -p $PORT -U postgres -d pepperpan -v ON_ERROR_STOP=1 -q"

echo "▸ stubbing the Supabase objects the migrations touch"
$PSQL -f "$HERE/migration-check/00-supabase-stub.sql" 2>&1 | grep -v 'wal_level\|HINT' || true

echo "▸ running every migration, in order"
for f in "$ROOT"/supabase/migrations/*.sql; do
  printf '  %s ' "$(basename "$f")"
  if $PSQL -f "$f" >/dev/null 2>"$DATA/err"; then echo "ok"; else
    echo "FAILED"; grep -i error "$DATA/err" | head -5; exit 1
  fi
done

echo "▸ asserting what they do"
psql -h "$SOCK" -p "$PORT" -U postgres -d pepperpan -v ON_ERROR_STOP=1 \
  -f "$HERE/migration-check/01-behaviour.sql" 2>&1 | grep -Ev '^\s*$|^(INSERT|UPDATE|DO|CREATE|SELECT) '

echo
echo "✓ all migrations ran and every behaviour check held"
