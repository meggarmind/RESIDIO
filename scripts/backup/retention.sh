#!/usr/bin/env bash
# Sourced by the backup scripts (#963). Needs r2-env.sh sourced first (for R2_BUCKET) and `node` on PATH.
# The decisions (which folders are old, whether the bucket is too big) live in retention.mjs.

retention_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Purge dated folders under FILESCRYPT:deleted older than DELETED_KEEP_DAYS (default 30).
# Names are listed through the crypt remote, so they are the decrypted YYYY-MM-DD names.
purge_old_deleted() {
  local rc=0 listing expired day
  listing="$(rclone lsd FILESCRYPT:deleted)" || rc=$?
  # rclone exits 3 when the directory does not exist: nothing has been moved there yet.
  if [ "$rc" -eq 3 ]; then
    echo "deleted/: nothing to prune"
    return 0
  elif [ "$rc" -ne 0 ]; then
    return "$rc"
  fi
  expired="$(node "${retention_dir}/retention.mjs" expired "${DELETED_KEEP_DAYS:-30}" <<<"$listing")"
  if [ -z "$expired" ]; then
    echo "deleted/: nothing older than ${DELETED_KEEP_DAYS:-30} days"
    return 0
  fi
  while IFS= read -r day; do
    echo "deleted/: purging ${day}"
    rclone purge "FILESCRYPT:deleted/${day}"
  done <<<"$expired"
}

# Print the whole bucket's size; warn above 7 GB, fail the job above 8.5 GB (10 GB free tier).
check_bucket_size() {
  rclone size "R2:${R2_BUCKET}" --json | node "${retention_dir}/retention.mjs" size
}
