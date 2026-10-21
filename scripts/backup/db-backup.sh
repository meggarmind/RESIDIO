#!/usr/bin/env bash
# Dump one Supabase database, encrypt it with age, upload to R2, keep 30 daily + 12 monthly (#415).
#
# Usage: db-backup.sh <prod|stage>
# Env:   DB_URL (session pooler, port 5432), BACKUP_AGE_PUBLIC_KEY, plus the R2_* variables.
#
# Nothing here prints the connection string, the dump or the keys. `set +x` is explicit so a
# debug-enabled runner cannot trace secrets into the log.
set -euo pipefail
set +x

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/backup/r2-env.sh
. "${here}/r2-env.sh"
# shellcheck source=scripts/backup/retention.sh
. "${here}/retention.sh"

env_name="${1:-}"
case "$env_name" in
  prod | stage) ;;
  *)
    echo "::error::usage: db-backup.sh <prod|stage>"
    exit 2
    ;;
esac

require_env DB_URL BACKUP_AGE_PUBLIC_KEY

KEEP_DAILY="${KEEP_DAILY:-30}"
KEEP_MONTHLY="${KEEP_MONTHLY:-12}"

day="$(date -u +%Y-%m-%d)"
month="$(date -u +%Y-%m)"
base="R2:${R2_BUCKET}/db/${env_name}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

dump="${work}/${day}.dump"
enc="${dump}.age"

echo "Dumping ${env_name} database (pg_dump -Fc, PostgreSQL 17 client)"
pg_dump --format=custom --no-password --dbname="$DB_URL" --file="$dump"

if [ ! -s "$dump" ]; then
  echo "::error::pg_dump produced an empty file"
  exit 1
fi
# Cheap integrity check: the archive's table of contents must be readable and non-empty.
if [ "$(pg_restore --list "$dump" | grep -vc '^;')" -lt 1 ]; then
  echo "::error::dump archive has no entries"
  exit 1
fi

age --recipient "$BACKUP_AGE_PUBLIC_KEY" --output "$enc" "$dump"
# Plaintext leaves the disk as soon as the encrypted copy exists.
rm -f "$dump"
if [ ! -s "$enc" ]; then
  echo "::error::encrypted file is empty"
  exit 1
fi
size="$(stat -c %s "$enc")"
echo "Encrypted dump: ${size} bytes"

echo "Uploading to daily/${day}.dump.age"
rclone copyto "$enc" "${base}/daily/${day}.dump.age"

# rclone verifies on upload; also confirm the stored object has the size we sent.
remote_size="$(rclone size --json "${base}/daily/${day}.dump.age" | sed -n 's/.*"bytes":\([0-9]*\).*/\1/p')"
if [ "$remote_size" != "$size" ]; then
  echo "::error::uploaded size (${remote_size}) differs from local size (${size})"
  exit 1
fi

# First successful backup of the month becomes the monthly copy (the 1st for nightly prod;
# the first weekly run of the month for stage). Server-side copy, nothing is re-uploaded.
existing_monthly="$(rclone lsf "${base}/monthly/" --files-only)"
if ! grep -qx "${month}.dump.age" <<<"$existing_monthly"; then
  echo "Copying to monthly/${month}.dump.age"
  rclone copyto "${base}/daily/${day}.dump.age" "${base}/monthly/${month}.dump.age"
fi

# Prune last, and only after everything above succeeded. Keeps the newest N by name
# (names sort chronologically), so a gap in runs never deletes more than intended.
prune() {
  local prefix="$1" keep="$2" files=() f
  mapfile -t files < <(rclone lsf "${base}/${prefix}/" --files-only | sort)
  local total="${#files[@]}"
  if [ "$total" -le "$keep" ]; then
    echo "${prefix}: ${total} kept, nothing to prune"
    return 0
  fi
  for f in "${files[@]:0:$((total - keep))}"; do
    echo "${prefix}: pruning ${f}"
    rclone deletefile "${base}/${prefix}/${f}"
  done
}
prune daily "$KEEP_DAILY"
prune monthly "$KEEP_MONTHLY"

# Last, so a full bucket fails the job (GitHub emails the owner) without losing today's backup.
check_bucket_size

echo "Backup of ${env_name} complete"
