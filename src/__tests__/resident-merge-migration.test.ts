import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@/lib/auth/action-roles';

/**
 * Static checks on the merge-residents migrations (#987). Nothing here connects to a database:
 * the behaviour (money never double counted, each blocker, the snapshot) is exercised by the
 * rolled-back probe docs/security/probe-821-merge.sql on Residio_Stage.
 *
 * The inventory test is the one that matters over time: it re-derives every column that
 * references residents(id) from the baseline and every migration, and fails when a migration adds
 * one that resident_merge_references() does not list.
 */

const root = fileURLToPath(new URL('../..', import.meta.url));
const migrationsDir = path.join(root, 'supabase/migrations');
const SCHEMA = '20261024100000_resident_merge_schema.sql';
const FUNCTIONS = '20261024100100_resident_merge_functions.sql';
const GUARD = '20261024100200_resident_merge_guard.sql';

const readRaw = (file: string) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const stripComments = (sql: string) => sql.replace(/--[^\n]*/g, '');
const collapse = (sql: string) => stripComments(sql).replace(/\s+/g, ' ').trim();

const schemaRaw = readRaw(path.join(migrationsDir, SCHEMA));
const functionsRaw = readRaw(path.join(migrationsDir, FUNCTIONS));
const guardRaw = readRaw(path.join(migrationsDir, GUARD));
const schema = collapse(schemaRaw);
const functions = collapse(functionsRaw);
const guard = collapse(guardRaw);

/** The body of one function in the functions migration, from its CREATE to the closing $$;. */
function functionBody(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start, `${name} is defined`).toBeGreaterThanOrEqual(0);
  const open = sql.indexOf('AS $$', start);
  return sql.slice(start, sql.indexOf('$$;', open + 5) + 3);
}

/**
 * Every (table, column) that references residents(id): the baseline (a catalogue dump of the live
 * schema, #279) plus every migration after it. Older migrations are already folded into the
 * baseline, and some of their foreign keys were later re-pointed (in_app_notifications.recipient_id
 * now references profiles).
 */
const BASELINE_CUTOFF = '20260907000000';
function residentReferences(): Set<string> {
  const files = [
    path.join(root, 'supabase/baseline/00000000000000_baseline.sql'),
    ...readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql') && f.slice(0, 14) > BASELINE_CUTOFF)
      .sort()
      .map((f) => path.join(migrationsDir, f)),
  ];
  const found = new Set<string>();
  for (const file of files) {
    const sql = stripComments(readRaw(file)).replace(/\$([a-z_]*)\$[\s\S]*?\$\1\$/gi, '');
    for (const statement of sql.split(';')) {
      if (!/REFERENCES\s+(?:public\.)?"?residents"?\s*\(/i.test(statement)) continue;
      const table =
        /^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?"?(\w+)"?/i.exec(statement)?.[1] ??
        /^\s*ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:public\.)?"?(\w+)"?/i.exec(statement)?.[1];
      expect(table, `table of: ${statement.trim().slice(0, 120)}`).toBeDefined();
      const columns = [
        ...statement.matchAll(/FOREIGN\s+KEY\s*\(\s*"?(\w+)"?\s*\)\s*REFERENCES\s+(?:public\.)?"?residents"?\s*\(/gi),
        ...statement.matchAll(/"?(\w+)"?\s+uuid\s+(?:[^,]*?\s)?REFERENCES\s+(?:public\.)?"?residents"?\s*\(/gi),
      ].map((m) => m[1]);
      expect(columns.length, `column of: ${statement.trim().slice(0, 120)}`).toBeGreaterThan(0);
      for (const column of columns) found.add(`${table}.${column}`);
    }
  }
  return found;
}

/** resident_merge_references() as written: ordinal, table, column, key, handling. */
const listed = [
  ...functionBody(functions, 'resident_merge_references').matchAll(
    /\(\s*(\d+),\s*'(\w+)',\s*'(\w+)',\s*'(\w+)',\s*'(move|fold|keep)'\s*\)/g
  ),
].map(([, ordinal, table, column, key, handling]) => ({ ordinal: Number(ordinal), table, column, key, handling }));

const merge = functionBody(functions, 'merge_residents');
const plan = functionBody(functions, 'resident_merge_plan');
const preview = functionBody(functions, 'preview_resident_merge');

describe('resident merge: every reference to residents(id) is handled', () => {
  it('lists exactly the columns the schema declares as foreign keys to residents', () => {
    const declared = residentReferences();
    const named = new Set(listed.map((r) => `${r.table}.${r.column}`));

    // 46 foreign keys before #987 plus merged_into_resident_id and the two resident_merges columns.
    expect(declared.size).toBe(49);
    expect([...declared].filter((ref) => !named.has(ref)).sort(), 'declared but not handled by the merge').toEqual([]);
    expect([...named].filter((ref) => !declared.has(ref)).sort(), 'handled but not a foreign key').toEqual([]);
    expect(named.size).toBe(listed.length);
  });

  it('numbers the list without gaps, so the move order is explicit', () => {
    expect(listed.map((r) => r.ordinal)).toEqual(listed.map((_, i) => i + 1));
  });

  it('moves house links before sponsors and the login before the duplicate is archived', () => {
    const at = (ref: string) => listed.find((r) => `${r.table}.${r.column}` === ref)!.ordinal;
    expect(at('resident_houses.resident_id')).toBeLessThan(at('resident_houses.sponsor_resident_id'));
    // The generic mover runs before the archive UPDATE, so residents_remove_admin_roles finds no profile.
    expect(listed.find((r) => r.table === 'profiles')?.handling).toBe('move');
    expect(merge.indexOf("WHERE r.handling IN ('move', 'fold') ORDER BY r.ordinal")).toBeLessThan(
      merge.indexOf("account_status = 'archived'")
    );
  });

  it('keeps only the duplicate wallet and the merge history pointing at the duplicate', () => {
    expect(listed.filter((r) => r.handling === 'keep').map((r) => `${r.table}.${r.column}`).sort()).toEqual([
      'resident_merges.kept_resident_id',
      'resident_merges.merged_resident_id',
      'resident_wallets.resident_id',
    ]);
  });

  it('drops colliding duplicate rows of every fold table, each into the snapshot', () => {
    const folds = listed.filter((r) => r.handling === 'fold');
    expect(folds.map((r) => r.table).sort()).toEqual(
      [
        'announcement_read_receipts',
        'clearance_certificate_copies',
        'escalation_states',
        'hierarchical_settings',
        'notification_preferences',
        'recipient_group_members',
        'report_subscriptions',
        'resident_houses',
        'resident_payment_aliases',
        'resident_payment_cadence_summary',
        'whatsapp_optins',
        'whatsapp_survey_opt_outs',
      ].sort()
    );
    for (const fold of folds) {
      expect(merge, fold.table).toContain(`DELETE FROM public.${fold.table} x`);
      expect(merge, fold.table).toContain(`v_folded_rows := v_folded_rows || jsonb_build_object('${fold.table}', v_rows);`);
      // The plan counts the same rows, so the per-column count invariant can compare them.
      expect(plan, fold.table).toContain(`'${fold.table}.${fold.column}',`);
    }
  });

  it('moves the references that have no foreign key', () => {
    expect(merge).toContain("UPDATE public.entity_notes n SET entity_id = p_kept WHERE n.entity_type = 'resident' AND n.entity_id = p_duplicate");
    for (const table of ['approval_requests', 'in_app_notifications', 'escalation_states']) {
      expect(merge, table).toMatch(
        new RegExp(`UPDATE public\\.${table} \\w+ SET entity_id = p_kept WHERE \\w+\\.entity_type IN \\('resident', 'residents'\\)`)
      );
    }
    expect(functions).not.toMatch(/UPDATE public\.audit_logs/);
  });
});

describe('resident merge: money', () => {
  it('re-points wallet rows and adds only zero-amount explanation rows (Q6)', () => {
    expect(merge).toContain('UPDATE public.wallet_transactions t SET wallet_id = v_kw.id WHERE t.wallet_id = v_dw.id');
    const inserts = [...merge.matchAll(/INSERT INTO public\.wallet_transactions[\s\S]*?;/g)].map((m) => m[0]);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toContain("(v_kw.id, 'credit', 0, v_new_balance, 'resident_merge', v_merge_id,");
    expect(inserts[0]).toContain("(v_dw.id, 'credit', 0, 0, 'resident_merge', v_merge_id,");
    expect(merge).toContain('v_new_balance := v_kw.balance + v_dw.balance;');
    expect(merge).toContain('UPDATE public.resident_wallets w SET balance = 0 WHERE w.id = v_dw.id;');
    // A wallet is never deleted.
    expect(functions).not.toMatch(/DELETE FROM public\.(resident_wallets|wallet_transactions|payment_records|invoices)\b/);
  });

  it('recomputes the kept running balance in time order, ending at the wallet balance', () => {
    expect(merge).toContain(
      'v_new_balance - sum(CASE WHEN t.type = \'credit\' THEN t.amount ELSE -t.amount END) OVER () + sum(CASE WHEN t.type = \'credit\' THEN t.amount ELSE -t.amount END) OVER (ORDER BY t.created_at, t.id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS new_after'
    );
  });

  it('checks every money invariant before commit and raises on failure', () => {
    for (const name of ['wallet balances', 'wallet ledger total', 'account balance', 'payments or invoices']) {
      expect(merge, name).toContain(`RAISE EXCEPTION 'Resident merge invariant failed: ${name}`);
    }
    expect(merge).toContain(
      "(v_after->>'kept_closing_balance')::numeric <> (v_before->>'kept_closing_balance')::numeric + (v_before->>'duplicate_closing_balance')::numeric"
    );
    expect(merge).toContain("OR (v_after->>'duplicate_wallet_balance')::numeric <> 0");
    expect(merge).toContain("RAISE EXCEPTION 'Resident merge invariant failed: % counted %, moved %, dropped %'");
    expect(merge).toContain("RAISE EXCEPTION 'Resident merge invariant failed: rows still reference the duplicate in %'");
  });

  it('reads the leftover check from the catalogue, not from its own list', () => {
    expect(merge).toContain("FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] WHERE c.contype = 'f' AND c.confrelid = 'public.residents'::regclass AND NOT EXISTS ( SELECT 1 FROM public.resident_merge_references() r WHERE r.handling = 'keep'");
  });

  it('computes the account-balance invariant with the shared roll-forward ledger', () => {
    const money = functionBody(functions, 'resident_merge_money');
    expect(money).toContain("FROM public.resident_account_balance(p_kept, NULL, DATE '1900-01-01', DATE '2999-12-31') kb");
    expect(money).toContain("CROSS JOIN public.resident_account_balance(p_duplicate, NULL, DATE '1900-01-01', DATE '2999-12-31') db");
  });
});

describe('resident merge: owner decisions', () => {
  it('blocks on every case the owner chose to stop on, and on unknown references', () => {
    for (const code of [
      'not_found',
      'self_merge',
      'already_merged',
      'kept_archived',
      'same_house',
      'both_logins',
      'two_active_residences',
      'entity_type_mismatch',
      'invoice_clash',
      'generation_run_open',
      'generation_candidate_clash',
      'unhandled_reference',
    ]) {
      expect(plan, code).toContain(`'code', '${code}'`);
    }
    expect(plan).toContain('WHERE kh.resident_id = p_kept AND kh.is_active AND dh.is_active'); // Q3
    expect(plan).toContain('IF v_kept_login AND v_dup_login THEN'); // Q4
  });

  it('accepts only the Q2 contact fields and sources', () => {
    expect(merge).toContain("IF v_choice.key NOT IN ('email', 'phone_primary', 'phone_secondary')");
    expect(merge).toContain("(v_choice.key = 'phone_secondary' AND (v_choice.value #>> '{}') = 'duplicate_phone_primary')");
    expect(merge).toContain("WHEN 'duplicate_phone_primary' THEN d.phone_primary");
  });

  it('clears the duplicate PIN and never copies it (Q5)', () => {
    const archive = merge.slice(merge.indexOf("account_status = 'archived'"), merge.indexOf('WHERE r.id = p_duplicate;', merge.indexOf("account_status = 'archived'")));
    for (const column of ['whatsapp_pin_hash = NULL', 'whatsapp_pin_set_at = NULL', 'whatsapp_pin_locked_until = NULL', 'whatsapp_pin_hard_locked_at = NULL']) {
      expect(archive, column).toContain(column);
    }
    expect(merge).not.toMatch(/whatsapp_pin_hash = d\./);
    expect(merge).toContain("'kept_before', to_jsonb(k) - 'whatsapp_pin_hash'");
    expect(merge).toContain("'duplicate_before', to_jsonb(d) - 'whatsapp_pin_hash'");
  });

  it('lets the latest opt-in decision win and keeps the consent log whole (Q7)', () => {
    expect(merge).toContain('opted_in = CASE WHEN p.dup_wins THEN p.opted_in ELSE ko.opted_in END');
    expect(merge).toContain("coalesce((pairs.old_row->>'opted_in_at')::timestamptz, (pairs.old_row->>'opted_out_at')::timestamptz, '-infinity'::timestamptz) AS dup_wins");
    expect(listed.find((r) => r.table === 'whatsapp_consent_decisions')?.handling).toBe('move');
  });

  it('writes the snapshot and the merge row (Q9)', () => {
    expect(merge).toContain('INSERT INTO public.resident_merges (id, kept_resident_id, merged_resident_id, merged_by, snapshot, counts)');
    for (const key of ["'moved', v_moved_keys", "'folded', v_folded_rows", "'updated', v_updated_rows", "'wallets', v_wallets"]) {
      expect(merge, key).toContain(key);
    }
  });
});

describe('resident merge: security', () => {
  it.each([
    ['preview_resident_merge', preview],
    ['merge_residents', merge],
  ])('%s is SECURITY DEFINER with an empty search_path and checks residents.merge first', (_name, body) => {
    expect(body).toMatch(/SECURITY DEFINER SET search_path = '' AS \$\$ (DECLARE [\s\S]*?)?BEGIN IF NOT public\.has_permission\('residents\.merge'\) THEN RAISE EXCEPTION 'Not authorized to merge residents' USING ERRCODE = '42501'; END IF;/);
  });

  it('grants the two API functions to authenticated only and hides the helpers', () => {
    expect(functions).toContain('REVOKE ALL ON FUNCTION public.preview_resident_merge(uuid, uuid) FROM PUBLIC, anon;');
    expect(functions).toContain('REVOKE ALL ON FUNCTION public.merge_residents(uuid, uuid, jsonb) FROM PUBLIC, anon;');
    expect(functions).toContain('GRANT EXECUTE ON FUNCTION public.preview_resident_merge(uuid, uuid) TO authenticated;');
    expect(functions).toContain('GRANT EXECUTE ON FUNCTION public.merge_residents(uuid, uuid, jsonb) TO authenticated;');
    for (const helper of ['resident_merge_references()', 'resident_merge_money(uuid, uuid)', 'resident_merge_plan(uuid, uuid)']) {
      expect(functions, helper).toContain(`REVOKE ALL ON FUNCTION public.${helper} FROM PUBLIC, anon, authenticated;`);
    }
    expect(functions.match(/GRANT EXECUTE/g)).toHaveLength(2);
    expect(functions).not.toMatch(/TO (anon|PUBLIC)/);
  });

  it('locks both residents, then both wallets, in ascending id order', () => {
    const residents = merge.indexOf('PERFORM 1 FROM public.residents r WHERE r.id IN (p_kept, p_duplicate) ORDER BY r.id FOR UPDATE;');
    const wallets = merge.indexOf('PERFORM 1 FROM public.resident_wallets w WHERE w.resident_id IN (p_kept, p_duplicate) ORDER BY w.id FOR UPDATE;');
    expect(residents).toBeGreaterThan(0);
    expect(wallets).toBeGreaterThan(residents);
    // The blockers are re-read inside the locks.
    expect(merge.indexOf('v_plan := public.resident_merge_plan(p_kept, p_duplicate);')).toBeGreaterThan(wallets);
  });

  it('seeds residents.merge to super_admin only (Q1)', () => {
    expect(schema).toContain("('residents.merge', 'Merge Residents',");
    expect(schema).toContain("WHERE r.name = 'super_admin' AND p.name = 'residents.merge'");
    expect(schema.match(/INSERT INTO public\.role_permissions/g)).toHaveLength(1);
    expect(PERMISSIONS.RESIDENTS_MERGE).toBe('residents.merge');
  });

  it('lets only residents.merge holders read the merge records, and nobody write them', () => {
    expect(schema).toContain('ALTER TABLE public.resident_merges ENABLE ROW LEVEL SECURITY;');
    expect(schema).toContain('REVOKE ALL ON TABLE public.resident_merges FROM PUBLIC, anon, authenticated;');
    expect(schema).toContain('GRANT SELECT ON TABLE public.resident_merges TO authenticated;');
    expect(schema).toContain("FOR SELECT TO authenticated USING ((SELECT public.has_permission('residents.merge')));");
    expect(schema.match(/CREATE POLICY/g)).toHaveLength(1);
  });

  it('adds merged_into_resident_id with its two checks', () => {
    expect(schema).toContain('ADD COLUMN IF NOT EXISTS merged_into_resident_id uuid NULL REFERENCES public.residents(id) ON DELETE RESTRICT;');
    expect(schema).toContain('CHECK (merged_into_resident_id <> id)');
    expect(schema).toContain("CHECK (merged_into_resident_id IS NULL OR account_status = 'archived')");
    expect(schema).toContain('CONSTRAINT resident_merges_merged_resident_key UNIQUE (merged_resident_id)');
  });
});

describe('resident merge: insert guard', () => {
  it.each(['payment_records', 'invoices', 'resident_houses', 'wallet_transactions'])(
    'refuses new %s rows for a merged resident',
    (table) => {
      expect(guard).toContain(
        `CREATE TRIGGER ${table}_refuse_merged_resident BEFORE INSERT ON public.${table} FOR EACH ROW EXECUTE FUNCTION public.refuse_merged_resident_reference();`
      );
    }
  );

  it('waits for a running merge by locking the resident row', () => {
    expect(guard).toContain('FROM public.residents r WHERE r.id = v_resident FOR KEY SHARE;');
    expect(guard).toContain("SECURITY DEFINER SET search_path = ''");
    expect(guard).toContain('REVOKE ALL ON FUNCTION public.refuse_merged_resident_reference() FROM PUBLIC, anon, authenticated;');
  });
});

describe('resident merge: migration hygiene', () => {
  it.each([
    [SCHEMA, schemaRaw],
    [FUNCTIONS, functionsRaw],
    [GUARD, guardRaw],
  ])('%s carries a rollback note and one transaction', (_file, raw) => {
    expect(raw).toMatch(/^-- ROLLBACK/m);
    const active = collapse(raw);
    expect(active.startsWith('BEGIN;')).toBe(true);
    expect(active.endsWith('COMMIT;')).toBe(true);
  });
});
