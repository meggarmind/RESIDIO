import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  TARGETS,
  buildHeaders,
  decideSkip,
  envPayload,
  gitQueries,
  normalizeBaseUrl,
  planRequests,
  redact,
  requestInit,
  requiredSecrets,
  resolveVersion,
  targetFor,
} from '../../scripts/coolify-version.mjs';

/**
 * Unit tests for the Coolify build-version writer (#421 slice B). Pure functions only: no
 * git, no network. The script's `main()` does the I/O; these pin the decisions it makes,
 * above all that Prod is never deployed from CI.
 */

const SHA = '0123456789abcdef0123456789abcdef01234567';

const configured = {
  COOLIFY_BASE_URL: 'https://coolify.example.test',
  COOLIFY_API_TOKEN: 'tok-SECRET-1',
  CF_ACCESS_CLIENT_ID: 'cfid-SECRET-2.access',
  CF_ACCESS_CLIENT_SECRET: 'cfsecret-SECRET-3',
  COOLIFY_APP_UUID_STAGE: 'stage-uuid-SECRET-4',
  COOLIFY_APP_UUID_PROD: 'prod-uuid-SECRET-5',
};

/**
 * A fake tag graph for resolveVersion. `parents` maps each commit to its parents (first
 * parent first); `tags` maps tag name to the commit it sits on. Ancestry and counts are
 * computed from the graph, the way git would.
 */
function fakeGit({
  parents,
  tags,
  describe = null,
}: {
  parents: Record<string, string[]>;
  tags: Record<string, string>;
  describe?: string | null;
}) {
  const ancestorsOf = (sha: string) => {
    const seen = new Set<string>();
    const stack = [sha];
    while (stack.length) {
      const next = stack.pop() as string;
      if (seen.has(next)) continue;
      seen.add(next);
      stack.push(...(parents[next] ?? []));
    }
    return seen;
  };
  return {
    exactTags: (sha: string) => Object.keys(tags).filter((tag) => tags[tag] === sha),
    tags: () => Object.keys(tags),
    secondParent: (tag: string) => parents[tags[tag]]?.[1] ?? null,
    isAncestor: (ancestor: string, sha: string) => ancestorsOf(sha).has(ancestor),
    countBetween: (from: string, to: string) => {
      const exclude = ancestorsOf(from);
      return String([...ancestorsOf(to)].filter((sha) => !exclude.has(sha)).length);
    },
    describe: () => describe,
  };
}

/** Full-length fake SHAs, so the 7-character short form is checked too. */
const c = (name: string) => name.padEnd(40, '0');

/**
 * The real shape (2026-10-11): stage s1..s4; master m1; release merges R1 = m1 + s2
 * (tagged v0.4.0) and R2 = R1 + s4 (tagged v0.5.0). Neither tag is an ancestor of stage.
 */
const releaseGraph = {
  parents: {
    [c('s1')]: [],
    [c('s2')]: [c('s1')],
    [c('s3')]: [c('s2')],
    [c('s4')]: [c('s3')],
    [c('s5')]: [c('s4')],
    [c('s6')]: [c('s5')],
    [c('m1')]: [c('s1')],
    [c('r1')]: [c('m1'), c('s2')],
    [c('r2')]: [c('r1'), c('s4')],
  },
  tags: { 'v0.4.0': c('r1'), 'v0.5.0': c('r2') },
};

describe('resolveVersion', () => {
  it('uses the exact tag on the commit (master, a release)', () => {
    expect(resolveVersion({ sha: c('r2'), git: fakeGit(releaseGraph) })).toBe('v0.5.0');
    expect(resolveVersion({ sha: c('r1'), git: fakeGit(releaseGraph) })).toBe('v0.4.0');
  });

  it('gives the release itself on the stage commit the release merged (T^2)', () => {
    expect(resolveVersion({ sha: c('s4'), git: fakeGit(releaseGraph) })).toBe('v0.5.0');
  });

  it('picks the newest qualifying tag and counts the commits ahead of its T^2', () => {
    // s6 is two commits past s4 = v0.5.0^2; v0.4.0^2 = s2 also qualifies but is older.
    expect(resolveVersion({ sha: c('s6'), git: fakeGit(releaseGraph) })).toBe('v0.5.0-2-gs600000');
    // s3 is past v0.4.0^2 but not past v0.5.0^2.
    expect(resolveVersion({ sha: c('s3'), git: fakeGit(releaseGraph) })).toBe('v0.4.0-1-gs300000');
  });

  it('orders tags by semver, not by name', () => {
    const graph = {
      parents: { ...releaseGraph.parents, [c('r3')]: [c('r2'), c('s5')] },
      tags: { 'v0.9.0': c('r1'), 'v0.10.0': c('r3') },
    };
    expect(resolveVersion({ sha: c('s6'), git: fakeGit(graph) })).toBe('v0.10.0-1-gs600000');
  });

  it('skips a tag with no second parent', () => {
    // v0.6.0 is a hand-made tag on a non-merge commit that is an ancestor of s6.
    const graph = { ...releaseGraph, tags: { ...releaseGraph.tags, 'v0.6.0': c('s5') } };
    expect(resolveVersion({ sha: c('s6'), git: fakeGit(graph) })).toBe('v0.5.0-2-gs600000');
  });

  it('skips a newer tag whose T^2 is not an ancestor of the commit', () => {
    // v0.6.0 merged s5, which s4 has not reached yet.
    const graph = {
      parents: { ...releaseGraph.parents, [c('r3')]: [c('r2'), c('s5')] },
      tags: { ...releaseGraph.tags, 'v0.6.0': c('r3') },
    };
    expect(resolveVersion({ sha: c('s4'), git: fakeGit(graph) })).toBe('v0.5.0');
  });

  it('falls back to git describe, then to v0.0.0-<shortsha>, when no tag qualifies', () => {
    const noTags = { parents: releaseGraph.parents, tags: {} };
    expect(resolveVersion({ sha: SHA, git: fakeGit({ ...noTags, describe: 'v0.1.0-4-g0123456' }) })).toBe(
      'v0.1.0-4-g0123456',
    );
    expect(resolveVersion({ sha: SHA, git: fakeGit(noTags) })).toBe('v0.0.0-0123456');
    expect(resolveVersion({ sha: SHA, git: fakeGit({ ...noTags, describe: '   ' }) })).toBe('v0.0.0-0123456');
  });

  it('throws rather than produce an empty version without a SHA', () => {
    expect(() => resolveVersion({ sha: '', git: fakeGit(releaseGraph) })).toThrow();
  });
});

describe('gitQueries', () => {
  it('maps each query onto one git command and treats a failure as no answer', () => {
    const calls: string[][] = [];
    const run = (args: string[]) => {
      calls.push(args);
      if (args[0] === 'merge-base') return null;
      if (args[0] === 'tag') return 'v0.5.0\nv0.4.2\n';
      return '';
    };
    const git = gitQueries(run);
    expect(git.tags()).toEqual(['v0.5.0', 'v0.4.2']);
    expect(git.exactTags('abc')).toEqual(['v0.5.0', 'v0.4.2']);
    expect(git.isAncestor('a', 'b')).toBe(false);
    expect(git.secondParent('v0.5.0')).toBeNull();
    expect(calls).toContainEqual(['tag', '--list', 'v*', '--points-at', 'abc']);
    expect(calls).toContainEqual(['merge-base', '--is-ancestor', 'a', 'b']);
    expect(calls).toContainEqual(['rev-parse', '--verify', '--quiet', 'refs/tags/v0.5.0^{commit}^2']);
  });
});

describe('envPayload', () => {
  it.each([
    ['staging', 'staging'],
    ['production', 'production'],
  ])('%s sets the three NEXT_PUBLIC_* variables as build-time literals', (name, appEnv) => {
    const target = targetFor(name);
    const payload = envPayload({ version: 'v0.5.0', sha: SHA, appEnv: target.appEnv });

    expect(payload.data.map((v: { key: string; value: string }) => [v.key, v.value])).toEqual([
      ['NEXT_PUBLIC_APP_VERSION', 'v0.5.0'],
      ['NEXT_PUBLIC_GIT_SHA', SHA],
      ['NEXT_PUBLIC_APP_ENV', appEnv],
    ]);
    for (const variable of payload.data) {
      // `is_buildtime` is the current Coolify v4 field name; NEXT_PUBLIC_* is inlined at build.
      expect(variable.is_buildtime).toBe(true);
      expect(variable.is_preview).toBe(false);
      expect(variable.is_literal).toBe(true);
      // Sent explicitly: Coolify's bulk update copies an omitted flag through as null.
      expect(variable).toHaveProperty('is_multiline', false);
      expect(variable).toHaveProperty('is_shown_once', false);
    }
  });
});

describe('planRequests', () => {
  const args = { appUuid: 'app-uuid', version: 'v0.5.0', sha: SHA };

  it('Prod sets the variables and contains no deploy call', () => {
    const plan = planRequests({ target: TARGETS.production, ...args });

    expect(plan).toHaveLength(1);
    expect(plan[0].method).toBe('PATCH');
    expect(plan[0].path).toBe('/api/v1/applications/app-uuid/envs/bulk');
    expect(plan.some((request: { path: string }) => request.path.includes('/deploy'))).toBe(false);
  });

  it('Stage sets the variables first, then triggers the deploy', () => {
    const plan = planRequests({ target: TARGETS.staging, ...args });

    expect(plan.map((request: { method: string; path: string }) => `${request.method} ${request.path}`)).toEqual([
      'PATCH /api/v1/applications/app-uuid/envs/bulk',
      'POST /api/v1/deploy?uuid=app-uuid&force=false',
    ]);
    expect(plan[0].body?.data.find((v: { key: string }) => v.key === 'NEXT_PUBLIC_APP_ENV')?.value).toBe('staging');
  });

  it('only staging is a deploying target', () => {
    expect(TARGETS.production.deploy).toBe(false);
    expect(TARGETS.staging.deploy).toBe(true);
  });

  it('rejects an unknown target rather than guessing', () => {
    expect(() => targetFor('prod')).toThrow(/Unknown TARGET_ENV/);
  });
});

describe('decideSkip', () => {
  it('skips and names every missing secret when nothing is configured', () => {
    expect(decideSkip(TARGETS.production, {})).toEqual({
      skip: true,
      missing: [
        'COOLIFY_BASE_URL',
        'COOLIFY_API_TOKEN',
        'CF_ACCESS_CLIENT_ID',
        'CF_ACCESS_CLIENT_SECRET',
        'COOLIFY_APP_UUID_PROD',
      ],
    });
  });

  it('treats a blank secret as missing and names only the missing ones', () => {
    const env = { ...configured, CF_ACCESS_CLIENT_SECRET: '  ', COOLIFY_APP_UUID_STAGE: '' };
    expect(decideSkip(TARGETS.staging, env)).toEqual({
      skip: true,
      missing: ['CF_ACCESS_CLIENT_SECRET', 'COOLIFY_APP_UUID_STAGE'],
    });
  });

  it('needs only its own application UUID', () => {
    const stageOnly: Partial<typeof configured> = { ...configured };
    delete stageOnly.COOLIFY_APP_UUID_PROD;
    expect(decideSkip(TARGETS.staging, stageOnly)).toEqual({ skip: false, missing: [] });
    expect(decideSkip(TARGETS.production, stageOnly).missing).toEqual(['COOLIFY_APP_UUID_PROD']);
  });

  it('returns names, never values', () => {
    const env = { ...configured, COOLIFY_API_TOKEN: '' };
    const result = JSON.stringify(decideSkip(TARGETS.staging, env));
    for (const value of Object.values(configured)) {
      expect(result).not.toContain(value);
    }
  });
});

describe('buildHeaders / requestInit', () => {
  it('sends the Coolify token and the Cloudflare Access service-token pair', () => {
    expect(buildHeaders(configured)).toMatchObject({
      Authorization: 'Bearer tok-SECRET-1',
      'CF-Access-Client-Id': 'cfid-SECRET-2.access',
      'CF-Access-Client-Secret': 'cfsecret-SECRET-3',
    });
  });

  it('never follows a redirect (Access answers a bad token with a 302 to its login page)', () => {
    const [patch, deploy] = planRequests({ target: TARGETS.staging, appUuid: 'u', version: 'v1.0.0', sha: SHA });
    expect(requestInit(patch, {}).redirect).toBe('manual');
    expect(JSON.parse(requestInit(patch, {}).body ?? '{}').data).toHaveLength(3);
    expect(requestInit(deploy, {})).not.toHaveProperty('body');
  });
});

describe('redact', () => {
  const values = requiredSecrets(TARGETS.staging).map((name) => configured[name as keyof typeof configured]);

  it('never prints a secret value', () => {
    const text = `PATCH ${configured.COOLIFY_BASE_URL}/api/v1/applications/${configured.COOLIFY_APP_UUID_STAGE}/envs/bulk ` +
      `Bearer ${configured.COOLIFY_API_TOKEN} ${configured.CF_ACCESS_CLIENT_ID} ${configured.CF_ACCESS_CLIENT_SECRET}`;
    const out = redact(text, values);

    for (const value of values) {
      expect(out).not.toContain(value);
    }
    expect(out).toContain('/envs/bulk');
    expect(out).toContain('***');
  });

  it('replaces a value that contains another one whole', () => {
    expect(redact('abc-long', ['abc', 'abc-long'])).toBe('***');
  });

  it('ignores blank values instead of mangling the text', () => {
    expect(redact('PATCH /x', ['', '  ', undefined as unknown as string])).toBe('PATCH /x');
  });
});

describe('normalizeBaseUrl', () => {
  it('strips trailing slashes and insists on https', () => {
    expect(normalizeBaseUrl('https://coolify.example.test///')).toBe('https://coolify.example.test');
    expect(() => normalizeBaseUrl('http://coolify.example.test')).toThrow(/https/);
    expect(() => normalizeBaseUrl('not a url')).toThrow();
  });
});

/**
 * The workflow files themselves. Regex over two small files, like release-version.test.ts:
 * the repo has no YAML parser dependency, and none is added for this.
 */
describe('coolify-version.yml and its call from release.yml', () => {
  const read = (file: string) =>
    readFileSync(fileURLToPath(new URL(`../../.github/workflows/${file}`, import.meta.url)), 'utf8');
  const stripComments = (yaml: string) => yaml.replace(/^\s*#.*$/gm, '');
  const workflow = stripComments(read('coolify-version.yml'));
  const release = stripComments(read('release.yml'));

  it('grants contents: read and nothing else', () => {
    expect(workflow).toMatch(/^permissions:\n {2}contents: read\n\n/m);
    expect(workflow.match(/permissions:/g)).toHaveLength(1);
  });

  it('has no deploy step of its own; the only deploy decision is the script TARGETS table', () => {
    expect(workflow).not.toMatch(/deploy\?|\/deploy/);
    expect(workflow).toMatch(/run: node scripts\/coolify-version\.mjs/);
  });

  it('defaults a push to stage to the staging target', () => {
    expect(workflow).toMatch(/push:\n\s+branches: \[stage\]/);
    expect(workflow).toMatch(/TARGET_ENV: \$\{\{ inputs\.environment \|\| 'staging' \}\}/);
  });

  it('release.yml calls it for production only, after the tag job, with contents: read', () => {
    const job = release.match(/\n {2}coolify-version:\n([\s\S]*?)(?=\n {2}\S|$)/)?.[1] ?? '';
    expect(job).toMatch(/needs: tag/);
    expect(job).toMatch(/if: needs\.tag\.outputs\.tag != ''/);
    expect(job).toMatch(/permissions:\n\s+contents: read\n/);
    expect(job).toMatch(/uses: \.\/\.github\/workflows\/coolify-version\.yml/);
    expect(job).toMatch(/environment: production/);
    expect(job).not.toMatch(/staging/);
  });
});
