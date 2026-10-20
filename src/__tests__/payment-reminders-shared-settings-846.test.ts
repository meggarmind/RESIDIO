/**
 * #846: the daily payment-reminders cron ignored the Billing reminder days and the Email
 * "Payment Reminders" switch, which only the manual run read. Both now read them through one
 * helper. The cron also stopped calling updateSetting/logAudit, which cannot write without a
 * session; its run is recorded in the System Action Log by the route.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { ReminderScheduleStep } from '@/lib/notifications/types';
import { applyPaymentReminderSettings } from '@/lib/notifications/payment-reminder-settings';

const m = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  dueDates: [] as string[],
  updateSetting: vi.fn(),
  logAudit: vi.fn(),
  sendEmail: vi.fn(),
  recordSystemAction: vi.fn(),
}));

vi.mock('@/lib/settings/service', () => ({
  getSettingValueAsService: async (key: string) => (key in m.settings ? m.settings[key] : null),
}));
vi.mock('@/actions/notifications/reminder-config', async () => {
  const actual = await vi.importActual<typeof import('@/actions/notifications/reminder-config')>(
    '@/actions/notifications/reminder-config'
  );
  return {
    areRemindersEnabled: async () => true,
    getReminderSchedule: async () => ({ data: await actual.getDefaultReminderSchedule(), error: null }),
  };
});
vi.mock('@/lib/supabase/server', () => {
  const chain = {
    select: () => chain,
    in: () => chain,
    eq: (column: string, value: string) => {
      if (column === 'due_date') m.dueDates.push(value);
      return chain;
    },
    then: (resolve: (r: unknown) => unknown) => resolve({ data: [], error: null }),
  };
  return { createAdminClient: () => ({ from: () => chain }), createServerSupabaseClient: vi.fn() };
});
vi.mock('@/actions/settings/update-setting', () => ({ updateSetting: m.updateSetting }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: m.logAudit }));
vi.mock('@/lib/email', () => ({ sendEmail: m.sendEmail, getEstateEmailSettings: async () => ({}) }));
vi.mock('@/lib/system-log/recorder', () => ({ recordSystemAction: m.recordSystemAction }));
vi.mock('@/lib/auth/cron-auth', () => ({ verifyCronAuth: () => null }));

import { processInvoiceReminders } from '@/actions/notifications/invoice-reminders';
import { GET } from '@/app/api/cron/payment-reminders/route';

function step(daysFromDue: number, channels: ReminderScheduleStep['channels'] = ['email']): ReminderScheduleStep {
  return { id: `s${daysFromDue}`, daysFromDue, escalationLevel: 'friendly', channels, isActive: true, priority: 1 };
}

// The due date a step targets today, as processInvoiceReminders computes it.
function dueDateFor(daysFromDue: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysFromDue);
  return d.toISOString().split('T')[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  m.settings = {};
  m.dueDates.length = 0;
});

describe('applyPaymentReminderSettings', () => {
  const steps = [step(-7), step(-3), step(-1, ['email', 'whatsapp']), step(0), step(3)];

  it('keeps only the before-due steps on a configured reminder day', () => {
    const kept = applyPaymentReminderSettings(steps, { emailEnabled: true, reminderDays: [3] });
    expect(kept.map((s) => s.daysFromDue)).toEqual([-3, 0, 3]);
  });

  it('drops email when the switch is off, and steps left with no channel', () => {
    const kept = applyPaymentReminderSettings(steps, { emailEnabled: false, reminderDays: [7, 3, 1] });
    expect(kept).toEqual([{ ...step(-1, ['whatsapp']) }]);
  });
});

describe('processInvoiceReminders (cron engine)', () => {
  it('queries only the Billing reminder days before the due date', async () => {
    m.settings.payment_reminder_days = [3];
    await processInvoiceReminders();
    expect(m.dueDates).toEqual([-3, 0, 1, 3, 7].map(dueDateFor));
  });

  it('uses the default days [7, 3, 1] when none are stored', async () => {
    await processInvoiceReminders();
    expect(m.dueDates).toEqual([-7, -3, -1, 0, 1, 3, 7].map(dueDateFor));
  });

  it('sends nothing on the email-only default schedule when the email switch is off', async () => {
    m.settings.email_payment_reminders_enabled = false;
    await processInvoiceReminders();
    expect(m.dueDates).toEqual([]);
    expect(m.sendEmail).not.toHaveBeenCalled();
  });

  it('does not write the last run through updateSetting or logAudit, which need a session', async () => {
    await processInvoiceReminders();
    expect(m.updateSetting).not.toHaveBeenCalled();
    expect(m.logAudit).not.toHaveBeenCalled();
  });
});

describe('payment-reminders cron route', () => {
  it('records the run in the System Action Log', async () => {
    m.settings.payment_reminder_days = [7];
    const res = await GET(new NextRequest('http://localhost/api/cron/payment-reminders'));
    expect(res.status).toBe(200);
    expect(m.recordSystemAction).toHaveBeenCalledTimes(1);
    expect(m.recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'cron:payment-reminders', action: 'send', outcome: 'success' })
    );
  });
});
