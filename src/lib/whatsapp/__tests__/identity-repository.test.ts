import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * #849: stale WhatsApp links. A link survives neither a deactivation, an archived/suspended
 * resident, nor its number leaving that resident's roster (the last keeps only the community tier).
 */
type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({ tables: {} as Record<string, Row[]> }));

function query(table: string) {
  const filters: Array<(row: Row) => boolean> = [];
  let patch: Row | null = null;
  const rows = () => (db.tables[table] ||= []).filter((row) => filters.every((f) => f(row)));
  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => (filters.push((row) => row[column] === value), builder),
    in: (column: string, values: unknown[]) => (filters.push((row) => values.includes(row[column])), builder),
    is: (column: string, value: unknown) => (filters.push((row) => (row[column] ?? null) === value), builder),
    not: (column: string, _op: 'is', value: null) => (filters.push((row) => (row[column] ?? null) !== value), builder),
    gt: (column: string, value: string) => (filters.push((row) => String(row[column]) > value), builder),
    filter: (column: string, _op: 'eq', value: unknown) => (filters.push((row) => row[column] === value), builder),
    update: (values: Row) => ((patch = values), builder),
    // Only the blocked-reply claim uses or(): null, or older than the cutoff.
    or: (expression: string) => {
      const cutoff = expression.split('blocked_reply_at.lt.')[1];
      filters.push((row) => row.blocked_reply_at == null || String(row.blocked_reply_at) < cutoff);
      return builder;
    },
    insert: async (values: Row) => {
      const table_ = (db.tables[table] ||= []);
      if (table_.some((row) => row.phone_number === values.phone_number)) {
        return { error: { code: '23505' } };
      }
      table_.push({ id: `row-${table_.length}`, ...values });
      return { error: null };
    },
    upsert: async (values: Row) => {
      const existing = (db.tables[table] ||= []).find(
        (row) => row.resident_id === values.resident_id && row.phone_number === values.phone_number
      );
      if (existing) Object.assign(existing, values);
      else db.tables[table].push({ ...values });
      return { error: null };
    },
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (resolve: (result: { data: Row[]; error: null }) => unknown) => {
      const matched = rows();
      if (patch) matched.forEach((row) => Object.assign(row, patch));
      return Promise.resolve({ data: matched, error: null }).then(resolve);
    },
  };
  return builder;
}

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({ from: (table: string) => query(table) }),
}));

import { createSupabaseWhatsAppIdentityRepository } from '@/lib/whatsapp/identity';

const NUMBER = '+2348000000001';

function resident(overrides: Row = {}): Row {
  return {
    id: 'res-1',
    first_name: 'Ada',
    last_name: 'Example',
    resident_code: 'RES001',
    phone_primary: '08000000001',
    phone_secondary: null,
    account_status: 'active',
    ...overrides,
  };
}

function link(overrides: Row = {}): Row {
  return { resident_id: 'res-1', phone_number: NUMBER, opted_in: true, deactivated_at: null, ...overrides };
}

beforeEach(() => {
  db.tables = {
    residents: [resident()],
    whatsapp_optins: [link()],
    resident_houses: [{ resident_id: 'res-1', resident_role: 'tenant', is_active: true }],
  };
});

describe('findLinkedResidents (#849)', () => {
  it('gives an active resident whose linked number is on the roster the financial tier', async () => {
    const linked = await createSupabaseWhatsAppIdentityRepository().findLinkedResidents(NUMBER);

    expect(linked).toHaveLength(1);
    expect(linked[0]).toMatchObject({ id: 'res-1', financialEligible: true });
  });

  it('ignores a deactivated link', async () => {
    db.tables.whatsapp_optins = [link({ deactivated_at: '2026-10-20T00:00:00Z' })];

    expect(await createSupabaseWhatsAppIdentityRepository().findLinkedResidents(NUMBER)).toEqual([]);
  });

  it.each(['archived', 'suspended'])('skips a %s resident', async (status) => {
    db.tables.residents = [resident({ account_status: status })];

    expect(await createSupabaseWhatsAppIdentityRepository().findLinkedResidents(NUMBER)).toEqual([]);
  });

  it('keeps an off-roster link at the community tier', async () => {
    db.tables.residents = [resident({ phone_primary: '08000000009' })];

    const linked = await createSupabaseWhatsAppIdentityRepository().findLinkedResidents(NUMBER);

    expect(linked).toHaveLength(1);
    expect(linked[0].financialEligible).toBe(false);
  });

  it('gives an off-roster link made with a LINK code (e.g. a spouse) the financial tier', async () => {
    db.tables.residents = [resident({ phone_primary: '08000000009' })];
    db.tables.whatsapp_optins = [];
    const repository = createSupabaseWhatsAppIdentityRepository();

    await repository.setOptIn('res-1', NUMBER, false, 'in_chat', true);
    await repository.setOptIn('res-1', NUMBER, true, 'in_chat');

    const linked = await repository.findLinkedResidents(NUMBER);
    expect(linked).toHaveLength(1);
    expect(linked[0].financialEligible).toBe(true);
  });

  it.each(['archived', 'suspended'])('skips a %s resident even with a LINK-code link', async (status) => {
    db.tables.residents = [resident({ phone_primary: '08000000009', account_status: status })];
    db.tables.whatsapp_optins = [link({ link_verified_at: '2026-10-20T00:00:00Z' })];

    expect(await createSupabaseWhatsAppIdentityRepository().findLinkedResidents(NUMBER)).toEqual([]);
  });

  it('ignores a deactivated LINK-code link', async () => {
    db.tables.whatsapp_optins = [link({ link_verified_at: '2026-10-20T00:00:00Z', deactivated_at: '2026-10-20T01:00:00Z' })];

    expect(await createSupabaseWhatsAppIdentityRepository().findLinkedResidents(NUMBER)).toEqual([]);
  });

  it('accepts a link on the secondary roster number', async () => {
    db.tables.residents = [resident({ phone_primary: '08000000009', phone_secondary: '08000000001' })];

    const linked = await createSupabaseWhatsAppIdentityRepository().findLinkedResidents(NUMBER);

    expect(linked[0].financialEligible).toBe(true);
  });
});

describe('opt-in rows and deactivation (#849)', () => {
  it('getOptIn ignores a deactivated row', async () => {
    db.tables.whatsapp_optins = [link({ deactivated_at: '2026-10-20T00:00:00Z' })];

    expect(await createSupabaseWhatsAppIdentityRepository().getOptIn('res-1', NUMBER)).toBe(false);
  });

  it('setOptIn (re-link or YES) reactivates a deactivated row', async () => {
    db.tables.whatsapp_optins = [link({ opted_in: false, deactivated_at: '2026-10-20T00:00:00Z' })];
    const repository = createSupabaseWhatsAppIdentityRepository();

    await repository.setOptIn('res-1', NUMBER, true, 'in_chat');

    expect(db.tables.whatsapp_optins[0].deactivated_at).toBeNull();
    expect(await repository.getOptIn('res-1', NUMBER)).toBe(true);
  });
});

describe('consumeLinkToken purpose (#890)', () => {
  const later = '2999-01-01T00:00:00.000Z';
  const token = (purpose: string): Row => ({
    id: `tok-${purpose}`,
    resident_id: 'res-1',
    token_hash: createHash('sha256').update('123456').digest('hex'),
    purpose,
    used_at: null,
    expires_at: later,
  });

  it('consumes a link code', async () => {
    db.tables.whatsapp_link_tokens = [token('link')];

    expect(await createSupabaseWhatsAppIdentityRepository().consumeLinkToken('123456')).toBe('res-1');
    expect(db.tables.whatsapp_link_tokens[0].used_at).not.toBeNull();
  });

  it('never links a number with a PIN setup code', async () => {
    db.tables.whatsapp_link_tokens = [token('pin_setup')];

    expect(await createSupabaseWhatsAppIdentityRepository().consumeLinkToken('123456')).toBeNull();
    expect(db.tables.whatsapp_link_tokens[0].used_at).toBeNull();
  });
});

describe('findLinkCodeIssuer (#1072)', () => {
  const later = '2999-01-01T00:00:00.000Z';
  const sponsorCode = (overrides: Row = {}): Row => ({
    id: 'tok-1',
    resident_id: 'co-1',
    token_hash: createHash('sha256').update('654321').digest('hex'),
    purpose: 'link',
    used_at: null,
    expires_at: later,
    issued_by_resident_id: 'sponsor-1',
    resident: { first_name: 'Bola' },
    house: { house_number: '12', short_name: null, street: { name: 'Palm Close' } },
    ...overrides,
  });

  it('names the sponsor, the co-resident and the house of a live code', async () => {
    db.tables.whatsapp_link_tokens = [sponsorCode()];
    expect(await createSupabaseWhatsAppIdentityRepository().findLinkCodeIssuer('654321')).toEqual({
      residentId: 'sponsor-1',
      coResidentFirstName: 'Bola',
      houseLabel: '12, Palm Close',
    });
  });

  it('finds nothing for an office code, a used or expired code, or a setup code', async () => {
    for (const overrides of [{ issued_by_resident_id: null }, { used_at: '2026-10-23T10:00:00Z' }, { expires_at: '2000-01-01T00:00:00.000Z' }, { purpose: 'pin_setup' }]) {
      db.tables.whatsapp_link_tokens = [sponsorCode(overrides)];
      expect(await createSupabaseWhatsAppIdentityRepository().findLinkCodeIssuer('654321')).toBeNull();
    }
  });
});

describe('who may use the Assistant (#1070)', () => {
  const houseRow = (role: string, overrides: Row = {}): Row => ({ resident_id: 'res-1', resident_role: role, is_active: true, ...overrides });

  it.each([
    ['resident_landlord', true],
    ['non_resident_landlord', true],
    ['tenant', true],
    ['developer', true],
    ['co_resident', false],
  ])('allows %s (financial tier: %s)', async (role, financial) => {
    db.tables.resident_houses = [houseRow(role)];

    const [match] = await createSupabaseWhatsAppIdentityRepository().findRosterMatches(NUMBER);

    expect(match).toMatchObject({ accessAllowed: true, financialEligible: financial });
  });

  describe('co-resident financial tier (#1071)', () => {
    const co = (overrides: Row = {}): Row => ({ resident_id: 'res-1', house_id: 'h1', resident_role: 'co_resident', sponsor_resident_id: 'sp-1', is_active: true, ...overrides });
    const sponsor = (overrides: Row = {}): Row => ({ resident_id: 'sp-1', house_id: 'h1', resident_role: 'tenant', is_active: true, ...overrides });

    it('is on while the sponsor still holds a resident role on the house', async () => {
      db.tables.resident_houses = [co(), sponsor()];
      const [match] = await createSupabaseWhatsAppIdentityRepository().findRosterMatches(NUMBER);
      expect(match).toMatchObject({ accessAllowed: true, financialEligible: true });
    });

    it.each([
      ['the sponsor moved out', [co(), sponsor({ is_active: false })]],
      ['the sponsor holds another house only', [co(), sponsor({ house_id: 'h2' })]],
      ['the sponsor is a non-resident landlord', [co(), sponsor({ resident_role: 'non_resident_landlord' })]],
      ['no sponsor is named', [co({ sponsor_resident_id: null }), sponsor()]],
    ])('is off when %s', async (_label, rows) => {
      db.tables.resident_houses = rows;
      const [match] = await createSupabaseWhatsAppIdentityRepository().findRosterMatches(NUMBER);
      expect(match).toMatchObject({ accessAllowed: true, financialEligible: false });
    });
  });

  it.each(['household_member', 'domestic_staff', 'caretaker', 'contractor'])('blocks a %s', async (role) => {
    db.tables.resident_houses = [houseRow(role)];

    const [match] = await createSupabaseWhatsAppIdentityRepository().findRosterMatches(NUMBER);

    expect(match.accessAllowed).toBe(false);
  });

  it('blocks a person whose only in-scope row is no longer active', async () => {
    db.tables.resident_houses = [houseRow('tenant', { is_active: false })];

    const [match] = await createSupabaseWhatsAppIdentityRepository().findRosterMatches(NUMBER);

    expect(match.accessAllowed).toBe(false);
  });

  it('blocks a person with no residency row', async () => {
    db.tables.resident_houses = [];

    const [match] = await createSupabaseWhatsAppIdentityRepository().findRosterMatches(NUMBER);

    expect(match.accessAllowed).toBe(false);
  });

  it('allows a person who holds one blocked and one in-scope role', async () => {
    db.tables.resident_houses = [houseRow('domestic_staff'), houseRow('tenant')];

    const [match] = await createSupabaseWhatsAppIdentityRepository().findRosterMatches(NUMBER);

    expect(match.accessAllowed).toBe(true);
  });

  it('applies the same rule to a LINK-code link, keeping its tier rule', async () => {
    db.tables.resident_houses = [houseRow('caretaker')];

    const [linked] = await createSupabaseWhatsAppIdentityRepository().findLinkedResidents(NUMBER);

    expect(linked).toMatchObject({ accessAllowed: false, financialEligible: false });
  });

  it('keeps an unverified in-scope link at the community tier but allowed', async () => {
    db.tables.residents = [resident({ phone_primary: '08000000009' })];
    db.tables.resident_houses = [houseRow('tenant')];

    const [linked] = await createSupabaseWhatsAppIdentityRepository().findLinkedResidents(NUMBER);

    expect(linked).toMatchObject({ accessAllowed: true, financialEligible: false });
  });
});

describe('claimBlockedReply (#1070)', () => {
  const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000).toISOString();

  it('claims the first reply for a number with no session and records it', async () => {
    db.tables.whatsapp_sessions = [];

    expect(await createSupabaseWhatsAppIdentityRepository().claimBlockedReply(NUMBER, 'res-1')).toBe(true);
    expect(db.tables.whatsapp_sessions).toHaveLength(1);
    expect(db.tables.whatsapp_sessions[0]).toMatchObject({ phone_number: NUMBER, resident_id: 'res-1' });
    expect(db.tables.whatsapp_sessions[0].blocked_reply_at).toBeTruthy();
  });

  it('refuses a second claim inside 24 hours', async () => {
    db.tables.whatsapp_sessions = [{ id: 's1', phone_number: NUMBER, blocked_reply_at: hoursAgo(23) }];

    expect(await createSupabaseWhatsAppIdentityRepository().claimBlockedReply(NUMBER, 'res-1')).toBe(false);
  });

  it('claims again once 24 hours have passed, and restamps the row', async () => {
    db.tables.whatsapp_sessions = [{ id: 's1', phone_number: NUMBER, blocked_reply_at: hoursAgo(25) }];

    expect(await createSupabaseWhatsAppIdentityRepository().claimBlockedReply(NUMBER, 'res-1')).toBe(true);
    expect(Date.now() - new Date(db.tables.whatsapp_sessions[0].blocked_reply_at as string).getTime()).toBeLessThan(60_000);
  });

  it('claims on an existing session that never had a blocked reply', async () => {
    db.tables.whatsapp_sessions = [{ id: 's1', phone_number: NUMBER, blocked_reply_at: null }];

    expect(await createSupabaseWhatsAppIdentityRepository().claimBlockedReply(NUMBER, 'res-1')).toBe(true);
  });

  it('stays silent when a concurrent message inserted the row first', async () => {
    // The update finds nothing and the lookup finds nothing, then the insert hits the unique number.
    db.tables.whatsapp_sessions = [];
    const repository = createSupabaseWhatsAppIdentityRepository();

    const [first, second] = [await repository.claimBlockedReply(NUMBER, 'res-1'), await repository.claimBlockedReply(NUMBER, 'res-1')];

    expect([first, second]).toEqual([true, false]);
  });
});
