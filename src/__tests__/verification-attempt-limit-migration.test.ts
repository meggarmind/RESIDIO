import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** Issue #556 item 6. Structural assertions over the migration file; no network. */

const migrationsDir = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));
const MIGRATION_FILE = '20261015090000_verification_token_attempt_limit.sql';

const migration = readFileSync(path.join(migrationsDir, MIGRATION_FILE), 'utf8').replace(/\r\n/g, '\n');
const activeSql = migration.match(/^BEGIN;[\s\S]*?^COMMIT;/m)?.[0] ?? '';
const active = activeSql.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ');
const FN = 'public.record_failed_verification_attempt(uuid, text, integer)';

describe('verification token attempt limit migration (#556)', () => {
  it('has an executable body', () => {
    expect(active.length).toBeGreaterThan(0);
  });

  it('adds attempts as NOT NULL DEFAULT 0 with a non-negative check', () => {
    expect(active).toContain(
      'ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0)'
    );
  });

  it('defines the function with a pinned search_path and the default limit of 5', () => {
    expect(active).toContain('CREATE OR REPLACE FUNCTION public.record_failed_verification_attempt(');
    expect(active).toContain("SET search_path = ''");
    expect(active).toContain('p_max_attempts integer DEFAULT 5');
  });

  it('invalidates with >= (the fifth wrong attempt, not the sixth)', () => {
    expect(active).toContain('vt.attempts + 1 >= p_max_attempts');
    expect(active).not.toMatch(/attempts \+ 1 > p_max_attempts/);
  });

  it('casts the token type to the enum and adds exactly one per failed attempt', () => {
    // Text-only checks: nothing here runs SQL. Without the cast `enum = text` errors on every
    // call (the limit would never work); a wrong increment or default changes the limit.
    expect(active).toContain('vt.token_type = p_token_type::public.verification_type');
    expect(active).toContain('SET attempts = vt.attempts + 1');
    // Every increment in the body is exactly '+ 1' (no other number follows 'vt.attempts + ').
    const increments = active.match(/vt\.attempts \+ \d+/g) ?? [];
    expect(increments.length).toBeGreaterThan(0);
    expect([...new Set(increments)]).toEqual(['vt.attempts + 1']);
    expect(active).toMatch(/p_max_attempts integer DEFAULT 5(?![0-9])/);
  });

  it('only counts active, unexpired tokens', () => {
    expect(active).toContain('vt.used_at IS NULL');
    expect(active).toContain('vt.expires_at > now()');
  });

  it('revokes from PUBLIC, anon and authenticated and grants only to service_role', () => {
    expect(active).toContain(`REVOKE ALL ON FUNCTION ${FN} FROM PUBLIC, anon, authenticated;`);
    expect(active).toContain(`GRANT EXECUTE ON FUNCTION ${FN} TO service_role;`);
    const grants = active.match(/GRANT [^;]*;/g) ?? [];
    expect(grants).toHaveLength(1);
    expect(grants[0]).not.toMatch(/anon|authenticated|PUBLIC/);
  });

  it('documents ROLLBACK and VERIFY sections', () => {
    expect(migration).toContain('-- ROLLBACK');
    expect(migration).toContain(
      'DROP FUNCTION IF EXISTS public.record_failed_verification_attempt(uuid, text, integer);'
    );
    expect(migration).toContain('DROP COLUMN IF EXISTS attempts;');
    expect(migration).toContain('-- VERIFY');
  });

  it('drops nothing in its executable body', () => {
    expect(active).not.toMatch(/\bDROP\b/i);
  });

  it('has a version no other migration shares, and sorts after the migration that creates the table', () => {
    // Was "sorts after every other migration", which fails as soon as any later
    // migration lands (#615 did). What matters is a unique version and that the table
    // already exists when this one runs.
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    const version = MIGRATION_FILE.split('_')[0];
    expect(files.filter((f) => f.startsWith(`${version}_`))).toEqual([MIGRATION_FILE]);

    const created = files.find((f) => f.includes('add_contact_verification'));
    expect(created).toBeDefined();
    expect(files.indexOf(MIGRATION_FILE)).toBeGreaterThan(files.indexOf(created!));
  });
});
