import { describe, expect, it, vi } from 'vitest';
import { ROUTE_PERMISSIONS } from '@/lib/auth/action-roles';
import { findSettingsEntry, settingsConfig } from '@/config/settings-nav';

const redirect = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ redirect }));

// Data Tools moved from /system to Settings > System (#1274); nobody gains or loses access.
describe('Data Tools move (#1274)', () => {
  it('guards /settings/data-tools exactly as /system/data-tools', () => {
    expect(ROUTE_PERMISSIONS['/settings/data-tools']).toEqual(ROUTE_PERMISSIONS['/system/data-tools']);
    expect(ROUTE_PERMISSIONS['/settings/data-tools']).toBeDefined();
  });

  it('lists Data Tools under the Settings System group', () => {
    expect(findSettingsEntry('/settings/data-tools', settingsConfig)?.group.title).toBe('System');
  });

  it('keeps both old URLs as redirects to the new page', async () => {
    const pages = [
      await import('@/app/(dashboard)/(oversight)/system/data-tools/page'),
      await import('@/app/(dashboard)/settings/data-management/page'),
    ];
    for (const page of pages) {
      redirect.mockClear();
      page.default();
      expect(redirect).toHaveBeenCalledWith('/settings/data-tools');
    }
  });

  it('moves Groups to the Messages group', () => {
    expect(findSettingsEntry('/settings/groups', settingsConfig)?.group.title).toBe('Messages');
  });
});
