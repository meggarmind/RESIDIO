import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Issue #237. `anonymous-read-closure.test.ts` (#212) guards the anon axis.
 * This file extends the same structural approach to the AUTHENTICATED axis:
 * a PERMISSIVE `USING (true)` SELECT/ALL policy granted to `authenticated` (or
 * `public`) lets every signed-in account, including a resident, read every row
 * of the table, and ORs with every sibling policy so no other predicate can
 * narrow it.
 *
 * Nothing here connects to a database. The migrations are replayed in
 * filename order into a model of the live policy set (CREATE / ALTER / DROP
 * POLICY, DROP TABLE), and the surviving open policies are compared against an
 * explicit allowlist. Known limit: policies created inside DO blocks or via
 * dynamic SQL are invisible to this model; the periodic live check in the
 * issue's "Reproduce" query is the backstop for those.
 */

const migrationsDir = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));

const RESTRICT_MIGRATION = '20261014120000_restrict_authenticated_read_policies.sql';
const KEY_SPLIT_MIGRATION = '20261014140000_system_settings_key_split.sql';

/**
 * Keys of system_settings readable by every signed-in user (owner decision
 * 2026-10-14, #237). Every other key requires settings.view. Adding a key here
 * is a deliberate, reviewed act: it exposes the value to residents.
 */
const SYSTEM_SETTINGS_PUBLIC_KEYS = [
  'maintenance_mode',
  'maintenance_message',
  'resident_portal_enabled',
  'dashboard_theme',
  'portal_theme',
  'estate_name',
  'estate_logo_url',
  'estate_address',
  'estate_email',
  'estate_phone',
  'estate_facebook_url',
  'estate_instagram_url',
  'estate_twitter_url',
  'estate_website_url',
  'security_gate_phone',
  'estate_manager_phone',
  'estate_manager_name',
  'disable_ai_assistant',
  'ai_assistant_greeting_enabled',
  'assistant_name',
];

/** Migrations strictly after this one may not add a new open policy at all. */
const BASELINE = RESTRICT_MIGRATION;

/**
 * Tables that still carry an open authenticated read policy, each with the
 * reason. Adding a table here is a deliberate, reviewed act.
 */
const ALLOWED_OPEN_READS: Record<string, string> = {
  billing_items: 'Declared reference data (#237): billable-item catalogue, readable by any signed-in user.',
  billing_profiles: 'Declared reference data (#237): levy profile catalogue, readable by any signed-in user.',
  notification_templates: 'Declared reference data (#237): message templates, readable by any signed-in user.',
  notification_schedules: 'Declared reference data (#237): reminder schedule definitions, readable by any signed-in user.',
  security_contact_categories: 'Declared reference data (#237): dropdown of contact categories.',
};

/** The eight tables this slice restricts, with the permission each now requires. */
const RESTRICTED: Record<string, string[]> = {
  resident_payment_cadence_summary: ['reports.view_financial'],
  report_archive: ['reports.view_financial'],
  role_assignment_rules: ['system.manage_roles', 'system.assign_roles'],
  petty_cash_accounts: ['view_expenditure', 'billing.view'],
  house_levy_history: ['billing.view', 'billing.create_invoice', 'houses.update'],
  house_ownership_history: ['houses.view', 'houses.assign_resident'],
  two_factor_policies: ['two_factor.manage_policies'],
  notification_preferences: ['notifications.view', 'residents.view'],
};

interface Policy {
  table: string;
  name: string;
  file: string;
  restrictive: boolean;
  cmd: string;
  roles: string;
  using: string | null;
}

const unquote = (s: string) => s.replace(/^"|"$/g, '');

function readMigration(file: string): string {
  return readFileSync(path.join(migrationsDir, file), 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*/g, '');
}

/** Normalised so `USING (true)`, `USING ((true))` and `USING ( TRUE )` agree. */
function isOpen(p: Policy): boolean {
  return (
    p.using !== null &&
    p.using.replace(/[\s()]/g, '').toLowerCase() === 'true' &&
    !p.restrictive &&
    /\b(authenticated|public)\b/i.test(p.roles) &&
    (p.cmd === 'SELECT' || p.cmd === 'ALL')
  );
}

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

/** Replay the migrations; returns the final live policies and, per file, the open policies it creates. */
function replay() {
  const live = new Map<string, Policy>();
  const introducedOpen: Array<{ file: string; table: string; name: string }> = [];

  for (const file of files) {
    for (const raw of readMigration(file).split(/;[ \t]*\n/)) {
      const st = raw.replace(/\s+/g, ' ').trim();
      let m: RegExpMatchArray | null;

      if ((m = st.match(/^DROP TABLE (?:IF EXISTS )?(?:public\.)?(\w+)/i))) {
        for (const key of [...live.keys()]) if (key.startsWith(`${m[1]}|`)) live.delete(key);
        continue;
      }
      if ((m = st.match(/^DROP POLICY (?:IF EXISTS )?("[^"]+"|\w+) ON (?:public\.)?(\w+)/i))) {
        live.delete(`${m[2]}|${unquote(m[1])}`);
        continue;
      }
      if ((m = st.match(/^CREATE POLICY ("[^"]+"|\w+) ON (?:public\.)?(\w+)(.*)$/i))) {
        const rest = m[3];
        const using = rest.match(/USING \((.*)\)(?: WITH CHECK.*)?$/i);
        const policy: Policy = {
          table: m[2],
          name: unquote(m[1]),
          file,
          restrictive: /AS RESTRICTIVE/i.test(rest),
          cmd: (rest.match(/FOR (ALL|SELECT|INSERT|UPDATE|DELETE)/i)?.[1] ?? 'ALL').toUpperCase(),
          roles: rest.match(/ TO ([\w, ]+?)(?= USING| WITH|$)/i)?.[1] ?? 'public',
          using: using ? using[1].trim() : null,
        };
        live.set(`${m[2]}|${policy.name}`, policy);
        if (isOpen(policy)) introducedOpen.push({ file, table: policy.table, name: policy.name });
        continue;
      }
      if ((m = st.match(/^ALTER POLICY ("[^"]+"|\w+) ON (?:public\.)?(\w+)(.*)$/i))) {
        const existing = live.get(`${m[2]}|${unquote(m[1])}`);
        if (!existing) continue;
        const using = m[3].match(/USING \((.*?)\)(?: WITH CHECK.*)?$/i);
        if (using) existing.using = using[1].trim();
        const to = m[3].match(/^\s*TO ([\w, ]+?)(?= USING| WITH|$)/i);
        if (to) existing.roles = to[1];
        if (isOpen(existing)) introducedOpen.push({ file, table: existing.table, name: existing.name });
      }
    }
  }
  return { live, introducedOpen };
}

const { live, introducedOpen } = replay();
const openTables = new Set([...live.values()].filter(isOpen).map((p) => p.table));

describe('#237: no USING (true) read policy for signed-in users beyond the allowlist', () => {
  it('the restricting migration exists under the agreed filename', () => {
    expect(files).toContain(RESTRICT_MIGRATION);
  });

  it('every open authenticated/public read policy still live belongs to an allowlisted table', () => {
    const unexpected = [...openTables].filter((t) => !(t in ALLOWED_OPEN_READS));
    expect(unexpected, `unreviewed USING (true) read policy on: ${unexpected.join(', ')}`).toEqual([]);
  });

  it('no migration after the baseline introduces a new open read policy', () => {
    const later = introducedOpen.filter((p) => p.file > BASELINE);
    expect(
      later,
      `new USING (true) policies after ${BASELINE}: ${later.map((p) => `${p.file}:${p.table}.${p.name}`).join(', ')}`
    ).toEqual([]);
  });

  it('every allowlist entry carries a reason and is still actually open', () => {
    for (const [table, reason] of Object.entries(ALLOWED_OPEN_READS)) {
      expect(reason.trim().length, `${table}: allowlist entry needs a reason`).toBeGreaterThan(20);
      expect(openTables.has(table), `${table} is allowlisted but no longer open: remove it`).toBe(true);
    }
  });

  it('the five declared reference tables are exactly the allowlist', () => {
    expect(Object.keys(ALLOWED_OPEN_READS).sort()).toEqual(
      [
        'billing_items',
        'billing_profiles',
        'notification_schedules',
        'notification_templates',
        'security_contact_categories',
      ].sort()
    );
  });
});

describe('#237: the eight restricted tables', () => {
  it.each(Object.keys(RESTRICTED))('%s no longer has an open read policy', (table) => {
    expect(openTables.has(table)).toBe(false);
  });

  it.each(Object.entries(RESTRICTED))(
    '%s keeps a SELECT policy gated on its permission(s) from the restricting migration',
    (table, permissions) => {
      const policies = [...live.values()].filter(
        (p) => p.table === table && p.file === RESTRICT_MIGRATION && p.cmd === 'SELECT'
      );
      expect(policies.length, `${table}: no SELECT policy from ${RESTRICT_MIGRATION}`).toBe(1);
      for (const permission of permissions) {
        expect(policies[0].using, `${table}: missing ${permission}`).toContain(
          `has_permission('${permission}')`
        );
      }
    }
  );

  it('notification_preferences keeps the resident own-row clause', () => {
    const policy = [...live.values()].find(
      (p) => p.table === 'notification_preferences' && p.name === 'notification_preferences_select'
    );
    expect(policy?.using).toContain('resident_id = public.get_my_resident_id()');
  });

  it('every has_permission() name used by the migration exists in a seeding migration', () => {
    const body = readMigration(RESTRICT_MIGRATION);
    const used = new Set([...body.matchAll(/has_permission\('([^']+)'\)/g)].map((m) => m[1]));
    expect(used.size).toBeGreaterThan(0);

    const others = files
      .filter((f) => f < RESTRICT_MIGRATION)
      .map((f) => readFileSync(path.join(migrationsDir, f), 'utf8'))
      .join('\n');
    for (const name of used) {
      // A typo here denies everyone silently: has_permission() returns false for unknown names.
      expect(others, `permission '${name}' is never seeded`).toContain(`('${name}',`);
    }
  });

  it('wraps its work in one transaction and carries a rollback block', () => {
    const raw = readFileSync(path.join(migrationsDir, RESTRICT_MIGRATION), 'utf8').replace(/\r\n/g, '\n');
    expect((raw.match(/^BEGIN;$/gm) ?? []).length).toBe(1);
    expect((raw.match(/^COMMIT;$/gm) ?? []).length).toBe(1);
    const rollback = raw.slice(raw.indexOf('-- ROLLBACK:'), raw.indexOf('\nBEGIN;'));
    for (const table of Object.keys(RESTRICTED)) {
      expect(rollback, `${table}: rollback missing`).toMatch(
        new RegExp(`-- CREATE POLICY "[^"]+"\\n-- {3}ON public\\.${table} FOR SELECT TO authenticated\\n-- {3}USING \\(true\\);`)
      );
    }
  });
});

describe('#237: system_settings key split', () => {
  const policies = [...live.values()].filter(
    (p) => p.table === 'system_settings' && (p.cmd === 'SELECT' || p.cmd === 'ALL')
  );

  it('is no longer open to every signed-in user', () => {
    expect(openTables.has('system_settings')).toBe(false);
  });

  it('has exactly one read policy, the key-split one, permissive and TO authenticated', () => {
    // A second permissive read policy would OR with this one and void the split.
    expect(policies.map((p) => `${p.name}@${p.file}`)).toEqual([
      `system_settings_select_policy@${KEY_SPLIT_MIGRATION}`,
    ]);
    expect(policies[0].cmd).toBe('SELECT');
    expect(policies[0].restrictive).toBe(false);
    expect(policies[0].roles.trim()).toBe('authenticated');
  });

  it('allows exactly the declared public keys, OR has_permission(settings.view)', () => {
    const using = policies[0].using ?? '';
    const array = using.match(/^key = ANY \(ARRAY\[([^\]]*)\]\) OR public\.has_permission\('settings\.view'\)$/);
    expect(array, `unexpected predicate shape: ${using}`).not.toBeNull();
    const keys = [...array![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect([...keys].sort()).toEqual([...SYSTEM_SETTINGS_PUBLIC_KEYS].sort());
  });

  it('settings.view is seeded by an earlier migration', () => {
    // has_permission() returns false silently for an unknown name, which would
    // deny every admin as well.
    const others = files
      .filter((f) => f < KEY_SPLIT_MIGRATION)
      .map((f) => readFileSync(path.join(migrationsDir, f), 'utf8'))
      .join('\n');
    expect(others).toContain("('settings.view',");
  });

  it('touches only the SELECT policy, in one transaction, with an exact rollback', () => {
    const body = readMigration(KEY_SPLIT_MIGRATION);
    expect(body.match(/DROP POLICY/g) ?? []).toHaveLength(1);
    expect(body.match(/CREATE POLICY/g) ?? []).toHaveLength(1);
    expect(body).toContain('DROP POLICY IF EXISTS "system_settings_select_policy" ON public.system_settings;');

    const raw = readFileSync(path.join(migrationsDir, KEY_SPLIT_MIGRATION), 'utf8').replace(/\r\n/g, '\n');
    expect((raw.match(/^BEGIN;$/gm) ?? []).length).toBe(1);
    expect((raw.match(/^COMMIT;$/gm) ?? []).length).toBe(1);
    const rollback = raw.slice(raw.indexOf('-- ROLLBACK'), raw.indexOf('\nBEGIN;'));
    expect(rollback).toContain(
      '-- CREATE POLICY "system_settings_select_policy"\n--   ON public.system_settings FOR SELECT TO authenticated\n--   USING (true);'
    );
  });
});
