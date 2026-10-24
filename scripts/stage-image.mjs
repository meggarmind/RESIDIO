#!/usr/bin/env node
/**
 * Stage image: version + deploy helper for `.github/workflows/stage-image.yml` (#1114, Part A).
 *
 * CI builds the Stage Docker image and pushes it to GHCR as
 * `ghcr.io/meggarmind/residio-stage:<full sha>` (and `:stage`). This script has two commands:
 *
 *   version   Resolves NEXT_PUBLIC_APP_VERSION for GIT_SHA with resolveVersion (the same rule
 *             as coolify-version.mjs) and writes `version=<value>` to $GITHUB_OUTPUT, for the
 *             build step's build args.
 *   deploy    Tells Coolify to run that image tag. Off by default: it skips with a `::notice::`
 *             (exit 0) unless STAGE_IMAGE_DEPLOY is 'true' AND every required secret is set,
 *             and also skips when GIT_SHA is no longer the head of origin/stage, so an older
 *             image is never deployed over a newer one. Otherwise, in this order:
 *               PATCH /api/v1/applications/{uuid}   { "docker_registry_image_tag": "<sha>" }
 *               POST  /api/v1/deploy?uuid={uuid}
 *
 * Coolify API, verified 2026-10-24 against the RUNNING Coolify 4.5.0 source in the `coolify`
 * container (/var/www/html/app/Http/Controllers/Api/...):
 *   - ApplicationsController.php:3331 update_by_uuid; its $allowedFields (line 3363) contains
 *     'docker_registry_image_tag' and the field is not restricted by build pack, so PATCH
 *     accepts it for a `dockerimage` app. (The PATCH build_pack enum, line 3158, excludes
 *     `dockerimage`: an existing git app cannot be converted, a new dockerimage app is
 *     needed. That is Part B.) Create validates the tag with
 *     ValidationPatterns::dockerImageTagRules (line 2363): a 40-char hex SHA is valid.
 *   - DeployController.php:359 deploy() takes `uuid` from the query; `docker_tag` is
 *     preview-only (it requires pull_request_id, line 384), so it is not used. deploy_resource
 *     (line 499) queues queue_application_deployment for the application, and
 *     ApplicationDeploymentJob.php:745-757 resolveDockerImageTag() uses the application's
 *     stored docker_registry_image_tag (falling back to 'latest'). So PATCH-then-POST
 *     deploys exactly the tag just written.
 *   - Response of a queued deploy: { deployments: [{ message, resource_uuid, deployment_uuid }] }
 *     (DeployController.php:339-340). `resource_uuid` is the app UUID, a secret: never logged.
 *
 * The API sits behind Cloudflare Access, so every request carries the Coolify bearer token
 * and the Access service-token pair (buildHeaders). Redirects are not followed: a rejected
 * service token gets a 302 to the Access login page, which must fail. No secret value is
 * logged; a failed response's body is never read.
 *
 * Usage (the workflow sets these):
 *   GIT_SHA=<sha> node scripts/stage-image.mjs version
 *   STAGE_IMAGE_DEPLOY=true GIT_SHA=<sha> COOLIFY_BASE_URL=... COOLIFY_API_TOKEN=... \
 *   CF_ACCESS_CLIENT_ID=... CF_ACCESS_CLIENT_SECRET=... COOLIFY_APP_UUID_STAGE_IMAGE=... \
 *   node scripts/stage-image.mjs deploy
 */

import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  SHARED_SECRETS,
  assertOk,
  buildHeaders,
  failureMessage,
  gitQueries,
  maskCommands,
  normalizeBaseUrl,
  parseDeploy,
  redact,
  sanitizeForLog,
  requestInit,
  resolveSha,
  resolveVersion,
  runGit,
} from './coolify-version.mjs';

/** Every secret `deploy` needs: the shared Coolify/Access four plus the app UUID. */
export const UUID_SECRET = 'COOLIFY_APP_UUID_STAGE_IMAGE';
export const REQUIRED_SECRETS = [...SHARED_SECRETS, UUID_SECRET];

/** Coolify merges a deploy into a queued or running one (same app, commit, no tag): retry. */
export const ALREADY_QUEUED = /already queued/i;
export const MAX_RETRIES = 16;
export const RETRY_WAIT_MS = 30_000;

/** NAMES of the required secrets that are unset or blank. Values are never returned. */
export function missingSecrets(env) {
  return REQUIRED_SECRETS.filter((name) => !String(env[name] ?? '').trim());
}

/** The requests to make, in order, pure: `[{ method, path, body? }]`. */
export function planRequests({ appUuid, sha }) {
  const uuid = encodeURIComponent(appUuid);
  return [
    { method: 'PATCH', path: `/api/v1/applications/${uuid}`, body: { docker_registry_image_tag: sha } },
    { method: 'POST', path: `/api/v1/deploy?uuid=${uuid}` },
  ];
}

/**
 * The `::notice::` to print when the deploy is skipped, or null to go ahead. Checks the flag
 * first, then the secrets (names only). The stage-head check needs git and is done by `main`.
 */
export function skipNotice(env) {
  if (!parseDeploy(env.STAGE_IMAGE_DEPLOY)) {
    return "::notice::Stage image deploy skipped: STAGE_IMAGE_DEPLOY is not 'true'. The image was built and pushed only.";
  }
  const missing = missingSecrets(env);
  if (missing.length) {
    return `::notice::Stage image deploy skipped: missing secret(s) ${missing.join(', ')}.`;
  }
  return null;
}

/** The secret values to redact from anything logged. */
export function secretValuesFor(env) {
  return REQUIRED_SECRETS.map((name) => String(env[name] ?? ''));
}

/** `version` command: compute the version and write it to $GITHUB_OUTPUT. */
async function runVersion({ env, git, log, resolveCommit, appendOutput }) {
  const sha = resolveCommit(env.GIT_SHA);
  if (!sha) throw new Error('Could not resolve the commit to describe');
  const version = resolveVersion({ sha, git });
  log(`Stage image version: ${version} (${sha})`);
  if (env.GITHUB_OUTPUT) appendOutput(env.GITHUB_OUTPUT, `version=${version}\n`);
  return version;
}

/** `deploy` command. */
async function runDeploy({ env, fetchImpl, log, resolveCommit, stageHead, sleep }) {
  const notice = skipNotice(env);
  if (notice) {
    log(notice);
    return;
  }

  const secretValues = secretValuesFor(env);
  if (env.GITHUB_ACTIONS === 'true') {
    for (const command of maskCommands(secretValues)) log(command);
  }

  const sha = resolveCommit(env.GIT_SHA);
  if (!sha) throw new Error('Could not resolve the built commit');

  const head = stageHead();
  if (head !== sha) {
    log(
      head
        ? `::notice::Stage image ${sha} is no longer stage's head (stage is now ${head}); not deploying. The newer push deploys its own image.`
        : `::notice::Could not resolve stage's head, so not deploying ${sha}.`,
    );
    return;
  }

  const baseUrl = normalizeBaseUrl(env.COOLIFY_BASE_URL);
  const headers = buildHeaders(env);
  const plan = planRequests({ appUuid: env[UUID_SECRET].trim(), sha });

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    let deployment;
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
      if (request.method === 'POST') deployment = await firstDeployment(response);
    }

    // Coolify returns a fresh deployment_uuid even when it dedups (it never inserted that
    // deployment), so the message decides first and the uuid only counts when it is not a dedupe.
    const message = sanitizeForLog(deployment?.message ?? '', secretValues);
    const deduped = ALREADY_QUEUED.test(message);
    if (!deduped && typeof deployment?.deployment_uuid === 'string' && deployment.deployment_uuid.trim()) {
      log(deployLogLineFor(deployment, sha, secretValues));
      log(`Coolify residio-stage-image: tag set to ${sha} and deploy queued.`);
      return;
    }

    // Without a deployment_uuid, or with a dedupe message, Coolify did NOT queue anything.
    if (!deduped) {
      throw new Error(
        failureMessage('POST', '/api/v1/deploy', `queued no deployment: ${message || 'no message'}`, secretValues),
      );
    }
    // Coolify merged this request into a queued or running deploy, which has already read the
    // old tag. Wait for it to finish, then write the tag and ask again.
    if (attempt === MAX_RETRIES) break;
    log(`::notice::Deploy was merged into one already queued or running (retry ${attempt + 1}/${MAX_RETRIES}); waiting ${RETRY_WAIT_MS / 1000}s.`);
    await sleep(RETRY_WAIT_MS);
    const head = stageHead();
    if (head !== sha) {
      log(
        head
          ? `::notice::Stage moved on to ${head} while waiting; not deploying ${sha}. The newer push deploys its own image.`
          : `::notice::Could not resolve stage's head while waiting, so not deploying ${sha}.`,
      );
      return;
    }
  }
  throw new Error(
    failureMessage('POST', '/api/v1/deploy', `was still merged into an earlier deploy after ${MAX_RETRIES} retries`, secretValues),
  );
}

/** The first entry of a deploy response's `deployments`, or undefined when the body is not that. */
async function firstDeployment(response) {
  try {
    return (await response.json())?.deployments?.[0];
  } catch {
    return undefined;
  }
}

/** One-line log for a queued deploy: only sanitised deployment_uuid and message. */
function deployLogLineFor(deployment, sha, secretValues) {
  const parts = [deployment.deployment_uuid, deployment.message]
    .filter((part) => typeof part === 'string' && part.trim())
    .map((part) => sanitizeForLog(part, secretValues));
  return `Stage deploy queued for ${sha} (${parts.join(': ')})`;
}

/** Fetch the live head of origin/stage and read it; null if the fetch fails. */
export function defaultStageHead(run = runGit) {
  // The checkout may be shallow or stale. A failed fetch must not fall through to the ref
  // checkout created (the built SHA), which would make the head check pass.
  const fetched = run(['fetch', '--no-tags', '--depth=1', 'origin', '+refs/heads/stage:refs/remotes/origin/stage']);
  if (fetched === null) return null;
  return run(['rev-parse', '--verify', '--quiet', 'refs/remotes/origin/stage^{commit}']);
}

/**
 * The whole run, every side effect injected so tests never touch the network or git.
 *
 * @param {{
 *   command?: string,
 *   env?: Record<string, string | undefined>,
 *   fetchImpl?: (url: string, init: object) => Promise<{ status: number, json: () => Promise<unknown> }>,
 *   log?: (line: string) => void,
 *   git?: ReturnType<typeof gitQueries>,
 *   resolveCommit?: (ref: string | undefined) => string | null,
 *   stageHead?: () => string | null,
 *   sleep?: (ms: number) => Promise<void>,
 *   appendOutput?: (file: string, text: string) => void,
 * }} [deps]
 */
export async function main({
  command = process.argv[2],
  env = process.env,
  fetchImpl = fetch,
  log = console.log,
  git = gitQueries(),
  resolveCommit = resolveSha,
  stageHead = defaultStageHead,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  appendOutput = (file, text) => appendFileSync(file, text),
} = {}) {
  if (command === 'version') return runVersion({ env, git, log, resolveCommit, appendOutput });
  if (command === 'deploy') return runDeploy({ env, fetchImpl, log, resolveCommit, stageHead, sleep });
  throw new Error(`Unknown command "${command ?? ''}"; expected "version" or "deploy"`);
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main().catch((error) => {
    console.error(`::error::stage-image: ${error.message}`);
    process.exitCode = 1;
  });
}
