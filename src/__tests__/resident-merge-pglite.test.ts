import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';

/**
 * Merge residents (#987), run for real: the baseline and every migration after it are replayed into
 * PGlite (in-process Postgres, no network) behind Supabase stand-ins, then preview_resident_merge and
 * merge_residents are called as a signed-in super_admin. Each test runs in a transaction that is
 * rolled back. The Stage probe docs/security/probe-821-merge.sql is the same checks on the real project.
 */

const root = fileURLToPath(new URL('../..', import.meta.url));
const migrationsDir = path.join(root, 'supabase/migrations');
const BASELINE_CUTOFF = '20260907000000';

const ADMIN = '11111111-1111-1111-1111-111111111111';
const PLAIN = '22222222-2222-2222-2222-222222222222';

// Split SQL into statements, respecting quotes, dollar quotes and comments.
function split(sql: string): string[] {
  const out: string[] = [];
  let cur = '';
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (c === '-' && sql[i + 1] === '-') {
      const j = sql.indexOf('\n', i);
      const end = j === -1 ? sql.length : j;
      cur += sql.slice(i, end);
      i = end;
      continue;
    }
    if (c === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue; }
        if (sql[j] === "'") break;
        j++;
      }
      cur += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === '"') {
      const j = sql.indexOf('"', i + 1);
      cur += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === '$') {
      const m = /^\$([A-Za-z_][A-Za-z_0-9]*)?\$/.exec(sql.slice(i));
      if (m) {
        const tag = m[0];
        const j = sql.indexOf(tag, i + tag.length);
        cur += sql.slice(i, j + tag.length);
        i = j + tag.length;
        continue;
      }
    }
    if (c === ';') {
      out.push(cur + ';');
      cur = '';
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  if (cur.trim()) out.push(cur);
  return out.filter((s) => s.replace(/--[^\n]*/g, '').trim() && s.replace(/--[^\n]*/g, '').trim() !== ';');
}


const PRELUDE = `
CREATE SCHEMA IF NOT EXISTS auth; CREATE SCHEMA IF NOT EXISTS extensions; CREATE SCHEMA IF NOT EXISTS storage;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
GRANT USAGE ON SCHEMA public, auth, extensions, storage TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb, raw_app_meta_data jsonb, created_at timestamptz DEFAULT now(), phone text, email_confirmed_at timestamptz, last_sign_in_at timestamptz);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(coalesce(current_setting('request.jwt.claim.sub', true), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('request.jwt.claim.role', true), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')) $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
CREATE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $$ SELECT auth.jwt() ->> 'email' $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[], created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), owner uuid);
CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb, created_at timestamptz DEFAULT now());
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql AS $$ SELECT string_to_array(name, '/') $$;
`;

// The only two statements allowed to fail on a database that never had Supabase's seed data.
const TOLERATED = [/role model seed: a built-in role is missing/, /#956: public\.estate_bank_accounts policies/];

let db: PGlite;

async function replay(label: string, sql: string) {
  for (const st of split(sql)) {
    const bare = st.replace(/--[^\n]*/g, '').trim();
    if (/^(BEGIN|COMMIT);$/i.test(bare)) continue;
    try {
      await db.exec(st);
    } catch (e) {
      const message = (e as Error).message;
      if (!TOLERATED.some((re) => re.test(message))) throw new Error(`${label}: ${message}\n${bare.slice(0, 300)}`);
    }
  }
}

type Row = Record<string, unknown> & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const q = async (sql: string, params: unknown[] = []): Promise<Row[]> => (await db.query<Row>(sql, params)).rows;
const one = async (sql: string, params: unknown[] = []): Promise<Row> => (await q(sql, params))[0];

/** Runs sql as a signed-in user (or anon); returns the result or the SQLSTATE it raised. */
async function as(sub: string | null, sql: string, params: unknown[] = []): Promise<{ rows?: Row[]; code?: string; message?: string }> {
  await db.exec('SAVEPOINT as_user');
  try {
    await db.query(
      `SELECT set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify(sub ? { role: 'authenticated', sub } : { role: 'anon' })]
    );
    await db.exec(`SET LOCAL ROLE ${sub ? 'authenticated' : 'anon'}`);
    const rows = (await db.query<Row>(sql, params)).rows;
    await db.exec('RESET ROLE');
    await db.exec('RELEASE SAVEPOINT as_user');
    return { rows };
  } catch (e) {
    await db.exec('ROLLBACK TO SAVEPOINT as_user');
    await db.exec('RELEASE SAVEPOINT as_user');
    return { code: (e as { code?: string }).code, message: (e as Error).message };
  }
}

const unwrap = (r: { rows?: Row[]; message?: string }) => {
  if (!r.rows) throw new Error(r.message);
  return r;
};
const preview = async (kept: string, dup: string) =>
  (await as(ADMIN, 'SELECT public.preview_resident_merge($1, $2) AS p', [kept, dup]).then(unwrap)).rows![0].p;
const merge = (kept: string, dup: string, choices: object = {}) =>
  as(ADMIN, 'SELECT public.merge_residents($1, $2, $3::jsonb) AS r', [kept, dup, JSON.stringify(choices)]);
const blockerCodes = (p: Row) => (p.blockers as Row[]).map((b) => b.code);

let seq = 0;
async function resident(extra: Record<string, unknown> = {}): Promise<string> {
  seq++;
  const cols = { first_name: 'Test', last_name: `R${seq}`, phone_primary: `+23400000${String(seq).padStart(5, '0')}`, ...extra };
  const keys = Object.keys(cols);
  return (
    await one(
      `INSERT INTO public.residents (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
      Object.values(cols)
    )
  ).id;
}
async function house(): Promise<string> {
  seq++;
  return (
    await one(
      `INSERT INTO public.houses (house_number, street_id, short_name) SELECT $1, id, $2 FROM public.streets LIMIT 1 RETURNING id`,
      [`T-${seq}`, `T${seq}`]
    )
  ).id;
}
const link = async (resident_id: string, house_id: string, role: string, active = true): Promise<string> =>
  (
    await one(
      `INSERT INTO public.resident_houses (resident_id, house_id, resident_role, is_active) VALUES ($1, $2, $3, $4) RETURNING id`,
      [resident_id, house_id, role, active]
    )
  ).id;

async function closing(residentId: string): Promise<number> {
  const r = await one(`SELECT closing_balance FROM public.resident_account_balance($1, NULL, DATE '1900-01-01', DATE '2999-12-31')`, [residentId]);
  return Number(r.closing_balance);
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pg_trgm, uuid_ossp } });
  await replay('prelude', PRELUDE);

  const baseline = readFileSync(path.join(root, 'supabase/baseline/00000000000000_baseline.sql'), 'utf8')
    .replace(/CREATE EXTENSION IF NOT EXISTS pgcrypto[^;]*;/, '')
    .replace(/CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;/, 'CREATE EXTENSION IF NOT EXISTS pg_trgm;');
  await replay('baseline', baseline);

  await replay(
    'roles',
    `INSERT INTO public.app_roles (name, display_name) SELECT 'super_admin', 'Super Admin' WHERE NOT EXISTS (SELECT 1 FROM public.app_roles WHERE name = 'super_admin');
     INSERT INTO public.app_roles (name, display_name) SELECT 'test_staff', 'Test Staff' WHERE NOT EXISTS (SELECT 1 FROM public.app_roles WHERE name = 'test_staff');`
  );

  const later = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql') && f.slice(0, 14) > BASELINE_CUTOFF)
    .sort();
  expect(later.filter((f) => f.startsWith('20261024')).length).toBe(3);
  for (const f of later) await replay(f, readFileSync(path.join(migrationsDir, f), 'utf8'));

  await replay(
    'fixtures',
    `
    INSERT INTO auth.users (id, email) VALUES ('${ADMIN}', 'sa@example.test'), ('${PLAIN}', 'sec@example.test');
    INSERT INTO public.profiles (id, email, full_name, role_id, approval_status)
      SELECT '${ADMIN}', 'sa@example.test', 'SA', id, 'active' FROM public.app_roles WHERE name = 'super_admin'
      ON CONFLICT (id) DO UPDATE SET role_id = EXCLUDED.role_id, approval_status = 'active';
    INSERT INTO public.profiles (id, email, full_name, role_id, approval_status)
      SELECT '${PLAIN}', 'sec@example.test', 'SEC', id, 'active' FROM public.app_roles WHERE name = 'test_staff'
      ON CONFLICT (id) DO UPDATE SET role_id = EXCLUDED.role_id, approval_status = 'active';
    INSERT INTO public.streets (name) VALUES ('Test Street');
    INSERT INTO public.billing_profiles (name) VALUES ('Test Profile');
    `
  );
}, 180_000);

afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  await db.exec('ROLLBACK').catch(() => {});
  await db.exec('BEGIN');
  return async () => {
    await db.exec('RESET ROLE').catch(() => {});
    await db.exec('ROLLBACK');
  };
});

describe('resident merge: who may call', () => {
  it('refuses anon and a signed-in user without residents.merge with 42501', async () => {
    const k = await resident();
    const d = await resident();
    expect((await as(null, 'SELECT public.preview_resident_merge($1, $2)', [k, d])).code).toBe('42501');
    expect((await as(PLAIN, 'SELECT public.preview_resident_merge($1, $2)', [k, d])).code).toBe('42501');
    expect((await as(PLAIN, `SELECT public.merge_residents($1, $2, '{}')`, [k, d])).code).toBe('42501');
    expect((await as(ADMIN, 'SELECT public.resident_merge_plan($1, $2)', [k, d])).code).toBe('42501');
    expect((await preview(k, d)).can_merge).toBe(true);
  });
});

describe('resident merge: blockers', () => {
  it('reports self_merge, not_found and kept_archived', async () => {
    const k = await resident();
    const archived = await resident({ account_status: 'archived' });
    const d = await resident();
    expect(blockerCodes(await preview(k, k))).toEqual(['self_merge']);
    expect(blockerCodes(await preview(k, '99999999-9999-9999-9999-999999999999'))).toEqual(['not_found']);
    expect(blockerCodes(await preview(archived, d))).toContain('kept_archived');
  });

  it('stops when both records have an active link to the same house, and changes nothing', async () => {
    const k = await resident();
    const d = await resident();
    const h = await house();
    await link(k, h, 'non_resident_landlord');
    await link(d, h, 'household_member');
    expect(blockerCodes(await preview(k, d))).toContain('same_house');

    const res = await merge(k, d);
    expect(res.code).toBe('P0001');
    expect(res.message).toContain('same_house');
    expect(await one(`SELECT account_status, merged_into_resident_id FROM public.residents WHERE id = $1`, [d])).toEqual({
      account_status: 'active',
      merged_into_resident_id: null,
    });
    expect(await q(`SELECT 1 FROM public.resident_merges`)).toHaveLength(0);
    expect(await q(`SELECT 1 FROM public.resident_houses WHERE resident_id = $1`, [d])).toHaveLength(1);
  });

  it('stops when both records have a portal login', async () => {
    const k = await resident();
    const d = await resident();
    for (const [i, r] of [k, d].entries()) {
      const id = `3333333${i}-3333-3333-3333-333333333333`;
      await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [id, `login${i}@example.test`]);
      await db.query(
        `INSERT INTO public.profiles (id, email, full_name, role_id, approval_status, resident_id)
         SELECT $1, $2, 'L', id, 'active', $3 FROM public.app_roles WHERE name = 'test_staff'`,
        [id, `login${i}@example.test`, r]
      );
    }
    expect(blockerCodes(await preview(k, d))).toContain('both_logins');
  });

  it('stops when both were invoiced for the same house and period', async () => {
    const k = await resident();
    const d = await resident();
    const h = await house();
    for (const [i, r] of [k, d].entries()) {
      await db.query(
        `INSERT INTO public.invoices (resident_id, house_id, billing_profile_id, invoice_number, amount_due, status, due_date, period_start, period_end)
         SELECT $1, $2, id, $3, 100, 'unpaid', current_date, DATE '2026-01-01', DATE '2026-01-31' FROM public.billing_profiles LIMIT 1`,
        [r, h, `CLASH-${seq}-${i}`]
      );
    }
    expect(blockerCodes(await preview(k, d))).toContain('invoice_clash');
    expect((await merge(k, d)).message).toContain('invoice_clash');
  });

  it('stops, with a named blocker and not a raw 23503, when a dropped ended house link is used by a personnel engagement', async () => {
    const k = await resident();
    const d = await resident();
    const h = await house();
    await link(k, h, 'tenant');
    const ended = await link(d, h, 'household_member');
    const vendor = (await one(`INSERT INTO public.vendors (name) VALUES ('Guard') RETURNING id`)).id;
    await db.query(
      `INSERT INTO public.personnel_engagements (personnel_id, accountability_scope, resident_house_id) VALUES ($1, 'resident_house', $2)`,
      [vendor, ended]
    );
    await db.query(`UPDATE public.resident_houses SET is_active = false WHERE id = $1`, [ended]);

    const p = await preview(k, d);
    expect(p.can_merge).toBe(false);
    expect(p.blockers.find((b: Row) => b.code === 'house_link_in_use').detail.resident_house_ids).toEqual([ended]);
    const res = await merge(k, d);
    expect(res.code).toBe('P0001');
    expect(res.message).toContain('house_link_in_use');
    expect(await q(`SELECT 1 FROM public.resident_houses WHERE id = $1`, [ended])).toHaveLength(1);
  });

  it('does not stop for a different entity type or for two residences (no role rules in the merge)', async () => {
    const k = await resident();
    const corporate = await resident({ entity_type: 'corporate', company_name: 'Acme' });
    await link(k, await house(), 'tenant');
    await link(corporate, await house(), 'tenant');
    const p = await preview(k, corporate);
    expect(blockerCodes(p)).toEqual([]);
    expect(p.can_merge).toBe(true);
  });

  it('refuses a second merge of the same duplicate with already_merged', async () => {
    const k = await resident();
    const d = await resident();
    expect((await merge(k, d)).rows).toHaveLength(1);
    expect(blockerCodes(await preview(k, d))).toContain('already_merged');
    expect((await merge(k, d)).message).toContain('already_merged');
  });

  it('refuses an unknown contact choice with 22023', async () => {
    const k = await resident();
    const d = await resident();
    expect((await merge(k, d, { first_name: 'duplicate' })).code).toBe('22023');
  });
});

describe('resident merge: money', () => {
  it('moves wallet and ledger rows without counting any money twice', async () => {
    const k = await resident();
    const d = await resident();
    const hk = await house();
    const hd = await house();
    const sql = (s: string, p: unknown[]) => db.query(s, p);
    await sql(
      `INSERT INTO public.invoices (resident_id, house_id, invoice_number, amount_due, status, due_date) VALUES ($1, $2, $3, 1000, 'unpaid', current_date)`,
      [k, hk, `K-${seq}`]
    );
    await sql(
      `INSERT INTO public.invoices (resident_id, house_id, invoice_number, amount_due, status, due_date) VALUES ($1, $2, $3, 500, 'unpaid', current_date), ($1, $2, $4, 300, 'void', current_date)`,
      [d, hd, `D1-${seq}`, `D2-${seq}`]
    );
    await sql(
      `INSERT INTO public.payment_records (resident_id, house_id, amount, payment_date, status, is_verified, verified_at, reference_number)
       VALUES ($1, $2, 1000, current_date - 3, 'paid', true, now(), $5), ($3, $4, 400, current_date - 2, 'paid', true, now(), $6)`,
      [k, hk, d, hd, `PK${seq}`, `PD${seq}`]
    );
    await sql(`INSERT INTO public.payment_records (resident_id, house_id, amount, payment_date, status, is_verified) VALUES ($1, $2, 100, current_date - 1, 'pending', false)`, [d, hd]);
    const kw = (await one(`INSERT INTO public.resident_wallets (resident_id, balance) VALUES ($1, 50) RETURNING id`, [k])).id;
    const dw = (await one(`INSERT INTO public.resident_wallets (resident_id, balance) VALUES ($1, 250) RETURNING id`, [d])).id;
    await sql(
      `INSERT INTO public.wallet_transactions (wallet_id, type, amount, balance_after, reference_type, description, created_at) VALUES
       ($2, 'credit', 200, 200, 'payment', 'mirrored', now() - interval '20 days'),
       ($1, 'credit', 50, 50, 'adjustment', 'kept adjustment', now() - interval '10 days'),
       ($2, 'credit', 50, 250, 'legacy_tracker_credit', 'legacy', now() - interval '5 days')`,
      [kw, dw]
    );

    const keptBefore = await closing(k);
    const dupBefore = await closing(d);
    const pv = await preview(k, d);
    expect(pv.can_merge).toBe(true);
    expect(Number(pv.wallets.combined_balance)).toBe(300);

    const res = (await merge(k, d)).rows![0].r;

    expect(Number((await one(`SELECT balance FROM public.resident_wallets WHERE id = $1`, [kw])).balance)).toBe(300);
    expect(Number((await one(`SELECT balance FROM public.resident_wallets WHERE id = $1`, [dw])).balance)).toBe(0);
    expect(await closing(k)).toBe(keptBefore + dupBefore);
    expect(await closing(d)).toBe(0);
    expect(Number(res.account_balance.kept_closing_after)).toBe(keptBefore + dupBefore);

    const ledger = await q(`SELECT balance_after, amount FROM public.wallet_transactions WHERE wallet_id = $1 ORDER BY created_at, id`, [kw]);
    expect(ledger.map((t) => `${Number(t.balance_after)}/${Number(t.amount)}`)).toEqual(['200/200', '250/50', '300/50', '300/0']);
    const markers = await q(`SELECT wallet_id, amount FROM public.wallet_transactions WHERE reference_type = 'resident_merge' AND reference_id = $1`, [res.merge_id]);
    expect(markers).toHaveLength(2);
    expect(markers.every((m) => Number(m.amount) === 0)).toBe(true);
    expect(new Set(markers.map((m) => m.wallet_id))).toEqual(new Set([kw, dw]));
    expect(await q(`SELECT 1 FROM public.wallet_transactions WHERE wallet_id = $1`, [dw])).toHaveLength(1);

    const pay = await one(`SELECT count(*)::int AS n, sum(amount)::numeric AS total FROM public.payment_records WHERE resident_id = $1`, [k]);
    expect([pay.n, Number(pay.total)]).toEqual([3, 1500]);
    const inv = await one(`SELECT count(*)::int AS n, sum(amount_due)::numeric AS total FROM public.invoices WHERE resident_id = $1`, [k]);
    expect([inv.n, Number(inv.total)]).toEqual([3, 1800]);
    expect(await q(`SELECT 1 FROM public.payment_records WHERE resident_id = $1`, [d])).toHaveLength(0);
    expect(await q(`SELECT 1 FROM public.invoices WHERE resident_id = $1`, [d])).toHaveLength(0);
  });
});

describe('resident merge: owner decisions', () => {
  it('clears a lone duplicate PIN and never copies it (Q5), and takes the chosen contact fields (Q2)', async () => {
    const k = await resident({ email: 'kept@example.test' });
    const d = await resident({ email: 'dup@example.test', whatsapp_pin_hash: 'not-a-real-hash', whatsapp_pin_set_at: new Date().toISOString(), whatsapp_pin_failed_attempts: 2 });
    const dupPhone = (await one(`SELECT phone_primary FROM public.residents WHERE id = $1`, [d])).phone_primary;
    expect((await preview(k, d)).duplicate.has_whatsapp_pin).toBe(true);

    const res = (await merge(k, d, { phone_secondary: 'duplicate_phone_primary' })).rows![0].r;
    expect(res.whatsapp_pin_cleared).toBe(true);
    expect(res.kept_has_whatsapp_pin).toBe(false);
    expect(await one(`SELECT whatsapp_pin_hash, whatsapp_pin_set_at, whatsapp_pin_failed_attempts FROM public.residents WHERE id = $1`, [d])).toEqual({
      whatsapp_pin_hash: null,
      whatsapp_pin_set_at: null,
      whatsapp_pin_failed_attempts: 0,
    });
    const kept = await one(`SELECT whatsapp_pin_hash, email, phone_secondary FROM public.residents WHERE id = $1`, [k]);
    expect(kept).toEqual({ whatsapp_pin_hash: null, email: 'kept@example.test', phone_secondary: dupPhone });
    const dup = await one(`SELECT account_status, merged_into_resident_id FROM public.residents WHERE id = $1`, [d]);
    expect(dup).toEqual({ account_status: 'archived', merged_into_resident_id: k });
  });

  it('keeps the later of two disagreeing opt-ins for one phone and moves the consent log whole (Q7)', async () => {
    const k = await resident();
    const d = await resident();
    const shared = '+2348000000001';
    const other = '+2348000000002';
    const laterIn = new Date(Date.now() - 86_400_000).toISOString();
    await db.query(
      `INSERT INTO public.whatsapp_optins (resident_id, phone_number, opted_in, source, opted_out_at) VALUES ($1, $2, false, 'in_chat', now() - interval '30 days')`,
      [k, shared]
    );
    await db.query(
      `INSERT INTO public.whatsapp_optins (resident_id, phone_number, opted_in, source, opted_in_at, link_verified_at) VALUES ($1, $2, true, 'in_chat', $3, $3)`,
      [d, shared, laterIn]
    );
    await db.query(`INSERT INTO public.whatsapp_optins (resident_id, phone_number, opted_in, source, opted_in_at) VALUES ($1, $2, true, 'in_chat', now())`, [d, other]);
    await db.query(
      `INSERT INTO public.whatsapp_consent_decisions (resident_id, phone_number, decision, notice_version) VALUES ($1, $2, 'privacy_accepted', 'v1'), ($1, $3, 'privacy_accepted', 'v1')`,
      [d, shared, other]
    );

    await merge(k, d);

    const optins = await q(`SELECT resident_id, phone_number, opted_in, opted_out_at, link_verified_at FROM public.whatsapp_optins ORDER BY phone_number`);
    expect(optins).toHaveLength(2);
    expect(optins.every((o) => o.resident_id === k)).toBe(true);
    const winner = optins.find((o) => o.phone_number === shared)!;
    expect([winner.opted_in, winner.opted_out_at]).toEqual([true, null]);
    expect(winner.link_verified_at).not.toBeNull();
    expect(await q(`SELECT 1 FROM public.whatsapp_consent_decisions WHERE resident_id = $1`, [k])).toHaveLength(2);
    expect(await q(`SELECT 1 FROM public.whatsapp_consent_decisions WHERE resident_id = $1`, [d])).toHaveLength(0);
  });

  it('writes a complete snapshot: moved keys and folded rows match the counts (Q9)', async () => {
    const k = await resident();
    const d = await resident({ whatsapp_pin_hash: 'not-a-real-hash' });
    const h = await house();
    await link(k, h, 'tenant');
    await link(d, h, 'household_member', false);
    await link(d, await house(), 'non_resident_landlord');
    await db.query(`INSERT INTO public.resident_payment_aliases (resident_id, alias_name) VALUES ($1, 'A'), ($2, 'A'), ($2, 'B')`, [k, d]);
    await db.query(`INSERT INTO public.notification_preferences (resident_id, category, channel) VALUES ($1, 'payment', 'email'), ($2, 'payment', 'email'), ($2, 'invoice', 'sms')`, [k, d]);
    await db.query(`INSERT INTO public.entity_notes (entity_type, entity_id, content, created_by) VALUES ('resident', $1, 'note', $2)`, [d, ADMIN]);
    await db.query(
      `INSERT INTO public.payment_records (resident_id, amount, payment_date, status, is_verified) VALUES ($1, 10, current_date, 'pending', false), ($1, 20, current_date, 'pending', false)`,
      [d]
    );

    const pv = await preview(k, d);
    const res = (await merge(k, d)).rows![0].r;

    for (const [key, n] of Object.entries(pv.counts as Record<string, number>)) {
      expect((res.moved[key] ?? 0) + (res.folded[key] ?? 0), key).toBe(n);
    }
    const m = await one(`SELECT snapshot, counts, merged_by FROM public.resident_merges WHERE id = $1`, [res.merge_id]);
    expect(m.merged_by).toBe(ADMIN);
    for (const [key, n] of Object.entries(m.counts.moved as Record<string, number>)) {
      expect((m.snapshot.moved[key] ?? []).length, `moved ${key}`).toBe(n);
    }
    for (const [key, n] of Object.entries(m.counts.folded as Record<string, number>)) {
      if (key === 'residents.emergency_contact_resident_id') continue;
      const table = key.split('.')[0];
      const replaced = key === 'resident_houses.resident_id' ? Number(m.counts.replaced_kept_rows.resident_houses ?? 0) : 0;
      expect((m.snapshot.folded[table] ?? []).length, `folded ${key}`).toBe(n + replaced);
    }
    expect(m.snapshot.moved['payment_records.resident_id']).toHaveLength(2);
    expect(m.snapshot.folded.resident_payment_aliases).toHaveLength(1);
    expect(m.snapshot.duplicate_before.id).toBe(d);
    expect('whatsapp_pin_hash' in m.snapshot.duplicate_before).toBe(false);
    expect('whatsapp_pin_hash' in m.snapshot.kept_before).toBe(false);
  });

  it('refuses new money for the archived duplicate once merged', async () => {
    const k = await resident();
    const d = await resident();
    await merge(k, d);
    await db.exec('SAVEPOINT guard');
    await expect(
      db.query(`INSERT INTO public.payment_records (resident_id, amount, payment_date, status, is_verified) VALUES ($1, 5, current_date, 'pending', false)`, [d])
    ).rejects.toThrow();
    await db.exec('ROLLBACK TO SAVEPOINT guard');
  });
});

describe('resident merge: reference inventory', () => {
  it('lists exactly the columns that are foreign keys to residents(id)', async () => {
    const declared = (
      await q(`
        SELECT DISTINCT c.conrelid::regclass::text AS t, a.attname::text AS c
          FROM pg_constraint c
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
         WHERE c.contype = 'f' AND c.confrelid = 'public.residents'::regclass`)
    ).map((r) => `${r.t.replace(/^public\./, '')}.${r.c}`);
    const listed = (await q(`SELECT table_name, column_name, handling FROM public.resident_merge_references()`)).map(
      (r) => `${r.table_name}.${r.column_name}`
    );
    expect(declared.filter((x) => !listed.includes(x)).sort(), 'declared but not handled').toEqual([]);
    expect(listed.filter((x) => !declared.includes(x)).sort(), 'handled but not a foreign key').toEqual([]);
  });
});
