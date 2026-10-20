/**
 * #907 -- admin-editable wording for the five real resident emails.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@react-email/render';

const { authorizePermission, logAudit, createServerSupabaseClient, createAdminClient } = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  logAudit: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission }));
vi.mock('@/lib/audit/logger', () => ({ logAudit }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient, createAdminClient }));

import { WelcomeResidentEmail } from '@/emails/welcome-resident';
import { PaymentReceiptEmail } from '@/emails/payment-receipt';
import { PaymentReminderEmail } from '@/emails/payment-reminder';
import { InvoiceGeneratedEmail } from '@/emails/invoice-generated';
import {
  PaymentReminderEscalatedEmail,
  getEscalatedReminderSubject,
  type ReminderEscalationLevel,
} from '@/emails/payment-reminder-escalated';
import { updateEventContent } from '@/actions/notifications/templates';
import { getEventContent } from '@/lib/notifications/event-content';
import {
  ESCALATION_LEVELS,
  EVENT_KEYS,
  getEventDefaults,
  mergeEventContent,
  renderEventText,
  validateOverrides,
} from '@/lib/notifications/event-content-registry';

// React inserts `<!-- -->` between adjacent text nodes; joining text into one string drops them.
const html = async (el: React.ReactElement) => (await render(el)).replace(/<!-- -->/g, '');

const estate = { estateName: 'Test Estate', estateEmail: 'a@b.c', estatePhone: '123', estateAddress: '1 Road' };

const renderers: Record<string, (copy?: Record<string, string>) => React.ReactElement> = {
  welcome_resident: (copy) =>
    WelcomeResidentEmail({ residentName: 'Ann Lee', residentCode: 'R1', houseNumber: '5', streetName: 'Elm', portalUrl: 'https://x.y', copy, ...estate }),
  payment_receipt: (copy) =>
    PaymentReceiptEmail({ residentName: 'Ann Lee', receiptNumber: 'RC-1', amount: 5000, paymentDate: 'May 1, 2026', paymentMethod: 'bank_transfer', houseNumber: '5', streetName: 'Elm', residentCode: 'R1', copy, ...estate }),
  payment_reminder: (copy) =>
    PaymentReminderEmail({ residentName: 'Ann Lee', invoiceNumber: 'INV-1', amountDue: 5000, dueDate: 'May 1', daysUntilDue: 1, houseNumber: '5', streetName: 'Elm', copy, ...estate }),
  invoice_generated: (copy) =>
    InvoiceGeneratedEmail({ residentName: 'Ann Lee', invoiceNumber: 'INV-1', amountDue: 5000, dueDate: 'May 1', houseNumber: '5', streetName: 'Elm', items: [{ name: 'Dues', amount: 5000 }], copy, ...estate }),
  payment_reminder_escalated: (copy) =>
    PaymentReminderEscalatedEmail({ residentName: 'Ann Lee', invoiceNumber: 'INV-1', amountDue: 5000, dueDate: 'May 1', daysUntilDue: 1, houseNumber: '5', streetName: 'Elm', escalationLevel: 'urgent', copy, ...estate }),
};

describe('registry merge and render', () => {
  it('an override wins over the default, other fields keep theirs', () => {
    const merged = mergeEventContent('welcome_resident', { heading: 'Hi there' });
    expect(merged.heading).toBe('Hi there');
    expect(merged.sign_off).toBe(getEventDefaults('welcome_resident').sign_off);
  });

  it('blank overrides and unknown keys fall back to the default', () => {
    const merged = mergeEventContent('payment_receipt', { heading: '   ', nonsense: 'x' });
    expect(merged.heading).toBe('Payment Receipt');
    expect(merged).not.toHaveProperty('nonsense');
  });

  it('escalated reminders are keyed <level>.<field>', () => {
    const merged = mergeEventContent('payment_reminder_escalated', { 'final.closing': 'Call us.' });
    expect(merged['final.closing']).toBe('Call us.');
    expect(Object.keys(merged)).toHaveLength(ESCALATION_LEVELS.length * 3);
  });

  it('renderEventText substitutes variables', () => {
    expect(renderEventText('Hi {{name}}, {{ n }} due', { name: 'Ann', n: 3 })).toBe('Hi Ann, 3 due');
  });

  it('validator rejects variables outside the event list and unknown fields', () => {
    expect(validateOverrides('welcome_resident', { body: 'Hi {{resident_name}}' })).toEqual({ ok: true });
    const bad = validateOverrides('welcome_resident', { body: 'Owes {{amount}}', bogus: 'x' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.errors.join(' ')).toContain('{{amount}}');
      expect(bad.errors.join(' ')).toContain('bogus');
    }
  });
});

describe('component rendering', () => {
  it.each(EVENT_KEYS)('%s renders identically with no overrides and with the defaults passed in', async (event) => {
    const without = await html(renderers[event]());
    const withDefaults = await html(renderers[event](getEventDefaults(event)));
    expect(withDefaults).toBe(without);
  });

  it('with no overrides the built-in wording is what renders', async () => {
    expect(await html(renderers.welcome_resident())).toContain('Welcome to Test Estate!');
    expect(await html(renderers.payment_receipt())).toContain('Thank you for your payment.');
    expect(await html(renderers.payment_reminder())).toContain('please disregard this reminder');
    expect(await html(renderers.invoice_generated())).toContain('New Invoice Generated');
    expect(await html(renderers.payment_reminder_escalated())).toContain('URGENT: Payment Due Tomorrow');
  });

  it.each(EVENT_KEYS.filter((e) => e !== 'payment_reminder_escalated'))('%s: an override reaches the email', async (event) => {
    const out = await html(renderers[event]({ heading: 'Custom heading for {{estate_name}}', sign_off: 'Cheers,' }));
    expect(out).toContain('Custom heading for Test Estate');
    expect(out).toContain('Cheers,');
  });

  it('escalated: only the overridden level changes, and variables are filled in', async () => {
    const out = await html(renderers.payment_reminder_escalated({ 'urgent.body': 'Pay {{amount}} for {{property}} now.' }));
    expect(out).toContain('Pay ₦5,000 for 5, Elm now.');
    expect(getEscalatedReminderSubject('INV-1', 'friendly', { 'friendly.subject': 'Hello {{estate_name}}' }, { estate_name: 'Test Estate' })).toBe(
      'Hello Test Estate: Invoice INV-1'
    );
    expect(getEscalatedReminderSubject('INV-1', 'overdue' as ReminderEscalationLevel)).toBe('OVERDUE: Immediate Payment Required: Invoice INV-1');
  });

  it('admin text is escaped, never injected as HTML', async () => {
    const out = await html(renderers.welcome_resident({ body: '<script>alert(1)</script>' }));
    expect(out).not.toContain('<script>alert(1)</script>');
    expect(out).toContain('&lt;script&gt;');
  });
});

describe('getEventContent', () => {
  const stubRead = (result: unknown) => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.maybeSingle = async () => result;
    createAdminClient.mockReturnValue({ from: () => chain });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('merges the stored overrides over the defaults', async () => {
    stubRead({ data: { overrides: { heading: 'Stored' } }, error: null });
    const content = await getEventContent('payment_receipt');
    expect(content.heading).toBe('Stored');
    expect(content.sign_off).toBe('Thank you,');
  });

  it('falls back to the defaults, with a logged error, when the read returns an error', async () => {
    stubRead({ data: null, error: { message: 'boom' } });
    expect(await getEventContent('payment_receipt')).toEqual(getEventDefaults('payment_receipt'));
    expect(console.error).toHaveBeenCalled();
  });

  it('falls back to the defaults when the read throws', async () => {
    createAdminClient.mockImplementation(() => {
      throw new Error('no env');
    });
    expect(await getEventContent('welcome_resident')).toEqual(getEventDefaults('welcome_resident'));
    expect(console.error).toHaveBeenCalled();
  });

  it('falls back to the defaults when no row exists', async () => {
    stubRead({ data: null, error: null });
    expect(await getEventContent('invoice_generated')).toEqual(getEventDefaults('invoice_generated'));
  });
});

describe('updateEventContent', () => {
  let saved: { overrides?: Record<string, string> } | null;
  let writes: number;
  const row = { id: 't1', display_name: 'Welcome email', overrides: { heading: 'Old' } };

  beforeEach(() => {
    vi.clearAllMocks();
    saved = null;
    writes = 0;
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.update = (values: { overrides: Record<string, string> }) => {
      writes++;
      saved = values;
      return chain;
    };
    chain.maybeSingle = async () => ({ data: row, error: null });
    chain.single = async () => ({ data: { ...row, overrides: saved?.overrides }, error: null });
    createServerSupabaseClient.mockResolvedValue({ from: () => chain });
    authorizePermission.mockResolvedValue({ authorized: true });
  });

  it('refuses without permission and touches nothing', async () => {
    authorizePermission.mockResolvedValue({ authorized: false, error: 'Unauthorized' });
    const result = await updateEventContent('welcome_resident', 'email', { heading: 'x' });
    expect(result.error).toBe('Unauthorized');
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
    expect(authorizePermission).toHaveBeenCalledWith('notifications.manage');
  });

  it('rejects an unknown variable on the server and writes nothing', async () => {
    const result = await updateEventContent('welcome_resident', 'email', { body: 'You owe {{amount}}' });
    expect(result.data).toBeNull();
    expect(result.error).toContain('{{amount}}');
    expect(writes).toBe(0);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('rejects an unknown event', async () => {
    const result = await updateEventContent('made_up', 'email', {});
    expect(result.data).toBeNull();
    expect(writes).toBe(0);
  });

  it('saves, drops blank values (reset to default) and audits old and new overrides', async () => {
    const result = await updateEventContent('welcome_resident', 'email', { heading: '  ', sign_off: 'Cheers' });
    expect(result.error).toBeNull();
    expect(saved?.overrides).toEqual({ sign_off: 'Cheers' });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        entityType: 'notification_templates',
        entityId: 't1',
        oldValues: { overrides: { heading: 'Old' } },
        newValues: { overrides: { sign_off: 'Cheers' } },
      })
    );
  });
});
