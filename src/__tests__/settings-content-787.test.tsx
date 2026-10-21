// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { ReactNode } from 'react';

// #787: settings pages showed backwards reminder timing, a mis-columned category table,
// unbuilt channels and "Phase 9" notes. These pin the corrected content.

import { formatDaysFromDue, IMPLEMENTED_CHANNELS, NOTIFICATION_CHANNEL_LABELS } from '@/lib/notifications/types';
import { formatDayCount } from '@/lib/utils';

const m = vi.hoisted(() => ({
  categories: [] as Record<string, unknown>[],
}));

const query = (data: unknown) => ({ data, isLoading: false });
const mutation = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });

vi.mock('@/lib/auth/auth-provider', () => ({ useAuth: () => ({ isLoading: false, hasPermission: () => true, hasAnyPermission: () => true }) }));

vi.mock('@/actions/notifications/reminder-config', () => ({
  getReminderSettings: async () => ({
    enabled: true,
    lastRun: null,
    schedule: {
      steps: [
        { id: 's1', daysFromDue: -7, escalationLevel: 'friendly', channels: ['email'], isActive: true, priority: 1 },
        { id: 's2', daysFromDue: 3, escalationLevel: 'overdue', channels: ['email'], isActive: true, priority: 5 },
      ],
    },
  }),
  setRemindersEnabled: vi.fn(),
  addReminderStep: vi.fn(),
  updateReminderStep: vi.fn(),
  removeReminderStep: vi.fn(),
  toggleReminderStep: vi.fn(),
  resetToDefaultSchedule: vi.fn(),
}));
vi.mock('@/hooks/use-settings', () => ({
  useBillingSettings: () => query([]),
  useClearanceCopyOptions: () => query([]),
  useUpdateSetting: () => mutation(),
}));
vi.mock('@/hooks/use-security', () => ({
  useSecurityContactCategories: () => query(m.categories),
  useUpdateSecurityContactCategory: () => mutation(),
  useToggleCategoryActive: () => mutation(),
}));
vi.mock('@/hooks/use-notifications', () => ({
  useNotificationTemplates: () => query([]),
  useQueueStatistics: () => query({ pending: 0, processing: 0, failed: 0, sent: 0 }),
  useNotificationStats: () => query({ sent: 0, failed: 0, total: 0, delivered: 0 }),
  useUpdateEventContent: () => mutation(),
}));
// Radix Select only renders its items once opened; render them inline so the list is readable.
vi.mock('@/components/ui/select', () => {
  const Pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Select: Pass,
    SelectContent: Pass,
    SelectTrigger: Pass,
    SelectValue: () => null,
    SelectItem: ({ children, value }: { children?: ReactNode; value: string }) => (
      <div role="option" aria-selected={false} data-value={value}>{children}</div>
    ),
  };
});

import { RemindersOnOffSection } from '@/components/settings/messages/reminders-on-off-section';
import { ReminderScheduleSection } from '@/components/settings/messages/reminder-schedule-section';
import { useReminderSettings } from '@/components/settings/messages/use-reminder-settings';
import { ContactCategoriesSection as CategoriesPage } from '@/components/settings/security/contact-categories-section';
import { TemplateForm } from '@/components/notifications/template-form';
import { BillingGeneralSection as BillingSettingsPage } from '@/components/settings/billing/billing-general-section';

// The on-off and schedule sections of /settings/reminders (#934), loaded the way the page loads them.
function RemindersPage() {
  const reminders = useReminderSettings(true);
  return (
    <>
      <RemindersOnOffSection {...reminders} />
      <ReminderScheduleSection schedule={reminders.schedule} loading={reminders.loading} reload={reminders.reload} />
    </>
  );
}
const RemindersOverviewPage = RemindersPage;
const ReminderSchedulePage = RemindersPage;

beforeAll(() => {
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});
afterEach(cleanup);

const SETTINGS_DIR = path.join(process.cwd(), 'src/app/(dashboard)/settings');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? sourceFiles(full) : /\.tsx?$/.test(name) ? [full] : [];
  });
}

describe('formatDaysFromDue', () => {
  it.each([
    [-7, '7 days before'],
    [-1, '1 day before'],
    [0, 'On due date'],
    [1, '1 day after'],
    [3, '3 days after'],
    [7, '7 days after'],
  ])('%i renders "%s"', (days, expected) => {
    expect(formatDaysFromDue(days)).toBe(expected);
  });

  it('the reminders overview renders post-due steps as "after"', async () => {
    render(<RemindersOverviewPage />);
    expect((await screen.findAllByText('7 days before')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('3 days after').length).toBeGreaterThan(0);
    expect(screen.queryByText(/-\d/)).not.toBeInTheDocument();
    expect(screen.getByText(/A WhatsApp step reaches only residents who have opted in to WhatsApp/)).toBeInTheDocument();
  });
});

describe('formatDayCount', () => {
  it('pluralises', () => {
    expect(formatDayCount(1)).toBe('1 day');
    expect(formatDayCount(30)).toBe('30 days');
  });
});

describe('security contact categories table', () => {
  it('renders the right value under each header', () => {
    m.categories = [{ id: 'c1', name: 'Visitor', default_validity_days: 1, max_validity_days: 90, is_active: true }];
    render(<CategoriesPage />);

    const table = screen.getByRole('table');
    const headers = within(table).getAllByRole('columnheader').map((h) => h.textContent?.trim());
    const cells = within(within(table).getAllByRole('row')[1]).getAllByRole('cell');
    expect(cells).toHaveLength(headers.length);

    const byHeader = Object.fromEntries(headers.map((h, i) => [h, cells[i]]));
    expect(byHeader['Category']).toHaveTextContent('Visitor');
    expect(byHeader['Default Validity']).toHaveTextContent(/^1 day$/);
    expect(byHeader['Max Validity']).toHaveTextContent(/^90 days$/);
    expect(byHeader['Status']).toHaveTextContent('Active');
    expect(within(byHeader['Actions']).getByRole('switch')).toBeInTheDocument();
  });
});

describe('notification channels follow IMPLEMENTED_CHANNELS', () => {
  const implementedLabels = IMPLEMENTED_CHANNELS.map((c) => NOTIFICATION_CHANNEL_LABELS[c]);

  it('IMPLEMENTED_CHANNELS excludes SMS', () => {
    expect(IMPLEMENTED_CHANNELS).not.toContain('sms');
  });

  it('the reminders page shows only implemented channels', async () => {
    render(<RemindersPage />);
    await screen.findAllByText(/7 days before/i);
    expect(screen.getAllByText(NOTIFICATION_CHANNEL_LABELS.email).length).toBeGreaterThan(0);
    expect(screen.queryByText('SMS')).not.toBeInTheDocument();
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /manage schedules/i })).not.toBeInTheDocument();
  });

  // #907: the wording form edits one event's email copy; it no longer offers a channel picker.
  it('the wording form offers no SMS', () => {
    const template = {
      id: 't1', name: 'welcome_resident', display_name: 'Welcome email', category: 'system',
      channel: 'email', event: 'welcome_resident', overrides: {}, subject_template: null,
      body_template: '', html_template: null, variables: [], is_system: true, is_active: true,
      created_at: '', updated_at: '', created_by: null,
    } as unknown as Parameters<typeof TemplateForm>[0]['template'];
    const { container } = render(<TemplateForm template={template} onSuccess={vi.fn()} onCancel={vi.fn()} />);
    expect(container).not.toHaveTextContent(/SMS|coming soon/i);
    expect(screen.queryAllByRole('option').filter((o) => o.getAttribute('data-value') === 'sms')).toEqual([]);
  });

  // #848: the step editors filtered a hard-coded ['email', 'sms'], so WhatsApp was never offered.
  it.each([
    ['add', () => screen.getAllByRole('button', { name: /add step/i })[0]],
    ['edit', () => screen.getAllByRole('button', { name: /edit/i })[0]],
  ])('the %s step dialog offers every implemented channel', async (_name, opener) => {
    render(<ReminderSchedulePage />);
    await screen.findAllByText(/7 days before/i);
    fireEvent.click(opener());
    const dialog = await screen.findByRole('dialog');
    const channelButtons = within(dialog)
      .getAllByRole('button')
      .filter((b) => b.hasAttribute('aria-pressed'))
      .map((b) => b.textContent);
    expect(channelButtons).toEqual(implementedLabels);
    expect(channelButtons).toContain(NOTIFICATION_CHANNEL_LABELS.whatsapp);
  });
});

describe('settings copy', () => {
  it('has no "Phase 9" or "future phase" notes', () => {
    const offenders = sourceFiles(SETTINGS_DIR).filter((f) => /phase 9|future phase/i.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it.each([
    ['billing', BillingSettingsPage],
    ['reminders overview', RemindersOverviewPage],
  ])('the %s page renders no "Phase 9" or "future phase" copy', async (_name, Page) => {
    const { container } = render(<Page />);
    await screen.findAllByText(/reminder/i);
    expect(container).not.toHaveTextContent(/phase 9|future phase/i);
  });
});
