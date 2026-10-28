/**
 * Issue #1286 -- settings.manage_banking_reference lets the financial officer edit bank accounts and
 * transaction tags, and nothing else on the settings.manage_reference list. Holders of
 * settings.manage_reference keep access. The authorize mock grants exactly the permissions in `held`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeRecordingSupabase, uid, type QueryResult } from '@/__tests__/helpers/recording-supabase';
import { createBankAccount, updateBankAccount } from '@/actions/imports/bank-accounts';
import { createTransactionTag, updateTransactionTag } from '@/actions/reference/transaction-tags';
import { createStreet } from '@/actions/reference/create-street';
import { createHouseType } from '@/actions/reference/create-house-type';
import { updateHouseType } from '@/actions/reference/update-house-type';
import { PERMISSIONS, ROUTE_PERMISSIONS } from '@/lib/auth/action-roles';
import { settingsConfig } from '@/config/settings-nav';

const { held, createServerSupabaseClient, calls, results } = vi.hoisted(() => ({
  held: new Set<string>(),
  createServerSupabaseClient: vi.fn(),
  calls: [] as string[],
  results: {} as Record<string, QueryResult>,
}));

vi.mock('@/lib/auth/authorize', () => {
  const result = (ok: boolean) => ({ authorized: ok, userId: 'u-1', roleName: 'financial_officer', error: ok ? null : 'Forbidden' });
  return {
    authorizePermission: async (p: string) => result(held.has(p)),
    authorizeAnyPermission: async (ps: string[]) => result(ps.some((p) => held.has(p))),
  };
});
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient, createAdminClient: vi.fn() }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/actions/approvals', () => ({ canAutoApprove: vi.fn().mockResolvedValue(true) }));

const BANKING = PERMISSIONS.SETTINGS_MANAGE_BANKING_REFERENCE;
const REFERENCE = PERMISSIONS.SETTINGS_MANAGE_REFERENCE;
const account = { account_number: '0123456789', account_name: 'Estate Levy', bank_name: 'FirstBank', is_active: true };
const tag = { name: 'Levy', transaction_type: 'credit' } as Parameters<typeof createTransactionTag>[0];

beforeEach(() => {
  held.clear();
  calls.length = 0;
  for (const k of Object.keys(results)) delete results[k];
  results['estate_bank_accounts.insert'] = { data: { id: uid(1), account_number: account.account_number } };
  results['estate_bank_accounts.update'] = { data: { id: uid(1), account_number: account.account_number } };
  results['transaction_tags.insert'] = { data: { id: uid(2), name: 'Levy' } };
  results['transaction_tags.update'] = { data: { id: uid(2), name: 'Levy' } };
  createServerSupabaseClient.mockImplementation(async () => makeRecordingSupabase({ results, calls }));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe.each([
  ['settings.manage_banking_reference (financial officer)', BANKING],
  ['settings.manage_reference (existing editors)', REFERENCE],
])('with only %s', (_label, permission) => {
  beforeEach(() => held.add(permission));

  it('saves a bank account', async () => {
    expect((await createBankAccount(account)).error).toBeNull();
    expect(calls).toContain('write:estate_bank_accounts.insert');
  });

  it('saves a transaction tag', async () => {
    expect((await createTransactionTag(tag)).error).toBeNull();
    expect(calls).toContain('write:transaction_tags.insert');
  });
});

describe('settings.manage_banking_reference opens nothing else', () => {
  beforeEach(() => held.add(BANKING));

  it('refuses streets and house types, nothing written', async () => {
    expect((await createStreet({ name: 'Oak Road' } as Parameters<typeof createStreet>[0])).error).toBe('Forbidden');
    expect((await createHouseType({ name: 'Duplex' } as Parameters<typeof createHouseType>[0])).error).toBe('Forbidden');
    expect((await updateHouseType(uid(3), { name: 'Duplex' } as Parameters<typeof updateHouseType>[1])).error).toBe('Forbidden');
    expect(calls).toEqual([]);
  });

  it('keeps Streets, House types and Property routes off the new permission', () => {
    for (const route of ['/settings/streets', '/settings/house-types', '/settings/property']) {
      expect(ROUTE_PERMISSIONS[route], route).not.toContain(BANKING);
    }
    const sections = settingsConfig.flatMap((g) => g.items).flatMap((i) => i.sections ?? []);
    const opened = sections.filter((s) => s.permissions?.includes(BANKING)).map((s) => s.id);
    expect(opened.sort()).toEqual(['bank-accounts', 'tags']);
  });

  it('refuses with neither permission', async () => {
    held.clear();
    expect((await updateBankAccount(uid(1), account)).error).toBe('Forbidden');
    expect((await updateTransactionTag(uid(2), { name: 'X' })).error).toBe('Forbidden');
    expect(calls).toEqual([]);
  });
});

describe('migration 20261104110000 grants', () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/20261104110000_settings_manage_banking_reference.sql'),
    'utf8'
  );
  const body = sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

  it('grants the new permission to financial_officer and to every settings.manage_reference holder', () => {
    expect(body).toMatch(/'settings\.manage_banking_reference'/);
    expect(body).toMatch(/r\.name = 'financial_officer'\s+OR r\.id IN \([\s\S]*ref\.name = 'settings\.manage_reference'/);
  });

  it('grants payments.write_transaction_tags to financial_officer only', () => {
    const grant = body.slice(body.lastIndexOf('INSERT INTO public.role_permissions'));
    expect(grant).toMatch(/WHERE r\.name = 'financial_officer'\s+AND p\.name = 'payments\.write_transaction_tags'/);
  });
});

describe('PDF statement passwords stay with email_imports.manage_passwords (owner decision, 29 Oct 2026)', () => {
  const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

  it('shows password controls only to email_imports.manage_passwords holders', () => {
    const section = read('src/components/admin/bank-passwords-section.tsx');
    expect(section).toContain('const canManage = hasPermission(PERMISSIONS.EMAIL_IMPORTS_MANAGE_PASSWORDS);');
    expect(section).not.toContain('SETTINGS_MANAGE_BANKING_REFERENCE');
  });

  it('keeps the password actions on email_imports.manage_passwords', () => {
    const actions = read('src/actions/email-imports/bank-passwords.ts');
    expect(actions.match(/authorizePermission\(PERMISSIONS\.EMAIL_IMPORTS_MANAGE_PASSWORDS\)/g)).toHaveLength(2);
    expect(actions).not.toContain('SETTINGS_MANAGE_BANKING_REFERENCE');
  });

  it('has no password field on the bank account form', () => {
    expect(read('src/components/admin/bank-accounts-list.tsx')).not.toMatch(/password/i);
  });

  it('grants no email_imports permission in the migration', () => {
    const sql = read('supabase/migrations/20261104110000_settings_manage_banking_reference.sql');
    const body = sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
    expect(body).not.toContain('email_imports');
  });
});
