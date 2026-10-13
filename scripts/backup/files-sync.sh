#!/usr/bin/env bash
# Incrementally mirror Supabase Storage into an rclone `crypt` remote on R2 (#415).
# Changed or deleted files are moved into a dated folder instead of being lost.
#
# Usage: files-sync.sh <prod|stage>
# Env:   STORAGE_S3_ENDPOINT, STORAGE_S3_REGION, STORAGE_S3_ACCESS_KEY_ID,
#        STORAGE_S3_SECRET_ACCESS_KEY, FILES_CRYPT_PASSWORD, FILES_CRYPT_PASSWORD2, R2_*.
set -euo pipefail
set +x

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/backup/r2-env.sh
. "${here}/r2-env.sh"

env_name="${1:-}"
case "$env_name" in
  prod | stage) ;;
  *)
    echo "::error::usage: files-sync.sh <prod|stage>"
    exit 2
    ;;
esac

require_env STORAGE_S3_ENDPOINT STORAGE_S3_REGION STORAGE_S3_ACCESS_KEY_ID \
  STORAGE_S3_SECRET_ACCESS_KEY FILES_CRYPT_PASSWORD FILES_CRYPT_PASSWORD2

# Source: Supabase's S3-compatible endpoint. Each bucket is a top-level directory.
export RCLONE_CONFIG_SUPA_TYPE=s3
export RCLONE_CONFIG_SUPA_PROVIDER=Other
export RCLONE_CONFIG_SUPA_ENDPOINT="$STORAGE_S3_ENDPOINT"
export RCLONE_CONFIG_SUPA_REGION="$STORAGE_S3_REGION"
export RCLONE_CONFIG_SUPA_ACCESS_KEY_ID="$STORAGE_S3_ACCESS_KEY_ID"
export RCLONE_CONFIG_SUPA_SECRET_ACCESS_KEY="$STORAGE_S3_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_SUPA_NO_CHECK_BUCKET=true

# Destination: crypt over R2. rclone requires crypt passwords in obscured form; mask the
# derived values so they cannot appear in the log.
pw1="$(rclone obscure "$FILES_CRYPT_PASSWORD")"
pw2="$(rclone obscure "$FILES_CRYPT_PASSWORD2")"
echo "::add-mask::${pw1}"
echo "::add-mask::${pw2}"
export RCLONE_CONFIG_FILESCRYPT_TYPE=crypt
export RCLONE_CONFIG_FILESCRYPT_REMOTE="R2:${R2_BUCKET}/files/${env_name}"
export RCLONE_CONFIG_FILESCRYPT_PASSWORD="$pw1"
export RCLONE_CONFIG_FILESCRYPT_PASSWORD2="$pw2"

day="$(date -u +%Y-%m-%d)"

# Fail loudly if the source cannot be listed (bad key, wrong endpoint) rather than
# discovering it from an empty mirror.
rclone lsd SUPA: >/dev/null

echo "Syncing ${env_name} storage into encrypted mirror (changes kept in deleted/${day})"
rclone sync SUPA: FILESCRYPT:current \
  --backup-dir "FILESCRYPT:deleted/${day}" \
  --transfers 4 \
  --stats-one-line --stats 30s

echo "Storage mirror of ${env_name} complete"
