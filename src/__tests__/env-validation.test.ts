import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  validateEnv,
  validateBuildEnv,
  assertValidEnv,
  WARN_ONLY_VARS,
} from '@/lib/config/env-validation.mjs';

const STRICT = [
  'NEXT_PUBLIC_SUPABASE_URL_CLOUD',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY_CLOUD',
  'SUPABASE_SERVICE_ROLE_KEY_CLOUD',
  'CRON_SECRET',
];

function fullEnv(): Record<string, string> {
  const env: Record<string, string> = {
    NEXT_PUBLIC_ENV_MODE: 'cloud',
    NEXT_PUBLIC_SUPABASE_URL_CLOUD: 'https://abc.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY_CLOUD: 'anon',
    SUPABASE_SERVICE_ROLE_KEY_CLOUD: 'service',
    CRON_SECRET: 'secret',
  };
  for (const name of WARN_ONLY_VARS) env[name] = 'x';
  return env;
}

function without(env: Record<string, string>, ...names: string[]) {
  const copy = { ...env };
  for (const n of names) delete copy[n];
  return copy;
}

function run(env: Record<string, string>, mode: 'runtime' | 'build' = 'runtime') {
  const logger = { warn: vi.fn(), error: vi.fn() };
  const exit = vi.fn();
  assertValidEnv({ env, mode, exit, logger });
  return { logger, exit };
}

describe('validateEnv', () => {
  it('passes with everything present and warns about nothing', () => {
    const result = validateEnv(fullEnv());
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it.each(STRICT)('rejects when %s alone is missing', (name) => {
    const result = validateEnv(without(fullEnv(), name));
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual([name]);
  });

  it('names EVERY missing strict variable, not just the first', () => {
    const result = validateEnv(
      without(fullEnv(), 'NEXT_PUBLIC_SUPABASE_URL_CLOUD', 'SUPABASE_SERVICE_ROLE_KEY_CLOUD', 'CRON_SECRET')
    );
    expect(result.missing).toEqual([
      'NEXT_PUBLIC_SUPABASE_URL_CLOUD',
      'SUPABASE_SERVICE_ROLE_KEY_CLOUD',
      'CRON_SECRET',
    ]);
    expect(result.errors).toHaveLength(3);
  });

  it('treats a blank value as missing', () => {
    const result = validateEnv({ ...fullEnv(), CRON_SECRET: '   ' });
    expect(result.missing).toEqual(['CRON_SECRET']);
  });

  it('rejects a malformed Supabase URL as malformed, not missing', () => {
    const result = validateEnv({ ...fullEnv(), NEXT_PUBLIC_SUPABASE_URL_CLOUD: 'not-a-url' });
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual([]);
    expect(result.malformed).toEqual(['NEXT_PUBLIC_SUPABASE_URL_CLOUD']);
  });

  it('rejects a non-http(s) URL', () => {
    const result = validateEnv({ ...fullEnv(), NEXT_PUBLIC_SUPABASE_URL_CLOUD: 'ftp://abc.supabase.co' });
    expect(result.malformed).toEqual(['NEXT_PUBLIC_SUPABASE_URL_CLOUD']);
  });

  it('reports missing and malformed together', () => {
    const result = validateEnv({
      ...without(fullEnv(), 'CRON_SECRET'),
      NEXT_PUBLIC_SUPABASE_URL_CLOUD: 'nope',
    });
    expect(result.errors).toEqual([
      'CRON_SECRET is missing',
      'NEXT_PUBLIC_SUPABASE_URL_CLOUD is not a valid http(s) URL',
    ]);
  });

  it('reads the _LOCAL names when NEXT_PUBLIC_ENV_MODE is local or unset', () => {
    const result = validateEnv({ CRON_SECRET: 'secret' });
    expect(result.missing).toEqual([
      'NEXT_PUBLIC_SUPABASE_URL_LOCAL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY_LOCAL',
      'SUPABASE_SERVICE_ROLE_KEY_LOCAL',
    ]);
  });

  it('lists every warn-only variable when all are unset, and still passes', () => {
    const result = validateEnv(without(fullEnv(), ...WARN_ONLY_VARS));
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual(WARN_ONLY_VARS);
  });
});

describe('validateBuildEnv', () => {
  it('requires only the NEXT_PUBLIC_ Supabase pair, so the service-role placeholder case works', () => {
    const env = without(fullEnv(), 'SUPABASE_SERVICE_ROLE_KEY_CLOUD', 'CRON_SECRET');
    expect(validateBuildEnv(env).ok).toBe(true);
  });

  it('names every missing build-time variable', () => {
    const result = validateBuildEnv({ NEXT_PUBLIC_ENV_MODE: 'cloud' });
    expect(result.missing).toEqual([
      'NEXT_PUBLIC_SUPABASE_URL_CLOUD',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY_CLOUD',
    ]);
  });

  it('rejects a malformed URL', () => {
    const result = validateBuildEnv({ ...fullEnv(), NEXT_PUBLIC_SUPABASE_URL_CLOUD: 'x' });
    expect(result.malformed).toEqual(['NEXT_PUBLIC_SUPABASE_URL_CLOUD']);
  });
});

describe('assertValidEnv', () => {
  it('does not exit or error when everything is present', () => {
    const { exit, logger } = run(fullEnv());
    expect(exit).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('exits 1 with ONE error message naming every problem', () => {
    const { exit, logger } = run(without(fullEnv(), 'CRON_SECRET', 'SUPABASE_SERVICE_ROLE_KEY_CLOUD'));
    expect(exit).toHaveBeenCalledWith(1);
    expect(logger.error).toHaveBeenCalledTimes(1);
    const message = logger.error.mock.calls[0][0] as string;
    expect(message).toContain('CRON_SECRET is missing');
    expect(message).toContain('SUPABASE_SERVICE_ROLE_KEY_CLOUD is missing');
  });

  it('exits 1 for a malformed URL', () => {
    const { exit, logger } = run({ ...fullEnv(), NEXT_PUBLIC_SUPABASE_URL_CLOUD: 'not-a-url' });
    expect(exit).toHaveBeenCalledWith(1);
    expect(logger.error.mock.calls[0][0]).toContain('NEXT_PUBLIC_SUPABASE_URL_CLOUD is not a valid http(s) URL');
  });

  it('with all warn-only unset: does not exit, warns exactly once per variable', () => {
    const { exit, logger } = run(without(fullEnv(), ...WARN_ONLY_VARS));
    expect(exit).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(WARN_ONLY_VARS.length);
    for (const name of WARN_ONLY_VARS) {
      const hits = logger.warn.mock.calls.filter((c) => (c[0] as string).includes(name));
      expect(hits).toHaveLength(1);
    }
  });

  it('build mode exits 1 when a NEXT_PUBLIC_ value is missing', () => {
    const { exit, logger } = run(without(fullEnv(), 'NEXT_PUBLIC_SUPABASE_ANON_KEY_CLOUD'), 'build');
    expect(exit).toHaveBeenCalledWith(1);
    expect(logger.error.mock.calls[0][0]).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY_CLOUD is missing');
  });
});

describe('wiring: validation runs before the server binds its port', () => {
  const root = path.resolve(__dirname, '..', '..');

  it('Dockerfile CMD runs the preflight check before server.js', () => {
    const dockerfile = readFileSync(path.join(root, 'Dockerfile'), 'utf8');
    const cmd = dockerfile.split(/\r?\n/).find((l) => l.startsWith('CMD '));
    expect(cmd).toBeDefined();
    expect(cmd!.indexOf('preflight-env.mjs')).toBeGreaterThan(-1);
    expect(cmd!.indexOf('preflight-env.mjs')).toBeLessThan(cmd!.indexOf('server.js'));
    expect(cmd).toMatch(/preflight-env\.mjs\s+&&/);
  });

  it('Dockerfile runs the build-time check before npm run build', () => {
    const dockerfile = readFileSync(path.join(root, 'Dockerfile'), 'utf8');
    const check = dockerfile.indexOf('RUN node preflight-env.mjs --build');
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(dockerfile.indexOf('RUN npm run build'));
  });
});

describe('instrumentation register()', () => {
  async function registerWith(env: Record<string, string | undefined>) {
    const saved = { ...process.env };
    Object.assign(process.env, env);
    for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k];
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { register } = await import('@/instrumentation');
      await register();
      return exit;
    } finally {
      error.mockRestore();
      vi.restoreAllMocks();
      for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
      Object.assign(process.env, saved);
    }
  }

  const prodNode = { NODE_ENV: 'production', NEXT_RUNTIME: 'nodejs', NEXT_PHASE: undefined };
  const broken = { NEXT_PUBLIC_ENV_MODE: 'cloud', NEXT_PUBLIC_SUPABASE_URL_CLOUD: undefined, CRON_SECRET: undefined };

  it('exits 1 in a production node server with a bad config', async () => {
    const exit = await registerWith({ ...prodNode, ...broken });
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('does nothing during next build', async () => {
    const exit = await registerWith({ ...prodNode, ...broken, NEXT_PHASE: 'phase-production-build' });
    expect(exit).not.toHaveBeenCalled();
  });

  it('does nothing outside production (dev, vitest)', async () => {
    const exit = await registerWith({ ...prodNode, ...broken, NODE_ENV: 'development' });
    expect(exit).not.toHaveBeenCalled();
  });
});
