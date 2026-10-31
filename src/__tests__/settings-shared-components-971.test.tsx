// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('@/components/dashboard/sidebar', () => ({ Sidebar: () => <aside /> }));
vi.mock('@/components/dashboard/header', () => ({ Header: () => <header /> }));
vi.mock('@/components/dashboard/mobile-nav', () => ({ MobileNav: () => null }));
vi.mock('@/components/dashboard/ops-status-banner', () => ({ OpsStatusBanner: () => null }));
vi.mock('next/navigation', () => ({ usePathname: () => '/settings/sending' }));
vi.mock('@/hooks/use-settings-navigation', () => ({ useSettingsNavigation: () => ({ groups: [] }) }));
const goToSection = vi.fn();
vi.mock('@/components/settings/settings-sections-provider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/settings/settings-sections-provider')>()),
  useSettingsSections: () => ({
    sections: [
      { id: 'one', title: 'One', visible: true, dirty: false },
      { id: 'two', title: 'Two', visible: true, dirty: false },
    ],
    activeTab: 'one',
    goToSection,
    goToSummary: vi.fn(),
    setSummaryEl: vi.fn(),
  }),
  useOptionalSettingsSections: () => null,
}));
vi.mock('@/hooks/use-settings', () => ({
  useSettings: () => ({ data: [], isLoading: false }),
  useUpdateSetting: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/actions/email/get-email-status', () => ({
  getEmailStatus: () => Promise.resolve({ isConfigured: true }),
}));
vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({ isLoading: false, hasPermission: () => true, hasAnyPermission: () => true }),
}));

import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { SettingsPageNav } from '@/components/settings/settings-page-nav';
import { EmailDeliverySections } from '@/components/settings/messages/email-delivery-sections';
import { SettingsPageHeader } from '@/components/settings/settings-page-header';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { formatDateTimeMedium } from '@/lib/utils';

afterEach(cleanup);

describe('dashboard shell scroll model (M1)', () => {
  it('has a fixed height so <main> is the scroller and sticky children stick', () => {
    const { container } = render(
      <DashboardShell>
        <p>page</p>
      </DashboardShell>,
    );
    expect(container.firstElementChild).toHaveClass('h-dvh');
    expect(container.firstElementChild).not.toHaveClass('min-h-screen');
    const main = screen.getByRole('main');
    expect(main).toHaveClass('overflow-y-auto', 'min-h-0', 'flex-1');
  });

  it('cannot be scrolled by scrollIntoView, and absolute children anchor to <main> (#1220)', () => {
    const { container } = render(
      <DashboardShell>
        <div role="status" className="sr-only" />
      </DashboardShell>,
    );
    // overflow-hidden is still a scroll container for programmatic scrolls; overflow-clip is not.
    expect(container.firstElementChild).toHaveClass('overflow-clip');
    expect(container.firstElementChild).not.toHaveClass('overflow-hidden');
    // A `sr-only` (position: absolute) child must take <main> as its containing block, or it
    // extends the shell's scrollable overflow and the nav's scrollIntoView moves the shell.
    expect(screen.getByRole('main')).toHaveClass('relative');
  });

  it('the page nav marks the open tab and opens another on click (#1365)', () => {
    render(<SettingsPageNav />);
    const tab = (name: string) => screen.getByRole('tab', { name });
    expect(tab('One')).toHaveAttribute('aria-selected', 'true');
    expect(tab('Two')).toHaveAttribute('aria-selected', 'false');
    expect(tab('Summary')).toHaveAttribute('aria-selected', 'false');
    fireEvent.click(tab('Two'));
    expect(goToSection).toHaveBeenCalledWith('two');
  });
});

describe('stacked table (M2)', () => {
  it('labels each cell and stacks the rows below md', () => {
    const { container } = render(
      <Table stack>
        <TableBody>
          <TableRow>
            <TableCell label="Name">Welcome</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(screen.getByText('Welcome')).toHaveAttribute('data-label', 'Name');
    expect(container.querySelector('table')?.className).toContain('max-md:[&_tr]:block');
  });

  it('a table without stack keeps its table layout', () => {
    const { container } = render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>x</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(container.querySelector('table')?.className).not.toContain('max-md');
  });
});

describe('settings page title (L1)', () => {
  it('is the h1', () => {
    render(<SettingsPageHeader title="Sending" breadcrumb={false} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Sending' })).toBeInTheDocument();
  });
});

describe('date with a month name (L5)', () => {
  it('writes the month as a name, not a number', () => {
    expect(formatDateTimeMedium(new Date(2026, 9, 21, 9, 0, 41))).toBe('21 Oct 2026, 09:00');
  });
});

describe('AlertDescription holds inline text in one block (M4)', () => {
  it('the Sending alerts keep bold words and links inside a paragraph or list, not as grid items', async () => {
    const { container } = render(<EmailDeliverySections />);
    await screen.findByText('Email service is configured and ready to send.');
    const descriptions = container.querySelectorAll('[data-slot="alert-description"]');
    expect(descriptions.length).toBeGreaterThan(0);
    for (const d of descriptions) {
      for (const child of Array.from(d.children)) {
        expect(['P', 'UL', 'OL']).toContain(child.tagName);
      }
    }
    expect(container.querySelectorAll('[data-slot="alert-description"] > a, [data-slot="alert-description"] > strong')).toHaveLength(0);
  });
});
