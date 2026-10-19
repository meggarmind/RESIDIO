#!/usr/bin/env node
/**
 * Deploy Residio_Stage's Coolify application from the dev machine, without opening the
 * Coolify dashboard.
 *
 *   npm run deploy:stage
 *
 * Stage only. Prod is deployed by hand in Coolify after its migrations are applied
 * (CORE.md §11), and this script has no Prod path.
 *
 * Same endpoint, headers and secrets as scripts/coolify-version.mjs (POST /api/v1/deploy,
 * Coolify bearer token plus the Cloudflare Access service-token pair, redirects not followed).
 * Builds the commit CI pinned on the last push to `stage`. Reads the secrets from the shell
 * environment only, never from a file:
 *
 *   COOLIFY_BASE_URL  COOLIFY_API_TOKEN  CF_ACCESS_CLIENT_ID  CF_ACCESS_CLIENT_SECRET
 *   COOLIFY_APP_UUID_STAGE
 *
 * Secret values are never printed.
 */

import { buildHeaders, TARGETS } from './coolify-version.mjs';

const env = process.env;
const uuidSecret = TARGETS.staging.uuidSecret;
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
