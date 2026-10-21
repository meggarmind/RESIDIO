/**
 * #909 -- admin channel switches for payment receipt, welcome and invoice messages.
 * Storage is `notification_templates.is_active`; senders read it through `isEventChannelEnabled`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  logAudit: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  createAdminClient: vi.fn(),
  sendEmail: vi.fn(),
  getSettingValue: vi.fn(),
  isEventChannelEnabled: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: mocks.authorizePermission }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: mocks.logAudit }));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@/lib/email', () => ({
  sendEmail: mocks.sendEmail,
  getEstateEmailSettings: vi.fn().mockResolvedValue({ estateName: 'Test Estate' }),
}));
vi.mock('@/actions/settings/get-settings', () => ({ getSettingValue: mocks.getSettingValue }));
vi.mock('@/emails', () => ({ WelcomeResidentEmail: vi.fn(() => null), PaymentReceiptEmail: vi.fn(() => null) }));
vi.mock('@/lib/notifications/event-content', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/notifications/event-content')>()),
  isEventChannelEnabled: mocks.isEventChannelEnabled,
}));

const { isEventChannelEnabled: realIsEventChannelEnabled } = await vi.importActual<
  typeof import('@/lib/notifications/event-content')
>('@/lib/notifications/event-content');

import { setEventChannelEnabled } from '@/actions/notifications/templates';
import { sendWelcomeEmail } from '@/actions/email/send-welcome-email';
import { sendPaymentReceiptEmail } from '@/actions/email/send-payment-receipt-email';
import { EVENT_KEYS, getToggleableChannels } from '@/lib/notifications/event-content-registry';

function readClient(result: { data?: unknown; error?: unknown } | 'throw') {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq']) chain[m] = () => chain;
  chain.maybeSingle = async () => {
    if (result === 'throw') throw new Error('boom');
    return { data: result.data ?? null, error: result.error ?? null };
  };
  return { from: () => chain };
}

describe('which channels an admin can switch', () => {
  it('offers email for receipt, welcome and invoice, and WhatsApp only where WhatsApp text exists', () => {
    expect(getToggleableChannels('payment_receipt')).toEqual(['email', 'whatsapp']);
    expect(getToggleableChannels('welcome_resident')).toEqual(['email']);
    expect(getToggleableChannels('invoice_generated')).toEqual(['email']);
  });

  it('offers nothing for the reminders: their channels are set per schedule step', () => {
    expect(getToggleableChannels('payment_reminder')).toEqual([]);
    expect(getToggleableChannels('payment_reminder_escalated')).toEqual([]);
  });

  it('never offers WhatsApp for an event without WhatsApp content', () => {
    for (const key of EVENT_KEYS) {
      if (key !== 'payment_receipt' && key !== 'payment_reminder') {
        expect(getToggleableChannels(key)).not.toContain('whatsapp');
      }
    }
  });
});

describe('isEventChannelEnabled: defaults match today', () => {
  beforeEach(() => vi.clearAllMocks());
  const check = async (result: Parameters<typeof readClient>[0]) => {
    mocks.createAdminClient.mockReturnValue(readClient(result));
    return realIsEventChannelEnabled('welcome_resident', 'email');
  };

  it('is on for an active row, a missing row, a read error and a throw', async () => {
    expect(await check({ data: { is_active: true } })).toBe(true);
    expect(await check({ data: null })).toBe(true);
    expect(await check({ error: { message: 'x' } })).toBe(true);
    expect(await check('throw')).toBe(true);
  });

  it('is off only for an explicitly inactive row', async () => {
    expect(await check({ data: { is_active: false } })).toBe(false);
  });
});

describe('setEventChannelEnabled', () => {
  const row = { id: 'row-1', display_name: 'Welcome email', is_active: true };
  let update: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizePermission.mockResolvedValue({ authorized: true });
    update = vi.fn();
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq']) chain[m] = () => chain;
    chain.update = (patch: unknown) => {
      update(patch);
      return chain;
    };
    chain.maybeSingle = async () => ({ data: row, error: null });
    chain.single = async () => ({ data: { ...row, is_active: false }, error: null });
    mocks.createServerSupabaseClient.mockResolvedValue({ from: () => chain });
  });

  it('refuses without permission and writes nothing', async () => {
    mocks.authorizePermission.mockResolvedValue({ authorized: false, error: 'nope' });
    const res = await setEventChannelEnabled('welcome_resident', 'email', false);
    expect(res.error).toBe('nope');
    expect(update).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it.each([
    ['payment_reminder', 'email'],
    ['payment_reminder_escalated', 'email'],
    ['welcome_resident', 'whatsapp'],
    ['invoice_generated', 'whatsapp'],
    ['unknown_event', 'email'],
  ])('refuses %s on %s', async (event, channel) => {
    const res = await setEventChannelEnabled(event, channel, false);
    expect(res.error).toBeTruthy();
    expect(update).not.toHaveBeenCalled();
  });

  it('switches the channel off and audits the change', async () => {
    const res = await setEventChannelEnabled('welcome_resident', 'email', false);
    expect(res.error).toBeNull();
    expect(update).toHaveBeenCalledWith({ is_active: false });
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DEACTIVATE',
        entityType: 'notification_templates',
        entityId: 'row-1',
        oldValues: { is_active: true },
        newValues: { is_active: false },
      })
    );
  });
});

describe('senders honour the switch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizePermission.mockResolvedValue({ authorized: true });
    mocks.getSettingValue.mockResolvedValue(null);
    mocks.isEventChannelEnabled.mockResolvedValue(false);
  });

  it('welcome email: off sends nothing and never reads the resident', async () => {
    const res = await sendWelcomeEmail('r1');
    expect(mocks.isEventChannelEnabled).toHaveBeenCalledWith('welcome_resident', 'email');
    expect(res.success).toBe(false);
    expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('receipt email: off sends nothing and never reads the payment', async () => {
    const res = await sendPaymentReceiptEmail('pay-1', ['a@example.test']);
    expect(mocks.isEventChannelEnabled).toHaveBeenCalledWith('payment_receipt', 'email');
    expect(res.success).toBe(false);
    expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});
