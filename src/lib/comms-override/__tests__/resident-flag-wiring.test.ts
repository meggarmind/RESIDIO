import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * #716: the per-resident flag reaches the send seams from the queue path
 * (sendAndRecordNotification, sendImmediate), through the real resolver. Only the
 * transport (Resend), the settings read and the database client are faked.
 */
const mocks = vi.hoisted(() => ({
  loadOverrideSettings: vi.fn(),
  resendSend: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/comms-override/settings', () => ({ loadOverrideSettings: mocks.loadOverrideSettings }));
vi.mock('@/lib/email/resend', () => ({
  resend: { emails: { send: mocks.resendSend } },
  emailConfig: { fromAddress: 'noreply@test.example', replyTo: 'reply@test.example' },
  isEmailConfigured: () => true,
}));
vi.mock('@/lib/settings/service', () => ({
  getSettingValueAsService: vi.fn().mockResolvedValue(null),
  getSettingResultAsService: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock('@/lib/sms/send-sms', () => ({ sendSms: vi.fn() }));
vi.mock('@/lib/whatsapp/send-policy', () => ({ evaluateSendPolicy: vi.fn(), createSendPolicyFacts: vi.fn(() => ({})) }));
vi.mock('@/lib/whatsapp/config', () => ({ resolveWhatsAppConfig: vi.fn() }));
vi.mock('@/lib/notifications/deduplication', () => ({ shouldQueue: vi.fn() }));

import { sendAndRecordNotification, sendImmediate } from '@/lib/notifications/send';
import { PRIORITY } from '@/lib/notifications/queue';
import type { NotificationQueueItem } from '@/lib/notifications/types';

const REAL = 'real@example.test';
const OVERRIDE = 'override@example.test';
// Debug Mode counts only with a parseable expiry in the future (#717); a switch on with none is expired.
const FAR_FUTURE = '2999-01-01T00:00:00.000Z';

type FlagResult = { rows?: Array<{ id: string; use_override_comms: unknown }>; error?: string };

/** The residents flag query, plus enough of the history and queue writes for the record step. */
function adminClient(flag: FlagResult) {
  const writes: Array<{ table: string; op: string; payload: unknown }> = [];
  const from = (table: string) => {
    if (table === 'residents') {
      return {
        select: () => ({
          in: async () =>
            flag.error ? { data: null, error: { message: flag.error } } : { data: flag.rows ?? [], error: null },
        }),
      };
    }
    const chain: Record<string, unknown> = {
      insert: (payload: unknown) => (writes.push({ table, op: 'insert', payload }), chain),
      update: (payload: unknown) => (writes.push({ table, op: 'update', payload }), chain),
      select: () => chain,
      single: async () => ({ data: { id: 'history-1' }, error: null }),
      eq: async () => ({ error: null }),
    };
    return chain;
  };
  return { client: { from }, writes };
}

function withFlag(value: boolean | null) {
  return adminClient({ rows: [{ id: 'resident-1', use_override_comms: value }] });
}

function item(over: Partial<NotificationQueueItem> = {}): NotificationQueueItem {
  return {
    id: 'q-1',
    template_id: null,
    schedule_id: null,
    recipient_id: 'resident-1',
    recipient_email: REAL,
    recipient_phone: null,
    channel: 'email',
    subject: 'Invoice due',
    body: 'Please pay',
    html_body: null,
    variables: null,
    priority: PRIORITY.NORMAL,
    status: 'processing',
    deduplication_key: null,
    dedup_window_minutes: null,
    scheduled_for: new Date().toISOString(),
    attempts: 0,
    max_attempts: 3,
    last_attempt_at: null,
    sent_at: null,
    error_message: null,
    metadata: null,
    created_at: new Date().toISOString(),
    created_by: null,
    ...over,
  } as NotificationQueueItem;
}

function settings(over: Record<string, unknown> = {}) {
  mocks.loadOverrideSettings.mockResolvedValue({
    status: 'ok',
    settings: {
      enabled: false,
      email: OVERRIDE,
      phone: '+15550100100',
      whatsappPhone: '',
      debugMode: false,
      debugExpiresAt: null,
      ...over,
    },
  });
}

const sentTo = () => mocks.resendSend.mock.calls[0]?.[0]?.to;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resendSend.mockResolvedValue({ data: { id: 'rid-1' }, error: null });
  settings();
});

afterEach(() => vi.unstubAllEnvs());

describe('queue path passes the resident flag to the seam (sendAndRecordNotification)', () => {
  describe('non-production (staging)', () => {
    beforeEach(() => vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'staging'));

    it('flag null follows the environment default: redirected', async () => {
      mocks.createAdminClient.mockReturnValue(withFlag(null).client);
      await sendAndRecordNotification(item());
      expect(sentTo()).toBe(OVERRIDE);
    });

    it('flag true: redirected', async () => {
      mocks.createAdminClient.mockReturnValue(withFlag(true).client);
      await sendAndRecordNotification(item());
      expect(sentTo()).toBe(OVERRIDE);
    });

    it('flag false: the real recipient (an explicit admin choice)', async () => {
      mocks.createAdminClient.mockReturnValue(withFlag(false).client);
      const result = await sendAndRecordNotification(item());
      expect(result.success).toBe(true);
      expect(sentTo()).toBe(REAL);
    });

    it('Debug Mode redirects even a stored false', async () => {
      settings({ debugMode: true, debugExpiresAt: FAR_FUTURE });
      mocks.createAdminClient.mockReturnValue(withFlag(false).client);
      await sendAndRecordNotification(item());
      expect(sentTo()).toBe(OVERRIDE);
    });
  });

  describe('production', () => {
    beforeEach(() => vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'production'));

    it('flag null follows the environment default: the real recipient, even with the switch on', async () => {
      settings({ enabled: true });
      mocks.createAdminClient.mockReturnValue(withFlag(null).client);
      await sendAndRecordNotification(item());
      expect(sentTo()).toBe(REAL);
    });

    it('flag true with the switch on: redirected', async () => {
      settings({ enabled: true });
      mocks.createAdminClient.mockReturnValue(withFlag(true).client);
      await sendAndRecordNotification(item());
      expect(sentTo()).toBe(OVERRIDE);
    });

    it('flag true with the switch off: the real recipient (the global switch gates it)', async () => {
      mocks.createAdminClient.mockReturnValue(withFlag(true).client);
      await sendAndRecordNotification(item());
      expect(sentTo()).toBe(REAL);
    });

    it('Debug Mode redirects a stored false', async () => {
      settings({ debugMode: true, debugExpiresAt: FAR_FUTURE });
      mocks.createAdminClient.mockReturnValue(withFlag(false).client);
      await sendAndRecordNotification(item());
      expect(sentTo()).toBe(OVERRIDE);
    });
  });

  describe('fails closed when the flag cannot be read', () => {
    beforeEach(() => vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'production'));

    it('does not send, and requeues the row as a transient failure', async () => {
      const admin = adminClient({ error: 'connection reset' });
      mocks.createAdminClient.mockReturnValue(admin.client);
      const result = await sendAndRecordNotification(item());

      expect(mocks.resendSend).not.toHaveBeenCalled();
      expect(result).toMatchObject({ success: false, retryable: true });
      expect(result.error).toContain('could not read resident flag');
      const queueUpdate = admin.writes.find((w) => w.table === 'notification_queue' && w.op === 'update');
      expect(queueUpdate?.payload).toMatchObject({ status: 'pending' });
    });

    it('does not send when the resident row is missing', async () => {
      mocks.createAdminClient.mockReturnValue(adminClient({ rows: [] }).client);
      const result = await sendAndRecordNotification(item());
      expect(mocks.resendSend).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
    });

    it('does not send when the queue row has no resident', async () => {
      mocks.createAdminClient.mockReturnValue(withFlag(null).client);
      const result = await sendAndRecordNotification(item({ recipient_id: null as unknown as string }));
      expect(mocks.resendSend).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
    });
  });

  it('looks the flag up once per send, not per field', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'staging');
    const inFn = vi.fn(async () => ({ data: [{ id: 'resident-1', use_override_comms: null }], error: null }));
    const base = withFlag(null).client;
    mocks.createAdminClient.mockReturnValue({
      from: (table: string) => (table === 'residents' ? { select: () => ({ in: inFn }) } : base.from(table)),
    });
    await sendAndRecordNotification(item());
    expect(inFn).toHaveBeenCalledTimes(1);
  });
});

describe('immediate path passes the resident flag to the seam (sendImmediate)', () => {
  const params = {
    recipientId: 'resident-1',
    recipientEmail: REAL,
    channel: 'email' as const,
    subject: 'Hello',
    body: 'Body',
  };

  it('staging, flag false: the real recipient', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'staging');
    mocks.createAdminClient.mockReturnValue(withFlag(false).client);
    await sendImmediate(params);
    expect(sentTo()).toBe(REAL);
  });

  it('staging, flag null: redirected', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'staging');
    mocks.createAdminClient.mockReturnValue(withFlag(null).client);
    await sendImmediate(params);
    expect(sentTo()).toBe(OVERRIDE);
  });

  it('fails closed on a lookup error: nothing is sent', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'production');
    mocks.createAdminClient.mockReturnValue(adminClient({ error: 'boom' }).client);
    const result = await sendImmediate(params);
    expect(mocks.resendSend).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
  });
});
