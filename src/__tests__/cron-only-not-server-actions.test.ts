import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Issue #875: every export of a 'use server' module is client-callable, so a
 * cron-only batch exported from one could be triggered by anyone. These live in
 * plain server libs imported only by their CRON_SECRET-authenticated route.
 * The rest of actions/notifications/invoice-reminders.ts (sendManualReminder,
 * resolveInvoiceReminders, getInvoiceReminderStatus) was unauthenticated and
 * unused, so the module was deleted rather than guarded.
 */

function read(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8');
}

const hasUseServer = (source: string) => /^\s*['"]use server['"]/m.test(source);

const CRON_ONLY = [
  {
    fn: 'processInvoiceReminders',
    lib: 'lib/notifications/invoice-reminders.ts',
    formerAction: 'actions/notifications/invoice-reminders.ts',
    route: 'app/api/cron/payment-reminders/route.ts',
  },
  {
    fn: 'refreshPaymentCadenceSummary',
    lib: 'lib/analytics/refresh-payment-cadence-summary.ts',
    formerAction: 'actions/analytics/refresh-payment-cadence-summary.ts',
    route: 'app/api/cron/refresh-payment-cadence/route.ts',
  },
];

describe('cron-only batches are not server actions (#875)', () => {
  for (const { fn, lib, formerAction, route } of CRON_ONLY) {
    it(`${fn} lives in a module without the server-action directive`, () => {
      const source = read(lib);
      expect(source).toMatch(new RegExp(`export async function ${fn}\\(`));
      expect(hasUseServer(source)).toBe(false);
    });

    it(`${fn} is imported by its cron route from the server lib`, () => {
      expect(read(route)).toContain(`from '@/${lib.replace(/\.ts$/, '')}'`);
    });

    it(`the former ${formerAction} server-action module is gone`, () => {
      expect(() => read(formerAction)).toThrow();
    });
  }
});
