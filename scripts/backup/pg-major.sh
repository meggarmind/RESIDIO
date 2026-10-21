#!/usr/bin/env bash
# Fail unless the given `pg_dump --version` line reports PostgreSQL major version $2 (#954).
# Usage: require_pg_major "<version line>" 17
require_pg_major() {
  local line="$1" want="$2" got
  got="$(sed -nE 's/^pg_dump \(PostgreSQL\) ([0-9]+).*/\1/p' <<<"$line")"
  if [ "$got" != "$want" ]; then
    echo "pg_dump must be PostgreSQL ${want}, but reports: ${line:-<none>} (is ${PG_BIN:-/usr/lib/postgresql/${want}/bin} first on PATH?)" >&2
    return 1
  fi
}
