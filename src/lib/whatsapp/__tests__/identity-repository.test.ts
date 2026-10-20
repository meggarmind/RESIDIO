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
    update: (values: Row) => ((patch = values), builder),
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
