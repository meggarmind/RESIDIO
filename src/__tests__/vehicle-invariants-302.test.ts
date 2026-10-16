import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { normalizePlate } from '@/lib/security/plate';
import { createVehicle, updateVehicle, setPrimaryVehicle, searchVehicleByPlate } from '@/actions/security/vehicles';
import { recordCheckIn } from '@/actions/security/access-logs';
import { checkInSchema } from '@/lib/validators/security-contact';

type Call = { table: string; chain: Array<[string, unknown[]]> };

const mocks = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  logAudit: vi.fn(),
  rpc: vi.fn(),
  getUser: vi.fn(),
  calls: [] as Array<{ table: string; chain: Array<[string, unknown[]]> }>,
  // Decides the result of a terminal `.single()` or awaited chain.
  resolve: vi.fn(),
}));

function builder(table: string) {
  const call: Call = { table, chain: [] };
  mocks.calls.push(call);
  const proxy: Record<string, unknown> = {};
  for (const name of ['select', 'insert', 'update', 'eq', 'neq', 'limit', 'order', 'ilike', 'or']) {
    proxy[name] = (...args: unknown[]) => {
      call.chain.push([name, args]);
      return proxy;
    };
  }
  proxy.single = () => {
    call.chain.push(['single', []]);
    return Promise.resolve(mocks.resolve(call));
  };
  return proxy;
}

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    from: (table: string) => builder(table),
    rpc: mocks.rpc,
    auth: { getUser: mocks.getUser },
  }),
}));
vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: mocks.authorizePermission }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: mocks.logAudit }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const CONTACT = '11111111-1111-4111-8111-111111111111';
const OTHER_CONTACT = '22222222-2222-4222-8222-222222222222';
const VEHICLE = '33333333-3333-4333-8333-333333333333';

const vehicleRow = {
  id: VEHICLE,
  contact_id: CONTACT,
  vehicle_type: 'car',
  plate_number: 'ABC123DE',
  is_primary: false,
  is_active: true,
};

const has = (c: Call, name: string) => c.chain.some(([n]) => n === name);
const callsTo = (table: string, op: string) =>
  mocks.calls.filter((c) => c.table === table && has(c, op));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.calls.length = 0;
  mocks.authorizePermission.mockResolvedValue({ authorized: true });
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
});

describe('normalizePlate (#302)', () => {
  it('upper-cases and strips spaces, hyphens and other non-alphanumerics', () => {
    expect(normalizePlate('abc-123 de')).toBe('ABC123DE');
    expect(normalizePlate(' lag_45.6/7 ')).toBe('LAG4567');
  });
  it('leaves an already-normal plate untouched', () => {
    expect(normalizePlate('ABC123')).toBe('ABC123');
  });
  it('returns an empty string when nothing alphanumeric remains', () => {
    expect(normalizePlate(' - - ')).toBe('');
  });
  it('strips before upper-casing so non-ASCII letters never expand', () => {
    expect(normalizePlate('ß1')).toBe('1');
  });
});

describe('migration 20261016100000 (#302)', () => {
  const file = path.resolve(
    __dirname,
    '../../supabase/migrations/20261016100000_visitor_vehicle_plate_primary_invariants.sql',
  );
  const raw = readFileSync(file, 'utf8');
  const code = raw.replace(/--[^\n]*/g, '');
  /** Everything outside $$ ... $$ bodies. */
  const topLevel = code.replace(/\$\$[\s\S]*?\$\$/g, '$$$$');

  it('creates the normalised active-plate unique index with the same expression as the app', () => {
    expect(code).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS uq_visitor_vehicles_active_plate\s+ON public\.visitor_vehicles \(\(upper\(regexp_replace\(plate_number, '\[\^A-Za-z0-9\]', '', 'g'\)\)\)\)\s+WHERE is_active;/,
    );
  });
  it('creates the one-active-primary-per-contact partial unique index', () => {
    expect(code).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS uq_visitor_vehicles_one_active_primary\s+ON public\.visitor_vehicles \(contact_id\)\s+WHERE is_primary AND is_active;/,
    );
  });
  it('defines set_primary_vehicle as SECURITY INVOKER with a pinned search_path', () => {
    expect(code).toMatch(/CREATE OR REPLACE FUNCTION public\.set_primary_vehicle\(p_vehicle_id uuid\)/);
    expect(code).toMatch(/SECURITY INVOKER/);
    expect(code).toMatch(/SET search_path = public/);
    expect(code).not.toMatch(/SECURITY DEFINER/);
  });
  it('grants execute to authenticated only', () => {
    expect(code).toContain('REVOKE ALL ON FUNCTION public.set_primary_vehicle(uuid) FROM PUBLIC;');
    expect(code).toContain('REVOKE ALL ON FUNCTION public.set_primary_vehicle(uuid) FROM anon;');
    expect(code).toContain('GRANT EXECUTE ON FUNCTION public.set_primary_vehicle(uuid) TO authenticated;');
    expect(code).not.toMatch(/GRANT[^;]*\b(anon|PUBLIC)\b/);
  });
  it('has a pre-check that raises with the offending counts', () => {
    expect(code).toMatch(/DO \$\$[\s\S]*RAISE EXCEPTION[\s\S]*v_dup_plates, v_multi_primary/);
  });
  it('has no UPDATE/DELETE outside function bodies, so existing data is never rewritten', () => {
    expect(topLevel).not.toMatch(/\bUPDATE\b/i);
    expect(topLevel).not.toMatch(/\bDELETE\b/i);
    // the pre-check block must not mutate either
    const doBlock = code.match(/DO \$\$[\s\S]*?\$\$;/)?.[0] ?? '';
    expect(doBlock).not.toMatch(/\b(UPDATE|DELETE|INSERT)\b/i);
  });
  const preCheck = code.match(/DO \$\$[\s\S]*?\$\$;/)?.[0] ?? '';
  const fn = code.match(/CREATE OR REPLACE FUNCTION public\.set_primary_vehicle[\s\S]*?\n\$\$;/)?.[0] ?? '';

  it('pre-check counts only ACTIVE vehicles for both invariants', () => {
    expect(preCheck).toMatch(/FROM public\.visitor_vehicles\s+WHERE is_active\s+GROUP BY 1/);
    expect(preCheck).toMatch(/WHERE is_primary AND is_active\s+GROUP BY contact_id/);
    expect(preCheck).toMatch(/upper\(regexp_replace\(plate_number, '\[\^A-Za-z0-9\]', '', 'g'\)\)/);
  });
  it('set_primary_vehicle locks the contact\'s active rows in id order', () => {
    expect(fn).toMatch(/WHERE contact_id = v_contact_id AND is_active\s+ORDER BY id\s+FOR UPDATE;/);
  });
  it('set_primary_vehicle only clears primaries of the same contact and only sets the target row', () => {
    expect(fn).toMatch(
      /SET is_primary = false, updated_at = now\(\)\s+WHERE contact_id = v_contact_id AND is_active AND is_primary AND id <> p_vehicle_id;/,
    );
    expect(fn).toMatch(/SET is_primary = true, updated_at = now\(\)\s+WHERE id = p_vehicle_id\s+RETURNING \* INTO v_vehicle;/);
  });
  it('set_primary_vehicle rejects an inactive vehicle', () => {
    expect(fn).toMatch(/WHERE id = p_vehicle_id AND is_active;\s+IF NOT FOUND THEN\s+RAISE EXCEPTION 'Vehicle % is not active'/);
  });
  it('set_primary_vehicle raises when the final update touched no row (RLS)', () => {
    expect(fn).toMatch(/RETURNING \* INTO v_vehicle;\s+(--[^\n]*\n\s*)?IF NOT FOUND THEN\s+RAISE EXCEPTION 'Vehicle % could not be updated'/);
  });

  it('documents a faithful rollback that drops each object by name', () => {
    expect(raw).toMatch(/--\s+ROLLBACK:/);
    expect(raw).toMatch(/--\s+DROP FUNCTION IF EXISTS public\.set_primary_vehicle\(uuid\);/);
    expect(raw).toMatch(/--\s+DROP INDEX IF EXISTS public\.uq_visitor_vehicles_one_active_primary;/);
    expect(raw).toMatch(/--\s+DROP INDEX IF EXISTS public\.uq_visitor_vehicles_active_plate;/);
  });
});

describe('vehicle actions use the atomic rpc (#302)', () => {
  it('createVehicle with is_primary calls the rpc once and issues no separate primary updates', async () => {
    mocks.resolve.mockImplementation((c: Call) => {
      if (c.table === 'security_contacts') {
        return { data: { id: CONTACT, full_name: 'Visitor', status: 'active' }, error: null };
      }
      if (has(c, 'insert')) return { data: vehicleRow, error: null };
      return { data: null, error: { code: 'PGRST116' } }; // no duplicate plate
    });
    mocks.rpc.mockResolvedValue({ data: { ...vehicleRow, is_primary: true }, error: null });

    const res = await createVehicle({
      contact_id: CONTACT,
      plate_number: 'abc-123 de',
      vehicle_type: 'car',
      is_primary: true,
    } as never);

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('set_primary_vehicle', { p_vehicle_id: VEHICLE });
    expect(callsTo('visitor_vehicles', 'update')).toHaveLength(0);
    const insert = callsTo('visitor_vehicles', 'insert')[0].chain.find(([n]) => n === 'insert')![1][0] as {
      plate_number: string;
      is_primary: boolean;
    };
    expect(insert.plate_number).toBe('ABC123DE');
    expect(insert.is_primary).toBe(false);
    expect(res.error).toBeNull();
    expect(res.data?.is_primary).toBe(true);
    expect(mocks.logAudit).toHaveBeenCalledTimes(1);
  });

  it('createVehicle without is_primary never calls the rpc', async () => {
    mocks.resolve.mockImplementation((c: Call) => {
      if (c.table === 'security_contacts') {
        return { data: { id: CONTACT, full_name: 'Visitor', status: 'active' }, error: null };
      }
      if (has(c, 'insert')) return { data: vehicleRow, error: null };
      return { data: null, error: { code: 'PGRST116' } };
    });
    await createVehicle({ contact_id: CONTACT, plate_number: 'ABC123DE', vehicle_type: 'car' } as never);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('createVehicle rejects a plate that is empty after normalisation, before inserting', async () => {
    mocks.resolve.mockReturnValue({
      data: { id: CONTACT, full_name: 'Visitor', status: 'active' },
      error: null,
    });
    const res = await createVehicle({ contact_id: CONTACT, plate_number: ' - ', vehicle_type: 'car' } as never);
    expect(res.data).toBeNull();
    expect(res.error).toMatch(/letters or digits/);
    expect(mocks.calls.some((c) => has(c, 'insert'))).toBe(false);
  });

  it('createVehicle rejects a duplicate active plate found by the pre-check', async () => {
    mocks.resolve.mockImplementation((c: Call) => {
      if (c.table === 'security_contacts') {
        return { data: { id: CONTACT, full_name: 'Visitor', status: 'active' }, error: null };
      }
      return { data: { id: 'other-vehicle' }, error: null };
    });
    const res = await createVehicle({ contact_id: CONTACT, plate_number: 'ABC-123', vehicle_type: 'car' } as never);
    expect(res.error).toBe('A vehicle with this plate number is already registered');
    expect(mocks.calls.some((c) => has(c, 'insert'))).toBe(false);
  });

  it('createVehicle maps a 23505 on the plate index (race past the pre-check) to the duplicate-plate error', async () => {
    mocks.resolve.mockImplementation((c: Call) => {
      if (c.table === 'security_contacts') {
        return { data: { id: CONTACT, full_name: 'Visitor', status: 'active' }, error: null };
      }
      if (has(c, 'insert')) {
        return {
          data: null,
          error: { code: '23505', message: 'duplicate key value violates unique constraint "uq_visitor_vehicles_active_plate"' },
        };
      }
      return { data: null, error: { code: 'PGRST116' } };
    });
    const res = await createVehicle({ contact_id: CONTACT, plate_number: 'ABC123', vehicle_type: 'car' } as never);
    expect(res.data).toBeNull();
    expect(res.error).toBe('A vehicle with this plate number is already registered');
  });

  it('updateVehicle promotes to primary via one rpc call and no separate unset update', async () => {
    mocks.resolve.mockImplementation((c: Call) => {
      if (has(c, 'update')) throw new Error('unexpected plain update');
      return { data: { ...vehicleRow, contact: { full_name: 'Visitor' } }, error: null };
    });
    mocks.rpc.mockResolvedValue({ data: { ...vehicleRow, is_primary: true }, error: null });

    const res = await updateVehicle({ id: VEHICLE, is_primary: true } as never);

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('set_primary_vehicle', { p_vehicle_id: VEHICLE });
    expect(callsTo('visitor_vehicles', 'update')).toHaveLength(0);
    expect(res.data?.is_primary).toBe(true);
    expect(mocks.logAudit).toHaveBeenCalledTimes(1);
  });

  it('updateVehicle normalises the plate and maps a 23505 to the duplicate-plate error', async () => {
    mocks.resolve.mockImplementation((c: Call) => {
      if (has(c, 'update')) {
        return { data: null, error: { code: '23505', message: 'uq_visitor_vehicles_active_plate' } };
      }
      return { data: { ...vehicleRow, contact: { full_name: 'Visitor' } }, error: null };
    });
    const res = await updateVehicle({ id: VEHICLE, plate_number: 'xy-12 z' } as never);
    const update = callsTo('visitor_vehicles', 'update')[0].chain.find(([n]) => n === 'update')![1][0] as {
      plate_number: string;
    };
    expect(update.plate_number).toBe('XY12Z');
    expect(res.error).toBe('A vehicle with this plate number is already registered');
  });

  it('setPrimaryVehicle makes exactly one rpc call and no table updates', async () => {
    mocks.rpc.mockResolvedValue({ data: { ...vehicleRow, is_primary: true }, error: null });
    const res = await setPrimaryVehicle(VEHICLE);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.calls.filter((c) => has(c, 'update'))).toHaveLength(0);
    expect(res.error).toBeNull();
    expect(mocks.logAudit).toHaveBeenCalledTimes(1);
  });

  it('setPrimaryVehicle reports a missing/inactive vehicle and does not audit', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'P0002', message: 'Vehicle x is not active' } });
    const res = await setPrimaryVehicle(VEHICLE);
    expect(res.data).toBeNull();
    expect(res.error).toBe('Vehicle not found or inactive');
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('setPrimaryVehicle maps a 23505 on the primary index to a clear error', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate key ... "uq_visitor_vehicles_one_active_primary"' },
    });
    const res = await setPrimaryVehicle(VEHICLE);
    expect(res.error).toMatch(/already has a primary vehicle/);
  });

  it('setPrimaryVehicle does nothing when permission is denied', async () => {
    mocks.authorizePermission.mockResolvedValue({ authorized: false, error: 'nope' });
    const res = await setPrimaryVehicle(VEHICLE);
    expect(res.error).toBe('nope');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe('QA hardening (#302)', () => {
  const contactOk = { id: CONTACT, full_name: 'Visitor', status: 'active' };

  it('createVehicle: when set-primary fails, returns the created vehicle with an error and still audits the create', async () => {
    mocks.resolve.mockImplementation((c: Call) => {
      if (c.table === 'security_contacts') return { data: contactOk, error: null };
      if (has(c, 'insert')) return { data: vehicleRow, error: null };
      return { data: null, error: { code: 'PGRST116' } };
    });
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '23505', message: 'uq_visitor_vehicles_one_active_primary' } });
    const res = await createVehicle({ contact_id: CONTACT, plate_number: 'ABC123DE', is_primary: true } as never);
    expect(res.data?.id).toBe(VEHICLE);
    expect(res.error).toMatch(/already has a primary vehicle/);
    expect(mocks.logAudit).toHaveBeenCalledTimes(1);
  });

  it('createVehicle: a generic set-primary failure is reported, not dropped', async () => {
    mocks.resolve.mockImplementation((c: Call) => {
      if (c.table === 'security_contacts') return { data: contactOk, error: null };
      if (has(c, 'insert')) return { data: vehicleRow, error: null };
      return { data: null, error: { code: 'PGRST116' } };
    });
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const res = await createVehicle({ contact_id: CONTACT, plate_number: 'ABC123DE', is_primary: true } as never);
    expect(res.error).toMatch(/could not be set as the primary/);
    expect(res.data?.is_primary).toBe(false);
  });

  it('createVehicle: an empty row from the rpc is a failure, not a primary', async () => {
    mocks.resolve.mockImplementation((c: Call) => {
      if (c.table === 'security_contacts') return { data: contactOk, error: null };
      if (has(c, 'insert')) return { data: vehicleRow, error: null };
      return { data: null, error: { code: 'PGRST116' } };
    });
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    const res = await createVehicle({ contact_id: CONTACT, plate_number: 'ABC123DE', is_primary: true } as never);
    expect(res.error).toMatch(/could not be set as the primary/);
  });

  it('setPrimaryVehicle: no error but no row means failure and no audit', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    const res = await setPrimaryVehicle(VEHICLE);
    expect(res.data).toBeNull();
    expect(res.error).toBe('Failed to set primary vehicle');
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('setPrimaryVehicle: an empty composite row (no id) from the rpc is a failure with no audit', async () => {
    mocks.rpc.mockResolvedValue({ data: {}, error: null });
    const res = await setPrimaryVehicle(VEHICLE);
    expect(res.data).toBeNull();
    expect(res.error).toBe('Failed to set primary vehicle');
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('updateVehicle: fields saved but set-primary fails still audits the saved fields and reports the error', async () => {
    mocks.resolve.mockImplementation((c: Call) => {
      if (has(c, 'update')) return { data: { ...vehicleRow, color: 'red' }, error: null };
      return { data: { ...vehicleRow, color: 'blue', contact: { full_name: 'Visitor' } }, error: null };
    });
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const res = await updateVehicle({ id: VEHICLE, color: 'red', is_primary: true } as never);
    expect(res.data).toBeNull();
    expect(res.error).toBe('Failed to set primary vehicle');
    expect(mocks.logAudit).toHaveBeenCalledTimes(1);
    expect(mocks.logAudit.mock.calls[0][0].newValues).toEqual({ color: 'red' });
  });

  it('updateVehicle: rejects a plate empty after normalisation without any write', async () => {
    mocks.resolve.mockReturnValue({ data: { ...vehicleRow, contact: { full_name: 'V' } }, error: null });
    const res = await updateVehicle({ id: VEHICLE, plate_number: '--' } as never);
    expect(res.error).toMatch(/letters or digits/);
    expect(mocks.calls.some((c) => has(c, 'update'))).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe('searchVehicleByPlate (#302)', () => {
  const orFilter = () =>
    mocks.calls[0].chain.find(([n]) => n === 'or')?.[1][0] as string | undefined;

  it('searches the normalised term and the raw term so legacy hyphenated rows stay findable', async () => {
    mocks.resolve.mockReturnValue({ data: { ...vehicleRow, contact: null }, error: null });
    const res = await searchVehicleByPlate(' abc-123 ');
    expect(res.error).toBeNull();
    expect(orFilter()).toBe('plate_number.ilike.%ABC123%,plate_number.ilike.%abc-123%');
    expect(mocks.calls[0].chain.some(([n, a]) => n === 'eq' && a[0] === 'is_active' && a[1] === true)).toBe(true);
  });

  it('does not duplicate the term when raw equals normalised', async () => {
    mocks.resolve.mockReturnValue({ data: null, error: { code: 'PGRST116' } });
    const res = await searchVehicleByPlate('ABC123');
    expect(orFilter()).toBe('plate_number.ilike.%ABC123%');
    expect(res).toEqual({ data: null, error: null });
  });

  it('strips characters that could break the or() filter syntax from the raw term', async () => {
    mocks.resolve.mockReturnValue({ data: null, error: { code: 'PGRST116' } });
    await searchVehicleByPlate('A,B(1)%');
    expect(orFilter()).toBe('plate_number.ilike.%AB1%');
  });

  it('returns no match without querying when nothing alphanumeric remains', async () => {
    const res = await searchVehicleByPlate(' - ');
    expect(res).toEqual({ data: null, error: null });
    expect(mocks.calls).toHaveLength(0);
  });
});

describe('check-in vehicle linkage (#302)', () => {
  function setup(vehicle: Record<string, unknown> | null, vehicleError: unknown = null) {
    mocks.resolve.mockImplementation((c: Call) => {
      if (c.table === 'security_contacts') {
        return {
          data: { id: CONTACT, full_name: 'Visitor', resident_id: 'res-1', status: 'active', resident: null },
          error: null,
        };
      }
      if (c.table === 'visitor_vehicles') return { data: vehicle, error: vehicleError };
      if (c.table === 'access_logs') return { data: { id: 'log-1', check_in_time: 't' }, error: null };
      return { data: null, error: null };
    });
  }
  const insertPayload = () =>
    callsTo('access_logs', 'insert')[0].chain.find(([n]) => n === 'insert')![1][0] as Record<string, unknown>;

  it('schema accepts an optional vehicle_id uuid and rejects a malformed one', () => {
    expect(checkInSchema.safeParse({ contact_id: CONTACT }).success).toBe(true);
    expect(checkInSchema.safeParse({ contact_id: CONTACT, vehicle_id: VEHICLE }).success).toBe(true);
    expect(checkInSchema.safeParse({ contact_id: CONTACT, vehicle_id: 'nope' }).success).toBe(false);
  });

  it('persists vehicle_id on the access log when the vehicle is active and belongs to the contact', async () => {
    setup({ id: VEHICLE, contact_id: CONTACT, is_active: true });
    const res = await recordCheckIn({ contact_id: CONTACT, vehicle_id: VEHICLE });
    expect(res.error).toBeNull();
    expect(insertPayload().vehicle_id).toBe(VEHICLE);
    expect(mocks.logAudit.mock.calls[0][0].newValues.vehicle_id).toBe(VEHICLE);
  });

  it('stores null vehicle_id when none is given and never looks up vehicles', async () => {
    setup(null);
    await recordCheckIn({ contact_id: CONTACT });
    expect(insertPayload().vehicle_id).toBeNull();
    expect(mocks.calls.some((c) => c.table === 'visitor_vehicles')).toBe(false);
  });

  it('rejects another contact\'s vehicle', async () => {
    setup({ id: VEHICLE, contact_id: OTHER_CONTACT, is_active: true });
    const res = await recordCheckIn({ contact_id: CONTACT, vehicle_id: VEHICLE });
    expect(res.data).toBeNull();
    expect(res.error).toBe('Vehicle does not belong to this contact');
    expect(callsTo('access_logs', 'insert')).toHaveLength(0);
  });

  it('rejects an inactive vehicle', async () => {
    setup({ id: VEHICLE, contact_id: CONTACT, is_active: false });
    const res = await recordCheckIn({ contact_id: CONTACT, vehicle_id: VEHICLE });
    expect(res.error).toBe('Vehicle is not active');
    expect(callsTo('access_logs', 'insert')).toHaveLength(0);
  });

  it('rejects a vehicle that does not exist', async () => {
    setup(null, { code: 'PGRST116' });
    const res = await recordCheckIn({ contact_id: CONTACT, vehicle_id: VEHICLE });
    expect(res.error).toBe('Vehicle not found');
    expect(callsTo('access_logs', 'insert')).toHaveLength(0);
  });
});
