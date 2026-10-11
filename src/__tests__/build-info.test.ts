import { afterEach, describe, expect, it, vi } from 'vitest';
import { getBuildInfo } from '@/lib/version';
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
