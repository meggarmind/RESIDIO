// @vitest-environment jsdom
//
// Issue #113: a client-side RBAC (role/permissions) fetch races a 15s
// timeout in src/lib/auth/auth-provider.tsx. On failure/timeout the
// resulting profile is degraded (permissions: [], role_name: null) but was
// being cached to sessionStorage unconditionally, turning one slow query
// into a 5-minute outage where every navigation/reload re-served the
// degraded profile instead of retrying.
//
// cacheProfileIfHealthy() is the extracted, exported decision the component
// now calls instead of writing to the cache directly. These tests exercise
// that real function -- not a parallel copy of its logic.

import { beforeEach, describe, expect, it } from 'vitest';
import { cacheProfileIfHealthy } from '@/lib/auth/auth-provider';
import type { AppRoleName } from '@/types/database';

const PROFILE_CACHE_KEY = 'residio_profile_cache';

interface Profile {
  id: string;
  email: string;
  full_name: string;
  role_id: string | null;
  role_name: AppRoleName | null;
  role_display_name: string | null;
  permissions: string[];
  resident_id: string | null;
}

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'user-1',
    email: 'admin@residio.test',
    full_name: 'Admin User',
    role_id: 'role-1',
    role_name: 'super_admin' as AppRoleName,
    role_display_name: 'Super Admin',
    permissions: ['residents.view', 'residents.create'],
    resident_id: null,
    ...overrides,
  };
}

describe('cacheProfileIfHealthy (RBAC fetch failure, #113)', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('does NOT write to sessionStorage when the RBAC fetch failed/timed out', () => {
    const degradedProfile = makeProfile({
      role_name: null,
      role_display_name: null,
      permissions: [],
    });

    cacheProfileIfHealthy(degradedProfile, true);

    expect(sessionStorage.getItem(PROFILE_CACHE_KEY)).toBeNull();
  });

  it('DOES write to sessionStorage on a healthy RBAC fetch', () => {
    const healthyProfile = makeProfile();

    cacheProfileIfHealthy(healthyProfile, false);

    const raw = sessionStorage.getItem(PROFILE_CACHE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string);
    expect(parsed.profile).toEqual(healthyProfile);
    expect(typeof parsed.timestamp).toBe('number');
  });

  it('still caches a healthy fetch that legitimately returns zero permissions', () => {
    // A role granted no permissions is not the same condition as a failed
    // fetch, and must not be treated like one.
    const zeroPermissionProfile = makeProfile({ permissions: [] });

    cacheProfileIfHealthy(zeroPermissionProfile, false);

    const raw = sessionStorage.getItem(PROFILE_CACHE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string);
    expect(parsed.profile.permissions).toEqual([]);
  });
});
