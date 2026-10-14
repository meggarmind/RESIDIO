import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Issue #222. RLS does not gate TRUNCATE, so anon/authenticated must not hold
 * it on public tables. Structural assertions over migration files; no network.
 */

const migrationsDir = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));
const MIGRATION_FILE = '20261014100000_revoke_truncate_from_api_roles.sql';

const read = (f: string) =>
  readFileSync(path.join(migrationsDir, f), 'utf8').replace(/\r\n/g, '\n');

const migration = read(MIGRATION_FILE);
const activeSql = migration.match(/^BEGIN;[\s\S]*?^COMMIT;/m)?.[0] ?? '';
/** Executable statements only: comments (header and rollback) stripped, whitespace collapsed. */
const active = activeSql.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ');

describe('revoke TRUNCATE from API roles (#222)', () => {
  it('has an executable body', () => {
    expect(active.length).toBeGreaterThan(0);
  });

  it('revokes TRUNCATE on all public tables from both anon and authenticated', () => {
    expect(active).toContain(
      'REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;'
    );
  });

  it('sets default privileges so new tables do not regain TRUNCATE', () => {
    expect(active).toContain(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE ON TABLES FROM anon, authenticated;'
    );
    expect(active).toContain(
      'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE TRUNCATE ON TABLES FROM anon, authenticated;'
    );
  });

  it('does not grant anything in its executable body', () => {
    expect(active).not.toMatch(/\bGRANT\b/i);
  });

  it('documents a rollback that restores TRUNCATE rather than GRANT ALL', () => {
    const rollback = migration.slice(
      migration.indexOf('-- ROLLBACK'),
      migration.indexOf('\nBEGIN;')
    );
    expect(rollback).toMatch(/GRANT TRUNCATE ON public\./);
    expect(rollback).toMatch(
      /DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT TRUNCATE/
    );
    expect(rollback).not.toMatch(/GRANT ALL/i);
  });

  it('no later migration re-grants TRUNCATE or ALL to anon/authenticated', () => {
    const later = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql') && f > MIGRATION_FILE)
      .sort();

    const offenders: string[] = [];
    for (const f of later) {
      // Strip comments so rollback blocks that quote old grants do not trip this.
      const sql = read(f)
        .replace(/--[^\n]*/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\s+/g, ' ');
      for (const s of sql.split(';')) {
        const grantsTruncate = /\bGRANT\b[^;]*\bTRUNCATE\b/i.test(s);
        const grantsAllToApi =
          /\bGRANT\s+ALL\b[^;]*\bTO\b[^;]*\b(anon|authenticated)\b/i.test(s) &&
          !/\bON\s+(FUNCTION|FUNCTIONS|SEQUENCE|SEQUENCES|ROUTINE|ROUTINES)\b/i.test(s);
        if (grantsTruncate || grantsAllToApi) offenders.push(`${f}: ${s.trim().slice(0, 120)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
