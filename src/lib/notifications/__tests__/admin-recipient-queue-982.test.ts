/**
 * #982 -- a queue row addressed to an admin account has recipient_id null. The sender must send it
 * (email only, with metadata.admin_profile_id) and fail closed for every other recipient-less row.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type Row } from './helpers/fake-supabase';

const mocks = vi.hoisted(() => ({
  resendSend: vi.fn(),
  isEmailConfigured: vi.fn(),
  buildDebtReportEmail: vi.fn(),
  resolveResidentOverride: vi.fn(),
}));

vi.mock('@/lib/email/resend', () => ({
  resend: { emails: { send: mocks.resendSend } },
  emailConfig: { fromAddress: 'noreply@test.example', replyTo: 'reply@test.example' },
  isEmailConfigured: mocks.isEmailConfigured,
}));
vi.mock('@/lib/comms-override/gate', () => ({
  decideSend: async () => ({ result: { redirect: false }, envLabel: 'TEST' }),
  loadSnapshotFor: async () => ({ status: 'error', message: 'unused' }),
}));
vi.mock('@/lib/settings/service', () => ({
  getSettingValueAsService: vi.fn(async () => null),
  getSettingResultAsService: vi.fn(),
}));
vi.mock('@/lib/whatsapp', () => ({ sendWhatsAppTemplate: vi.fn(), isApprovedWhatsAppTemplateName: vi.fn() }));
vi.mock('@/lib/whatsapp/config', () => ({ resolveWhatsAppConfig: vi.fn() }));
vi.mock('@/lib/whatsapp/rollout', () => ({ isWhatsAppRecipientAllowed: vi.fn() }));
vi.mock('@/lib/sms/send-sms', () => ({ sendSms: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/comms-override/resident-flag', () => ({ resolveResidentOverride: mocks.resolveResidentOverride }));
vi.mock('@/lib/whatsapp/statement-delivery', () => ({ buildStatementEmail: vi.fn(), markStatementEmailSent: vi.fn() }));
vi.mock('@/lib/whatsapp/debt-report', () => ({ buildDebtReportEmail: mocks.buildDebtReportEmail }));

import { createAdminClient } from '@/lib/supabase/server';
import { sendAndRecordNotification, sendNotification } from '@/lib/notifications/send';
import type { NotificationQueueItem } from '@/lib/notifications/types';

function adminRow(overrides: Row = {}): Row {
  return {
    id: 'queue-admin',
    template_id: null,
    schedule_id: null,
    recipient_id: null,
    recipient_email: 'ada@example.test',
    recipient_phone: null,
    channel: 'email',
    subject: 'Debt status report',
    body: 'attached',
    html_body: null,
    variables: null,
    priority: 5,
    status: 'pending',
    deduplication_key: null,
    dedup_window_minutes: null,
    scheduled_for: new Date().toISOString(),
    attempts: 0,
    max_attempts: 3,
    last_attempt_at: null,
    sent_at: null,
    error_message: null,
    metadata: { admin_profile_id: 'admin-1', whatsapp_debt_report: { all: true, streetIds: [] } },
    created_at: new Date().toISOString(),
    created_by: null,
    ...overrides,
  };
}

const asItem = (row: Row) => row as unknown as NotificationQueueItem;

function useFake(row: Row) {
  const fake = createFakeSupabase({ notification_queue: [row], notification_history: [] });
  vi.mocked(createAdminClient).mockReturnValue(fake.client as unknown as ReturnType<typeof createAdminClient>);
  return fake;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isEmailConfigured.mockReturnValue(true);
  mocks.resendSend.mockResolvedValue({ data: { id: 'email-1' }, error: null });
  mocks.resolveResidentOverride.mockResolvedValue({ ok: true, residentOverride: null });
  mocks.buildDebtReportEmail.mockResolvedValue({ react: 'debt-email', attachments: [{ filename: 'd.pdf', content: Buffer.from('%PDF') }] });
});

describe('admin-addressed queue rows (#982)', () => {
  it('sends the report email with its PDF built at send time, without a resident lookup', async () => {
    useFake(adminRow());
    const result = await sendAndRecordNotification(asItem(adminRow()));

    expect(result.success).toBe(true);
    expect(mocks.resolveResidentOverride).not.toHaveBeenCalled();
    expect(mocks.buildDebtReportEmail).toHaveBeenCalledWith(expect.objectContaining({ admin_profile_id: 'admin-1' }));
    expect(mocks.resendSend.mock.calls[0][0]).toMatchObject({ react: 'debt-email', attachments: [{ filename: 'd.pdf' }] });
  });

  it('still fails closed for a recipient-less row that is not an admin email', async () => {
    useFake(adminRow({ metadata: null }));
    const result = await sendAndRecordNotification(asItem(adminRow({ metadata: null })));

    expect(result).toMatchObject({ success: false, retryable: true });
    expect(mocks.resendSend).not.toHaveBeenCalled();
  });

  it('does not send a recipient-less row over WhatsApp', async () => {
    const result = await sendNotification(asItem(adminRow({ channel: 'whatsapp', recipient_email: null, recipient_phone: '+2348000000000' })));

    expect(result).toEqual({ success: false, error: 'WhatsApp needs a resident recipient' });
  });
});
