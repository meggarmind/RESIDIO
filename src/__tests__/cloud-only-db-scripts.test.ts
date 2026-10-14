import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { buildGenArgs, validateGeneratedTypes, DEFAULT_PROJECT_REF } from '../../scripts/db-types.mjs';

const root = path.resolve(__dirname, '..', '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};

const GUARDED = ['db:migrate', 'supabase:start', 'supabase:stop', 'supabase:reset', 'supabase:status'];

const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;

describe('cloud-only db scripts (#219)', () => {
  it('no package script drives a local Supabase stack', () => {
    const banned = ['--local', 'supabase start', 'supabase db reset', 'supabase db push'];
    for (const [name, cmd] of Object.entries(pkg.scripts)) {
      for (const b of banned) {
        expect(cmd, `script "${name}" contains "${b}"`).not.toContain(b);
      }
    }
  });

  it('db:types uses the cloud script and the local-CLI scripts point at the guard', () => {
    expect(pkg.scripts['db:types']).toContain('scripts/db-types.mjs');
    for (const name of GUARDED) {
      expect(pkg.scripts[name], name).toContain('scripts/cloud-only-guard.mjs');
    }
  });

  describe('buildGenArgs', () => {
    it('targets a cloud project and never --local', () => {
      const args = buildGenArgs(env({ SUPABASE_ACCESS_TOKEN: "t" })) as string[];
      expect(args).not.toContain('--local');
      expect(args[args.indexOf('--project-id') + 1]).toBe(DEFAULT_PROJECT_REF);
    });

    it('honours SUPABASE_PROJECT_REF', () => {
      const args = buildGenArgs(env({ SUPABASE_ACCESS_TOKEN: "t", SUPABASE_PROJECT_REF: "abcdefghij" })) as string[];
      expect(args[args.indexOf('--project-id') + 1]).toBe('abcdefghij');
    });

    it('refuses when the access token is absent', () => {
      expect(() => buildGenArgs(env({}))).toThrow(/SUPABASE_ACCESS_TOKEN/);
    });
  });

  describe('validateGeneratedTypes', () => {
    it('rejects empty and error output', () => {
      expect(validateGeneratedTypes('')).toBe(false);
      expect(validateGeneratedTypes('   \n')).toBe(false);
      expect(
        validateGeneratedTypes('failed to connect to docker: Cannot connect to the Docker daemon'),
      ).toBe(false);
    });

    it('accepts generated types', () => {
      expect(validateGeneratedTypes('export type Database = {\n  public: {}\n}')).toBe(true);
    });
  });

  it('cloud-only guard exits non-zero and points at CORE.md', () => {
    const res = spawnSync(process.execPath, [path.join(root, 'scripts', 'cloud-only-guard.mjs'), 'supabase:start'], {
      encoding: 'utf8',
    });
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain('CORE.md');
    expect(res.stderr).toContain('supabase:start');
  });
});
