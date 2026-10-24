#!/usr/bin/env node
/**
 * Coolify build-version writer (#421, slice B).
 *
 * The app shows which build is running from three build-time variables (#421 slice A):
 *
 *   NEXT_PUBLIC_APP_VERSION  the release the deployed commit belongs to (resolveVersion):
 *                            `v0.5.0` on the release tag itself or on the `stage` commit
 *                            that release merged, `v0.5.0-3-gabc1234` three commits further
 *                            along `stage`, or `v0.0.0-<shortsha>` when no tag applies.
 *                            Never empty.
 *   NEXT_PUBLIC_GIT_SHA      the full commit SHA
 *   NEXT_PUBLIC_APP_ENV      `staging` | `production`
 *
 * The Docker build cannot work these out itself (`.dockerignore` excludes `.git`), so
 * `.github/workflows/coolify-version.yml` runs this script to write them into the Coolify
 * application's build variables (owner decision on #421, option (a)):
 *
 *   production  residio-prod: set the variables ONLY. Prod is never deployed from CI; the
 *               owner deploys it by hand after migrations (CORE.md §11,
 *               docs/deployment/hosting-plan.md:226), and that build picks the values up.
 *               DEPLOY=true fails the run.
 *
 * Stage is not handled here since #1114: it deploys from a CI-built GHCR image
 * (.github/workflows/stage-image.yml, scripts/stage-image.mjs), which reuses the shared helpers
 * exported below (resolveVersion, gitQueries, buildHeaders and the rest).
 *
 * Coolify API (Coolify v4; verified against the v4.x branch and the v4.0.0 / v4.4.0 /
 * v4.4.6 tags of coollabsio/coolify: routes/api.php, ApplicationsController::create_bulk_envs
 * and ApplicationsController::update_by_uuid; reference page:
 * https://coolify.io/docs/api-reference/api/operations/update-envs-by-application-uuid):
 *
 *   PATCH /api/v1/applications/{uuid}/envs/bulk   body { data: [{ key, value, is_buildtime,
 *         is_runtime, is_preview, is_literal, is_multiline, is_shown_once }] }  -> 201.
 *         Upserts by key: updates the variable when it exists, creates it when it does not,
 *         so a re-run is idempotent. The build-time flag is `is_buildtime` (older betas
 *         called it `is_build_time`). Every flag is sent explicitly, because the update path
 *         copies an omitted `is_multiline` / `is_shown_once` through as null.
 *
 * The API sits behind Cloudflare Access (owner decision on #421), so every request carries
 * the Coolify bearer token AND the Access service-token pair. Redirects are not followed: a
 * rejected service token gets a 302 to the Access login page, which must fail, not pass.
 *
 * Usage (the workflow sets these):
 *   TARGET_ENV=production GIT_SHA=<sha> COOLIFY_BASE_URL=... COOLIFY_API_TOKEN=... \
 *   CF_ACCESS_CLIENT_ID=... CF_ACCESS_CLIENT_SECRET=... COOLIFY_APP_UUID_PROD=... \
 *   node scripts/coolify-version.mjs
 *
 * Exits 0 with a `::notice::` naming the missing secrets (names only) when the target is not
 * configured yet, so setup in progress never turns the workflow red. Once configured, any
 * non-2xx response (3xx included) fails the run with the method, the path and the status
 * code. Secret values are never logged. No response body is read.
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
 * The Coolify application this script writes to. Only Prod since #1114 (Stage deploys from
 * the CI-built image). Prod is never deployed from CI; the owner deploys it by hand.
 */
export const TARGETS = {
  production: { appEnv: 'production', uuidSecret: 'COOLIFY_APP_UUID_PROD' },
};

/** The target for a `TARGET_ENV` value; throws on anything else rather than guessing. */
export function targetFor(name) {
  // Own keys only: `TARGETS['constructor']` or `['__proto__']` must not count as a target.
  const target = Object.hasOwn(TARGETS, name) ? TARGETS[name] : undefined;
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

/** `[major, minor, patch]` for a strict `vX.Y.Z` tag, or null for anything else. */
export function parseTag(tag) {
  const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(String(tag ?? '').trim());
  return match ? match.slice(1).map(Number) : null;
}

/** Strict `vX.Y.Z` tags only, newest first by semver (never by name or date). */
export function sortTagsNewestFirst(tags) {
  return tags
    .map((tag) => String(tag).trim())
    .filter((tag) => parseTag(tag))
    .sort((a, b) => {
      const [x, y] = [parseTag(a), parseTag(b)];
      return y[0] - x[0] || y[1] - x[1] || y[2] - x[2];
    });
}

/**
 * The version string for a commit (#421; the rule is in the issue's latest comment).
 *
 * Release tags sit on `master`'s release merge commits, which never become ancestors of
 * `stage`, so plain `git describe` on Stage finds an older tag, not the release Stage
 * actually shipped. Instead:
 *
 *   1. An exact `v*` tag on the commit wins (`master`, a release).
 *   2. Otherwise the newest tag T whose own commit (a fast-forward release, #1137) or second
 *      parent T^2 (the `stage` commit a merge-commit release merged) is the commit or an ancestor of it: `T` when the commit IS T^2, otherwise
 *      `T-<n>-g<7-char sha>` with n = `git rev-list --count <that commit>..sha`. A squashed
 *      release or hand-made tag (#1116) has no T^2 and matches through its own commit.
 *   3. Otherwise plain `git describe --tags --match 'v*'`, and failing that
 *      `v0.0.0-<shortsha>`.
 *
 * Pure apart from `git`, an object of small git queries (gitQueries() for real, a fake tag
 * graph in tests): exactTags(sha), tags(), secondParent(tag), isAncestor(a, b),
 * countBetween(a, b), describe(sha). Each returns [] / null / false when git has no answer.
 * `sha` must be the full commit SHA.
 */
export function resolveVersion({ sha, git }) {
  const full = String(sha ?? '').trim();
  if (!full) throw new Error('No commit SHA was given');
  const short = full.slice(0, 7);

  const [exact] = sortTagsNewestFirst(git.exactTags(full) ?? []);
  if (exact) return exact;

  for (const tag of sortTagsNewestFirst(git.tags() ?? [])) {
    // The tag's own commit when stage reached it (a fast-forward release, #1137, which may itself
    // be a merge), else the merged stage commit T^2 of a merge-commit release.
    const merged = [git.tagCommit(tag), git.secondParent(tag)].find(
      (candidate) => candidate && (candidate === full || git.isAncestor(candidate, full)),
    );
    if (!merged) continue;
    const ahead = merged === full ? 0 : Number(git.countBetween(merged, full));
    if (!Number.isInteger(ahead) || ahead < 0) continue;
    return ahead === 0 ? tag : `${tag}-${ahead}-g${short}`;
  }

  const described = String(git.describe(full) ?? '').trim();
  if (described) return described;
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

/** Whether `DEPLOY` asks for a deploy: only the exact string 'true'. */
export function parseDeploy(value) {
  return value === 'true';
}

/**
 * The requests to make, in order, pure: `[{ method, path, body? }]`. One bulk write of the
 * build variables; there is no commit pin and no deploy request.
 */
export function planRequests({ target, appUuid, version, sha }) {
  const uuid = encodeURIComponent(appUuid);
  return [
    {
      method: 'PATCH',
      path: `/api/v1/applications/${uuid}/envs/bulk`,
      body: envPayload({ version, sha, appEnv: target.appEnv }),
    },
  ];
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

/**
 * A response-derived string made safe to log: control characters removed, secrets redacted,
 * at most 200 characters.
 */
export function sanitizeForLog(text, secretValues = []) {
  const clean = String(text ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').trim();
  return redact(clean, secretValues).slice(0, 200);
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

/** Trimmed git stdout, or null when git fails (no such ref, not an ancestor, no tag). */
export function runGit(args, cwd = repoRoot) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * The git queries resolveVersion needs, over `run` (runGit by default). The only place the
 * version rule touches git, so the rule itself is tested against fake tag graphs.
 */
export function gitQueries(run = runGit) {
  const lines = (out) => String(out ?? '').split('\n').map((line) => line.trim()).filter(Boolean);
  return {
    exactTags: (sha) => lines(run(['tag', '--list', 'v*', '--points-at', sha])),
    tags: () => lines(run(['tag', '--list', 'v*'])),
    secondParent: (tag) => run(['rev-parse', '--verify', '--quiet', `refs/tags/${tag}^{commit}^2`]) || null,
    tagCommit: (tag) => run(['rev-parse', '--verify', '--quiet', `refs/tags/${tag}^{commit}`]) || null,
    isAncestor: (ancestor, sha) => run(['merge-base', '--is-ancestor', ancestor, sha]) !== null,
    countBetween: (from, to) => run(['rev-list', '--count', `${from}..${to}`]),
    describe: (sha) => run(['describe', '--tags', '--match', 'v*', sha]),
  };
}

/** The full SHA of `ref`, or null. */
export function resolveSha(ref, run = runGit) {
  return run(['rev-parse', '--verify', '--quiet', `${String(ref || 'HEAD').trim()}^{commit}`]) || null;
}

/**
 * The `::notice::` for an unconfigured target, or null when every secret is set. It names
 * the missing secrets and nothing else: no values, no other environment.
 */
export function skipNotice(target, env) {
  const { skip, missing } = decideSkip(target, env);
  if (!skip) return null;
  return (
    `::notice::Coolify version update skipped for ${target.appEnv}: missing secret(s) ${missing.join(', ')}. ` +
    'See docs/agents/branching.md (Build version variables).'
  );
}

/** The secret values to redact for this target, from the environment. */
export function secretValuesFor(target, env) {
  return requiredSecrets(target).map((name) => String(env[name] ?? ''));
}

/**
 * One `::add-mask::` command per non-blank LINE of each secret value. GitHub masks a single
 * line per command, so a multi-line value masked whole would leak its other lines.
 */
export function maskCommands(secretValues) {
  const lines = secretValues.flatMap((value) => String(value ?? '').split(/\r?\n/));
  return [...new Set(lines.filter((line) => line.trim()))].map((line) => `::add-mask::${line}`);
}

/** `METHOD path detail`, with every secret value redacted from the whole message. */
export function failureMessage(method, path, detail, secretValues = []) {
  return redact(`${method} ${path} ${detail}`, secretValues);
}

/**
 * Throws unless `status` is 2xx. A 3xx is a failure too: Cloudflare Access answers a
 * rejected service token with a 302 to its login page, and redirects are not followed.
 */
export function assertOk(status, method, path, secretValues = []) {
  if (!Number.isInteger(status) || status < 200 || status > 299) {
    throw new Error(failureMessage(method, path, `returned HTTP ${status}`, secretValues));
  }
}

/**
 * The whole run. Every side effect is injected so tests drive it with a fake `fetchImpl`
 * and fake git; nothing here reaches the network on its own.
 *
 * @param {{
 *   env?: Record<string, string | undefined>,
 *   fetchImpl?: (url: string, init: object) => Promise<{ status: number, json: () => Promise<unknown> }>,
 *   log?: (line: string) => void,
 *   appendSummary?: (file: string, text: string) => void,
 *   git?: ReturnType<typeof gitQueries>,
 *   resolveCommit?: (ref: string | undefined) => string | null,
 * }} [deps]
 */
export async function main({
  env = process.env,
  fetchImpl = fetch,
  log = console.log,
  appendSummary = (file, text) => appendFileSync(file, text),
  git = gitQueries(),
  resolveCommit = resolveSha,
} = {}) {
  const target = targetFor(env.TARGET_ENV ?? '');

  const notice = skipNotice(target, env);
  if (notice) {
    log(notice);
    return;
  }

  const secretValues = secretValuesFor(target, env);
  if (env.GITHUB_ACTIONS === 'true') {
    for (const command of maskCommands(secretValues)) log(command);
  }

  const sha = resolveCommit(env.GIT_SHA);
  if (!sha) throw new Error('Could not resolve the commit to describe');

  // Prod is never deployed from CI.
  if (parseDeploy(env.DEPLOY)) {
    throw new Error(`DEPLOY=true is not allowed for ${target.appEnv}: Prod is deployed by hand, never from CI`);
  }
  const version = resolveVersion({ sha, git });
  const baseUrl = normalizeBaseUrl(env.COOLIFY_BASE_URL);
  const headers = buildHeaders(env);
  const plan = planRequests({ target, appUuid: env[target.uuidSecret].trim(), version, sha });

  log(`Build version for ${target.appEnv}: ${version} (${sha})`);
  for (const request of plan) {
    const shown = redact(`${request.method} ${request.path}`, secretValues);
    let response;
    try {
      response = await fetchImpl(`${baseUrl}${request.path}`, {
        ...requestInit(request, headers),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      throw new Error(
        failureMessage(request.method, request.path, `failed before a response (${error?.name ?? 'Error'})`, secretValues),
      );
    }
    // Status first; a failed response's body is never read (an error page may echo headers).
    assertOk(response.status, request.method, request.path, secretValues);
    log(`${shown} -> HTTP ${response.status}`);
  }

  const action = 'variables set; no deploy (Prod is deployed by hand)';
  log(`Coolify ${target.appEnv}: ${action}.`);
  if (env.GITHUB_STEP_SUMMARY) {
    appendSummary(
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
