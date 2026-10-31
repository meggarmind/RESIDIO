#!/usr/bin/env bash
# Install pinned rclone and age into ~/.local/bin with no sudo (#1337), for hosts that are not
# CI runners (the KVM). Mirrors install-tools.sh: same rclone release, verified against the
# published SHA256SUMS. age publishes no checksum list, so its sha256 is pinned below.
# Idempotent: a tool already at the pinned version is skipped. No secrets are used here.
set -euo pipefail
set +x

RCLONE_VERSION="v1.68.2"
AGE_VERSION="v1.2.1"
# sha256 of age-v1.2.1-linux-amd64.tar.gz, computed from the release download (29 Oct 2026).
AGE_SHA256="7df45a6cc87d4da11cc03a539a7470c15b1041ab2b396af088fe9990f7c79d50"

bin="${HOME}/.local/bin"
mkdir -p "$bin"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

if [ "$("${bin}/rclone" --version 2>/dev/null | head -n 1)" = "rclone ${RCLONE_VERSION}" ]; then
  echo "rclone ${RCLONE_VERSION} already installed"
else
  zip="rclone-${RCLONE_VERSION}-linux-amd64.zip"
  curl -fsSL -o "${tmp}/${zip}" "https://downloads.rclone.org/${RCLONE_VERSION}/${zip}"
  curl -fsSL -o "${tmp}/SHA256SUMS" "https://downloads.rclone.org/${RCLONE_VERSION}/SHA256SUMS"
  (cd "$tmp" && grep " ${zip}\$" SHA256SUMS | sha256sum -c -)
  # unzip is not installed on the KVM; python3 reads zip files (-I: isolated mode).
  (cd "$tmp" && python3 -I -m zipfile -e "$zip" .)
  install -m 0755 "${tmp}/rclone-${RCLONE_VERSION}-linux-amd64/rclone" "${bin}/rclone"
fi

if [ "$("${bin}/age" --version 2>/dev/null | head -n 1)" = "${AGE_VERSION}" ]; then
  echo "age ${AGE_VERSION} already installed"
else
  tgz="age-${AGE_VERSION}-linux-amd64.tar.gz"
  curl -fsSL -o "${tmp}/${tgz}" "https://github.com/FiloSottile/age/releases/download/${AGE_VERSION}/${tgz}"
  echo "${AGE_SHA256}  ${tmp}/${tgz}" | sha256sum -c -
  tar -xzf "${tmp}/${tgz}" -C "$tmp" age/age
  install -m 0755 "${tmp}/age/age" "${bin}/age"
fi

"${bin}/rclone" --version | head -n 1
"${bin}/age" --version
