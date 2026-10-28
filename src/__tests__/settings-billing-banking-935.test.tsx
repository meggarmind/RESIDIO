// @vitest-environment jsdom
//
// #935: billing sub-pages merged into Billing rules, bank accounts and tags merged into Banking (#791).
import * as React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { PERMISSIONS, ROUTE_PERMISSIONS } from '@/lib/auth/action-roles';
import { flattenSettingsNav, settingsConfig, type SettingsItem } from '@/config/settings-nav';

const auth = vi.hoisted(() => ({ permissions: [] as string[] }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/settings/banking',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({
    isLoading: false,
    hasPermission: (p: string) => auth.permissions.includes(p),
    hasAnyPermission: (ps: string[]) => ps.some((p) => auth.permissions.includes(p)),
  }),
}));
vi.mock('@/hooks/use-settings', () => ({
  useSystemSettings: () => ({ data: [{ key: 'duplicate_matching_threshold', value: 90 }], isLoading: false }),
  useUpdateSettings: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/use-imports', () => ({ useBankAccounts: () => ({ data: { data: [{ id: 'b1' }, { id: 'b2' }] }, isLoading: false }) }));
vi.mock('@/hooks/use-reference', () => ({ useTransactionTags: () => ({ data: [{ id: 't1' }], isLoading: false }) }));
vi.mock('@/components/admin/bank-accounts-list', () => ({ BankAccountsList: () => <p>bank accounts list</p> }));
vi.mock('@/components/admin/bank-passwords-section', () => ({ BankPasswordsSection: () => <p>bank passwords</p> }));
vi.mock('@/components/admin/transaction-tags-list', () => ({ TransactionTagsList: () => <p>tags list</p> }));

import { BankAccountsSection } from '@/components/settings/banking/bank-accounts-section';
import { DuplicateMatchingSection } from '@/components/settings/banking/duplicate-matching-section';
import { TransactionTagsSection } from '@/components/settings/banking/transaction-tags-section';

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');
const PAGE_DIR = 'src/app/(dashboard)/settings';

const PAGES = ['/settings/billing', '/settings/banking'] as const;
const item = (href: string): SettingsItem => flattenSettingsNav(settingsConfig).find((i) => i.href === href)!;

/** Where each old route now lands (#935). */
const STUBS: Record<string, string> = {
  'billing/late-fees': '/settings/billing#late-fees',
  'billing/invoices': '/settings/billing#invoices',
  'billing/development-levies': '/settings/billing#levies',
  'bank-accounts': '/settings/banking#bank-accounts',
  'transaction-tags': '/settings/banking#tags',
};

describe('registry and page components agree', () => {
  const components = [
    'src/components/settings/billing/billing-general-section.tsx',
    'src/components/settings/billing/invoice-generation-section.tsx',
    'src/components/settings/billing/late-fees-section.tsx',
    'src/components/settings/billing/levies-section.tsx',
    'src/components/settings/banking/bank-accounts-section.tsx',
    'src/components/settings/banking/transaction-tags-section.tsx',
    'src/components/settings/banking/duplicate-matching-section.tsx',
    'src/components/settings/banking/approval-limit-section.tsx',
  ];
  const source = components.map(read).join('\n');

  it('every registered section is rendered under its own id, and every rendered section is registered', () => {
    const registered = PAGES.flatMap((href) => item(href).sections!.map((s) => s.id)).sort();
    const rendered = [...source.matchAll(/<SettingsSection\s+id="([^"]+)"/g)].map((m) => m[1]).sort();
    expect(rendered).toEqual(registered);
  });

  it('every registered row is rendered by a SettingsRow, and every SettingsRow is registered', () => {
    const registered = PAGES.flatMap((href) => item(href).sections!.flatMap((s) => s.rows.map((r) => r.id))).sort();
    const rendered = [...source.matchAll(/rowId="([^"]+)"/g)].map((m) => m[1]).sort();
    expect(rendered).toEqual(registered);
  });

  it('the page files render the sections in registry order', () => {
    const order = (file: string) => [...read(file).matchAll(/<(\w+Section)\s*\/>/g)].map((m) => m[1]);
    expect(order(`${PAGE_DIR}/billing/page.tsx`)).toEqual([
      'BillingGeneralSection',
      'InvoiceGenerationSection',
      'LateFeesSection',
      'LeviesSection',
    ]);
    expect(order(`${PAGE_DIR}/banking/page.tsx`)).toEqual(['BankAccountsSection', 'TransactionTagsSection', 'DuplicateMatchingSection', 'ApprovalLimitSection']);
    expect(item('/settings/billing').sections!.map((s) => s.id)).toEqual(['general', 'invoices', 'late-fees', 'levies']);
    expect(item('/settings/banking').sections!.map((s) => s.id)).toEqual(['bank-accounts', 'tags', 'duplicate-matching', 'approval-limit']);
  });
});

describe('permissions: each section keeps its own, the route is their OR (#791 decision 9)', () => {
  it('Billing rules opens for exactly the permissions the four old routes did', () => {
    // The sub-routes resolved through the /settings/billing prefix, so the key is unchanged.
    expect(ROUTE_PERMISSIONS['/settings/billing']).toEqual([PERMISSIONS.SETTINGS_MANAGE_BILLING, PERMISSIONS.BILLING_MANAGE_PROFILES]);
    expect(ROUTE_PERMISSIONS['/settings/billing/profiles']).toEqual([PERMISSIONS.BILLING_MANAGE_PROFILES]);
    expect(item('/settings/billing').permissions).toEqual([PERMISSIONS.SETTINGS_MANAGE_BILLING]);
  });

  it('Banking opens for exactly the union of its sections', () => {
    const page = item('/settings/banking');
    const union = new Set(page.sections!.flatMap((s) => s.permissions ?? page.permissions ?? []));
    expect(new Set(ROUTE_PERMISSIONS['/settings/banking'])).toEqual(union);
    expect(new Set(page.permissions)).toEqual(union);
  });

  it('keeps duplicate matching under system.manage_maintenance and the lists under settings.manage_reference', () => {
    const sections = item('/settings/banking').sections!;
    expect(sections.find((s) => s.id === 'duplicate-matching')?.permissions).toEqual([PERMISSIONS.SYSTEM_MANAGE_MAINTENANCE]);
    expect(sections.find((s) => s.id === 'bank-accounts')?.permissions).toEqual([PERMISSIONS.SETTINGS_MANAGE_REFERENCE]);
    expect(sections.find((s) => s.id === 'tags')?.permissions).toEqual([PERMISSIONS.SETTINGS_MANAGE_REFERENCE]);
  });

  it('keeps every old route key with its old permission (ADR-0004)', () => {
    expect(ROUTE_PERMISSIONS['/settings/bank-accounts']).toEqual([PERMISSIONS.SETTINGS_MANAGE_REFERENCE]);
    expect(ROUTE_PERMISSIONS['/settings/transaction-tags']).toEqual([PERMISSIONS.SETTINGS_MANAGE_REFERENCE]);
    expect(ROUTE_PERMISSIONS['/settings/maintenance']).toEqual([PERMISSIONS.SYSTEM_MANAGE_MAINTENANCE]);
  });
});

describe('old routes are redirect stubs', () => {
  it.each(Object.entries(STUBS))('/settings/%s redirects to %s', (route, target) => {
    const src = read(`${PAGE_DIR}/${route}/page.tsx`);
    expect(src).toContain(`redirect('${target}')`);
    expect(src).not.toContain("'use client'");
  });

  it('the nav no longer links to a merged route, and Rate cards stays at /settings/billing/profiles', () => {
    const hrefs = new Set(flattenSettingsNav(settingsConfig).map((i) => i.href));
    for (const route of Object.keys(STUBS)) expect(hrefs.has(`/settings/${route}`)).toBe(false);
    for (const page of [...PAGES, '/settings/billing/profiles']) expect(hrefs.has(page)).toBe(true);
    expect(item('/settings/billing').children).toBeUndefined();
  });
});

describe('Banking sections show only to holders of their permission', () => {
  afterEach(cleanup);
  const page = () =>
    render(
      <>
        <BankAccountsSection />
        <TransactionTagsSection />
        <DuplicateMatchingSection />
      </>,
    );

  it('shows the lists to settings.manage_reference and no duplicate matching', () => {
    auth.permissions = [PERMISSIONS.SETTINGS_MANAGE_REFERENCE];
    page();
    expect(screen.getByRole('button', { name: 'Bank accounts' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Transaction tags' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Duplicate matching' })).toBeNull();
  });

  it('shows only duplicate matching to system.manage_maintenance', () => {
    auth.permissions = [PERMISSIONS.SYSTEM_MANAGE_MAINTENANCE];
    page();
    expect(screen.getByRole('button', { name: 'Duplicate matching' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bank accounts' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Transaction tags' })).toBeNull();
  });

  it('summarises each list with its count', () => {
    auth.permissions = [PERMISSIONS.SETTINGS_MANAGE_REFERENCE, PERMISSIONS.SYSTEM_MANAGE_MAINTENANCE];
    page();
    expect(screen.getByText('2 active accounts')).toBeInTheDocument();
    expect(screen.getByText('1 tag')).toBeInTheDocument();
    expect(screen.getByText('Flags transactions that score above 90%')).toBeInTheDocument();
  });
});

describe('tables stack on a phone', () => {
  it.each([
    'src/components/admin/bank-accounts-list.tsx',
    'src/components/settings/billing/late-fees-section.tsx',
  ])('%s uses the stacked Table', (file) => {
    const src = read(file);
    expect(src).toMatch(/<Table stack>/);
    expect(src).not.toMatch(/<Table>/);
  });
});
