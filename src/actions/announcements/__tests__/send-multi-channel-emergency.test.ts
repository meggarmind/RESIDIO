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
// The stored flag per resident (#716) comes from flagState; the lookup itself is covered in
// comms-override/__tests__/resident-flag.test.ts.
const flagState = vi.hoisted(() => ({ byId: new Map<string, boolean | null>(), error: null as string | null }));
vi.mock('@/lib/comms-override/resident-flag', async (importOriginal) =>
  (await import('@/__tests__/helpers/resident-flag-lookup-mock')).flagModule(
    await importOriginal<typeof import('@/lib/comms-override/resident-flag')>(),
    flagState
  )
);
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
  flagState.error = null;
  flagState.byId = new Map([
    ['r1', null],
    ['r2', null],
  ]);
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

describe('sendMultiChannelEmergencyBroadcast passes each resident its stored override flag (#716)', () => {
  const overrideSentTo = (mock: { mock: { calls: unknown[][] } }, id: string) =>
    (mock.mock.calls.map((c) => c[0]) as Array<{ to: { residentId: string }; residentOverride?: unknown }>).find(
      (o) => o.to.residentId === id
    );

  it.each([
    [true, false],
    [false, true],
    [null, true],
  ])('email and SMS: r1 stored %s, r2 stored %s reach the seams unchanged', async (r1, r2) => {
    flagState.byId = new Map<string, boolean | null>([
      ['r1', r1],
      ['r2', r2],
    ]);
    mocks.isChannelImplemented.mockReturnValue(true);

    await sendMultiChannelEmergencyBroadcast(INPUT);

    for (const seam of [mocks.sendEmail, mocks.sendSms]) {
      expect(seam).toHaveBeenCalledTimes(2);
      expect(overrideSentTo(seam, 'r1')).toHaveProperty('residentOverride', r1);
      expect(overrideSentTo(seam, 'r2')).toHaveProperty('residentOverride', r2);
    }
  });

  it('fails closed when the flags cannot be read: nothing is emailed or texted, both channels report failure', async () => {
    flagState.error = 'db down';
    mocks.isChannelImplemented.mockReturnValue(true);

    const response = await sendMultiChannelEmergencyBroadcast(INPUT);

    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.sendSms).not.toHaveBeenCalled();
    for (const channel of ['email', 'sms']) {
      const result = response.data!.results.find((r) => r.channel === channel);
      expect(result).toMatchObject({ success: false, count: 0 });
      expect(result!.error).toContain('could not read resident flags');
    }
  });

  it('fails a resident whose row is missing from the lookup without sending to them', async () => {
    flagState.byId = new Map([['r1', null]]);
    mocks.isChannelImplemented.mockReturnValue(true);

    await sendMultiChannelEmergencyBroadcast(INPUT);

    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(overrideSentTo(mocks.sendEmail, 'r2')).toBeUndefined();
    expect(mocks.sendSms).toHaveBeenCalledTimes(1);
  });
});
