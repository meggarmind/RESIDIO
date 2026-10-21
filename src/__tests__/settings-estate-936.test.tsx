// @vitest-environment jsdom
//
// #936: estate info, branding and appearance merged into Estate Profile, and streets with house
// types into Streets & houses (#791).
import * as React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { PERMISSIONS, ROUTE_PERMISSIONS } from '@/lib/auth/action-roles';
import { flattenSettingsNav, settingsConfig, type SettingsItem } from '@/config/settings-nav';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    settings: [] as { key: string; value: unknown }[],
    mutateAsync: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/settings/estate',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({ isLoading: false, hasPermission: () => true, hasAnyPermission: () => true }),
}));
vi.mock('@/hooks/use-settings', () => ({
  useGeneralSettings: () => ({ data: mocks.settings, isLoading: false }),
  useUpdateSettings: () => ({ mutateAsync: mocks.mutateAsync, isPending: false }),
}));

import { EstateAssistantSection, EstateDetailsSection } from '@/components/settings/estate/estate-form-sections';
import { useEstateForm } from '@/components/settings/estate/use-estate-form';
import { SettingsSectionsProvider } from '@/components/settings/settings-sections-provider';

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');
const PAGE_DIR = 'src/app/(dashboard)/settings';

const PAGES = ['/settings/estate', '/settings/property'] as const;
const item = (href: string): SettingsItem => flattenSettingsNav(settingsConfig).find((i) => i.href === href)!;

/** Where each old route now lands (#936). */
const STUBS: Record<string, string> = {
  'estate-info': '/settings/estate#details',
  'branding': '/settings/estate#logo',
  'appearance': '/settings/estate#theme',
  'streets': '/settings/property#streets',
  'house-types': '/settings/property#house-types',
};

describe('registry and page components agree', () => {
  const components = [
    'src/components/settings/estate/estate-form-sections.tsx',
    'src/components/settings/estate/estate-logo-section.tsx',
    'src/components/settings/estate/estate-theme-section.tsx',
    'src/components/settings/estate/resident-portal-section.tsx',
    'src/components/settings/property/property-sections.tsx',
  ];
  const source = components.map(read).join('\n');

  it('every registered section is rendered under its own id, and every rendered section is registered', () => {
    const registered = PAGES.flatMap((href) => item(href).sections!.map((s) => s.id)).sort();
    const rendered = [...source.matchAll(/<SettingsSection[^>]*?\bid="([^"]+)"/g)].map((m) => m[1]);
    expect([...new Set(rendered)].sort()).toEqual(registered);
  });

  it('every registered row is rendered by a SettingsRow, and every SettingsRow is registered', () => {
    const registered = PAGES.flatMap((href) => item(href).sections!.flatMap((s) => s.rows.map((r) => r.id))).sort();
    const literal = [...source.matchAll(/rowId="([^"]+)"/g)].map((m) => m[1]);
    // The three social links are rendered from a table of row ids.
    const table = [...source.matchAll(/rowId: '([^']+)'/g)].map((m) => m[1]);
    expect([...new Set([...literal, ...table])].sort()).toEqual(registered);
  });
});

describe('permissions: each section keeps its own, the route is their OR (#791 decision 9)', () => {
  it.each(PAGES)('%s opens for exactly the union of its sections', (href) => {
    const page = item(href);
    const union = new Set(page.sections!.flatMap((s) => s.permissions ?? page.permissions ?? []));
    expect(new Set(ROUTE_PERMISSIONS[href])).toEqual(union);
    expect(new Set(page.permissions)).toEqual(union);
  });

  it('keeps every old route key with its old permission (ADR-0004)', () => {
    for (const route of ['estate-info', 'branding', 'appearance']) {
      expect(ROUTE_PERMISSIONS[`/settings/${route}`]).toEqual([PERMISSIONS.SETTINGS_MANAGE_GENERAL]);
    }
    for (const route of ['streets', 'house-types']) {
      expect(ROUTE_PERMISSIONS[`/settings/${route}`]).toEqual([PERMISSIONS.SETTINGS_MANAGE_REFERENCE]);
    }
  });
});

describe('old routes are redirect stubs', () => {
  it.each(Object.entries(STUBS))('/settings/%s redirects to %s', (route, target) => {
    const src = read(`${PAGE_DIR}/${route}/page.tsx`);
    expect(src).toContain(`redirect('${target}')`);
    expect(src).not.toContain("'use client'");
  });

  it('the nav no longer links to a merged route, and every redirect lands on a registered section', () => {
    const hrefs = new Set(flattenSettingsNav(settingsConfig).map((i) => i.href));
    for (const route of Object.keys(STUBS)) expect(hrefs.has(`/settings/${route}`)).toBe(false);
    for (const page of PAGES) expect(hrefs.has(page)).toBe(true);
    for (const target of Object.values(STUBS)) {
      const [href, section] = target.split('#');
      expect(item(href).sections!.map((s) => s.id)).toContain(section);
    }
  });
});

function Harness() {
  const estate = useEstateForm();
  return (
    <SettingsSectionsProvider>
      <EstateDetailsSection estate={estate} />
      <EstateAssistantSection estate={estate} />
    </SettingsSectionsProvider>
  );
}

describe('Estate Profile saves one section at a time', () => {
  beforeEach(() => {
    mocks.settings = [{ key: 'estate_name', value: 'Opera' }];
    mocks.mutateAsync.mockReset();
    mocks.mutateAsync.mockResolvedValue({ success: true });
  });
  afterEach(cleanup);

  it('writes only the keys edited in the section being saved', async () => {
    render(<Harness />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Estate name' }), { target: { value: 'Opera Estate' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Assistant name' }), { target: { value: 'Ada' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save Details' }));

    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledTimes(1));
    expect(mocks.mutateAsync).toHaveBeenCalledWith({ estate_name: 'Opera Estate' });
    // The Assistant edit is still waiting for its own Save.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save Assistant' })).toBeEnabled());
    expect(screen.getByRole('button', { name: 'Save Details' })).toBeDisabled();
  });

  it('Discard drops only that section\'s edits', () => {
    render(<Harness />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Estate name' }), { target: { value: 'Changed' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Assistant name' }), { target: { value: 'Ada' } });

    fireEvent.click(screen.getAllByRole('button', { name: 'Discard' })[0]);

    expect(screen.getByRole('textbox', { name: 'Estate name' })).toHaveValue('Opera');
    expect(screen.getByRole('textbox', { name: 'Assistant name' })).toHaveValue('Ada');
  });

  it('a bad email blocks Save in Details but not in Assistant', () => {
    render(<Harness />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Contact email' }), { target: { value: 'not-an-email' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Assistant name' }), { target: { value: 'Ada' } });

    expect(screen.getByRole('button', { name: 'Save Details' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save Assistant' })).toBeEnabled();
    expect(screen.getByText(/Enter an email address/)).toBeInTheDocument();
  });
});
