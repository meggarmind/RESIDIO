/**
 * Tests of the ratchet's own scanner (#390).
 *
 * The scan in module-integration.test.ts is only worth anything if it can
 * fail. These tests feed small inline sources to the scanner and assert both
 * directions: compliant code passes, and each way of cheating is caught.
 */

import { describe, it, expect } from 'vitest';
import { analyzeProject, findViolations, type ScanOptions } from '../helpers/action-scanner';

const NO_ALLOWLIST: ScanOptions = { permissionAllowlist: [], auditAllowlist: [] };

/** Scan inline sources and return `check id` strings, sorted for stable asserts. */
function scan(sources: Record<string, string>, options: ScanOptions = NO_ALLOWLIST): string[] {
  return findViolations(analyzeProject(sources), options)
    .map((v) => `${v.check} ${v.id}`)
    .sort();
}

const GUARDED_AND_AUDITED = `
export async function updateThing(id: string) {
  const auth = await authorizePermission(PERMISSIONS.THING_UPDATE);
  if (!auth.authorized) return { error: 'Unauthorized' };
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.from('things').update({ a: 1 }).eq('id', id).select().single();
  await logAudit({ action: 'UPDATE', entityType: 'things', entityId: id });
  return { data };
}
`;

describe('action scanner', () => {
  it('passes a guarded, audited write action', () => {
    expect(scan({ 'things/a.ts': GUARDED_AND_AUDITED })).toEqual([]);
  });

  it('flags a write action with no permission guard (M1)', () => {
    const source = GUARDED_AND_AUDITED.replace(
      /\s*const auth = await authorizePermission[^\n]*\n\s*if \(!auth\.authorized\)[^\n]*\n/,
      '\n'
    );
    expect(source).not.toContain('authorizePermission');
    expect(scan({ 'things/a.ts': source })).toEqual(['permission-missing things/a.ts::updateThing']);
  });

  it('flags a guard that comes AFTER the first database operation (M2)', () => {
    const source = `
export async function updateThing(id: string) {
  const supabase = await createServerSupabaseClient();
  const { data: old } = await supabase.from('things').select('*').eq('id', id).single();
  const auth = await authorizePermission(PERMISSIONS.THING_UPDATE);
  if (!auth.authorized) return { error: 'Unauthorized' };
  await supabase.from('things').update({ a: 1 }).eq('id', id);
  await logAudit({ action: 'UPDATE', entityType: 'things', entityId: id });
}
`;
    expect(scan({ 'things/a.ts': source })).toEqual(['permission-late things/a.ts::updateThing']);
  });

  it('allows creating the Supabase client before the guard', () => {
    const source = `
export async function updateThing() {
  const adminClient = createAdminClient();
  const auth = await authorizePermission(PERMISSIONS.THING_UPDATE);
  if (!auth.authorized) return;
  await adminClient.from('things').update({ a: 1 });
  await logAudit({});
}
`;
    expect(scan({ 'things/a.ts': source })).toEqual([]);
  });

  it('judges each action on its own: one guarded, one unguarded in the same file', () => {
    const source = `
${GUARDED_AND_AUDITED}
export async function deleteThing(id: string) {
  const supabase = await createServerSupabaseClient();
  await supabase.from('things').delete().eq('id', id);
  await logAudit({ action: 'DELETE', entityType: 'things', entityId: id });
}
`;
    expect(scan({ 'things/a.ts': source })).toEqual(['permission-missing things/a.ts::deleteThing']);
  });

  it('flags a write action with no logAudit', () => {
    const source = GUARDED_AND_AUDITED.replace(/\s*await logAudit[^\n]*\n/, '\n');
    expect(source).not.toContain('logAudit');
    expect(scan({ 'things/a.ts': source })).toEqual(['audit-missing things/a.ts::updateThing']);
  });

  it('is not fooled by an inline object type in the signature', () => {
    const source = `
export async function updateThing(input: { id: string; patch: { a: number } }): Promise<{ ok: boolean }> {
  const supabase = await createServerSupabaseClient();
  await supabase.from('things').update(input.patch).eq('id', input.id);
  return { ok: true };
}
`;
    expect(scan({ 'things/a.ts': source })).toEqual([
      'audit-missing things/a.ts::updateThing',
      'permission-missing things/a.ts::updateThing',
    ]);
  });

  it('ignores read-only actions and non-exported helpers', () => {
    const source = `
export async function getThings() {
  const supabase = await createServerSupabaseClient();
  return supabase.from('things').select('*');
}
async function internalWrite() {
  const supabase = await createServerSupabaseClient();
  await supabase.from('things').insert({ a: 1 });
}
`;
    expect(scan({ 'things/a.ts': source })).toEqual([]);
  });

  it('does not exempt files by name prefix: a get-*.ts file with a write is checked (#458)', () => {
    const source = `
export async function updateAutoGenerateEnabled(enabled: boolean) {
  const supabase = await createServerSupabaseClient();
  await supabase.from('settings').update({ enabled });
}
`;
    expect(scan({ 'billing/get-generation-log.ts': source })).toEqual([
      'audit-missing billing/get-generation-log.ts::updateAutoGenerateEnabled',
      'permission-missing billing/get-generation-log.ts::updateAutoGenerateEnabled',
    ]);
  });

  it('ignores guard/write words that appear only in comments or strings', () => {
    const source = `
export async function updateThing() {
  // authorizePermission(...) and logAudit(...) would go here
  const note = "supabase.from('x').insert(y)";
  const supabase = await createServerSupabaseClient();
  await supabase.from('things').update({ note });
}
`;
    expect(scan({ 'things/a.ts': source })).toEqual([
      'audit-missing things/a.ts::updateThing',
      'permission-missing things/a.ts::updateThing',
    ]);
  });

  it('finds exported arrow-function consts', () => {
    const source = `
export const removeThing = async (id: string) => {
  const supabase = await createServerSupabaseClient();
  await supabase.from('things').delete().eq('id', id);
};
`;
    expect(scan({ 'things/a.ts': source })).toEqual([
      'audit-missing things/a.ts::removeThing',
      'permission-missing things/a.ts::removeThing',
    ]);
  });

  describe('allowlist granularity (M3)', () => {
    const source = `
export async function allowedWrite() {
  const supabase = await createServerSupabaseClient();
  await supabase.from('things').insert({ a: 1 });
  await logAudit({});
}
export async function otherWrite() {
  const supabase = await createServerSupabaseClient();
  await supabase.from('things').insert({ b: 1 });
  await logAudit({});
}
`;

    it('a file::function entry exempts only that function', () => {
      expect(
        scan(
          { 'things/a.ts': source },
          { permissionAllowlist: ['things/a.ts::allowedWrite'], auditAllowlist: [] }
        )
      ).toEqual(['permission-missing things/a.ts::otherWrite']);
    });

    it('a bare file entry exempts every function in the file (permanent entries only)', () => {
      expect(
        scan(
          { 'things/a.ts': source },
          { permissionAllowlist: ['things/a.ts'], auditAllowlist: [] }
        )
      ).toEqual([]);
    });

    it('an entry for a different file exempts nothing', () => {
      expect(
        scan(
          { 'things/a.ts': source },
          { permissionAllowlist: ['things/b.ts::allowedWrite'], auditAllowlist: [] }
        )
      ).toHaveLength(2);
    });
  });

  describe('audit delegation', () => {
    it('accepts an action that delegates to an audited function in the same file', () => {
      const source = `
export async function setMany(items: string[]) {
  const auth = await authorizePermission(PERMISSIONS.X);
  if (!auth.authorized) return;
  const supabase = await createServerSupabaseClient();
  await supabase.from('settings').upsert({ n: items.length });
  for (const i of items) await setOne(i);
}
export async function setOne(i: string) {
  const auth = await authorizePermission(PERMISSIONS.X);
  if (!auth.authorized) return;
  const supabase = await createServerSupabaseClient();
  await supabase.from('settings').upsert({ i });
  await logAudit({});
}
`;
      expect(scan({ 'settings/a.ts': source })).toEqual([]);
    });

    it('accepts delegation to an audited action imported from another actions file', () => {
      const caller = `
import { setOne } from '@/actions/settings/b';
export async function setMany(items: string[]) {
  const auth = await authorizePermission(PERMISSIONS.X);
  if (!auth.authorized) return;
  const supabase = await createServerSupabaseClient();
  await supabase.from('settings').upsert({ n: items.length });
  for (const i of items) await setOne(i);
}
`;
      const callee = `
export async function setOne(i: string) {
  const auth = await authorizePermission(PERMISSIONS.X);
  if (!auth.authorized) return;
  const supabase = await createServerSupabaseClient();
  await supabase.from('settings').upsert({ i });
  await logAudit({});
}
`;
      expect(scan({ 'settings/a.ts': caller, 'settings/b.ts': callee })).toEqual([]);
    });

    it('does not accept delegation to an UNaudited function', () => {
      const source = `
export async function setMany(items: string[]) {
  const auth = await authorizePermission(PERMISSIONS.X);
  if (!auth.authorized) return;
  const supabase = await createServerSupabaseClient();
  await supabase.from('settings').upsert({ n: items.length });
  for (const i of items) await setOne(i);
}
export async function setOne(i: string) {
  const auth = await authorizePermission(PERMISSIONS.X);
  if (!auth.authorized) return;
  const supabase = await createServerSupabaseClient();
  await supabase.from('settings').upsert({ i });
}
`;
      expect(scan({ 'settings/a.ts': source })).toEqual([
        'audit-missing settings/a.ts::setMany',
        'audit-missing settings/a.ts::setOne',
      ]);
    });

    it('terminates on mutually recursive actions', () => {
      const source = `
export async function a() {
  const auth = await authorizePermission(PERMISSIONS.X);
  const supabase = await createServerSupabaseClient();
  await supabase.from('t').insert({});
  await b();
}
export async function b() {
  const auth = await authorizePermission(PERMISSIONS.X);
  const supabase = await createServerSupabaseClient();
  await supabase.from('t').insert({});
  await a();
}
`;
      expect(scan({ 't/a.ts': source })).toEqual(['audit-missing t/a.ts::a', 'audit-missing t/a.ts::b']);
    });
  });
});
