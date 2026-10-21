import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveEntityDisplay } from '@/lib/audit/recorder';
import { AUDIT_ENTITY_LABELS } from '@/types/database';

/**
 * Static checks on the admin titles and resident-link migration (#823). Only the migration text
 * is pinned; nothing here connects to a database. The header's probe exercises the triggers on
 * the database inside a transaction that ends in ROLLBACK.
 */

const root = fileURLToPath(new URL('../..', import.meta.url));
const sql = readFileSync(
  path.join(root, 'supabase/migrations/20261022150000_admin_titles_and_resident_link.sql'),
  'utf8'
)
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n')
  .replace(/\s+/g, ' ')
  .trim();

const fn = (name: string) => {
  const from = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}()`);
  expect(from).toBeGreaterThanOrEqual(0);
  return sql.slice(from, sql.indexOf('$$;', from));
};

describe('admin titles migration (static)', () => {
  it('changes nobody\'s access: no role is flagged and no existing row is written or scanned', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS requires_resident boolean NOT NULL DEFAULT false');
    expect(sql).not.toMatch(/requires_resident\s*=\s*true/i);
    expect(sql).not.toMatch(/INSERT INTO public\.admin_titles/i);
    // The only profiles UPDATE is the removal inside its trigger function.
    expect(sql.match(/UPDATE public\.profiles/g)).toHaveLength(1);
    expect(fn('remove_resident_admin_roles')).toContain('UPDATE public.profiles SET role_id = NULL, title_id = NULL');
    expect(sql).not.toMatch(/CONSTRAINT TRIGGER/i);
  });

  it('defines admin_titles with seats, one principal per role and manage_roles writes', () => {
    expect(sql).toContain('CONSTRAINT admin_titles_role_name_key UNIQUE (role_id, name)');
    expect(sql).toContain('CHECK (seats IS NULL OR seats >= 1)');
    expect(sql).toContain('ON public.admin_titles (role_id) WHERE is_principal');
    expect(sql).toContain('CREATE POLICY admin_titles_select ON public.admin_titles FOR SELECT TO authenticated USING (true)');
    for (const cmd of ['insert', 'update', 'delete']) {
      const from = sql.indexOf(`CREATE POLICY admin_titles_${cmd}`);
      expect(from).toBeGreaterThanOrEqual(0);
      expect(sql.slice(from, sql.indexOf(';', from))).toContain("public.has_permission('system.manage_roles')");
    }
    expect(sql).toContain('title_id uuid NULL REFERENCES public.admin_titles(id) ON DELETE SET NULL');
    expect(sql).toContain('GRANT SELECT (title_id) ON public.profiles TO authenticated');
    expect(sql).not.toMatch(/GRANT UPDATE[^;]*title_id/i);
  });

  it('runs both trigger functions as definer with an empty search_path and no API EXECUTE', () => {
    for (const name of ['enforce_profile_role_rules', 'remove_resident_admin_roles']) {
      expect(fn(name)).toContain("SECURITY DEFINER SET search_path = ''");
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${name}() FROM PUBLIC, anon, authenticated`);
    }
  });

  it('checks only values that change, clears the title on a role change, and locks the title for seats', () => {
    const body = fn('enforce_profile_role_rules');
    expect(sql).toContain('BEFORE INSERT OR UPDATE OF role_id, resident_id, title_id ON public.profiles');
    expect(body).toContain(
      'NEW.role_id IS DISTINCT FROM OLD.role_id AND NEW.title_id IS NOT DISTINCT FROM OLD.title_id THEN NEW.title_id := NULL'
    );
    expect(body).toContain(
      '(v_is_insert OR NEW.role_id IS DISTINCT FROM OLD.role_id OR NEW.resident_id IS DISTINCT FROM OLD.resident_id)'
    );
    expect(body).toContain('IF v_requires_resident THEN RAISE EXCEPTION');
    expect(body).toContain('(v_is_insert OR NEW.title_id IS DISTINCT FROM OLD.title_id)');
    expect(body).toContain('WHERE t.id = NEW.title_id FOR UPDATE');
    expect(body).toContain('IF v_title_role IS DISTINCT FROM NEW.role_id THEN');
    expect(body).toContain('WHERE p.title_id = NEW.title_id AND p.id <> NEW.id');
    expect(body).toContain('IF v_holders >= v_seats THEN');
  });

  it('removes resident roles only when account_status leaves active, with an UNASSIGN audit row', () => {
    expect(sql).toContain(
      "AFTER UPDATE OF account_status ON public.residents FOR EACH ROW WHEN (OLD.account_status = 'active' AND NEW.account_status IS DISTINCT FROM 'active')"
    );
    const body = fn('remove_resident_admin_roles');
    expect(body).toContain('WHERE p.resident_id = NEW.id AND r.requires_resident');
    expect(body).toContain("v_actor, 'UNASSIGN', 'profiles', v_profile.id,");
  });
});

describe('admin_titles audit entity', () => {
  it('has a label and resolves its display from the title name', () => {
    expect(AUDIT_ENTITY_LABELS.admin_titles).toBe('Admin Title');
    expect(resolveEntityDisplay('admin_titles', { name: 'Vice Chairman', role_id: 'r1' })).toBe('Vice Chairman');
  });
});
