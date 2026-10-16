/**
 * Test double for `@/lib/comms-override/resident-flag` (#716). The lookup reads a stored flag per resident id
 * from `state`, so a caller test can store `true` / `null` / `false` and assert the seam receives exactly that
 * value; `state.error` makes the lookup fail so the fail-closed path can be tested. The combining and
 * missing-resident logic stays the real code.
 *
 * Usage, in a test file:
 *   const flagState = vi.hoisted(() => ({ byId: new Map(), error: null }));
 *   vi.mock('@/lib/comms-override/resident-flag', async (importOriginal) =>
 *     (await import('@/__tests__/helpers/resident-flag-lookup-mock')).flagModule(await importOriginal(), flagState));
 */
export interface FlagState {
  byId: Map<string, boolean | null>;
  error: string | null;
}

type Actual = typeof import('@/lib/comms-override/resident-flag');

export function flagModule(actual: Actual, state: FlagState): Actual {
  const load: Actual['loadResidentOverrideFlags'] = async (ids) => {
    if (state.error) return { ok: false, error: state.error };
    const flags = new Map<string, boolean | null>();
    for (const id of ids) if (state.byId.has(id)) flags.set(id, state.byId.get(id) ?? null);
    return { ok: true, flags };
  };
  return {
    ...actual,
    loadResidentOverrideFlags: load,
    resolveResidentOverride: async (ids) => actual.residentOverrideFrom(await load(ids), ids),
  };
}
