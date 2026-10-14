/**
 * Issue #594 -- audit_logs.entity_id is uuid NOT NULL and logAudit() swallows insert
 * errors, so these actions used to pass sentinels ('batch', 'ALL', a settings key) and
 * write nothing. Each now audits ONCE, after a successful write, with a uuid entityId.
 * Not covered here (too large to mock sensibly; the ratchet in
 * integration/audit-entity-id-uuid.test.ts guards them): generateRetroactiveLevies,
 * sendBulkNotification, backfillOwnershipHistory, importWhatsAppOptIns,
 * sendPaymentReminders, processInvoiceReminders.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeRecordingSupabase, expectUuidEntityId, uid, type QueryResult } from '@/__tests__/helpers/recording-supabase';
import { updateInvoiceGenerationDay, updateAutoGenerateEnabled } from '@/actions/billing/get-generation-log';
import { updateSyncCriteria } from '@/actions/email-imports/gmail-oauth';
import { resetEmailImports } from '@/actions/email-imports/reset-email-imports';
import { processNotificationQueue } from '@/actions/notifications/queue';
import { updateRoleAssignmentRule, batchUpdateRoleAssignmentRules } from '@/actions/roles/assignment-rules';
import { resetSecuritySettingsToDefault } from '@/actions/security/settings';
import { updateEmailDebugMode } from '@/actions/settings/update-email-debug-mode';
import { updateMaintenanceMode } from '@/actions/settings/update-maintenance-mode';
import { removeEstateLogo } from '@/actions/settings/upload-estate-logo';
import { pruneSystemData } from '@/actions/system/prune-data';
import { setWhatsAppForcePin } from '@/actions/whatsapp/identity';
import { updateWhatsAppPilotSettings, promoteWhatsAppPilotToEstate, setWhatsAppEnabled } from '@/actions/whatsapp/pilot';

const { authorizePermission, createServerSupabaseClient, createAdminClient, logAudit, updateSetting, processQueue, calls, results } = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  createAdminClient: vi.fn(),
  logAudit: vi.fn(),
  updateSetting: vi.fn(),
  processQueue: vi.fn(),
  calls: [] as string[],
  results: {} as Record<string, QueryResult>,
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission }));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient,
  createAdminClient,
}));
vi.mock('@/lib/audit/logger', () => ({ logAudit }));
vi.mock('@/actions/settings/update-setting', () => ({ updateSetting }));
vi.mock('@/lib/notifications/queue', () => ({ processQueue, PRIORITY: {}, addToQueue: vi.fn(), cancelQueueItem: vi.fn(), retryQueueItem: vi.fn(), getQueueStats: vi.fn(), getQueueItems: vi.fn() }));
vi.mock('@/lib/notifications', () => ({ renderTemplate: vi.fn(), shouldSendToResident: vi.fn(), generateDeduplicationKey: vi.fn() }));
vi.mock('@/actions/notifications/templates', () => ({ getTemplate: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const boom = { message: 'boom' };
const pilotInput = {
  mode: 'disabled' as const, residentIds: [], streetId: '', outboundDailyCap: 1, outboundBurstCap: 1,
  outboundBurstWindowMinutes: 1, financialLookupDailyCap: 1, sessionRetentionDays: 7, processedMessageRetentionDays: 7,
};

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  for (const k of Object.keys(results)) delete results[k];
  authorizePermission.mockResolvedValue({ authorized: true, userId: uid(900), roleName: 'super_admin' });
  updateSetting.mockResolvedValue({ data: { id: uid(1) }, error: null });
  const client = () => ({
    ...makeRecordingSupabase({ results, calls }),
    storage: { from: () => ({ remove: async () => ({ error: null }) }) },
  });
  createServerSupabaseClient.mockImplementation(async () => client());
  createAdminClient.mockImplementation(() => client());
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

function expectAuditedOnce(extra: Record<string, unknown>) {
  expect(logAudit).toHaveBeenCalledTimes(1);
  expectUuidEntityId(logAudit);
  expect(logAudit).toHaveBeenCalledWith(expect.objectContaining(extra));
}

describe('system_settings single-row sites', () => {
  it('updateInvoiceGenerationDay audits with the settings row id', async () => {
    results['system_settings.select'] = { data: { id: uid(1), value: '5' } };
    expect((await updateInvoiceGenerationDay(10)).success).toBe(true);
    expectAuditedOnce({ action: 'UPDATE', entityType: 'system_settings', entityId: uid(1), entityDisplay: 'invoice_generation_day' });
  });
  it('updateInvoiceGenerationDay does not audit on failure', async () => {
    results['system_settings.select'] = { data: { id: uid(1), value: '5' } };
    results['system_settings.update'] = { error: boom };
    await updateInvoiceGenerationDay(10);
    expect(logAudit).not.toHaveBeenCalled();
  });
  it('updateAutoGenerateEnabled audits ACTIVATE/DEACTIVATE with the settings row id', async () => {
    results['system_settings.select'] = { data: { id: uid(2), value: false } };
    await updateAutoGenerateEnabled(true);
    expectAuditedOnce({ action: 'ACTIVATE', entityId: uid(2), entityDisplay: 'auto_generate_invoices' });
  });
  it('updateAutoGenerateEnabled does not audit on failure', async () => {
    results['system_settings.update'] = { error: boom };
    await updateAutoGenerateEnabled(false);
    expect(logAudit).not.toHaveBeenCalled();
  });
  it('updateEmailDebugMode / updateMaintenanceMode audit with the row id returned by updateSetting', async () => {
    await updateEmailDebugMode(true);
    expectAuditedOnce({ entityType: 'system_settings', entityId: uid(1) });
    logAudit.mockClear();
    await updateMaintenanceMode(true);
    expectAuditedOnce({ entityType: 'system_settings', entityId: uid(1) });
  });
  it('updateEmailDebugMode / updateMaintenanceMode do not audit when updateSetting fails', async () => {
    updateSetting.mockResolvedValue({ data: null, error: 'nope' });
    await updateEmailDebugMode(true);
    await updateMaintenanceMode(true);
    expect(logAudit).not.toHaveBeenCalled();
  });
  it('setWhatsAppForcePin audits with the updated row id; no audit on failure', async () => {
    results['system_settings.update'] = { data: [{ id: uid(3) }] };
    await setWhatsAppForcePin(true);
    expectAuditedOnce({ entityId: uid(3) });
    logAudit.mockClear();
    results['system_settings.update'] = { error: boom };
    await setWhatsAppForcePin(true);
    expect(logAudit).not.toHaveBeenCalled();
  });
  it('setWhatsAppEnabled audits with the upserted row id; no audit on failure', async () => {
    results['system_settings.upsert'] = { data: { id: uid(4) } };
    await setWhatsAppEnabled(true);
    expectAuditedOnce({ entityId: uid(4) });
    logAudit.mockClear();
    results['system_settings.upsert'] = { error: boom };
    await setWhatsAppEnabled(true);
    expect(logAudit).not.toHaveBeenCalled();
  });
  it('promoteWhatsAppPilotToEstate audits with the updated row id', async () => {
    results['system_settings.select'] = { data: { value: 'pilot' } };
    results['system_settings.update'] = { data: [{ id: uid(5) }] };
    await promoteWhatsAppPilotToEstate();
    expectAuditedOnce({ action: 'ACTIVATE', entityId: uid(5) });
  });
  it('removeEstateLogo audits with the settings row id read earlier', async () => {
    results['system_settings.select'] = { data: { id: uid(6), value: 'https://x/logos/a.png' } };
    expect((await removeEstateLogo()).success).toBe(true);
    expectAuditedOnce({ action: 'DELETE', entityId: uid(6) });
  });
});

describe('system_settings group sites (first row stands for the group)', () => {
  it('updateWhatsAppPilotSettings', async () => {
    results['system_settings.upsert'] = { data: [{ id: uid(7) }, { id: uid(8) }] };
    await updateWhatsAppPilotSettings(pilotInput);
    expectAuditedOnce({ entityId: uid(7) });
    expect(logAudit.mock.calls[0][0].newValues.total_count).toBe(2);
  });
  it('updateWhatsAppPilotSettings does not audit on failure', async () => {
    results['system_settings.upsert'] = { error: boom };
    await updateWhatsAppPilotSettings(pilotInput);
    expect(logAudit).not.toHaveBeenCalled();
  });
  it('resetSecuritySettingsToDefault', async () => {
    results['system_settings.update'] = { data: [{ id: uid(9) }] };
    expect((await resetSecuritySettingsToDefault()).success).toBe(true);
    expectAuditedOnce({ entityId: uid(9) });
  });
  it('resetSecuritySettingsToDefault does not audit when an update fails', async () => {
    results['system_settings.update'] = { error: boom };
    await resetSecuritySettingsToDefault();
    expect(logAudit).not.toHaveBeenCalled();
  });
});

describe('batch and row sites', () => {
  it('updateSyncCriteria audits the updated credentials row; skips when none is active', async () => {
    results['gmail_oauth_credentials.update'] = { data: [{ id: uid(10) }] };
    await updateSyncCriteria({ a: 1 });
    expectAuditedOnce({ entityType: 'gmail_oauth_credentials', entityId: uid(10) });
    logAudit.mockClear();
    results['gmail_oauth_credentials.update'] = { data: [] };
    await updateSyncCriteria({ a: 1 });
    expect(logAudit).not.toHaveBeenCalled();
  });
  it('updateSyncCriteria does not audit on failure', async () => {
    results['gmail_oauth_credentials.update'] = { error: boom };
    await updateSyncCriteria({ a: 1 });
    expect(logAudit).not.toHaveBeenCalled();
  });
  it('resetEmailImports (global) audits the first import id with total_count; skips when empty', async () => {
    results['email_imports.select'] = { data: [{ id: uid(11) }, { id: uid(12) }], count: 2 };
    expect((await resetEmailImports()).success).toBe(true);
    expectAuditedOnce({ entityType: 'email_imports', entityId: uid(11) });
    expect(logAudit.mock.calls[0][0].newValues).toMatchObject({ total_count: 2, scope: 'ALL' });
    logAudit.mockClear();
    results['email_imports.select'] = { data: [], count: 0 };
    await resetEmailImports();
    expect(logAudit).not.toHaveBeenCalled();
  });
  it('resetEmailImports does not audit when the delete fails', async () => {
    results['email_imports.select'] = { data: [{ id: uid(11) }], count: 1 };
    results['email_imports.delete'] = { error: boom };
    await resetEmailImports();
    expect(logAudit).not.toHaveBeenCalled();
  });
  it('batchUpdateRoleAssignmentRules audits the first rule row; skips an empty batch', async () => {
    results['role_assignment_rules.upsert'] = { data: [{ id: uid(13) }, { id: uid(14) }] };
    await batchUpdateRoleAssignmentRules([
      { residentRole: 'tenant' as never, appRoleId: uid(20), isAllowed: false },
      { residentRole: 'co_resident' as never, appRoleId: uid(21), isAllowed: false },
    ]);
    expectAuditedOnce({ entityType: 'role_assignment_rules', entityId: uid(13) });
    logAudit.mockClear();
    results['role_assignment_rules.upsert'] = { data: [] };
    await batchUpdateRoleAssignmentRules([]);
    expect(logAudit).not.toHaveBeenCalled();
  });
  it('updateRoleAssignmentRule audits the rule row id, keeping the role pair in newValues', async () => {
    results['role_assignment_rules.upsert'] = { data: { id: uid(15) } };
    await updateRoleAssignmentRule('tenant' as never, uid(20), false);
    expectAuditedOnce({ entityId: uid(15) });
    expect(logAudit.mock.calls[0][0].newValues).toMatchObject({ resident_role: 'tenant', app_role_id: uid(20) });
  });
  it('updateRoleAssignmentRule does not audit on failure', async () => {
    results['role_assignment_rules.upsert'] = { error: boom };
    await updateRoleAssignmentRule('tenant' as never, uid(20), false);
    expect(logAudit).not.toHaveBeenCalled();
  });
  it('processNotificationQueue audits the first attempted queue item; skips when nothing processed', async () => {
    processQueue.mockResolvedValue({ processed: 2, sent: 2, failed: 0, skipped: 0, errors: [] });
    results['notification_queue.select'] = { data: [{ id: uid(16) }, { id: uid(17) }] };
    await processNotificationQueue();
    expectAuditedOnce({ entityType: 'notification_queue', entityId: uid(16) });
    logAudit.mockClear();
    processQueue.mockResolvedValue({ processed: 0, sent: 0, failed: 0, skipped: 0, errors: [] });
    await processNotificationQueue();
    expect(logAudit).not.toHaveBeenCalled();
  });
  it('pruneSystemData audits with a fresh run uuid; skips when nothing was pruned', async () => {
    results['in_app_notifications.delete'] = { count: 3 };
    expect((await pruneSystemData()).error).toBeNull();
    expectAuditedOnce({ action: 'DELETE', entityType: 'system_settings' });
    logAudit.mockClear();
    delete results['in_app_notifications.delete'];
    await pruneSystemData();
    expect(logAudit).not.toHaveBeenCalled();
  });
});
