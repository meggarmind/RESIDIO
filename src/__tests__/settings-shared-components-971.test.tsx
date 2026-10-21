// @vitest-environment jsdom
import * as React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('@/components/dashboard/sidebar', () => ({ Sidebar: () => <aside /> }));
vi.mock('@/components/dashboard/header', () => ({ Header: () => <header /> }));
vi.mock('@/components/dashboard/mobile-nav', () => ({ MobileNav: () => null }));
vi.mock('@/components/dashboard/ops-status-banner', () => ({ OpsStatusBanner: () => null }));
vi.mock('next/navigation', () => ({ usePathname: () => '/settings/sending' }));
vi.mock('@/hooks/use-settings-navigation', () => ({ useSettingsNavigation: () => ({ groups: [] }) }));

import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { SettingsPageHeader } from '@/components/settings/settings-page-header';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { formatDateTimeMedium } from '@/lib/utils';

const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8');

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

  it('the page nav follows scroll on the capture phase, because <main> scrolls, not the window', () => {
    const src = read('src/components/settings/settings-page-nav.tsx');
    expect(src).toContain("document.addEventListener('scroll', onScroll, { capture: true");
    expect(src).not.toContain("window.addEventListener('scroll'");
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

  it('the layout label "Settings" is not a heading', () => {
    expect(read('src/app/(dashboard)/settings/layout.tsx')).not.toMatch(/<h2[^>]*>Settings<\/h2>/);
  });
});

describe('date with a month name (L5)', () => {
  it('writes the month as a name, not a number', () => {
    expect(formatDateTimeMedium(new Date(2026, 9, 21, 9, 0, 41))).toBe('21 Oct 2026, 09:00');
  });
});

describe('AlertDescription holds inline text in one block (M4)', () => {
  it('no settings page puts bare text and inline tags straight into AlertDescription', () => {
    const files = [
      'src/components/settings/messages/email-delivery-sections.tsx',
      'src/app/(dashboard)/settings/billing/page.tsx',
      'src/app/(dashboard)/settings/billing/layout.tsx',
    ];
    for (const f of files) {
      for (const m of read(f).matchAll(/<AlertDescription[^>]*>([\s\S]*?)<\/AlertDescription>/g)) {
        const body = m[1];
        if (/<(strong|Link|a|code)\b/.test(body)) expect(body).toContain('<p');
      }
    }
  });
});
