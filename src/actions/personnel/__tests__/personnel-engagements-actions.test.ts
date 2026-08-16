import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { authorizePermission } from '@/lib/auth/authorize';
import { logAudit } from '@/lib/audit/logger';
import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import {
  createResidentHouseEngagement,
  updateResidentHouseEngagement,
  endPersonnelEngagement,
  getActiveResidentHouses,
} from '../engagements';

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: vi.fn(),
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({
  authorizePermission: vi.fn(),
}));

vi.mock('@/lib/auth/action-roles', () => ({
  PERMISSIONS: {
    VENDORS_MANAGE: 'vendors.manage',
    VENDORS_VIEW: 'vendors.view',
  },
}));

vi.mock('@/lib/audit/logger', () => ({
  logAudit: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

interface MockResult { data: unknown; error: unknown }

interface FluentQuery {
  select: (value?: unknown) => FluentQuery;
  eq: (column?: unknown, value?: unknown) => FluentQuery;
  in: (column?: unknown, value?: unknown) => FluentQuery;
  is: (column?: unknown, value?: unknown) => FluentQuery;
  update: (values?: unknown) => FluentQuery;
  insert: (values?: unknown) => FluentQuery;
  single: () => Promise<MockResult>;
  maybeSingle: () => Promise<MockResult>;
  then: (onFulfilled: (result: MockResult) => unknown, onRejected?: (error: unknown) => unknown) => Promise<unknown>;
}

interface MockClient {
  from: ReturnType<typeof vi.fn>;
  rpc: ReturnType<typeof vi.fn>;
}

const createMockClient = (results: MockResult[]): { client: MockClient; chains: FluentQuery[] } => {
  const queue = [...results];
  const take = (): MockResult => (queue.length ? queue.shift() as MockResult : { data: null, error: null });
  const chains: FluentQuery[] = [];
  const makeChain = (): FluentQuery => {
    const chain = {} as FluentQuery;
    const fluent = vi.fn().mockReturnValue(chain);
    chain.select = fluent;
    chain.eq = fluent;
    chain.in = fluent;
    chain.is = fluent;
    chain.update = fluent;
    chain.insert = fluent;
    chain.single = vi.fn().mockImplementation(async () => take());
    chain.maybeSingle = chain.single;
    chain.then = (onFulfilled, onRejected) => Promise.resolve(take()).then(onFulfilled, onRejected);
    return chain;
  };
  const client: MockClient = {
    from: vi.fn().mockImplementation(() => {
      const chain = makeChain();
      chains.push(chain);
      return chain;
    }),
    rpc: vi.fn().mockImplementation(async () => take()),
  };
  return { client, chains };
};

const authorizeMock = vi.mocked(authorizePermission);
const auditMock = vi.mocked(logAudit);
const adminClientMock = vi.mocked(createAdminClient);
const revalidateMock = vi.mocked(revalidatePath);

const authorized = (userId: string | null = 'user-1', error: string | null = null) =>
  ({ authorized: !error, userId, role: null, roleName: null, roleId: null, permissions: [], error });

const engagementRow = {
  id: 'engagement-1',
  personnel_id: 'personnel-1',
  accountability_scope: 'resident_house',
  resident_house_id: 'resident-house-1',
  responsibility: 'Driver',
  start_date: '2026-08-15',
  end_date: null as string | null,
  created_at: '2026-08-15T00:00:00.000Z',
  updated_at: '2026-08-15T00:00:00.000Z',
};

describe('createResidentHouseEngagement', () => {
  const input = {
    personnelId: 'personnel-1',
    residentHouseId: 'resident-house-1',
    responsibility: '  Driver  ',
    startDate: '2026-08-15',
    endDate: null,
  };

  beforeEach(() => {
    authorizeMock.mockResolvedValue(authorized());
    auditMock.mockResolvedValue(undefined as never);
    revalidateMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthorized callers before creating a Supabase client', async () => {
    authorizeMock.mockResolvedValue(authorized(null, 'Unauthorized: Missing permission'));
    const { client } = createMockClient([]);
    adminClientMock.mockReturnValue(client as unknown as ReturnType<typeof createAdminClient>);

    await expect(createResidentHouseEngagement(input)).resolves.toEqual({
      data: null,
      error: 'Unauthorized',
    });
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('creates the engagement through the RPC, reads it back, and audits', async () => {
    const { client, chains } = createMockClient([
      { data: 'engagement-1', error: null },
      { data: engagementRow, error: null },
    ]);
    adminClientMock.mockReturnValue(client as unknown as ReturnType<typeof createAdminClient>);

    const result = await createResidentHouseEngagement(input);

    expect(client.rpc).toHaveBeenCalledWith('create_personnel_resident_house_engagement', {
      p_personnel_id: 'personnel-1',
      p_resident_house_id: 'resident-house-1',
      p_responsibility: 'Driver',
      p_start_date: '2026-08-15',
      p_end_date: null,
    });
    expect(chains[0].eq).toHaveBeenCalledWith('id', 'engagement-1');
    expect(result).toEqual({ data: engagementRow, error: null });
    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({
      action: 'CREATE',
      entityType: 'personnel_engagements',
      entityId: 'engagement-1',
      entityDisplay: 'Resident-House engagement',
    }));
    expect(revalidateMock).toHaveBeenCalledWith('/personnel');
  });

  it('reports a duplicate active engagement for the same Resident House', async () => {
    const { client } = createMockClient([
      { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } },
    ]);
    adminClientMock.mockReturnValue(client as unknown as ReturnType<typeof createAdminClient>);

    await expect(createResidentHouseEngagement(input)).resolves.toEqual({
      data: null,
      error: 'This personnel already has an active engagement for that Resident House.',
    });
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('rejects an inactive Resident-House target with the database message', async () => {
    const { client } = createMockClient([
      { data: null, error: { message: 'Resident-House engagement requires an active Resident House' } },
    ]);
    adminClientMock.mockReturnValue(client as unknown as ReturnType<typeof createAdminClient>);

    await expect(createResidentHouseEngagement(input)).resolves.toEqual({
      data: null,
      error: 'Resident-House engagement requires an active Resident House',
    });
  });

  it('surfaces a read-back failure after a successful insert', async () => {
    const { client } = createMockClient([
      { data: 'engagement-1', error: null },
      { data: null, error: { message: 'could not find row' } },
    ]);
    adminClientMock.mockReturnValue(client as unknown as ReturnType<typeof createAdminClient>);

    await expect(createResidentHouseEngagement(input)).resolves.toEqual({
      data: null,
      error: 'Engagement was created but could not be read.',
    });
  });
});

describe('updateResidentHouseEngagement', () => {
  const input = { responsibility: '  Head driver  ', startDate: '2026-08-15', endDate: '2026-09-30' };

  beforeEach(() => {
    authorizeMock.mockResolvedValue(authorized());
    auditMock.mockResolvedValue(undefined as never);
    revalidateMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthorized callers before creating a Supabase client', async () => {
    authorizeMock.mockResolvedValue(authorized(null, 'Unauthorized: Missing permission'));
    const { client } = createMockClient([]);
    adminClientMock.mockReturnValue(client as unknown as ReturnType<typeof createAdminClient>);

    await expect(updateResidentHouseEngagement('engagement-1', input)).resolves.toEqual({
      data: null,
      error: 'Unauthorized',
    });
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('updates the engagement scoped to resident_house, then audits', async () => {
    const { client, chains } = createMockClient([
      { data: { ...engagementRow, responsibility: 'Head driver', end_date: '2026-09-30' }, error: null },
    ]);
    adminClientMock.mockReturnValue(client as unknown as ReturnType<typeof createAdminClient>);

    const result = await updateResidentHouseEngagement('engagement-1', input);

    expect(chains[0].eq).toHaveBeenCalledWith('id', 'engagement-1');
    expect(chains[0].eq).toHaveBeenCalledWith('accountability_scope', 'resident_house');
    expect(result).toEqual({ data: { ...engagementRow, responsibility: 'Head driver', end_date: '2026-09-30' }, error: null });
    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({ action: 'UPDATE' }));
    expect(revalidateMock).toHaveBeenCalledWith('/personnel');
  });

  it('returns a failure message when the update errors', async () => {
    const { client } = createMockClient([
      { data: null, error: { message: 'update failed' } },
    ]);
    adminClientMock.mockReturnValue(client as unknown as ReturnType<typeof createAdminClient>);

    await expect(updateResidentHouseEngagement('engagement-1', input)).resolves.toEqual({
      data: null,
      error: 'Failed to update Resident-House engagement.',
    });
  });
});

describe('endPersonnelEngagement', () => {
  beforeEach(() => {
    authorizeMock.mockResolvedValue(authorized());
    auditMock.mockResolvedValue(undefined as never);
    revalidateMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthorized callers before creating a Supabase client', async () => {
    authorizeMock.mockResolvedValue(authorized(null, 'Unauthorized: Missing permission'));
    const { client } = createMockClient([]);
    adminClientMock.mockReturnValue(client as unknown as ReturnType<typeof createAdminClient>);

    await expect(endPersonnelEngagement('engagement-1')).resolves.toEqual({
      data: null,
      error: 'Unauthorized',
    });
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('ends an open engagement with today as the end date', async () => {
    const { client, chains } = createMockClient([
      { data: { ...engagementRow, end_date: '2026-08-16' }, error: null },
    ]);
    adminClientMock.mockReturnValue(client as unknown as ReturnType<typeof createAdminClient>);

    const result = await endPersonnelEngagement('engagement-1', '2026-08-16');

    expect(chains[0].eq).toHaveBeenCalledWith('id', 'engagement-1');
    expect(chains[0].is).toHaveBeenCalledWith('end_date', null);
    expect(result).toEqual({ data: { ...engagementRow, end_date: '2026-08-16' }, error: null });
    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({
      action: 'UPDATE',
      entityId: 'engagement-1',
      entityDisplay: 'Ended personnel engagement',
    }));
    expect(revalidateMock).toHaveBeenCalledWith('/personnel');
  });

  it('fails when the engagement is already ended (no open row to update)', async () => {
    const { client } = createMockClient([
      { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } },
    ]);
    adminClientMock.mockReturnValue(client as unknown as ReturnType<typeof createAdminClient>);

    await expect(endPersonnelEngagement('engagement-1')).resolves.toEqual({
      data: null,
      error: 'Failed to end engagement.',
    });
    expect(auditMock).not.toHaveBeenCalled();
  });
});

describe('getActiveResidentHouses', () => {
  beforeEach(() => {
    authorizeMock.mockResolvedValue(authorized());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthorized callers', async () => {
    authorizeMock.mockResolvedValue(authorized(null, 'Unauthorized: Missing permission'));
    const { client } = createMockClient([]);
    adminClientMock.mockReturnValue(client as unknown as ReturnType<typeof createAdminClient>);

    await expect(getActiveResidentHouses()).resolves.toEqual({ data: [], error: 'Unauthorized' });
  });

  it('joins resident, house, and street details into labeled options', async () => {
    const { client } = createMockClient([
      { data: [{ id: 'rh-1', resident_id: 'r-1', house_id: 'h-1' }], error: null },
      { data: [{ id: 'r-1', first_name: 'Ada', last_name: 'Okoro' }], error: null },
      { data: [{ id: 'h-1', house_number: '12A', street_id: 's-1' }], error: null },
      { data: [{ id: 's-1', name: 'Main St' }], error: null },
    ]);
    adminClientMock.mockReturnValue(client as unknown as ReturnType<typeof createAdminClient>);

    await expect(getActiveResidentHouses()).resolves.toEqual({
      data: [{ id: 'rh-1', houseNumber: '12A', streetName: 'Main St', residentName: 'Ada Okoro' }],
      error: null,
    });
  });

  it('falls back to placeholders when detail rows are missing', async () => {
    const { client } = createMockClient([
      { data: [{ id: 'rh-1', resident_id: 'r-1', house_id: 'h-1' }], error: null },
      { data: [], error: null },
      { data: [], error: null },
    ]);
    adminClientMock.mockReturnValue(client as unknown as ReturnType<typeof createAdminClient>);

    await expect(getActiveResidentHouses()).resolves.toEqual({
      data: [{ id: 'rh-1', houseNumber: 'House', streetName: null, residentName: 'Resident' }],
      error: null,
    });
  });

  it('returns a failure message when the base query errors', async () => {
    const { client } = createMockClient([
      { data: null, error: { message: 'base query failed' } },
    ]);
    adminClientMock.mockReturnValue(client as unknown as ReturnType<typeof createAdminClient>);

    await expect(getActiveResidentHouses()).resolves.toEqual({
      data: [],
      error: 'Failed to fetch active Resident Houses',
    });
  });
});