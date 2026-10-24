#!/usr/bin/env node
/**
 * Deploy the OLD `residio-stage` Coolify application (Dockerfile build pack, secret
 * COOLIFY_APP_UUID_STAGE) from the dev machine.
 *
 *   npm run deploy:stage
 *
 * WARNING: the old app is stopped, and running this starts it again.
 *
 * It exists only for the rollback window after #1114 (until about 2026-10-31). Stage is
 * normally `residio-stage-image`, deployed by .github/workflows/stage-image.yml on every push
 * to `stage`. coolify-version.yml no longer pins a commit, so this builds whatever
 * `git_commit_sha` was last pinned on the old app. Prod is deployed by hand in Coolify after
 * its migrations are applied (CORE.md §11), and this script has no Prod path.
 *
 * Same endpoint and headers as scripts/coolify-version.mjs (POST /api/v1/deploy, Coolify
 * bearer token plus the Cloudflare Access service-token pair, redirects not followed). Reads
 * the secrets from the shell environment only, never from a file:
 *
 *   COOLIFY_BASE_URL  COOLIFY_API_TOKEN  CF_ACCESS_CLIENT_ID  CF_ACCESS_CLIENT_SECRET
 *   COOLIFY_APP_UUID_STAGE
 *
 * Secret values are never printed.
 */

import { buildHeaders } from './coolify-version.mjs';

const env = process.env;
// The old residio-stage application (stopped since #1114; Stage runs as residio-stage-image,
// deployed by CI). Kept for rollback only. coolify-version.mjs no longer has a staging target.
const uuidSecret = 'COOLIFY_APP_UUID_STAGE';
const missing = ['COOLIFY_BASE_URL', 'COOLIFY_API_TOKEN', 'CF_ACCESS_CLIENT_ID', 'CF_ACCESS_CLIENT_SECRET', uuidSecret].filter(
  (k) => !env[k],
);
if (missing.length) {
  console.error(`Missing environment variables: ${missing.join(', ')}`);
  process.exit(2);
}

const url = new URL('/api/v1/deploy', env.COOLIFY_BASE_URL);
url.searchParams.set('uuid', env[uuidSecret]);
url.searchParams.set('force', 'false');

const res = await fetch(url, { method: 'POST', headers: buildHeaders(env), redirect: 'manual' });
if (!res.ok) {
  // Status only: an error page may echo headers.
  console.error(`POST /api/v1/deploy failed: HTTP ${res.status}`);
  process.exit(1);
}
const body = await res.json().catch(() => ({}));
console.log(`Stage deploy queued: ${(body.deployments ?? []).length} deployment(s). Watch progress in Coolify.`);
