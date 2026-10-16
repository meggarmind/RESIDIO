import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));

import {
  canManageResidentOverride,
  combineResidentOverrides,
  loadResidentOverrideFlags,
  residentOverrideFrom,
  resolveResidentOverride,
} from '@/lib/comms-override/resident-flag';
import {
  describeEnvironmentDefault,
  flagToSelectValue,
  selectValueToFlag,
} from '@/lib/comms-override/resident-flag-ui';
import { PERMISSIONS } from '@/lib/auth/action-roles';

function client(result: { data: unknown; error: { message: string } | null }) {
  const inFn = vi.fn(async () => result);
  const select = vi.fn(() => ({ in: inFn }));
  const from = vi.fn(() => ({ select }));
  return { client: { from } as never, from, select, inFn };
}

describe('loadResidentOverrideFlags', () => {
  it('reads id and use_override_comms for the requested residents in one query', async () => {
    const c = client({
      data: [
        { id: 'r1', use_override_comms: null },
        { id: 'r2', use_override_comms: true },
        { id: 'r3', use_override_comms: false },
      ],
      error: null,
    });
    const result = await loadResidentOverrideFlags(['r1', 'r2', 'r3', 'r1'], c.client);
    expect(c.from).toHaveBeenCalledWith('residents');
    expect(c.select).toHaveBeenCalledWith('id, use_override_comms');
    expect(c.inFn).toHaveBeenCalledWith('id', ['r1', 'r2', 'r3']);
    expect(result).toEqual({
      ok: true,
      flags: new Map([
        ['r1', null],
        ['r2', true],
        ['r3', false],
      ]),
    });
  });

  it('fails closed on a query error instead of returning null flags', async () => {
    const c = client({ data: null, error: { message: 'boom' } });
    expect(await loadResidentOverrideFlags(['r1'], c.client)).toEqual({ ok: false, error: 'boom' });
  });

  it('fails closed when the client throws', async () => {
    const throwing = { from: () => { throw new Error('network down'); } } as never;
    expect(await loadResidentOverrideFlags(['r1'], throwing)).toEqual({ ok: false, error: 'network down' });
  });

  it('fails closed on a stored value that is neither boolean nor null', async () => {
    const c = client({ data: [{ id: 'r1', use_override_comms: 'yes' }], error: null });
    const result = await loadResidentOverrideFlags(['r1'], c.client);
    expect(result.ok).toBe(false);
  });

  it('does not query for an empty list', async () => {
    const c = client({ data: [], error: null });
    expect(await loadResidentOverrideFlags([], c.client)).toEqual({ ok: true, flags: new Map() });
    expect(c.from).not.toHaveBeenCalled();
  });
});

describe('combineResidentOverrides leans toward redirecting', () => {
  it.each([
    [[true, false], true],
    [[false, true, null], true],
    [[null, false], null],
    [[false, false], false],
    [[null], null],
    [[false], false],
  ] as const)('%j -> %s', (flags, expected) => {
    expect(combineResidentOverrides([...flags])).toBe(expected);
  });
});

describe('residentOverrideFrom', () => {
  const lookup = { ok: true as const, flags: new Map<string, boolean | null>([['r1', false], ['r2', null]]) };

  it('returns the combined flag for the requested residents', () => {
    expect(residentOverrideFrom(lookup, ['r1'])).toEqual({ ok: true, residentOverride: false });
    expect(residentOverrideFrom(lookup, ['r1', 'r2'])).toEqual({ ok: true, residentOverride: null });
  });

  it('fails closed for a resident missing from the lookup, never defaulting to null', () => {
    const result = residentOverrideFrom(lookup, ['r1', 'ghost']);
    expect(result.ok).toBe(false);
  });

  it('fails closed when the lookup itself failed', () => {
    const result = residentOverrideFrom({ ok: false, error: 'boom' }, ['r1']);
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('boom') });
  });

  it('fails closed when there is no resident to read', () => {
    expect(residentOverrideFrom(lookup, []).ok).toBe(false);
  });
});

describe('resolveResidentOverride', () => {
  it('looks up and combines', async () => {
    const c = client({ data: [{ id: 'r1', use_override_comms: true }], error: null });
    expect(await resolveResidentOverride(['r1'], c.client)).toEqual({ ok: true, residentOverride: true });
  });
});

describe('canManageResidentOverride', () => {
  it('requires settings.manage_general specifically', () => {
    expect(canManageResidentOverride([PERMISSIONS.SETTINGS_MANAGE_GENERAL])).toBe(true);
    expect(canManageResidentOverride([PERMISSIONS.RESIDENTS_UPDATE, PERMISSIONS.RESIDENTS_CREATE])).toBe(false);
    expect(canManageResidentOverride([])).toBe(false);
  });
});

describe('three-state control mapping (#716)', () => {
  it('maps follow default = null, use override = true, send to real recipient = false', () => {
    expect(selectValueToFlag('default')).toBeNull();
    expect(selectValueToFlag('override')).toBe(true);
    expect(selectValueToFlag('real')).toBe(false);
  });

  it('round-trips every state', () => {
    for (const flag of [null, true, false]) expect(selectValueToFlag(flagToSelectValue(flag))).toBe(flag);
    expect(flagToSelectValue(undefined)).toBe('default');
  });

  it('describes the environment default for each environment', () => {
    expect(describeEnvironmentDefault(true)).toContain('send to the real recipient');
    expect(describeEnvironmentDefault(false)).toContain('redirect');
  });
});
