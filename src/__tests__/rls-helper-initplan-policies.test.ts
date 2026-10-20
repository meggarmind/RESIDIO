import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Issue #63. Policies that call the RLS helpers bare (`has_permission('x')`,
 * `get_my_resident_id()`, ...) re-evaluate them per row. The migration wraps each
 * call as `(select helper(...))`, a once-per-statement InitPlan, and replaces the
 * `get_my_role_name() = ANY (ARRAY[...])` literal comparisons that have an exact
 * same-domain permission with `has_permission()`.
 *
 * The change must not alter who can see or do anything, so this test pins it to
 * the live definitions captured in `fixtures/rls-helper-initplan-policies.json`:
 * for every policy the migration alters, the new USING / WITH CHECK text must
 * equal the original with ONLY the helper calls wrapped and, for the policies in
 * PERMISSION_FOR, the role-literal comparison swapped for that permission. The
 * commented rollback must restore every original verbatim. That each permission's
 * role set equals the literal set it replaces was checked against Residio_Stage
 * and Residio_Prod when the migration was written; nothing here connects to a
 * database.
 */

const MIGRATION = '20261020150000_rls_helper_initplan_and_exact_permissions.sql';
const migrationPath = path.join(
  fileURLToPath(new URL('../../supabase/migrations', import.meta.url)),
  MIGRATION
);
const fixturePath = fileURLToPath(
  new URL('./fixtures/rls-helper-initplan-policies.json', import.meta.url)
);

interface Policy {
  table: string;
  policy: string;
  cmd: string;
  using: string | null;
  check: string | null;
}

/** The 29 literal policies whose exact-role-set permission is in their own domain. */
const PERMISSION_FOR: Record<string, string> = {
  'invoices|Admins chairmen fin sec can manage all invoices': 'billing.create_invoice',
  'invoice_items|Admins chairmen fin sec can manage all invoice items': 'billing.create_invoice',
  'house_levy_history|house_levy_history_delete_policy': 'system.manage_data_retention',
  'house_levy_history|house_levy_history_insert_policy': 'billing.create_invoice',
  'house_levy_history|house_levy_history_update_policy': 'billing.create_invoice',
  'resident_wallets|Admins chairmen fin sec can manage wallets': 'billing.manage_wallets',
  'wallet_transactions|Admins chairmen fin sec can view all transactions': 'billing.manage_wallets',
  'wallet_settlement_requests|Finance can create wallet settlement requests': 'billing.manage_wallets',
  'wallet_settlement_requests|Finance can view wallet settlement requests': 'billing.manage_wallets',
  'bank_statement_imports|Admin, Chairman, Financial Secretary can manage imports': 'imports.create',
  'bank_statement_rows|Admin, Chairman, Financial Secretary can manage import rows': 'imports.create',
  'house_ownership_history|Only admins can update ownership history': 'system.manage_data_retention',
  'access_codes|access_codes_delete_policy': 'security.suspend_revoke',
  'security_contacts|security_contacts_delete_policy': 'security.suspend_revoke',
  'visitor_vehicles|visitor_vehicles_delete_policy': 'security.suspend_revoke',
  'access_logs|access_logs_delete_policy': 'system.manage_data_retention',
  'profiles|Admins can delete profiles': 'system.assign_roles',
  'profiles|Admins can insert profiles': 'system.assign_roles',
  'system_settings|system_settings_delete_policy': 'system.view_all_settings',
  'notification_templates|notification_templates_delete': 'notifications.manage',
  'notification_templates|notification_templates_insert': 'notifications.manage',
  'notification_templates|notification_templates_update': 'notifications.manage',
  'notification_schedules|notification_schedules_delete': 'notifications.manage',
  'notification_schedules|notification_schedules_insert': 'notifications.manage',
  'notification_schedules|notification_schedules_update': 'notifications.manage',
  'notification_queue|notification_queue_delete': 'notifications.manage',
  'notification_queue|notification_queue_update': 'notifications.manage',
  'notification_preferences|notification_preferences_delete': 'notifications.manage',
  'escalation_states|escalation_states_delete': 'notifications.manage',
};

/** The role set each permission above is held by, which the replaced literal must equal. */
const ROLES_FOR: Record<string, string[]> = {
  'billing.create_invoice': ['chairman', 'financial_officer', 'super_admin', 'vice_chairman'],
  'billing.manage_wallets': ['chairman', 'financial_officer', 'super_admin', 'vice_chairman'],
  'imports.create': ['chairman', 'financial_officer', 'super_admin', 'vice_chairman'],
  'security.suspend_revoke': ['chairman', 'super_admin', 'vice_chairman'],
  'notifications.manage': ['chairman', 'super_admin', 'vice_chairman'],
  'system.manage_data_retention': ['super_admin'],
  'system.assign_roles': ['super_admin'],
  'system.view_all_settings': ['super_admin'],
};

const ROLE_LITERAL = /get_my_role_name\(\) = (ANY \(ARRAY\[[^\]]*\]\)|'[a-z_]+'::text)/g;

const originals: Policy[] = JSON.parse(readFileSync(fixturePath, 'utf8'));
const keyOf = (p: { table: string; policy: string }) => `${p.table}|${p.policy}`;

/** Independent expectation: swap the literal (if mapped), then the simplest textual wrap. */
function rewrite(text: string, permission: string | undefined): string {
  const swapped = permission
    ? text.replace(ROLE_LITERAL, `has_permission('${permission}'::text)`)
    : text;
  return swapped
    .replace(/has_permission\('([^']*)'::text\)/g, "(select has_permission('$1'::text))")
    .replace(/get_my_resident_id\(\)/g, '(select get_my_resident_id())')
    .replace(/is_super_admin\(\)/g, '(select is_super_admin())')
    .replace(/is_approved\(\)/g, '(select is_approved())')
    .replace(/is_resident\(\)/g, '(select is_resident())');
}

interface Altered {
  policy: string;
  table: string;
  using: string | null;
  check: string | null;
}

const splitStatements = (sql: string) =>
  sql.split(/;(?:\n|$)/).map((s) => s.trim()).filter(Boolean);

function parseStatements(statements: string[]): Altered[] {
  const out: Altered[] = [];
  for (const stmt of statements) {
    const head = /^ALTER POLICY "([^"]+)" ON public\.([a-z_]+)\n/.exec(stmt);
    if (!head) throw new Error(`Unrecognised statement:\n${stmt.slice(0, 200)}`);
    const rest = stmt.slice(head[0].length);
    const using = /^ {2}USING \(\n([\s\S]*?)\n {2}\)(?=\n {2}WITH CHECK|$)/.exec(rest);
    const afterUsing = using ? rest.slice(using[0].length).replace(/^\n/, '') : rest;
    const check = /^ {2}WITH CHECK \(\n([\s\S]*?)\n {2}\)$/.exec(afterUsing);
    if (!using && !check) throw new Error(`No clause in:\n${stmt.slice(0, 200)}`);
    if (using && afterUsing && !check) throw new Error(`Trailing text in:\n${stmt.slice(0, 200)}`);
    out.push({ policy: head[1], table: head[2], using: using?.[1] ?? null, check: check?.[1] ?? null });
  }
  return out;
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
const altered = parseStatements(statements.slice(1, -1));
const rolledBack = parseStatements(splitStatements(rollback));

const find = (list: Altered[], p: Policy) =>
  list.filter((a) => a.table === p.table && a.policy === p.policy);
const clauses = (p: { using: string | null; check: string | null }) =>
  `${p.using ?? ''} ${p.check ?? ''}`;

describe('hoist RLS helper calls and swap exact-match role literals (#63)', () => {
  it('fixture holds the 134 in-scope policies on 77 tables', () => {
    expect(originals).toHaveLength(134);
    expect(new Set(originals.map((p) => p.table)).size).toBe(77);
  });

  it('maps exactly 29 literal policies, all present in the fixture', () => {
    const keys = Object.keys(PERMISSION_FOR);
    expect(keys).toHaveLength(29);
    const fixtureKeys = new Set(originals.map(keyOf));
    for (const k of keys) expect(fixtureKeys.has(k)).toBe(true);
  });

  it('includes no role-literal policy outside the mapped 29 (the owner-call ones stay out)', () => {
    const literal = originals.filter((p) => new RegExp(ROLE_LITERAL.source).test(clauses(p)));
    expect(literal.map(keyOf).sort()).toEqual(Object.keys(PERMISSION_FOR).sort());
  });

  it('leaves out the documents role-name policy and the housemates policy', () => {
    for (const k of [
      'documents|Users can view documents based on permissions',
      'resident_houses|Residents can view housemates house assignments',
    ]) {
      expect(originals.map(keyOf)).not.toContain(k);
      expect(altered.map(keyOf)).not.toContain(k);
    }
  });

  it('is a single transaction', () => {
    expect(statements[0]).toBe('BEGIN');
    expect(statements.at(-1)).toBe('COMMIT');
  });

  it('alters exactly the fixture policies, once each, and nothing else', () => {
    const keys = altered.map(keyOf);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.sort()).toEqual(originals.map(keyOf).sort());
  });

  it('removes every get_my_role_name() call from the altered policies', () => {
    for (const a of altered) expect(clauses(a)).not.toContain('get_my_role_name');
  });

  describe.each(originals)('$table / $policy', (original) => {
    const matches = find(altered, original);
    const permission = PERMISSION_FOR[keyOf(original)];

    it('has exactly one ALTER POLICY statement', () => {
      expect(matches).toHaveLength(1);
    });

    it('rewrites USING and changes nothing else', () => {
      const [a] = matches;
      expect(a.using).toBe(original.using === null ? null : rewrite(original.using, permission));
    });

    it('rewrites WITH CHECK and changes nothing else', () => {
      const [a] = matches;
      expect(a.check).toBe(original.check === null ? null : rewrite(original.check, permission));
    });

    it('leaves no bare scalar helper call outside (select ...)', () => {
      const [a] = matches;
      const stripped = clauses(a).replace(
        /\(select (has_permission\('[^']*'::text\)|get_my_resident_id\(\)|is_super_admin\(\)|is_approved\(\)|is_resident\(\))\)/g,
        ''
      );
      expect(stripped).not.toMatch(/(has_permission|get_my_resident_id|is_super_admin|is_approved|is_resident)\(/);
      expect(clauses(a)).not.toMatch(/\(select \(select/);
    });

    if (permission) {
      it('replaces a literal set equal to the permission role set', () => {
        const sets = [...clauses(original).matchAll(ROLE_LITERAL)].map((m) =>
          [...m[0].matchAll(/'([a-z_]+)'/g)].map((r) => r[1]).sort()
        );
        expect(sets.length).toBeGreaterThan(0);
        for (const s of sets) expect(s).toEqual(ROLES_FOR[permission]);
      });
    }

    it('rollback restores the original verbatim', () => {
      const back = find(rolledBack, original);
      expect(back).toHaveLength(1);
      expect(back[0].using).toBe(original.using);
      expect(back[0].check).toBe(original.check);
    });
  });

  it('rollback covers exactly the fixture policies', () => {
    expect(rolledBack).toHaveLength(originals.length);
  });
});
