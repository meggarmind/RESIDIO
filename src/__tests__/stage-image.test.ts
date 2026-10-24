import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  REQUIRED_SECRETS,
  UUID_SECRET,
  MAX_RETRIES,
  RETRY_WAIT_MS,
  defaultStageHead,
  main,
  missingSecrets,
  planRequests,
  skipNotice,
} from '../../scripts/stage-image.mjs';

/**
 * Tests for the Stage image deploy helper and its workflow (#1114, Part A). No network and
 * no git: `fetch`, the git queries and the stage head are all injected.
 */

const SHA = '0123456789abcdef0123456789abcdef01234567';
const NEWER = 'fedcba9876543210fedcba9876543210fedcba98';

const configured: Record<string, string> = {
  STAGE_IMAGE_DEPLOY: 'true',
  GIT_SHA: SHA,
  COOLIFY_BASE_URL: 'https://coolify.example.test',
  COOLIFY_API_TOKEN: 'tok-SECRET-1',
  CF_ACCESS_CLIENT_ID: 'cfid-SECRET-2.access',
  CF_ACCESS_CLIENT_SECRET: 'cfsecret-SECRET-3',
  COOLIFY_APP_UUID_STAGE_IMAGE: 'img-uuid-SECRET-4',
};

type FakeResponse = { status: number; json: () => Promise<unknown> };
const ok = (body: unknown = {}): FakeResponse => ({ status: 200, json: async () => body });

function run({
  command = 'deploy',
  env = configured,
  responses = [ok(), ok({ deployments: [{ message: 'queued', deployment_uuid: 'dep1', resource_uuid: 'img-uuid-SECRET-4' }] })],
  head = SHA as string | null | (() => string | null),
  sleep = async () => {},
}: {
  command?: string;
  env?: Record<string, string | undefined>;
  responses?: FakeResponse[];
  head?: string | null | (() => string | null);
  sleep?: (ms: number) => Promise<void>;
} = {}) {
  const queue = [...responses];
  const fetchImpl = vi.fn(async () => queue.shift() as FakeResponse);
  const logs: string[] = [];
  const result = main({
    command,
    env,
    fetchImpl,
    log: (line: string) => logs.push(line),
    resolveCommit: (ref: string | undefined) => ref ?? null,
    stageHead: typeof head === 'function' ? head : () => head,
    sleep,
  });
  return { result, fetchImpl, logs };
}

describe('skip rules', () => {
  it.each([undefined, '', 'false', 'TRUE', '1'])('skips with a notice when STAGE_IMAGE_DEPLOY is %j', async (flag) => {
    const { result, fetchImpl, logs } = run({ env: { ...configured, STAGE_IMAGE_DEPLOY: flag } });
    await result;
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatch(/^::notice::.*STAGE_IMAGE_DEPLOY/);
  });

  it.each(REQUIRED_SECRETS)('skips with a notice naming %s when it is missing', async (name) => {
    const { result, fetchImpl, logs } = run({ env: { ...configured, [name]: '  ' } });
    await result;
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatch(/^::notice::/);
    expect(logs[0]).toContain(name);
    // Names only: no other secret's name or any value appears.
    for (const other of REQUIRED_SECRETS.filter((n) => n !== name)) {
      expect(logs[0]).not.toContain(other);
      expect(logs[0]).not.toContain(configured[other]);
    }
  });

  it('lists every missing secret, and never a value', () => {
    expect(missingSecrets({ STAGE_IMAGE_DEPLOY: 'true' })).toEqual(REQUIRED_SECRETS);
    expect(skipNotice({ ...configured, COOLIFY_API_TOKEN: '', CF_ACCESS_CLIENT_ID: undefined })).toMatch(
      /COOLIFY_API_TOKEN, CF_ACCESS_CLIENT_ID\./,
    );
    expect(skipNotice(configured)).toBeNull();
  });

  it('skips with a notice when the built SHA is no longer the head of stage', async () => {
    const { result, fetchImpl, logs } = run({ head: NEWER });
    await result;
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(logs.at(-1)).toMatch(/^::notice::.*no longer stage's head/);
  });

  it('skips with a notice when the stage head cannot be resolved', async () => {
    const { result, fetchImpl, logs } = run({ head: null });
    await result;
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(logs.at(-1)).toMatch(/^::notice::.*Could not resolve stage's head/);
  });
});

describe('request plan', () => {
  it('is PATCH the image tag, then POST the deploy, in that order', () => {
    expect(planRequests({ appUuid: 'abc', sha: SHA })).toEqual([
      { method: 'PATCH', path: '/api/v1/applications/abc', body: { docker_registry_image_tag: SHA } },
      { method: 'POST', path: '/api/v1/deploy?uuid=abc' },
    ]);
  });

  it('url-encodes the app uuid', () => {
    expect(planRequests({ appUuid: 'a b/c', sha: SHA })[0].path).toBe('/api/v1/applications/a%20b%2Fc');
  });

  it('sends exactly those requests with the auth headers and no redirect following', async () => {
    const { result, fetchImpl } = run();
    await result;
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [patch, post] = fetchImpl.mock.calls as unknown as [string, Record<string, unknown>][];
    expect(patch[0]).toBe('https://coolify.example.test/api/v1/applications/img-uuid-SECRET-4');
    expect(patch[1]).toMatchObject({ method: 'PATCH', redirect: 'manual' });
    expect(JSON.parse(patch[1].body as string)).toEqual({ docker_registry_image_tag: SHA });
    expect(post[0]).toBe('https://coolify.example.test/api/v1/deploy?uuid=img-uuid-SECRET-4');
    expect(post[1]).toMatchObject({ method: 'POST', redirect: 'manual' });
    expect(post[1].body).toBeUndefined();
    expect(post[1].headers).toMatchObject({
      Authorization: 'Bearer tok-SECRET-1',
      'CF-Access-Client-Id': 'cfid-SECRET-2.access',
      'CF-Access-Client-Secret': 'cfsecret-SECRET-3',
    });
  });

  it('never logs the app uuid, the token or the Access secret', async () => {
    const { result, logs } = run();
    await result;
    const text = logs.join('\n');
    expect(text).toContain('queued');
    expect(text).toContain('dep1');
    for (const name of REQUIRED_SECRETS) expect(text).not.toContain(configured[name]);
  });
});

describe('failures are redacted', () => {
  it('fails on a non-2xx PATCH without sending the deploy, and hides the secrets', async () => {
    const { result, fetchImpl } = run({ responses: [{ status: 500, json: async () => ({}) }] });
    await expect(result).rejects.toThrow(/PATCH .* returned HTTP 500/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const error = await result.catch((e: Error) => e.message);
    for (const name of REQUIRED_SECRETS) expect(error).not.toContain(configured[name]);
    expect(error).toContain('***');
  });

  it('fails on a 302 from Cloudflare Access', async () => {
    const { result } = run({ responses: [ok(), { status: 302, json: async () => ({}) }] });
    await expect(result).rejects.toThrow(/POST .* returned HTTP 302/);
  });

  it('redacts the token and the Access secret from a network error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('boom tok-SECRET-1 cfsecret-SECRET-3');
    });
    const error = await main({
      command: 'deploy',
      env: configured,
      fetchImpl,
      log: () => {},
      resolveCommit: (ref: string | undefined) => ref ?? null,
      stageHead: () => SHA,
    }).catch((e: Error) => e.message);
    expect(error).toMatch(/failed before a response/);
    expect(error).not.toContain('tok-SECRET-1');
    expect(error).not.toContain('cfsecret-SECRET-3');
    expect(error).not.toContain('img-uuid-SECRET-4');
  });

  it('masks every secret in GitHub Actions before anything else is logged', async () => {
    const { result, logs } = run({ env: { ...configured, GITHUB_ACTIONS: 'true' } });
    await result;
    expect(logs[0]).toMatch(/^::add-mask::/);
    expect(logs).toContain('::add-mask::tok-SECRET-1');
    expect(logs).toContain('::add-mask::cfsecret-SECRET-3');
  });

  it('rejects a non-https base url', async () => {
    const { result } = run({ env: { ...configured, COOLIFY_BASE_URL: 'http://coolify.example.test' } });
    await expect(result).rejects.toThrow(/must use https/);
  });
});

const queued = (message: string, uuid?: string) =>
  ok({ deployments: [{ message, resource_uuid: 'img-uuid-SECRET-4', ...(uuid ? { deployment_uuid: uuid } : {}) }] });
const DEDUPED = 'Deployment already queued for this commit.';
const QUEUED = 'Application residio-stage deployment queued.';

describe('a deploy Coolify did not queue', () => {
  it('succeeds on the first try when a deployment_uuid comes back', async () => {
    const sleep = vi.fn(async () => {});
    const { result, fetchImpl, logs } = run({ sleep, responses: [ok(), queued(QUEUED, 'dep1')] });
    await result;
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).not.toHaveBeenCalled();
    expect(logs.at(-1)).toMatch(/deploy queued/);
  });

  it('waits, re-writes the tag and posts again after a dedupe, then succeeds', async () => {
    const sleep = vi.fn(async () => {});
    const { result, fetchImpl } = run({
      sleep,
      responses: [ok(), queued(DEDUPED, 'fresh-uuid'), ok(), queued(QUEUED, 'dep2')],
    });
    await result;
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(RETRY_WAIT_MS);
    const calls = fetchImpl.mock.calls as unknown as [string, { method: string }][];
    expect(calls.map(([url, init]) => `${init.method} ${url.replace('https://coolify.example.test', '')}`)).toEqual([
      'PATCH /api/v1/applications/img-uuid-SECRET-4',
      'POST /api/v1/deploy?uuid=img-uuid-SECRET-4',
      'PATCH /api/v1/applications/img-uuid-SECRET-4',
      'POST /api/v1/deploy?uuid=img-uuid-SECRET-4',
    ]);
  });

  it('fails with ::error:: material after the last retry is still deduped', async () => {
    const sleep = vi.fn(async () => {});
    const responses: FakeResponse[] = [];
    for (let i = 0; i <= MAX_RETRIES; i += 1) responses.push(ok(), queued(DEDUPED, 'fresh-uuid'));
    const { result, fetchImpl } = run({ sleep, responses });
    await expect(result).rejects.toThrow(/still merged into an earlier deploy after 16 retries/);
    expect(sleep).toHaveBeenCalledTimes(MAX_RETRIES);
    expect(fetchImpl).toHaveBeenCalledTimes((MAX_RETRIES + 1) * 2);
  });

  it('treats a dedupe that carries a deployment_uuid as not queued, and never logs success for it', async () => {
    const sleep = vi.fn(async () => {});
    const { result, logs } = run({
      sleep,
      responses: [ok(), queued(DEDUPED, 'fresh-uuid'), ok(), queued(QUEUED, 'dep2')],
    });
    await result;
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(logs.join('\n')).not.toContain('fresh-uuid');
    expect(logs.findIndex((l) => /deploy queued/.test(l))).toBeGreaterThan(logs.findIndex((l) => /Deploy was merged/.test(l)));
    expect(logs.findIndex((l) => /Deploy was merged/.test(l))).toBeLessThan(logs.findIndex((l) => /deploy queued/.test(l)));
  });

  it('keeps the retry and moved-on notices free of the app uuid and every secret', async () => {
    const heads = [SHA, SHA, NEWER];
    const { result, logs } = run({
      head: () => heads.shift() ?? NEWER,
      responses: [ok(), queued(DEDUPED, 'fresh-uuid'), ok(), queued(DEDUPED, 'fresh-uuid')],
    });
    await result;
    const notices = logs.filter((l) => /Deploy was merged|Stage moved on/.test(l));
    expect(notices).toHaveLength(3);
    for (const line of notices) for (const name of REQUIRED_SECRETS) expect(line).not.toContain(configured[name]);
  });

  it('skips with a notice when stage moves on while waiting after a dedupe', async () => {
    const heads = [SHA, NEWER];
    const sleep = vi.fn(async () => {});
    const { result, fetchImpl, logs } = run({
      sleep,
      head: () => heads.shift() ?? NEWER,
      responses: [ok(), queued(DEDUPED, 'fresh-uuid'), ok(), queued(QUEUED, 'dep3')],
    });
    await result;
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(logs.at(-1)).toMatch(/^::notice::Stage moved on to /);
  });

  it('fails on an HTTP 200 without a deployment_uuid that is not a dedupe (unauthorized)', async () => {
    const sleep = vi.fn(async () => {});
    const { result } = run({ sleep, responses: [ok(), queued('Unauthorized to deploy this application.')] });
    await expect(result).rejects.toThrow(/queued no deployment: Unauthorized to deploy this application\./);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('fails on an HTTP 200 with an unreadable body, and redacts secrets in the message', async () => {
    const { result } = run({ responses: [ok(), queued('denied for tok-SECRET-1')] });
    const error = await result.catch((e: Error) => e.message);
    expect(error).not.toContain('tok-SECRET-1');
    expect(error).toContain('***');
    const bad = run({ responses: [ok(), { status: 200, json: async () => { throw new Error('x'); } }] });
    await expect(bad.result).rejects.toThrow(/queued no deployment/);
  });
});

describe('default stageHead', () => {
  it('returns null when the fetch fails, never the stale local ref', () => {
    const run = vi.fn((args: string[]) => (args[0] === 'fetch' ? null : SHA));
    expect(defaultStageHead(run)).toBeNull();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('reads origin/stage after a successful fetch', () => {
    const run = vi.fn((args: string[]) => (args[0] === 'fetch' ? '' : NEWER));
    expect(defaultStageHead(run)).toBe(NEWER);
    expect(run.mock.calls.map(([a]) => a)).toEqual([
      ['fetch', '--no-tags', '--depth=1', 'origin', '+refs/heads/stage:refs/remotes/origin/stage'],
      ['rev-parse', '--verify', '--quiet', 'refs/remotes/origin/stage^{commit}'],
    ]);
  });
});

describe('commands', () => {
  it('rejects an unknown command', async () => {
    await expect(run({ command: 'nope' }).result).rejects.toThrow(/Unknown command/);
  });

  it('version writes the resolved version to GITHUB_OUTPUT', async () => {
    const out: string[] = [];
    await main({
      command: 'version',
      env: { GIT_SHA: SHA, GITHUB_OUTPUT: '/tmp/out' },
      log: () => {},
      resolveCommit: (ref: string | undefined) => ref ?? null,
      git: {
        exactTags: () => ['v1.2.3'],
        tags: () => [],
        secondParent: () => null,
        tagCommit: () => null,
        isAncestor: () => false,
        countBetween: () => '0',
        describe: () => null,
      },
      appendOutput: (_file: string, text: string) => out.push(text),
    });
    expect(out).toEqual(['version=v1.2.3\n']);
  });

  it('exposes the app uuid secret name the workflow passes', () => {
    expect(UUID_SECRET).toBe('COOLIFY_APP_UUID_STAGE_IMAGE');
  });
});

/**
 * The workflow file itself. Regex over a small file (the repo has no YAML parser dependency,
 * and none is added), like coolify-version.test.ts.
 */
describe('stage-image.yml', () => {
  const raw = readFileSync(fileURLToPath(new URL('../../.github/workflows/stage-image.yml', import.meta.url)), 'utf8');
  const workflow = raw.replace(/^\s*#.*$/gm, '');
  const jobsBlock = workflow.slice(workflow.indexOf('\njobs:'));
  const buildJob = jobsBlock.slice(jobsBlock.indexOf('\n  build:'), jobsBlock.indexOf('\n  deploy:'));
  const deployJob = jobsBlock.slice(jobsBlock.indexOf('\n  deploy:'));
  const buildArgs = buildJob.match(/build-args: \|\n((?: {12}\S.*\n?)+)/)?.[1] ?? '';

  it('runs on push to stage and workflow_dispatch only', () => {
    const on = workflow.match(/\non:\n([\s\S]*?)\n\S/)?.[1] ?? '';
    expect(on).toMatch(/^ {2}push:\n {4}branches: \[stage\]$/m);
    expect(on).toMatch(/^ {2}workflow_dispatch:/m);
    expect(on.match(/^ {2}\S+:/gm)).toHaveLength(2);
  });

  it('refuses a manual run from any branch but stage, before the checkout', () => {
    const guard = buildJob.match(/- name: Refuse a manual run from the wrong branch\n([\s\S]*?)(?=\n\s+- name:)/)?.[1] ?? '';
    expect(guard).toMatch(/github\.event_name == 'workflow_dispatch'/);
    expect(guard).toMatch(/github\.ref != 'refs\/heads\/stage'/);
    expect(guard).toMatch(/exit 1/);
    expect(buildJob.indexOf('Refuse a manual run')).toBeLessThan(buildJob.indexOf('actions/checkout'));
  });

  it('build: cancels older builds in the same group', () => {
    expect(buildJob).toMatch(/concurrency:\n {6}group: stage-image-build\n {6}cancel-in-progress: true/);
  });

  it('deploy: needs build and never cancels a running deploy', () => {
    expect(deployJob).toMatch(/needs: build/);
    expect(deployJob).toMatch(/concurrency:\n {6}group: stage-image-deploy\n {6}cancel-in-progress: false/);
  });

  it('grants packages: write to the build job only', () => {
    expect(workflow.match(/packages:/g)).toHaveLength(1);
    expect(buildJob).toMatch(/permissions:\n {6}contents: read\n {6}packages: write/);
    expect(deployJob).toMatch(/permissions:\n {6}contents: read\n/);
    expect(deployJob).not.toMatch(/packages:/);
    expect(workflow).toMatch(/^permissions:\n {2}contents: read\n/m);
  });

  it('never uses secrets: inherit', () => {
    expect(workflow).not.toMatch(/secrets:\s*inherit/);
  });

  it('build args exist and come only from vars.* and computed values, never secrets.*', () => {
    expect(buildArgs).not.toBe('');
    expect(buildArgs).not.toMatch(/secrets\./);
    const lines = buildArgs.trim().split('\n').map((l) => l.trim());
    expect(lines).toEqual([
      'NEXT_PUBLIC_ENV_MODE=cloud',
      'NEXT_PUBLIC_SUPABASE_URL_CLOUD=${{ vars.STAGE_SUPABASE_URL }}',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY_CLOUD=${{ vars.STAGE_SUPABASE_ANON_KEY }}',
      'NEXT_PUBLIC_APP_URL=${{ vars.STAGE_APP_URL }}',
      'NEXT_PUBLIC_SITE_URL=${{ vars.STAGE_APP_URL }}',
      'NEXT_PUBLIC_PAYSTACK_KEY=${{ vars.STAGE_PAYSTACK_PUBLIC_KEY }}',
      'NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY=${{ vars.STAGE_PAYSTACK_PUBLIC_KEY }}',
      'NEXT_PUBLIC_APP_VERSION=${{ steps.version.outputs.version }}',
      'NEXT_PUBLIC_GIT_SHA=${{ github.sha }}',
      'NEXT_PUBLIC_APP_ENV=staging',
    ]);
    // Every key is public by name.
    for (const line of lines) expect(line).toMatch(/^NEXT_PUBLIC_/);
  });

  it('the only secrets referenced in the build job are GITHUB_TOKEN for the GHCR login', () => {
    expect([...buildJob.matchAll(/secrets\.(\w+)/g)].map((m) => m[1])).toEqual(['GITHUB_TOKEN']);
  });

  it('pushes the full sha and :stage tags, with its own gha cache scope', () => {
    expect(buildJob).toMatch(/ghcr\.io\/meggarmind\/residio-stage:\$\{\{ github\.sha \}\}/);
    expect(buildJob).toMatch(/ghcr\.io\/meggarmind\/residio-stage:stage/);
    expect(buildJob).toMatch(/push: true/);
    expect(buildJob).toMatch(/cache-from: type=gha,scope=stage-image/);
    expect(buildJob).toMatch(/cache-to: type=gha,mode=max,scope=stage-image/);
  });

  it('checks out full history and tags, and takes Node from .nvmrc', () => {
    expect(buildJob).toMatch(/fetch-depth: 0/);
    expect(buildJob).toMatch(/fetch-tags: true/);
    expect(buildJob).toMatch(/node-version-file: \.nvmrc/);
    expect(buildJob).toMatch(/run: node scripts\/stage-image\.mjs version/);
  });

  it('references exactly the five Coolify secrets in the deploy job', () => {
    expect([...deployJob.matchAll(/secrets\.(\w+)/g)].map((m) => m[1]).sort()).toEqual(
      [
        'CF_ACCESS_CLIENT_ID',
        'CF_ACCESS_CLIENT_SECRET',
        'COOLIFY_API_TOKEN',
        'COOLIFY_APP_UUID_STAGE_IMAGE',
        'COOLIFY_BASE_URL',
      ],
    );
  });

  it('has no if: on the deploy job or its step, so the script alone decides to skip', () => {
    expect(deployJob).not.toMatch(/^\s+if:/m);
  });

  it('gives the deploy job room for the dedupe retries', () => {
    expect(deployJob).toMatch(/timeout-minutes: 15\n/);
  });

  it('passes the commit to the version step', () => {
    const step = buildJob.match(/- name: Compute version\n([\s\S]*?)(?=\n\s+- name:)/)?.[1] ?? '';
    expect(step).toMatch(/GIT_SHA: \$\{\{ github\.sha \}\}/);
  });

  it('pushes exactly the two tags', () => {
    const tags = buildJob.match(/ {10}tags: \|\n((?: {12}\S.*\n?)+)/)?.[1] ?? '';
    expect(tags.trim().split('\n').map((l) => l.trim())).toEqual([
      'ghcr.io/meggarmind/residio-stage:${{ github.sha }}',
      'ghcr.io/meggarmind/residio-stage:stage',
    ]);
  });

  it('deploy lists each secret explicitly and reads the flag from vars', () => {
    expect(deployJob).toMatch(/STAGE_IMAGE_DEPLOY: \$\{\{ vars\.STAGE_IMAGE_DEPLOY \}\}/);
    expect(deployJob).toMatch(/GIT_SHA: \$\{\{ github\.sha \}\}/);
    for (const name of [
      'COOLIFY_BASE_URL',
      'COOLIFY_API_TOKEN',
      'CF_ACCESS_CLIENT_ID',
      'CF_ACCESS_CLIENT_SECRET',
      'COOLIFY_APP_UUID_STAGE_IMAGE',
    ]) {
      expect(deployJob).toContain(`${name}: \${{ secrets.${name} }}`);
    }
    expect(deployJob).toMatch(/run: node scripts\/stage-image\.mjs deploy/);
  });
});
