import { describe, expect, it } from 'vitest';

/**
 * Issue #875: every export of a 'use server' module is client-callable, so a
 * cron-only batch exported from one could be triggered by anyone.
 * processInvoiceReminders and refreshPaymentCadenceSummary now live in plain
 * server libs imported only by their CRON_SECRET-authenticated routes. The rest
 * of actions/notifications/invoice-reminders.ts (sendManualReminder,
 * resolveInvoiceReminders, getInvoiceReminderStatus) was unauthenticated and
 * unused, so the module was deleted rather than guarded.
 */

describe('cron-only batches are not server actions (#875)', () => {
  it.each([
    '@/actions/notifications/invoice-reminders',
    '@/actions/analytics/refresh-payment-cadence-summary',
  ])('%s no longer exists as a server-action module', async (path) => {
    await expect(import(/* @vite-ignore */ path)).rejects.toThrow();
  });
});
