// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { PERMISSIONS, type Permission } from '@/lib/auth/action-roles';

let held: Permission[] = [];
vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({
    isLoading: false,
    hasAnyPermission: (needed: Permission[]) => needed.some((p) => held.includes(p)),
  }),
}));

import { useSectionedNavigation } from '@/hooks/use-navigation';

const oversightHref = (...permissions: Permission[]) => {
  held = permissions;
  const { result } = renderHook(() => useSectionedNavigation());
  return result.current.sections.flatMap((s) => s.items).find((i) => i.id === 'oversight')?.href;
};

describe('Oversight sidebar entry (#1272)', () => {
  it('opens the first Oversight page the user may open', () => {
    expect(oversightHref(PERMISSIONS.SYSTEM_VIEW_ALL_SETTINGS, PERMISSIONS.REPORTS_VIEW_FINANCIAL)).toBe('/system');
    expect(oversightHref(PERMISSIONS.REPORTS_VIEW_FINANCIAL)).toBe('/analytics');
    expect(oversightHref(PERMISSIONS.SETTINGS_VIEW_AUDIT_LOGS)).toBe('/system/audit-logs');
    expect(oversightHref(PERMISSIONS.WHATSAPP_VIEW)).toBe('/system/whatsapp-monitoring');
  });

  it('is hidden from a user with no Oversight permission', () => {
    expect(oversightHref()).toBeUndefined();
  });
});
