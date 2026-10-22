/**
 * Issue #594 part 2 -- these actions passed an IDENTIFIER (a settings key, an email, a
 * report type) as the audit entityId. audit_logs.entity_id is uuid NOT NULL and
 * logAudit() swallows insert errors, so nothing was ever written. Each now audits ONCE,
 * after a successful write, with the real row uuid, and the old label moves to
 * entityDisplay / newValues. No row id, or a failed write, means no audit.
 * Sites not covered here are guarded by integration/audit-entity-id-uuid.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { makeRecordingSupabase, expectUuidEntityId, uid, type QueryResult } from '@/__tests__/helpers/recording-supabase';
import { updateSetting, updateSettings, createSetting } from '@/actions/settings/update-setting';
import { updateSecuritySetting } from '@/actions/security/settings';
import { setResidentPortalEnabled } from '@/actions/settings/resident-portal';
import { setEstateDefaultTheme } from '@/actions/settings/theme-preferences';
import { exchangeGmailCode } from '@/actions/email-imports/gmail-oauth';
import { GET as downloadReport } from '@/app/api/reports/download/route';

const { authorizePermission, createServerSupabaseClient, createAdminClient, logAudit, storeReportPdf, calls, results } = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  createAdminClient: vi.fn(),
  logAudit: vi.fn(),
  storeReportPdf: vi.fn(),
  calls: [] as string[],
  results: {} as Record<string, QueryResult>,
}));

vi.mock('@/lib/auth/authorize', () => ({
  authorizePermission,
  authorizeAnyPermission: (permissions: string[]) => authorizePermission(permissions[0]),
}));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient, createAdminClient }));
vi.mock('@/lib/audit/logger', () => ({ logAudit }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/validators/setting-value', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/validators/setting-value')>()), settingValueError: () => null }));
vi.mock('@/lib/email-imports/gmail-client', () => ({
  getGmailAuthUrl: vi.fn(),
  exchangeAuthCode: vi.fn(async () => ({ accessToken: 'a', refreshToken: 'r', expiry: new Date() })),
  getGmailClient: vi.fn(),
  GMAIL_SCOPES: ['scope-1'],
  verifyGmailOAuthState: () => true,
  GMAIL_OAUTH_STATE_COOKIE: 'gmail_oauth_state',
  GMAIL_OAUTH_STATE_COOKIE_PATH: '/api/auth/gmail-callback',
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, delete: vi.fn() }) }));
vi.mock('@/lib/email-imports/oauth-encryption', () => ({ encrypt: (v: string) => `enc:${v}`, decrypt: (v: string) => v }));
vi.mock('googleapis', () => ({
  google: {
    auth: { OAuth2: class { setCredentials() {} } },
    oauth2: () => ({ userinfo: { get: async () => ({ data: { email: 'a@b.test' } }) } }),
  },
}));
vi.mock('@/actions/reports/report-engine', () => ({ generateReport: vi.fn(async () => ({ report: { data: {} }, error: null })) }));
vi.mock('@/lib/pdf/reports/renderer', () => ({ renderReportPdf: vi.fn(async () => Buffer.from('pdf')) }));
vi.mock('@/lib/pdf/reports/archive', () => ({ storeReportPdf }));

const boom = { message: 'boom' };

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  for (const k of Object.keys(results)) delete results[k];
  authorizePermission.mockResolvedValue({ authorized: true, userId: uid(900), roleName: 'super_admin' });
  const client = () => makeRecordingSupabase({ results, calls });
  createServerSupabaseClient.mockImplementation(async () => client());
  createAdminClient.mockImplementation(() => client());
  storeReportPdf.mockResolvedValue(uid(70));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

function expectAuditedOnce(extra: Record<string, unknown>) {
  expect(logAudit).toHaveBeenCalledTimes(1);
  expectUuidEntityId(logAudit);
  expect(logAudit).toHaveBeenCalledWith(expect.objectContaining(extra));
}

describe('A. settings/update-setting.ts', () => {
  it('updateSetting audits with the row id and keeps the key in entityDisplay/newValues', async () => {
    results['system_settings.select'] = { data: { value: '1' } };
    results['system_settings.update'] = { data: { id: uid(1), key: 'k1', value: '2' } };
    expect((await updateSetting('k1', 2)).error).toBeNull();
    expectAuditedOnce({ action: 'UPDATE', entityType: 'system_settings', entityId: uid(1), entityDisplay: 'k1' });
    expect(logAudit.mock.calls[0][0].newValues).toMatchObject({ key: 'k1', value: '2' });
  });
  it('updateSetting does not audit on failure or when no row id comes back', async () => {
    results['system_settings.update'] = { error: boom };
    await updateSetting('k1', 2);
    results['system_settings.update'] = { data: {} };
    await updateSetting('k1', 2);
    expect(logAudit).not.toHaveBeenCalled();
  });
  it('updateSettings audits once with the first row id, all keys and total_count', async () => {
    results['system_settings.select'] = { data: [{ key: 'a', value: '0' }] };
    results['system_settings.upsert'] = { data: { id: uid(2) } };
    expect((await updateSettings({ a: 1, b: 2 })).success).toBe(true);
    expectAuditedOnce({ action: 'BULK_UPDATE', entityType: 'system_settings', entityId: uid(2) });
    expect(logAudit.mock.calls[0][0].newValues).toMatchObject({ keys: ['a', 'b'], total_count: 2 });
  });
  it('updateSettings does not audit when an upsert fails or returns no id', async () => {
    results['system_settings.upsert'] = { error: boom };
    expect((await updateSettings({ a: 1 })).success).toBe(false);
    results['system_settings.upsert'] = { data: {} };
    await updateSettings({ a: 1 });
    expect(logAudit).not.toHaveBeenCalled();
  });
  it('createSetting audits with the inserted row id; not on failure', async () => {
    results['system_settings.insert'] = { data: { id: uid(3) } };
    await createSetting('k3', 'v');
    expectAuditedOnce({ action: 'CREATE', entityId: uid(3), entityDisplay: 'k3' });
    logAudit.mockClear();
    results['system_settings.insert'] = { error: boom };
    await createSetting('k3', 'v');
    expect(logAudit).not.toHaveBeenCalled();
  });
});

describe('B. security/settings.ts updateSecuritySetting', () => {
  const key = 'security_code_format';
  it('audits with the updated row id; key in entityDisplay/newValues', async () => {
    results['system_settings.select'] = { data: { value: 'numeric' } };
    results['system_settings.update'] = { data: [{ id: uid(4) }] };
    expect((await updateSecuritySetting(key, 'alphanumeric')).success).toBe(true);
    expectAuditedOnce({ entityType: 'system_settings', entityId: uid(4), entityDisplay: `Security Setting: ${key}` });
    expect(logAudit.mock.calls[0][0].newValues).toMatchObject({ key, value: 'alphanumeric' });
  });
  it('does not audit with no row id or on failure', async () => {
    results['system_settings.update'] = { data: [] };
    await updateSecuritySetting(key, 'numeric');
    results['system_settings.update'] = { error: boom };
    expect((await updateSecuritySetting(key, 'numeric')).success).toBe(false);
    expect(logAudit).not.toHaveBeenCalled();
  });
});

describe('C. settings row sites', () => {
  it('setResidentPortalEnabled audits with the upserted row id and the key in the values', async () => {
    results['system_settings.select'] = { data: { value: false } };
    results['system_settings.upsert'] = { data: { id: uid(5) } };
    expect((await setResidentPortalEnabled(true)).success).toBe(true);
    expectAuditedOnce({ entityType: 'system_settings', entityId: uid(5) });
    expect(logAudit.mock.calls[0][0].newValues).toMatchObject({ key: 'resident_portal_enabled' });
  });
  it('setResidentPortalEnabled does not audit on failure or without an id', async () => {
    results['system_settings.upsert'] = { error: boom };
    await setResidentPortalEnabled(true);
    results['system_settings.upsert'] = { data: null };
    await setResidentPortalEnabled(true);
    expect(logAudit).not.toHaveBeenCalled();
  });
  it('setEstateDefaultTheme audits with the updated row id and the key in the values', async () => {
    results['system_settings.select'] = { data: { value: 'old' } };
    results['system_settings.update'] = { data: [{ id: uid(6) }] };
    await setEstateDefaultTheme('admin-dashboard', 'new');
    expectAuditedOnce({ entityType: 'system_settings', entityId: uid(6) });
    expect(logAudit.mock.calls[0][0].newValues).toMatchObject({ key: 'dashboard_theme', theme: 'new' });
  });
  it('setEstateDefaultTheme does not audit on failure or without a row', async () => {
    results['system_settings.update'] = { data: [] };
    await setEstateDefaultTheme('admin-dashboard', 'new');
    results['system_settings.update'] = { error: boom };
    await setEstateDefaultTheme('admin-dashboard', 'new');
    expect(logAudit).not.toHaveBeenCalled();
  });
});

describe('D. email-imports/gmail-oauth.ts exchangeGmailCode', () => {
  it('audits with the inserted credentials row id; the email stays in entityDisplay/newValues', async () => {
    results['gmail_oauth_credentials.insert'] = { data: { id: uid(7) } };
    expect((await exchangeGmailCode('code', 'state')).error).toBeNull();
    expectAuditedOnce({ entityType: 'gmail_oauth_credentials', entityId: uid(7), entityDisplay: 'Gmail: a@b.test' });
    expect(logAudit.mock.calls[0][0].newValues).toMatchObject({ email: 'a@b.test' });
  });
  it('does not audit on insert failure or without a row id', async () => {
    results['gmail_oauth_credentials.insert'] = { error: boom };
    expect((await exchangeGmailCode('code', 'state')).error).toBe('Failed to store credentials');
    results['gmail_oauth_credentials.insert'] = { data: null };
    await exchangeGmailCode('code', 'state');
    expect(logAudit).not.toHaveBeenCalled();
  });
});

describe('G. api/reports/download GET (generated PDF)', () => {
  const req = () => new NextRequest('http://localhost/api/reports/download?type=defaulters');
  it('audits with the report_archive row id returned by storeReportPdf', async () => {
    const res = await downloadReport(req());
    expect(res.status).toBe(200);
    expectAuditedOnce({ entityType: 'report_archive', entityId: uid(70), entityDisplay: 'PDF report: defaulters' });
  });
  it('does not audit when archiving fails (no row), but still serves the PDF', async () => {
    storeReportPdf.mockRejectedValue(new Error('x'));
    const res = await downloadReport(req());
    expect(res.status).toBe(200);
    expect(logAudit).not.toHaveBeenCalled();
  });
});
