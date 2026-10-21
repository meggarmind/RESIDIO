// #937: document categories + tags/fields, and security rules + contact categories + session timeout,
// merged into two task pages (#791).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS, ROUTE_PERMISSIONS } from '@/lib/auth/action-roles';
import { flattenSettingsNav, settingsConfig, type SettingsItem } from '@/config/settings-nav';

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');
const PAGE_DIR = 'src/app/(dashboard)/settings';

const PAGES = ['/settings/documents', '/settings/security'] as const;
const item = (href: string): SettingsItem => flattenSettingsNav(settingsConfig).find((i) => i.href === href)!;

/** Where each old route now lands (#937). */
const STUBS: Record<string, string> = {
  'document-categories': '/settings/documents#categories',
  'document-taxonomy': '/settings/documents#tags-fields',
  'security/categories': '/settings/security#contact-categories',
};

describe('registry and page components agree', () => {
  const components = [
    'src/components/settings/documents/document-categories-section.tsx',
    'src/components/settings/documents/document-tags-fields-section.tsx',
    'src/components/settings/security/security-limits-section.tsx',
    'src/components/settings/security/contact-categories-section.tsx',
    'src/components/settings/security/session-timeout-section.tsx',
  ];
  const source = components.map(read).join('\n');

  it('every registered section is rendered under its own id, and every rendered section is registered', () => {
    const registered = PAGES.flatMap((href) => item(href).sections!.map((s) => s.id)).sort();
    const rendered = [...source.matchAll(/<SettingsSection[^>]*?\bid="([^"]+)"/g)].map((m) => m[1]).sort();
    expect(rendered).toEqual(registered);
  });

  it('every registered row is rendered by a SettingsRow, and every SettingsRow is registered', () => {
    const registered = PAGES.flatMap((href) => item(href).sections!.flatMap((s) => s.rows.map((r) => r.id))).sort();
    const rendered = [...source.matchAll(/rowId="([^"]+)"/g)].map((m) => m[1]).sort();
    expect(rendered).toEqual(registered);
  });

  it('each section component passes the permissions the registry records for it', () => {
    for (const page of PAGES) {
      for (const section of item(page).sections!) {
        const re = new RegExp(`<SettingsSection[^>]*?\\bid="${section.id}"[\\s\\S]*?permissions=\\{\\[([^\\]]+)\\]\\}`);
        const found = source.match(re)?.[1].match(/PERMISSIONS\.(\w+)/g)?.map((p) => p.slice('PERMISSIONS.'.length));
        const expected = section.permissions!.map((p) => Object.entries(PERMISSIONS).find(([, v]) => v === p)![0]);
        expect(found?.sort(), section.id).toEqual(expected.sort());
      }
    }
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
    expect(ROUTE_PERMISSIONS['/settings/document-categories']).toEqual([PERMISSIONS.DOCUMENTS_MANAGE_CATEGORIES]);
    expect(ROUTE_PERMISSIONS['/settings/document-taxonomy']).toEqual([
      PERMISSIONS.DOCUMENTS_MANAGE_TAGS,
      PERMISSIONS.DOCUMENTS_MANAGE_CUSTOM_FIELDS,
    ]);
    expect(ROUTE_PERMISSIONS['/settings/security/categories']).toEqual([PERMISSIONS.SECURITY_MANAGE_CATEGORIES]);
    expect(ROUTE_PERMISSIONS['/settings/maintenance']).toEqual([PERMISSIONS.SYSTEM_MANAGE_MAINTENANCE]);
  });

  it('session timeout keeps system.manage_maintenance, as it had on Maintenance', () => {
    const sections = item('/settings/security').sections!;
    expect(sections.find((s) => s.id === 'session-timeout')?.permissions).toEqual([PERMISSIONS.SYSTEM_MANAGE_MAINTENANCE]);
    expect(sections.find((s) => s.id === 'contact-limits')?.permissions).toEqual([PERMISSIONS.SETTINGS_MANAGE_SECURITY]);
    expect(sections.find((s) => s.id === 'contact-categories')?.permissions).toEqual([PERMISSIONS.SECURITY_MANAGE_CATEGORIES]);
  });
});

describe('old routes are redirect stubs', () => {
  it.each(Object.entries(STUBS))('/settings/%s redirects to %s', (route, target) => {
    const src = read(`${PAGE_DIR}/${route}/page.tsx`);
    expect(src).toContain(`redirect('${target}')`);
    expect(src).not.toContain("'use client'");
  });

  it('every redirect target names a registered section', () => {
    for (const target of Object.values(STUBS)) {
      const [href, hash] = target.split('#');
      expect(item(href).sections!.map((s) => s.id)).toContain(hash);
    }
  });

  it('the nav no longer links to a merged route', () => {
    const hrefs = new Set(flattenSettingsNav(settingsConfig).map((i) => i.href));
    for (const route of Object.keys(STUBS)) expect(hrefs.has(`/settings/${route}`)).toBe(false);
    for (const page of PAGES) expect(hrefs.has(page)).toBe(true);
  });
});

describe('session timeout moved off Maintenance', () => {
  it('Maintenance no longer writes or describes the session timeout', () => {
    const maintenance = read(`${PAGE_DIR}/maintenance/page.tsx`);
    expect(maintenance).not.toContain('session_timeout_minutes');
    const entry = flattenSettingsNav(settingsConfig).find((i) => i.href === '/settings/maintenance')!;
    expect(entry.description).not.toMatch(/session/i);
  });

  it('the new section writes the same setting key', () => {
    expect(read('src/components/settings/security/session-timeout-section.tsx')).toContain('session_timeout_minutes');
  });
});
