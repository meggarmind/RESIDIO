// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

/**
 * Issue #464: admin client payload.
 *
 * - xlsx parser and the two PDF-importing move-out wizards must not be part of
 *   the initial module graph of the page/component that uses them
 * - the notification list must not be fetched while the bell popover is closed
 * - name-only resident dropdowns use the slim resident options query, never the
 *   nested useResidents list
 */

// Cold dynamic imports of whole pages are slow on a cold transform cache.
vi.setConfig({ testTimeout: 90000 });

const spies = vi.hoisted(() => ({
  xlsxLoaded: vi.fn(),
  moveOutLoaded: vi.fn(),
  ownerMoveOutLoaded: vi.fn(),
  notificationCalls: [] as Array<[unknown, unknown]>,
  residentOptionsCalls: 0,
  residentsCalls: 0,
}));

vi.mock('@/lib/parsers/xlsx-parser', () => {
  spies.xlsxLoaded();
  return { parseXLSXFile: vi.fn() };
});
vi.mock('@/lib/parsers/csv-parser', () => ({ parseCSVFile: vi.fn() }));
vi.mock('@/components/residents/move-out-wizard', () => {
  spies.moveOutLoaded();
  return { MoveOutWizard: () => null };
});
vi.mock('@/components/residents/owner-move-out-wizard', () => {
  spies.ownerMoveOutLoaded();
  return { OwnerMoveOutWizard: () => null };
});

vi.mock('@/hooks/use-in-app-notifications', () => ({
  useInAppNotifications: (params: unknown, options: unknown) => {
    spies.notificationCalls.push([params, options]);
    return { data: undefined, isLoading: false };
  },
  useUnreadNotificationCount: () => ({ data: 0, isLoading: false }),
  useMarkNotificationAsRead: () => ({ mutate: vi.fn() }),
  useMarkAllNotificationsAsRead: () => ({ mutate: vi.fn() }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/payments',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/use-residents', () => ({
  useResidentOptions: () => {
    spies.residentOptionsCalls += 1;
    return { data: { data: [{ id: 'r1', first_name: 'Ada', last_name: 'Obi', resident_code: 'R-001' }] } };
  },
  useResidents: () => {
    spies.residentsCalls += 1;
    return { data: { data: [] } };
  },
}));

beforeEach(() => {
  spies.notificationCalls.length = 0;
  spies.residentOptionsCalls = 0;
  spies.residentsCalls = 0;
});
afterEach(() => cleanup());

describe('lazy heavy imports', () => {
  it('does not load the xlsx parser when the statement upload module is imported', async () => {
    await import('@/components/imports/statement-upload');
    expect(spies.xlsxLoaded).not.toHaveBeenCalled();
  });

  it('does not load the PDF move-out wizards when the house detail page module is imported', async () => {
    await import('@/app/(dashboard)/houses/[id]/page');
    expect(spies.moveOutLoaded).not.toHaveBeenCalled();
    expect(spies.ownerMoveOutLoaded).not.toHaveBeenCalled();
  });
});

describe('NotificationBell', () => {
  it('only enables the notification list query once the popover is open', async () => {
    const { NotificationBell } = await import('@/components/notifications/notification-bell');
    render(<NotificationBell />);

    expect(spies.notificationCalls.length).toBeGreaterThan(0);
    expect(spies.notificationCalls.every(([, options]) => (options as { enabled?: boolean }).enabled === false)).toBe(true);

    spies.notificationCalls.length = 0;
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }));

    const last = spies.notificationCalls.at(-1);
    expect((last?.[1] as { enabled?: boolean }).enabled).toBe(true);
  });
});

describe('resident dropdowns', () => {
  it('payment filters use the slim resident options query', async () => {
    const { PaymentFilters } = await import('@/components/payments/payment-filters');
    render(<PaymentFilters />);
    expect(spies.residentOptionsCalls).toBeGreaterThan(0);
    expect(spies.residentsCalls).toBe(0);
  });
});
