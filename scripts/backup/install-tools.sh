#!/usr/bin/env bash
# Install the tools the backup workflow needs on an ubuntu GitHub runner (#415):
# a PostgreSQL 17 client (PGDG), age, and a pinned rclone.
# No secrets are used here.
set -euo pipefail
set +x

RCLONE_VERSION="v1.68.2"
PG_BIN=/usr/lib/postgresql/17/bin

# shellcheck source=scripts/backup/pg-major.sh
. "$(dirname "${BASH_SOURCE[0]}")/pg-major.sh"

sudo install -d /usr/share/postgresql-common/pgdg
sudo curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
  https://www.postgresql.org/media/keys/ACCC4CF8.asc
codename="$(. /etc/os-release && echo "$VERSION_CODENAME")"
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${codename}-pgdg main" |
  sudo tee /etc/apt/sources.list.d/pgdg.list >/dev/null

sudo apt-get update -qq
sudo apt-get install -y -qq postgresql-client-17 age

# The runner image ships its own PostgreSQL 16 client first on PATH; put 17 ahead of it (#954).
export PATH="${PG_BIN}:${PATH}"
[ -z "${GITHUB_PATH:-}" ] || echo "$PG_BIN" >> "$GITHUB_PATH"
require_pg_major "$(pg_dump --version)" 17

# rclone: pinned release, verified against the published checksum list.
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
zip="rclone-${RCLONE_VERSION}-linux-amd64.zip"
curl -fsSL -o "${tmp}/${zip}" "https://downloads.rclone.org/${RCLONE_VERSION}/${zip}"
curl -fsSL -o "${tmp}/SHA256SUMS" "https://downloads.rclone.org/${RCLONE_VERSION}/SHA256SUMS"
(cd "$tmp" && grep " ${zip}\$" SHA256SUMS | sha256sum -c -)
(cd "$tmp" && unzip -q "$zip")
sudo install -m 0755 "${tmp}/rclone-${RCLONE_VERSION}-linux-amd64/rclone" /usr/local/bin/rclone

pg_dump --version
age --version
rclone --version | head -n 1
