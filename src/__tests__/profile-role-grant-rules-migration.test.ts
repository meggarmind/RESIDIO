import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));

import {
  CANNOT_CHANGE_ACCOUNT_ERROR,
  CANNOT_GRANT_ROLE_ERROR,
  permissionToGrant,
  permissionToManage,
} from '@/lib/auth/account-guards';

/**
 * Static checks on the database copy of the role grant rule (#991). Only the migration text is
 * pinned; nothing here connects to a database. docs/security/probe-991-role-grants.sql exercises
 * the same rule on Residio_Stage inside a rolled-back transaction.
 */

const root = fileURLToPath(new URL('../..', import.meta.url));
const migrationsDir = path.join(root, 'supabase/migrations');
const FILE = '20261023110000_profile_role_grant_rules.sql';

const normalize = (text: string) =>
  text
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim();

const raw = readFileSync(path.join(migrationsDir, FILE), 'utf8');
const sql = normalize(raw);
const body = sql.slice(sql.indexOf('AS $$'), sql.indexOf('$$;'));

const roleList = (name: string): string[] => {
  const match = body.match(new RegExp(`${name} CONSTANT text\\[\\] := ARRAY\\[([^\\]]*)\\]`));
  expect(match, `${name} is declared`).not.toBeNull();
  return [...match![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
};

// SQL: CASE WHEN <role name> = ANY (<list>) THEN board ELSE assign_roles; a NULL name is never in it.
const sqlPermission = (list: string[], roleName: string | null) =>
  roleName !== null && list.includes(roleName) ? 'system.assign_board_roles' : 'system.assign_roles';

// Every role seeded by 20261022160000, plus a custom role and an account with no role.
const ROLES = [
  'super_admin',
  'chairman',
  'trustee',
  'financial_officer',
  'secretary',
  'security_officer',
  'welfare_officer',
  'security_guard_supervisor',
  'some_custom_role',
];

describe('profile role grant rules migration (static)', () => {
  it('needs the same permission as the app to grant each role', () => {
    const list = roleList('v_board_grant_roles');
    for (const role of ROLES) {
      expect(sqlPermission(list, role), role).toBe(permissionToGrant(role));
    }
  });

  it('needs the same permission as the app to change or delete an account holding each role', () => {
    const list = roleList('v_board_account_roles');
    for (const role of [...ROLES, null]) {
      expect(sqlPermission(list, role), String(role)).toBe(permissionToManage(role));
    }
  });

  it('asks has_permission about the role being given and the role held now', () => {
    expect(body).toContain(
      "SELECT r.name INTO v_new_role_name FROM public.app_roles r WHERE r.id = NEW.role_id; IF NOT public.has_permission( CASE WHEN v_new_role_name = ANY (v_board_grant_roles) THEN 'system.assign_board_roles' ELSE 'system.assign_roles' END) THEN"
    );
    expect(body).toContain(
      "SELECT r.name INTO v_old_role_name FROM public.app_roles r WHERE r.id = OLD.role_id; IF NOT public.has_permission( CASE WHEN v_old_role_name = ANY (v_board_account_roles) THEN 'system.assign_board_roles' ELSE 'system.assign_roles' END) THEN"
    );
  });

  it("refuses with insufficient_privilege and the app's own messages", () => {
    expect(body).toContain(
      `RAISE EXCEPTION '${CANNOT_GRANT_ROLE_ERROR}' USING ERRCODE = 'insufficient_privilege';`
    );
    expect(body).toContain(
      `RAISE EXCEPTION '${CANNOT_CHANGE_ACCOUNT_ERROR}' USING ERRCODE = 'insufficient_privilege';`
    );
  });

  it('checks every signed-in caller and skips only writes with no auth.uid()', () => {
    expect(body.match(/auth\.uid\(\)/g)).toHaveLength(1);
    expect(body).toContain('IF (SELECT auth.uid()) IS NOT NULL THEN IF TG_OP = \'DELETE\' OR');
  });

  it('judges deletes and role changes by the role held, and new roles on insert and change', () => {
    expect(body).toContain(
      "IF TG_OP = 'DELETE' OR (NOT v_is_insert AND NEW.role_id IS DISTINCT FROM OLD.role_id AND NOT (NEW.role_id IS NULL AND pg_trigger_depth() > 1)) THEN"
    );
    expect(body).toContain(
      "IF TG_OP <> 'DELETE' AND NEW.role_id IS NOT NULL AND (v_is_insert OR NEW.role_id IS DISTINCT FROM OLD.role_id) THEN"
    );
  });

  it('exempts only a removal made by another trigger, never a grant', () => {
    expect(body.match(/pg_trigger_depth\(\)/g)).toHaveLength(1);
    expect(body).toContain('NOT (NEW.role_id IS NULL AND pg_trigger_depth() > 1)');
  });

  it('returns OLD on delete after the grant check and before the #823 rules', () => {
    const grant = body.indexOf('IF (SELECT auth.uid()) IS NOT NULL');
    const ret = body.indexOf("IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;");
    const titles = body.indexOf('IF NOT v_is_insert AND NEW.role_id IS DISTINCT FROM OLD.role_id AND NEW.title_id');
    expect(grant).toBeGreaterThanOrEqual(0);
    expect(ret).toBeGreaterThan(grant);
    expect(titles).toBeGreaterThan(ret);
  });

  it('keeps every #823 rule of 20261022150000 unchanged', () => {
    const before = normalize(
      readFileSync(path.join(migrationsDir, '20261022150000_admin_titles_and_resident_link.sql'), 'utf8')
    );
    const start = before.indexOf('IF NOT v_is_insert AND NEW.role_id IS DISTINCT FROM OLD.role_id');
    const end = before.indexOf('RETURN NEW; END; $$;', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(body).toContain(before.slice(start, end) + 'RETURN NEW; END;');
  });

  it('fires the trigger on delete as well, and stays SECURITY DEFINER with an empty search_path', () => {
    expect(sql).toContain(
      'DROP TRIGGER IF EXISTS profiles_enforce_role_rules ON public.profiles; CREATE TRIGGER profiles_enforce_role_rules BEFORE INSERT OR DELETE OR UPDATE OF role_id, resident_id, title_id ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_role_rules();'
    );
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.enforce_profile_role_rules() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$"
    );
    expect(sql).toContain(
      'REVOKE ALL ON FUNCTION public.enforce_profile_role_rules() FROM PUBLIC, anon, authenticated;'
    );
  });

  it('writes a rollback to the previous trigger in its header', () => {
    expect(raw).toContain('-- ROLLBACK (restores 20261022150000 exactly):');
    expect(raw).toContain('--     BEFORE INSERT OR UPDATE OF role_id, resident_id, title_id ON public.profiles');
  });

  it('is still the latest definition of the function and the trigger', () => {
    const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    const latest = (needle: string) =>
      files.filter((f) => normalize(readFileSync(path.join(migrationsDir, f), 'utf8')).includes(needle)).pop();
    expect(latest('CREATE OR REPLACE FUNCTION public.enforce_profile_role_rules()')).toBe(FILE);
    expect(latest('CREATE TRIGGER profiles_enforce_role_rules')).toBe(FILE);
  });

  it('ships a probe that always rolls back', () => {
    const probe = normalize(readFileSync(path.join(root, 'docs/security/probe-991-role-grants.sql'), 'utf8'));
    expect(probe.startsWith('BEGIN;')).toBe(true);
    expect(probe).toMatch(/DO \$report\$ BEGIN RAISE EXCEPTION USING ERRCODE = 'P0991', [^$]* END \$report\$; ROLLBACK;$/);
    expect(probe).not.toMatch(/\bCOMMIT\b/);
  });
});
