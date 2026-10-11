#!/usr/bin/env node
/**
 * Coolify build-version writer (#421, slice B).
 *
 * The app shows which build is running from three build-time variables (#421 slice A):
 *
 *   NEXT_PUBLIC_APP_VERSION  `git describe --tags --match 'v*'` on the deployed commit:
 *                            `v0.5.0` on a release tag, `v0.5.0-3-gabc1234` on Stage, or
 *                            `v0.0.0-<shortsha>` when no tag is reachable. Never empty.
 *   NEXT_PUBLIC_GIT_SHA      the full commit SHA
 *   NEXT_PUBLIC_APP_ENV      `staging` | `production`
 *
 * The Docker build cannot work these out itself (`.dockerignore` excludes `.git`), so
 * `.github/workflows/coolify-version.yml` runs this script to write them into the Coolify
 * application's build variables (owner decision on #421, option (a)):
 *
 *   staging     residio-stage: set the variables, then trigger a deploy. Stage's Coolify
 *               auto-deploy is switched off, so this script is what builds Stage.
 *   production  residio-prod: set the variables ONLY. Prod is never deployed from CI; the
 *               owner deploys it by hand after migrations (CORE.md §11,
 *               docs/deployment/hosting-plan.md:226), and that build picks the values up.
 *
 * Coolify API (Coolify v4; verified against the v4.x branch and the v4.0.0 / v4.4.0 /
 * v4.4.6 tags of coollabsio/coolify: routes/api.php, ApplicationsController::create_bulk_envs,
 * DeployController::deploy; reference pages:
 * https://coolify.io/docs/api-reference/api/operations/update-envs-by-application-uuid and
 * https://coolify.io/docs/api-reference/api/operations/deploy-by-tag-or-uuid):
 *
 *   PATCH /api/v1/applications/{uuid}/envs/bulk   body { data: [{ key, value, is_buildtime,
 *         is_runtime, is_preview, is_literal, is_multiline, is_shown_once }] }  -> 201.
 *         Upserts by key: updates the variable when it exists, creates it when it does not,
 *         so a re-run is idempotent. The build-time flag is `is_buildtime` (older betas
 *         called it `is_build_time`). Every flag is sent explicitly, because the update path
 *         copies an omitted `is_multiline` / `is_shown_once` through as null.
 *   POST  /api/v1/deploy?uuid={uuid}&force=false  -> 200. Since v4.4.0 `GET /deploy` answers
 *         405 "This endpoint has changed to a POST request"; v4.0.0 accepts GET or POST, so
 *         POST works on every v4 release.
 *
 * The API sits behind Cloudflare Access (owner decision on #421), so every request carries
 * the Coolify bearer token AND the Access service-token pair. Redirects are not followed: a
 * rejected service token gets a 302 to the Access login page, which must fail, not pass.
 *
 * Usage (the workflow sets these):
 *   TARGET_ENV=staging GIT_SHA=<sha> COOLIFY_BASE_URL=... COOLIFY_API_TOKEN=... \
 *   CF_ACCESS_CLIENT_ID=... CF_ACCESS_CLIENT_SECRET=... COOLIFY_APP_UUID_STAGE=... \
 *   node scripts/coolify-version.mjs
 *
 * Exits 0 with a `::notice::` naming the missing secrets (names only) when the target is not
 * configured yet, so setup in progress never turns the workflow red. Once configured, any
 * non-2xx response fails the run with the method, the path and the status code. Response
 * bodies and secret values are never logged.
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The secrets every target needs, whatever the environment. */
export const SHARED_SECRETS = [
  'COOLIFY_BASE_URL',
  'COOLIFY_API_TOKEN',
  'CF_ACCESS_CLIENT_ID',
  'CF_ACCESS_CLIENT_SECRET',
];

/**
 * The two Coolify applications. `deploy` is the only place a deploy is decided, and it is
 * false for production by design: Prod is deployed by hand.
 */
export const TARGETS = {
  staging: { appEnv: 'staging', uuidSecret: 'COOLIFY_APP_UUID_STAGE', deploy: true },
  production: { appEnv: 'production', uuidSecret: 'COOLIFY_APP_UUID_PROD', deploy: false },
};

/** The target for a `TARGET_ENV` value; throws on anything else rather than guessing. */
export function targetFor(name) {
  const target = TARGETS[name];
  if (!target) {
    throw new Error(`Unknown TARGET_ENV "${name}"; expected one of ${Object.keys(TARGETS).join(', ')}`);
  }
  return target;
}

/** The secret names this target needs. */
export function requiredSecrets(target) {
  return [...SHARED_SECRETS, target.uuidSecret];
}

/**
 * Whether to skip, and why: `{ skip, missing }` where `missing` lists the NAMES of the
 * required secrets that are unset or blank. Values are never returned.
 */
export function decideSkip(target, env) {
  const missing = requiredSecrets(target).filter((name) => !String(env[name] ?? '').trim());
  return { skip: missing.length > 0, missing };
}

/**
 * The version string for a commit. `describe` is `git describe --tags --match 'v*'` output,
 * or empty when no tag is reachable; the fallback keeps the version non-empty and still
 * names the commit.
 */
export function resolveVersion({ describe, sha }) {
  const described = String(describe ?? '').trim();
  if (described) return described;
  const short = String(sha ?? '').trim().slice(0, 7);
  if (!short) throw new Error('No tag is reachable and no commit SHA was given');
  return `v0.0.0-${short}`;
}

/** The three build variables, as Coolify's bulk endpoint takes them. */
export function envPayload({ version, sha, appEnv }) {
  const variable = (key, value) => ({
    key,
    value,
    is_buildtime: true,
    // Also available at runtime, Coolify's default, so a server route can read them too.
    is_runtime: true,
    is_preview: false,
    // Literal: Coolify must not interpolate or escape anything in the value.
    is_literal: true,
    is_multiline: false,
    is_shown_once: false,
  });
  return {
    data: [
      variable('NEXT_PUBLIC_APP_VERSION', version),
      variable('NEXT_PUBLIC_GIT_SHA', sha),
      variable('NEXT_PUBLIC_APP_ENV', appEnv),
    ],
  };
}

/** The headers every request sends: the Coolify token plus the Cloudflare Access pair. */
export function buildHeaders(env) {
  return {
    Authorization: `Bearer ${env.COOLIFY_API_TOKEN}`,
    'CF-Access-Client-Id': env.CF_ACCESS_CLIENT_ID,
    'CF-Access-Client-Secret': env.CF_ACCESS_CLIENT_SECRET,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

/**
 * The requests to make, in order, pure: `[{ method, path, body? }]`. Staging ends with the
 * deploy trigger; production never contains one.
 */
export function planRequests({ target, appUuid, version, sha }) {
  const uuid = encodeURIComponent(appUuid);
  const plan = [
    {
      method: 'PATCH',
      path: `/api/v1/applications/${uuid}/envs/bulk`,
      body: envPayload({ version, sha, appEnv: target.appEnv }),
    },
  ];
  if (target.deploy) {
    plan.push({ method: 'POST', path: `/api/v1/deploy?uuid=${uuid}&force=false` });
  }
  return plan;
}

/** The fetch options for one planned request. Redirects are an error, never followed. */
export function requestInit(request, headers) {
  return {
    method: request.method,
    headers,
    redirect: 'manual',
    ...(request.body ? { body: JSON.stringify(request.body) } : {}),
  };
}

/**
 * `text` with every secret value replaced by `***`. Longest first, so a value containing
 * another is replaced whole. Blank values are ignored (replacing '' would mangle the text).
 */
export function redact(text, secretValues) {
  const values = [...new Set(secretValues.map((value) => String(value ?? '')).filter((value) => value.trim()))]
    .sort((a, b) => b.length - a.length);
  let out = String(text);
  for (const value of values) {
    out = out.split(value).join('***');
  }
  return out;
}

/** `https://host` with no trailing slash; throws on anything that is not https. */
export function normalizeBaseUrl(raw) {
  const trimmed = String(raw ?? '').trim().replace(/\/+$/, '');
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('COOLIFY_BASE_URL is not a valid URL');
  }
  if (url.protocol !== 'https:') throw new Error('COOLIFY_BASE_URL must use https');
  return trimmed;
}

function gitDescribe(sha) {
  try {
    return execFileSync('git', ['describe', '--tags', '--match', 'v*', sha], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    // No reachable v* tag: resolveVersion falls back to v0.0.0-<shortsha>.
    return '';
  }
}

async function main() {
  const env = process.env;
  const target = targetFor(env.TARGET_ENV ?? '');

  const { skip, missing } = decideSkip(target, env);
  if (skip) {
    console.log(
      `::notice::Coolify version update skipped for ${target.appEnv}: missing secret(s) ${missing.join(', ')}. ` +
        'See docs/agents/branching.md (Build version variables).',
    );
    return;
  }

  const secretValues = requiredSecrets(target).map((name) => env[name]);
  if (env.GITHUB_ACTIONS === 'true') {
    for (const value of secretValues) console.log(`::add-mask::${value}`);
  }

  const sha = (env.GIT_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' })).trim();
  const version = resolveVersion({ describe: gitDescribe(sha), sha });
  const baseUrl = normalizeBaseUrl(env.COOLIFY_BASE_URL);
  const headers = buildHeaders(env);
  const plan = planRequests({ target, appUuid: env[target.uuidSecret].trim(), version, sha });

  console.log(`Build version for ${target.appEnv}: ${version} (${sha})`);
  for (const request of plan) {
    const shown = `${request.method} ${redact(request.path, secretValues)}`;
    let response;
    try {
      response = await fetch(`${baseUrl}${request.path}`, {
        ...requestInit(request, headers),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      throw new Error(`${shown} failed before a response (${redact(error.name ?? 'Error', secretValues)})`);
    }
    // The body is deliberately never read into the log: an error page may echo headers.
    if (response.status < 200 || response.status > 299) {
      throw new Error(`${shown} returned HTTP ${response.status}`);
    }
    console.log(`${shown} -> HTTP ${response.status}`);
  }

  const action = target.deploy ? 'variables set and deploy triggered' : 'variables set; no deploy (Prod is deployed by hand)';
  console.log(`Coolify ${target.appEnv}: ${action}.`);
  if (env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      env.GITHUB_STEP_SUMMARY,
      `Coolify \`${target.appEnv}\`: \`${version}\` (\`${sha}\`), ${action}.\n`,
    );
  }
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main().catch((error) => {
    console.error(`::error::coolify-version: ${error.message}`);
    process.exitCode = 1;
  });
}
