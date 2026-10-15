import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatBuildLabel, getBuildInfo } from '@/lib/version';
import { GET } from '@/app/api/version/route';

afterEach(() => {
  vi.unstubAllEnvs();
});

function clearAll() {
  vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '');
  vi.stubEnv('NEXT_PUBLIC_GIT_SHA', '');
  vi.stubEnv('NEXT_PUBLIC_APP_ENV', '');
}

describe('getBuildInfo', () => {
  it('falls back to dev / unknown / development when unset', () => {
    delete process.env.NEXT_PUBLIC_APP_VERSION;
    delete process.env.NEXT_PUBLIC_GIT_SHA;
    delete process.env.NEXT_PUBLIC_APP_ENV;
    expect(getBuildInfo()).toEqual({
      version: 'dev',
      sha: 'unknown',
      shortSha: 'unknown',
      env: 'development',
    });
  });

  it('treats empty and whitespace-only values as unset', () => {
    clearAll();
    expect(getBuildInfo().version).toBe('dev');
    expect(getBuildInfo().sha).toBe('unknown');
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '   ');
    vi.stubEnv('NEXT_PUBLIC_GIT_SHA', ' \t ');
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', '  ');
    const info = getBuildInfo();
    expect(info.version).toBe('dev');
    expect(info.sha).toBe('unknown');
    expect(info.shortSha).toBe('unknown');
    expect(info.env).toBe('development');
  });

  it('trims the version and sha', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '  v0.5.0 ');
    vi.stubEnv('NEXT_PUBLIC_GIT_SHA', ' a1b2c3d4e5f6 ');
    const info = getBuildInfo();
    expect(info.version).toBe('v0.5.0');
    expect(info.sha).toBe('a1b2c3d4e5f6');
  });

  it('truncates the short sha to 7 characters', () => {
    vi.stubEnv('NEXT_PUBLIC_GIT_SHA', 'a1b2c3d4e5f60718293a');
    expect(getBuildInfo().shortSha).toBe('a1b2c3d');
  });

  it('keeps a sha shorter than 7 characters whole', () => {
    vi.stubEnv('NEXT_PUBLIC_GIT_SHA', 'abc12');
    expect(getBuildInfo().shortSha).toBe('abc12');
  });

  it.each([
    ['production', 'production'],
    ['prod', 'production'],
    ['staging', 'staging'],
    ['stage', 'staging'],
    ['development', 'development'],
    ['banana', 'development'],
  ])('maps env %s to %s', (raw, expected) => {
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', raw);
    expect(getBuildInfo().env).toBe(expected);
  });

  it.each([
    ['Production', 'production'],
    ['PROD', 'production'],
    ['STAGING', 'staging'],
    ['Stage', 'staging'],
  ])('maps env %s case-insensitively to %s', (raw, expected) => {
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', raw);
    expect(getBuildInfo().env).toBe(expected);
  });

  it('never consults NODE_ENV: production NODE_ENV with no app env is still development', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', '');
    expect(getBuildInfo().env).toBe('development');
    delete process.env.NEXT_PUBLIC_APP_ENV;
    expect(getBuildInfo().env).toBe('development');
  });
});

describe('formatBuildLabel (#633)', () => {
  it('shortens a describe-style version to tag+commits and does not repeat the sha', () => {
    expect(formatBuildLabel({ version: 'v1.0.0-341-g3bafb1d', shortSha: '3bafb1d' })).toEqual({
      short: 'v1.0.0+341',
      full: 'v1.0.0-341-g3bafb1d',
    });
  });

  it('shows an exact release as-is, with the sha only in the full label', () => {
    expect(formatBuildLabel({ version: 'v1.0.0', shortSha: 'a1b2c3d' })).toEqual({
      short: 'v1.0.0',
      full: 'v1.0.0 · a1b2c3d',
    });
  });

  it.each(['dev', 'v0.0.0-a1b2c3d', 'v1.0.0-rc1', 'v1.0.0-3-gXYZ'])(
    'leaves %s unshortened and appends the sha in the full label',
    (version) => {
      expect(formatBuildLabel({ version, shortSha: 'a1b2c3d' })).toEqual({
        short: version,
        full: `${version} · a1b2c3d`,
      });
    },
  );
});

describe('src/lib/version.ts source', () => {
  // Next.js inlines NEXT_PUBLIC_* into the client bundle only for the literal
  // `process.env.NAME` form. A dynamic lookup passes every unit test above and
  // silently yields `dev · unknown` in the browser.
  const source = readFileSync(fileURLToPath(new URL('../lib/version.ts', import.meta.url)), 'utf8');

  it.each(['NEXT_PUBLIC_APP_VERSION', 'NEXT_PUBLIC_GIT_SHA', 'NEXT_PUBLIC_APP_ENV'])(
    'reads %s by its literal name',
    (name) => {
      expect(source).toContain(`process.env.${name}`);
    },
  );

  it('never reads process.env dynamically', () => {
    expect(source).not.toMatch(/process\.env\s*\[/);
    expect(source).not.toMatch(/process\.env\s*\)/);
    expect(source).not.toMatch(/=\s*process\.env\s*[;,]/);
  });
});

describe('GET /api/version', () => {
  it('returns exactly version, sha and env, with no-store', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', 'v0.5.0');
    vi.stubEnv('NEXT_PUBLIC_GIT_SHA', 'a1b2c3d4e5f6');
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'stage');
    const res = await GET();
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(['env', 'sha', 'version']);
    expect(body).toEqual({ version: 'v0.5.0', sha: 'a1b2c3d4e5f6', env: 'staging' });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});
