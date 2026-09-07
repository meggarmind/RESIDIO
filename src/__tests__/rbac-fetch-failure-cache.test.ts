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

import { readFileSync } from 'node:fs';
import path from 'node:path';
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

  it('the profile-commit path in auth-provider.tsx actually routes through cacheProfileIfHealthy (#113 regression guard)', () => {
    // The three tests above only prove cacheProfileIfHealthy() itself is
    // correct. None of them prove the component still *calls* it -- a future
    // edit could inline the cache write back at the call site (reintroducing
    // the exact #113 bug) while leaving this now-unused helper untouched,
    // and every test in the repo would stay green. This test reads the real
    // source file and checks the call site directly, the same ratchet
    // pattern src/__tests__/drop-has-security-permission.test.ts uses to pin
    // down a source file's shape rather than trusting a parallel unit test.
    // Resolve from process.cwd() rather than import.meta.url: this file runs
    // under the jsdom environment (for sessionStorage), and jsdom rewrites
    // import.meta.url to an http://localhost URL, which breaks a relative
    // file:// resolution.
    const source = readFileSync(
      path.join(process.cwd(), 'src/lib/auth/auth-provider.tsx'),
      'utf8'
    );

    // Collapse all whitespace so a harmless reformat (wrapping the call
    // across lines, changing indentation) can't make this test brittle --
    // only the presence/absence of these exact calls matters, not layout.
    const collapsed = source.replace(/\s+/g, '');

    // The profile built after an RBAC fetch (possibly failed/timed-out, see
    // `rbacFailed` above) must be committed to sessionStorage only via the
    // guard, which refuses to cache it when rbacFailed is true. If this call
    // site stops going through cacheProfileIfHealthy, a degraded profile can
    // be cached again and the app can be stuck showing no permissions for a
    // full 5-minute TTL, exactly as in #113.
    // Trailing comma allowed: Prettier adds one when it wraps the call across
    // lines, and that reformat must not fail this test.
    expect(collapsed).toMatch(/cacheProfileIfHealthy\(newProfile,rbacFailed,?\)/);

    // setCachedProfile(newProfile) is the exact bug signature: an
    // unconditional cache write of the RBAC-derived profile, bypassing the
    // guard above. It must never reappear in this file. This assertion is
    // deliberately narrow -- it does NOT forbid every setCachedProfile call.
    // setCachedProfile(null) (clearing the cache) and setCachedProfile(profile)
    // (the guard's own internal write, inside cacheProfileIfHealthy) are both
    // legitimate and untouched by this test. So is the pre-existing
    // setCachedProfile(fallbackProfile) call on the profiles-table-fetch-error
    // path: that is a genuine sibling defect, already filed as #256, and is
    // explicitly out of scope for #113 -- this assertion must keep passing
    // with that line present.
    expect(collapsed).not.toContain('setCachedProfile(newProfile)');
  });
});
