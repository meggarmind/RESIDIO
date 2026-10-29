#!/usr/bin/env bash
# Back up the WAHA session volume (WhatsApp link) to R2, age-encrypted, 30 daily + 12 monthly (#1337).
# Runs on the KVM from the claude user's crontab: CI runners cannot reach the volume.
#
# Usage: waha-sessions-backup.sh <stage|prod>
# Env file: ${WAHA_BACKUP_ENV_FILE:-$HOME/.config/residio-backup/waha-<env>.env}, mode 600, holding
#           the R2_* variables and BACKUP_AGE_PUBLIC_KEY (never committed).
# Other env: WAHA_APP_UUID (override; required for prod until its app exists), KEEP_DAILY,
#           KEEP_MONTHLY, WAHA_BACKUP_DISCORD_WEBHOOK_FILE (default ~/.config/waha-watch/discord-webhook).
#
# The tar stream goes straight into age: no plaintext archive ever touches disk. Nothing here
# prints secrets, the env file or the webhook URL; `set +x` is explicit so a traced shell cannot.
set -euo pipefail
set +x

export PATH="${HOME}/.local/bin:${PATH}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

env_name="${1:-}"
case "$env_name" in
  prod | stage) ;;
  *)
    echo "error: usage: waha-sessions-backup.sh <stage|prod>" >&2
    exit 2
    ;;
esac

work=""
step="starting"
webhook_file="${WAHA_BACKUP_DISCORD_WEBHOOK_FILE:-${HOME}/.config/waha-watch/discord-webhook}"

# Post exactly one Discord message on a non-zero exit. The URL reaches curl through a --config
# file descriptor, so it is never in argv (visible in ps) or in any log.
notify_failure() {
  local url body
  if [ ! -r "$webhook_file" ]; then
    echo "no Discord webhook file; failure not posted"
    return 0
  fi
  url="$(tr -d '[:space:]' <"$webhook_file")"
  if [ -z "$url" ]; then
    echo "Discord webhook file is empty; failure not posted"
    return 0
  fi
  body="$(python3 -I -c 'import json,sys; print(json.dumps({"content": "WAHA %s backup failed: %s" % (sys.argv[1], sys.argv[2])}))' "$env_name" "$step")" ||
    body='{"content":"WAHA backup failed"}'
  if curl -fsS -m 20 -H 'Content-Type: application/json' -d "$body" \
    --config <(printf 'url = "%s"\n' "$url") >/dev/null; then
    echo "failure posted to Discord"
  else
    echo "could not post failure to Discord"
  fi
}

on_exit() {
  local rc=$?
  trap - EXIT
  [ -z "$work" ] || rm -rf "$work"
  if [ "$rc" -ne 0 ]; then
    echo "error: WAHA ${env_name} backup failed at: ${step}" >&2
    notify_failure || true
  fi
  exit "$rc"
}
trap on_exit EXIT

step="reading the env file"
env_file="${WAHA_BACKUP_ENV_FILE:-${HOME}/.config/residio-backup/waha-${env_name}.env}"
if [ ! -f "$env_file" ]; then
  echo "error: env file not found: ${env_file}" >&2
  exit 1
fi
mode="$(stat -c %a "$env_file")"
if [ $((8#$mode & 8#177)) -ne 0 ]; then
  echo "error: ${env_file} has mode ${mode}; it must be 600 or tighter" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
. "$env_file"
set +a
# shellcheck source=scripts/backup/r2-env.sh
. "${here}/r2-env.sh"
require_env BACKUP_AGE_PUBLIC_KEY

KEEP_DAILY="${KEEP_DAILY:-30}"
KEEP_MONTHLY="${KEEP_MONTHLY:-12}"

step="resolving the WAHA app"
uuid="${WAHA_APP_UUID:-}"
if [ -z "$uuid" ]; then
  case "$env_name" in
    stage) uuid="kcaayyjlk7mxojspks56ziwe" ;;
    prod)
      echo "error: no prod WAHA app yet; set WAHA_APP_UUID to its Coolify app uuid" >&2
      exit 1
      ;;
  esac
fi

step="finding the WAHA container"
container="$(docker ps --filter "name=^${uuid}-" --format '{{.Names}}' | head -1)"
if [ -z "$container" ]; then
  echo "error: no running container for app ${uuid}" >&2
  exit 1
fi

day="$(date -u +%Y-%m-%d)"
month="$(date -u +%Y-%m)"
base="R2:${R2_BUCKET}/waha/${env_name}"
work="$(mktemp -d)"
enc="${work}/${day}.tar.gz.age"

step="archiving and encrypting the session volume"
echo "Archiving .sessions from ${container}"
# pipefail makes a tar failure fail the run even though age exits 0 on a short stream.
docker exec "$container" tar -C /app -czf - .sessions |
  age --recipient "$BACKUP_AGE_PUBLIC_KEY" --output "$enc"
if [ ! -s "$enc" ]; then
  echo "error: encrypted archive is empty" >&2
  exit 1
fi
size="$(stat -c %s "$enc")"
echo "Encrypted archive: ${size} bytes"

step="uploading to R2"
echo "Uploading to daily/${day}.tar.gz.age"
rclone copyto "$enc" "${base}/daily/${day}.tar.gz.age"

step="verifying the uploaded size"
remote_size="$(rclone size --json "${base}/daily/${day}.tar.gz.age" | sed -n 's/.*"bytes":\([0-9]*\).*/\1/p')"
if [ "$remote_size" != "$size" ]; then
  echo "error: uploaded size (${remote_size:-none}) differs from local size (${size})" >&2
  exit 1
fi

step="writing the monthly copy"
existing_monthly="$(rclone lsf "${base}/monthly/" --files-only 2>/dev/null || true)"
if ! grep -qx "${month}.tar.gz.age" <<<"$existing_monthly"; then
  echo "Copying to monthly/${month}.tar.gz.age"
  rclone copyto "${base}/daily/${day}.tar.gz.age" "${base}/monthly/${month}.tar.gz.age"
fi

# Same newest-N-by-name prune as db-backup.sh (names sort chronologically); duplicated here
# because that script's copy is a function nested in its main flow and must stay untouched.
step="pruning old backups"
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

step="done"
echo "WAHA ${env_name} session backup complete"
