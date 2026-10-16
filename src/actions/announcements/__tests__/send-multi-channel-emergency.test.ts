import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  logAudit: vi.fn(),
  addToQueue: vi.fn(),
  sendSms: vi.fn(),
  sendEmail: vi.fn(),
  createNotificationsForAllResidents: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  createAdminClient: vi.fn(),
  isChannelImplemented: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: mocks.authorizePermission }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: mocks.logAudit }));
vi.mock('@/lib/notifications/queue', () => ({
  addToQueue: mocks.addToQueue,
  PRIORITY: { URGENT: 1, NORMAL: 5 },
}));
vi.mock('@/lib/notifications/types', () => ({ isChannelImplemented: mocks.isChannelImplemented }));
vi.mock('@/lib/sms/send-sms', () => ({ sendSms: mocks.sendSms }));
// Every resident follows the environment default here (#716); the lookup itself is covered in
// comms-override/__tests__/resident-flag.test.ts.
vi.mock('@/lib/comms-override/resident-flag', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/comms-override/resident-flag')>()),
  loadResidentOverrideFlags: vi.fn(async (ids: string[]) => ({
    ok: true,
    flags: new Map(ids.map((id) => [id, null])),
  })),
}));
vi.mock('@/lib/email/send-email', () => ({
  sendEmail: mocks.sendEmail,
  getEstateEmailSettings: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/emails/emergency-broadcast', () => ({ EmergencyBroadcastEmail: vi.fn(() => null) }));
vi.mock('@/lib/whatsapp', () => ({
  whatsappTemplate: vi.fn(() => ({})),
  WHATSAPP_TEMPLATE_NAMES: { announcement: 'announcement' },
}));
vi.mock('@/actions/in-app-notifications/create-notification', () => ({
  createNotificationsForAllResidents: mocks.createNotificationsForAllResidents,
}));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
  createAdminClient: mocks.createAdminClient,
}));

import { sendMultiChannelEmergencyBroadcast } from '../send-multi-channel-emergency';

const RESIDENTS = [
  { id: 'r1', first_name: 'A', last_name: 'One', email: 'a@example.test', phone_primary: '2348000000001' },
  { id: 'r2', first_name: 'B', last_name: 'Two', email: 'b@example.test', phone_primary: '2348000000002' },
];

const ALL_CHANNELS = { inApp: true, email: true, sms: true, whatsapp: true };
const INPUT = { title: 'Gas leak', content: 'Evacuate block C', channels: ALL_CHANNELS };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorizePermission.mockResolvedValue({ authorized: true, userId: 'admin-1' });
  mocks.createServerSupabaseClient.mockResolvedValue({
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: { id: 'ann-1', title: 'Gas leak' },
            error: null,
          }),
        })),
      })),
    })),
  });
  mocks.createAdminClient.mockReturnValue({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ data: RESIDENTS, error: null }),
      })),
    })),
  });
  mocks.createNotificationsForAllResidents.mockResolvedValue({ count: 2, error: null });
  mocks.sendEmail.mockResolvedValue({ success: true });
  mocks.sendSms.mockResolvedValue({ success: true, messageId: 'sms-1' });
  mocks.addToQueue.mockResolvedValue({ success: true });
});

describe('sendMultiChannelEmergencyBroadcast SMS switch', () => {
  it('sends no SMS when SMS is not implemented and reports the SMS channel as failed', async () => {
    mocks.isChannelImplemented.mockImplementation((channel: string) => channel !== 'sms');

    const response = await sendMultiChannelEmergencyBroadcast(INPUT);

    expect(mocks.sendSms).not.toHaveBeenCalled();
    const sms = response.data!.results.find((r) => r.channel === 'sms');
    expect(sms).toEqual({
      channel: 'sms',
      success: false,
      count: 0,
      error: 'SMS is disabled until the SMS provider is connected',
    });
  });

  it('still runs the other channels when SMS is off', async () => {
    mocks.isChannelImplemented.mockImplementation((channel: string) => channel !== 'sms');

    const response = await sendMultiChannelEmergencyBroadcast(INPUT);

    expect(response.error).toBeNull();
    expect(mocks.createNotificationsForAllResidents).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(2);
    expect(mocks.addToQueue).toHaveBeenCalledTimes(2);
    const successByChannel = Object.fromEntries(
      response.data!.results.map((r) => [r.channel, r.success])
    );
    expect(successByChannel.sms).toBe(false);
    expect(successByChannel.email).toBe(true);
    expect(successByChannel.whatsapp).toBe(true);
    expect(response.data!.results).toHaveLength(4);
  });

  it('preserves the old behaviour when SMS is implemented', async () => {
    mocks.isChannelImplemented.mockReturnValue(true);

    const response = await sendMultiChannelEmergencyBroadcast(INPUT);

    expect(mocks.sendSms).toHaveBeenCalledTimes(2);
    const sms = response.data!.results.find((r) => r.channel === 'sms');
    expect(sms).toMatchObject({ success: true, count: 2 });
  });
});
