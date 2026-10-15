#!/usr/bin/env bash
# Sourced by the backup scripts. Defines the rclone remote "R2" from environment variables
# (no rclone config file exists anywhere). Requires R2_ENDPOINT, R2_ACCESS_KEY_ID,
# R2_SECRET_ACCESS_KEY and R2_BUCKET.

require_env() {
  local name
  for name in "$@"; do
    if [ -z "${!name:-}" ]; then
      echo "::error::Required secret ${name} is not set"
      exit 1
    fi
  done
}

require_env R2_ENDPOINT R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET

export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_R2_ENDPOINT="$R2_ENDPOINT"
# The API token is scoped to object read/write, which cannot create buckets.
export RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true
# No config file: every remote comes from the environment.
export RCLONE_CONFIG=/dev/null
