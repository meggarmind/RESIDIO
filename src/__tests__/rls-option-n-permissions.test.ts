import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { PERMISSIONS } from '@/lib/auth/action-roles';

/**
 * Issue #63, Option N. The last 62 policies comparing `get_my_role_name()` with role-name
 * literals, and the documents policy comparing `app_roles.name` with 'resident', move to
 * `(select has_permission(...))` on 15 new permissions, each seeded to exactly the roles the
 * literal names today. Owner decision 2026-10-20: zero access change.
 *
 * This test pins the migration to the live definitions captured in
 * `fixtures/rls-option-n-policies.json` (identical on Residio_Stage and Residio_Prod): every
 * ALTER must equal the original with ONLY the role literal swapped for the mapped permission,
 * that literal's role set must equal the roles the migration grants the permission, and the
 * commented rollback must restore every original verbatim and drop the 15 permissions. Nothing
 * here connects to a database; the Stage rollback probe is recorded on the PR.
 */

const MIGRATION = '20261020200000_rls_option_n_permissions.sql';
const migrationPath = path.join(
  fileURLToPath(new URL('../../supabase/migrations', import.meta.url)),
  MIGRATION
);
const fixturePath = fileURLToPath(new URL('./fixtures/rls-option-n-policies.json', import.meta.url));

interface Policy {
  table: string;
  policy: string;
  cmd: string;
  using: string | null;
  check: string | null;
}

const C = ['chairman', 'financial_officer', 'super_admin', 'vice_chairman'];
const B = ['chairman', 'super_admin', 'vice_chairman'];

/** The role set each new permission is seeded to; it must equal every literal it replaces. */
const ROLES_FOR: Record<string, string[]> = {
  'houses.manage_records': C,
  'residents.manage_records': C,
  'residents.delete_records': ['super_admin'],
  'security.view_active_residents': ['security_officer'],
  'security.manage_records': C,
  'security.operate_records': [...C, 'security_officer'].sort(),
  'security.write_contact_categories': ['super_admin'],
  'billing.write_profiles': C,
  'notifications.manage_delivery': C,
  'payments.manage_reference_records': C,
  'payments.write_transaction_tags': ['super_admin'],
  'settings.write_property_reference': B,
  'settings.write_system': B,
  'system.view_all_profiles': B,
  // every role except resident: the old documents policy's "role <> 'resident'" test
  'documents.view_all': [...C, 'project_manager', 'secretary', 'security_officer'].sort(),
};

/** The 62 role-literal policies and the permission each now checks. */
const PERMISSION_FOR: Record<string, string> = {
  'access_codes|access_codes_insert_policy': 'security.manage_records',
  'access_codes|access_codes_select_policy': 'security.operate_records',
  'access_codes|access_codes_update_policy': 'security.operate_records',
  'access_logs|access_logs_insert_policy': 'security.operate_records',
  'access_logs|access_logs_select_policy': 'security.operate_records',
  'access_logs|access_logs_update_policy': 'security.operate_records',
  'billing_items|Admins chairmen fin sec can manage billing items': 'billing.write_profiles',
  'billing_profiles|Admins chairmen fin sec can manage billing profiles': 'billing.write_profiles',
  'email_logs|Admins can view email logs': 'notifications.manage_delivery',
  'escalation_states|escalation_states_insert': 'notifications.manage_delivery',
  'escalation_states|escalation_states_select': 'notifications.manage_delivery',
  'escalation_states|escalation_states_update': 'notifications.manage_delivery',
  'estate_bank_accounts|Admins chairmen fin sec can manage bank accounts': 'payments.manage_reference_records',
  'estate_bank_accounts|All authenticated can view active bank accounts': 'payments.manage_reference_records',
  'hierarchical_settings|hierarchical_settings_admin_all': 'settings.write_system',
  'house_ownership_history|Authorized users can insert ownership history': 'houses.manage_records',
  'house_types|Admins and chairmen can delete house types': 'settings.write_property_reference',
  'house_types|Admins and chairmen can insert house types': 'settings.write_property_reference',
  'house_types|Admins and chairmen can update house types': 'settings.write_property_reference',
  'house_types|All authenticated users can view active house types': 'settings.write_property_reference',
  'houses|Admins chairmen and fin sec can delete houses': 'houses.manage_records',
  'houses|Admins chairmen and fin sec can insert houses': 'houses.manage_records',
  'houses|Admins chairmen and fin sec can update houses': 'houses.manage_records',
  'houses|All authenticated users can view active houses': 'houses.manage_records',
  'notification_history|notification_history_select': 'notifications.manage_delivery',
  'notification_preferences|notification_preferences_insert': 'notifications.manage_delivery',
  'notification_preferences|notification_preferences_update': 'notifications.manage_delivery',
  'notification_queue|notification_queue_insert': 'notifications.manage_delivery',
  'notification_queue|notification_queue_select': 'notifications.manage_delivery',
  'profiles|Admins and chairmen can view all profiles': 'system.view_all_profiles',
  'property_transition_requests|House managers can create property transition requests': 'houses.manage_records',
  'property_transition_requests|House managers can view property transition requests': 'houses.manage_records',
  'resident_houses|Admins chairmen fin sec can delete resident houses': 'houses.manage_records',
  'resident_houses|Admins chairmen fin sec can insert resident houses': 'houses.manage_records',
  'resident_houses|Admins chairmen fin sec can update resident houses': 'houses.manage_records',
  'resident_houses|Admins chairmen fin sec can view all resident houses': 'houses.manage_records',
  'resident_houses|Security officers can view active resident houses': 'security.view_active_residents',
  'resident_payment_aliases|Admin, Chairman, Financial Secretary can manage aliases': 'residents.manage_records',
  'residents|Admins chairmen fin sec can insert residents': 'residents.manage_records',
  'residents|Admins chairmen fin sec can update residents': 'residents.manage_records',
  'residents|Admins chairmen fin sec can view all residents': 'residents.manage_records',
  'residents|Only admins can delete residents': 'residents.delete_records',
  'residents|Security officers can view active residents': 'security.view_active_residents',
  'security_contact_categories|security_contact_categories_delete_policy': 'security.write_contact_categories',
  'security_contact_categories|security_contact_categories_insert_policy': 'security.write_contact_categories',
  'security_contact_categories|security_contact_categories_update_policy': 'security.write_contact_categories',
  'security_contacts|security_contacts_insert_policy': 'security.manage_records',
  'security_contacts|security_contacts_select_policy': 'security.operate_records',
  'security_contacts|security_contacts_update_policy': 'security.manage_records',
  'streets|Admins and chairmen can delete streets': 'settings.write_property_reference',
  'streets|Admins and chairmen can insert streets': 'settings.write_property_reference',
  'streets|Admins and chairmen can update streets': 'settings.write_property_reference',
  'streets|All authenticated users can view active streets': 'settings.write_property_reference',
  'system_settings|system_settings_insert_policy': 'settings.write_system',
  'system_settings|system_settings_update_policy': 'settings.write_system',
  'transaction_tags|Authenticated users can view transaction tags': 'payments.manage_reference_records',
  'transaction_tags|Only admin can create transaction tags': 'payments.write_transaction_tags',
  'transaction_tags|Only admin can delete transaction tags': 'payments.write_transaction_tags',
  'transaction_tags|Only admin can update transaction tags': 'payments.write_transaction_tags',
  'visitor_vehicles|visitor_vehicles_insert_policy': 'security.manage_records',
  'visitor_vehicles|visitor_vehicles_select_policy': 'security.operate_records',
  'visitor_vehicles|visitor_vehicles_update_policy': 'security.manage_records',
};

const DOCUMENTS = 'documents|Users can view documents based on permissions';
const DOCUMENTS_USING =
  "((is_archived = false) AND (select has_permission('documents.view'::text)) AND ((select has_permission('documents.view_all'::text)) OR (category_id IS NULL) OR (EXISTS ( SELECT 1\n" +
  '   FROM document_categories dc\n' +
  '  WHERE ((dc.id = documents.category_id) AND (dc.is_resident_accessible = true))))))';

const ROLE_LITERAL = /get_my_role_name\(\) = (ANY \(ARRAY\[[^\]]*\]\)|'[a-z_]+'::text)/g;

const originals: Policy[] = JSON.parse(readFileSync(fixturePath, 'utf8'));
const keyOf = (p: { table: string; policy: string }) => `${p.table}|${p.policy}`;

/** Independent expectation: swap the literal for the wrapped permission check. */
const rewrite = (text: string, permission: string) =>
  text.replace(ROLE_LITERAL, `(select has_permission('${permission}'::text))`);

interface Altered {
  policy: string;
  table: string;
  using: string | null;
  check: string | null;
}

const splitStatements = (sql: string) =>
  sql.split(/;(?:\n|$)/).map((s) => s.trim()).filter(Boolean);

function parseAlter(stmt: string): Altered {
  const head = /^ALTER POLICY "([^"]+)" ON public\.([a-z_]+)\n/.exec(stmt);
  if (!head) throw new Error(`Unrecognised statement:\n${stmt.slice(0, 200)}`);
  const rest = stmt.slice(head[0].length);
  const using = /^ {2}USING \(\n([\s\S]*?)\n {2}\)(?=\n {2}WITH CHECK|$)/.exec(rest);
  const afterUsing = using ? rest.slice(using[0].length).replace(/^\n/, '') : rest;
  const check = /^ {2}WITH CHECK \(\n([\s\S]*?)\n {2}\)$/.exec(afterUsing);
  if (!using && !check) throw new Error(`No clause in:\n${stmt.slice(0, 200)}`);
  if (using && afterUsing && !check) throw new Error(`Trailing text in:\n${stmt.slice(0, 200)}`);
  return { policy: head[1], table: head[2], using: using?.[1] ?? null, check: check?.[1] ?? null };
}

/** Splits a migration into its commented rollback lines and its executable body. */
function splitMigration(sql: string): { rollback: string; body: string } {
  const rollbackLines: string[] = [];
  const bodyLines: string[] = [];
  let inRollback = false;
  for (const line of sql.split('\n')) {
    if (line === '-- BEGIN;') {
      inRollback = true;
      continue;
    }
    if (line === '-- COMMIT;') {
      inRollback = false;
      continue;
    }
    if (inRollback) rollbackLines.push(line.replace(/^-- ?/, ''));
    else if (!line.startsWith('--')) bodyLines.push(line);
  }
  return { rollback: rollbackLines.join('\n'), body: bodyLines.join('\n') };
}

const sql = readFileSync(migrationPath, 'utf8');
const { rollback, body } = splitMigration(sql);
const statements = splitStatements(body);
const isAlter = (s: string) => s.startsWith('ALTER POLICY ');
const altered = statements.filter(isAlter).map(parseAlter);
const rollbackStatements = splitStatements(rollback);
const rolledBack = rollbackStatements.filter(isAlter).map(parseAlter);

/** Permission name -> category, from the single app_permissions seed. */
const seeded = new Map<string, string>();
for (const s of statements.filter((s) => s.startsWith('INSERT INTO public.app_permissions'))) {
  for (const m of s.matchAll(/^ {2}\('([a-z_.]+)', '(?:[^']|'')*', '(?:[^']|'')*', '([a-z_]+)', true\)/gm)) {
    seeded.set(m[1], m[2]);
  }
}

/** Permission name -> roles granted, from the role_permissions seeds. */
const granted = new Map<string, string[]>();
for (const s of statements.filter((s) => s.startsWith('INSERT INTO public.role_permissions'))) {
  const m = /WHERE p\.name = '([a-z_.]+)'\n {2}AND r\.name IN \(([^)]*)\)\nON CONFLICT \(role_id, permission_id\) DO NOTHING$/.exec(s);
  if (!m) throw new Error(`Unrecognised grant:\n${s}`);
  if (granted.has(m[1])) throw new Error(`Granted twice: ${m[1]}`);
  granted.set(m[1], [...m[2].matchAll(/'([a-z_]+)'/g)].map((r) => r[1]).sort());
}

const find = (list: Altered[], p: { table: string; policy: string }) =>
  list.filter((a) => a.table === p.table && a.policy === p.policy);
const clauses = (p: { using: string | null; check: string | null }) =>
  `${p.using ?? ''} ${p.check ?? ''}`;

describe('Option N: role-literal RLS policies move to dedicated permissions (#63)', () => {
  it('fixture holds the 62 literal policies plus the documents policy, on 26 tables', () => {
    expect(originals).toHaveLength(63);
    expect(new Set(originals.map((p) => p.table)).size).toBe(26);
    const literal = originals.filter((p) => new RegExp(ROLE_LITERAL.source).test(clauses(p)));
    expect(literal.map(keyOf).sort()).toEqual(Object.keys(PERMISSION_FOR).sort());
    expect(originals.map(keyOf)).toContain(DOCUMENTS);
  });

  it('is a single transaction: seed, grants, then the policy changes', () => {
    expect(statements[0]).toBe('BEGIN');
    expect(statements.at(-1)).toBe('COMMIT');
    const kinds = statements.slice(1, -1).map((s) => s.split(' ').slice(0, 3).join(' '));
    expect(kinds[0]).toBe('INSERT INTO public.app_permissions');
    expect(kinds.slice(1, 16).every((k) => k === 'INSERT INTO public.role_permissions')).toBe(true);
    expect(statements.slice(17, -1).every(isAlter)).toBe(true);
  });

  it('seeds exactly the 15 permissions, active, each with a PERMISSIONS constant', () => {
    expect([...seeded.keys()].sort()).toEqual(Object.keys(ROLES_FOR).sort());
    const constants = new Set<string>(Object.values(PERMISSIONS));
    for (const [name, category] of seeded) {
      expect(constants.has(name)).toBe(true);
      expect(name.split('.')[0]).toBe(category);
    }
  });

  it('grants each permission to exactly its role set', () => {
    expect([...granted.keys()].sort()).toEqual(Object.keys(ROLES_FOR).sort());
    for (const [name, roles] of granted) expect(roles).toEqual(ROLES_FOR[name]);
  });

  it('alters exactly the fixture policies, once each', () => {
    const keys = altered.map(keyOf);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.sort()).toEqual(originals.map(keyOf).sort());
  });

  it('leaves no role-name comparison in any altered policy', () => {
    for (const a of altered) {
      expect(clauses(a)).not.toContain('get_my_role_name');
      expect(clauses(a)).not.toMatch(/ar\.name|app_roles/);
    }
  });

  it('rewrites the documents policy to documents.view plus documents.view_all', () => {
    const [a] = find(altered, { table: 'documents', policy: DOCUMENTS.split('|')[1] });
    expect(a.using).toBe(DOCUMENTS_USING);
    expect(a.check).toBeNull();
  });

  describe.each(originals.filter((p) => keyOf(p) !== DOCUMENTS))('$table / $policy', (original) => {
    const [a] = find(altered, original);
    const permission = PERMISSION_FOR[keyOf(original)];

    it('swaps only the role literal, in USING and WITH CHECK', () => {
      expect(a.using).toBe(original.using === null ? null : rewrite(original.using, permission));
      expect(a.check).toBe(original.check === null ? null : rewrite(original.check, permission));
    });

    it('replaces a literal role set equal to the roles granted the permission', () => {
      const sets = [...clauses(original).matchAll(ROLE_LITERAL)].map((m) =>
        [...m[0].matchAll(/'([a-z_]+)'/g)].map((r) => r[1]).sort()
      );
      expect(sets.length).toBeGreaterThan(0);
      for (const s of sets) expect(s).toEqual(granted.get(permission));
    });
  });

  it('rollback restores every original verbatim, then drops the 15 permissions', () => {
    expect(rolledBack).toHaveLength(originals.length);
    for (const original of originals) {
      const back = find(rolledBack, original);
      expect(back).toHaveLength(1);
      expect(back[0].using).toBe(original.using);
      expect(back[0].check).toBe(original.check);
    }
    const drop = rollbackStatements.at(-1) ?? '';
    expect(drop).toMatch(/^DELETE FROM public\.app_permissions WHERE name IN \(/);
    expect([...drop.matchAll(/'([a-z_.]+)'/g)].map((m) => m[1]).sort()).toEqual(
      Object.keys(ROLES_FOR).sort()
    );
  });
});
