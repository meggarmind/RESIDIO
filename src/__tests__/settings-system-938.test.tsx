// #938: maintenance mode and data retention merged into Maintenance & data (#791).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS, ROUTE_PERMISSIONS } from '@/lib/auth/action-roles';
import { flattenSettingsNav, settingsConfig } from '@/config/settings-nav';

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');
const PAGE_DIR = 'src/app/(dashboard)/settings';

const page = flattenSettingsNav(settingsConfig).find((i) => i.href === '/settings/system')!;

/** Where each old route now lands (#938). */
const STUBS: Record<string, string> = {
  'maintenance': '/settings/system#maintenance-mode',
  'data-retention': '/settings/system#retention',
  'system/maintenance': '/settings/system#maintenance-mode',
  'system/data': '/settings/system#retention',
};

describe('registry and page components agree', () => {
  const source = [
    'src/components/settings/system/maintenance-mode-section.tsx',
    'src/components/settings/system/retention-section.tsx',
  ].map(read).join('\n');

  it('every registered section is rendered under its own id, and every rendered section is registered', () => {
    const registered = page.sections!.map((s) => s.id).sort();
    const rendered = [...source.matchAll(/<SettingsSection[^>]*?\bid="([^"]+)"/g)].map((m) => m[1]).sort();
    expect(rendered).toEqual(registered);
  });

  it('every registered row is rendered by a SettingsRow, and every SettingsRow is registered', () => {
    const registered = page.sections!.flatMap((s) => s.rows.map((r) => r.id)).sort();
    const rendered = [...source.matchAll(/rowId="([^"]+)"/g)].map((m) => m[1]).sort();
    expect(rendered).toEqual(registered);
  });

  it('the page mounts both sections', () => {
    const src = read(`${PAGE_DIR}/system/page.tsx`);
    expect(src).toContain('<MaintenanceModeSection />');
    expect(src).toContain('<RetentionSection />');
  });
});

describe('permissions: each section keeps its own, the route is their OR (#791 decision 9)', () => {
  it('opens for exactly the union of its sections', () => {
    const union = new Set(page.sections!.flatMap((s) => s.permissions!));
    expect(union).toEqual(new Set([PERMISSIONS.SYSTEM_MANAGE_MAINTENANCE, PERMISSIONS.SYSTEM_MANAGE_DATA_RETENTION]));
    expect(new Set(ROUTE_PERMISSIONS['/settings/system'])).toEqual(union);
    expect(new Set(page.permissions)).toEqual(union);
  });

  it('keeps each section on the permission its own server action enforces', () => {
    const permissionOf = (id: string) => page.sections!.find((s) => s.id === id)?.permissions;
    expect(permissionOf('maintenance-mode')).toEqual([PERMISSIONS.SYSTEM_MANAGE_MAINTENANCE]);
    expect(permissionOf('retention')).toEqual([PERMISSIONS.SYSTEM_MANAGE_DATA_RETENTION]);
  });

  it('keeps every old route key with its old permission (ADR-0004)', () => {
    expect(ROUTE_PERMISSIONS['/settings/maintenance']).toEqual([PERMISSIONS.SYSTEM_MANAGE_MAINTENANCE]);
    expect(ROUTE_PERMISSIONS['/settings/data-retention']).toEqual([PERMISSIONS.SYSTEM_MANAGE_DATA_RETENTION]);
    expect(ROUTE_PERMISSIONS['/settings/system/maintenance']).toEqual([PERMISSIONS.SYSTEM_MANAGE_MAINTENANCE]);
    expect(ROUTE_PERMISSIONS['/settings/system/data']).toEqual([PERMISSIONS.SYSTEM_MANAGE_DATA_RETENTION]);
    expect(ROUTE_PERMISSIONS['/settings/system/health']).toEqual([PERMISSIONS.SYSTEM_MONITOR]);
  });
});

describe('old routes are redirect stubs', () => {
  it.each(Object.entries(STUBS))('/settings/%s redirects to %s', (route, target) => {
    const src = read(`${PAGE_DIR}/${route}/page.tsx`);
    expect(src).toContain(`redirect('${target}')`);
    expect(src).not.toContain("'use client'");
  });

  it('the nav no longer links to a merged route', () => {
    const hrefs = new Set(flattenSettingsNav(settingsConfig).map((i) => i.href));
    for (const route of Object.keys(STUBS)) expect(hrefs.has(`/settings/${route}`)).toBe(false);
    expect(hrefs.has('/settings/system')).toBe(true);
  });
});

describe('Maintenance & data sections', () => {
  const section = (id: string) => page.sections!.find((s) => s.id === id)!;

  it('keeps Prune beside the retention policy (ADR-0004), collapsed by default', () => {
    expect(section('retention').defaultCollapsed).toBe(true);
    expect(section('retention').rows.map((r) => r.id)).toEqual(['audit-log-retention', 'prune-data']);
  });

  it('puts the switch before the message it shows', () => {
    expect(section('maintenance-mode').rows.map((r) => r.id)).toEqual(['maintenance-mode', 'maintenance-message']);
  });
});
