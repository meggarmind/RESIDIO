import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ROUTE_PERMISSIONS } from '@/lib/auth/action-roles';
import { findSettingsEntry, settingsConfig } from '@/config/settings-nav';

// Data Tools moved from /system to Settings > System (#1274); nobody gains or loses access.
describe('Data Tools move (#1274)', () => {
  it('guards /settings/data-tools exactly as /system/data-tools', () => {
    expect(ROUTE_PERMISSIONS['/settings/data-tools']).toEqual(ROUTE_PERMISSIONS['/system/data-tools']);
    expect(ROUTE_PERMISSIONS['/settings/data-tools']).toBeDefined();
  });

  it('lists Data Tools under the Settings System group', () => {
    expect(findSettingsEntry('/settings/data-tools', settingsConfig)?.group.title).toBe('System');
  });

  it('keeps both old URLs as redirects to the new page', () => {
    for (const old of ['system/data-tools', 'settings/data-management']) {
      const src = readFileSync(`src/app/(dashboard)/${old}/page.tsx`, 'utf8');
      expect(src).toContain("redirect('/settings/data-tools')");
    }
  });

  it('moves Groups to the Messages group', () => {
    expect(findSettingsEntry('/settings/groups', settingsConfig)?.group.title).toBe('Messages');
  });
});
