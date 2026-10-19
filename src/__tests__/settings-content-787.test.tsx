// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
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

vi.mock('@/hooks/use-security', () => ({
  useSecurityContactCategories: () => query(m.categories),
  useUpdateSecurityContactCategory: () => mutation(),
  useToggleCategoryActive: () => mutation(),
}));
vi.mock('@/hooks/use-notifications', () => ({
  useNotificationTemplates: () => query([]),
  useQueueStatistics: () => query({ pending: 0, processing: 0, failed: 0, sent: 0 }),
  useNotificationStats: () => query({ sent: 0, failed: 0, total: 0, delivered: 0 }),
  useCreateTemplate: () => mutation(),
  useUpdateTemplate: () => mutation(),
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

import CategoriesPage from '@/app/(dashboard)/settings/security/categories/page';
import NotificationsSettingsPage from '@/app/(dashboard)/settings/notifications/page';
import { TemplateForm } from '@/components/notifications/template-form';

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

  it('is the one shared formatter: neither reminder page defines its own', () => {
    for (const page of ['notifications/reminders/page.tsx', 'notifications/reminders/schedule/page.tsx']) {
      const source = readFileSync(path.join(SETTINGS_DIR, page), 'utf8');
      expect(source).not.toMatch(/function formatDaysFromDue/);
      expect(source).toMatch(/formatDaysFromDue\b.*from '@\/lib\/notifications\/types'/);
    }
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

  it('the overview shows only implemented channels', () => {
    render(<NotificationsSettingsPage />);
    for (const label of implementedLabels) expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    expect(screen.queryByText('SMS')).not.toBeInTheDocument();
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /manage schedules/i })).not.toBeInTheDocument();
  });

  it('the template form offers only implemented channels', () => {
    render(<TemplateForm onSuccess={vi.fn()} onCancel={vi.fn()} />);
    const channelOptions = screen
      .getAllByRole('option')
      .map((o) => o.getAttribute('data-value'))
      .filter((v) => ['email', 'sms', 'whatsapp'].includes(v ?? ''));
    expect(channelOptions).toEqual(IMPLEMENTED_CHANNELS);
  });
});

describe('settings copy', () => {
  it('has no "Phase 9" or "future phase" notes', () => {
    const offenders = sourceFiles(SETTINGS_DIR).filter((f) => /phase 9|future phase/i.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
