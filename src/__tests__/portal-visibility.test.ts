import { describe, expect, it } from 'vitest';
import {
  PORTAL_ACCESS_OVERRIDES,
  canSeeImpersonationLink,
  canSeeSelfPortalLinks,
  describeEffectiveAccess,
  isPortalVisible,
  parsePortalAccessOverride,
  type PortalAccessOverride,
} from '@/lib/auth/portal-visibility';

type Row = [generalEnabled: boolean, override: PortalAccessOverride, visible: boolean];

// Truth table: an explicit override wins; null inherits the estate switch.
const VISIBILITY: Row[] = [
  [false, null, false],
  [true, null, true],
  [false, 'enabled', true],
  [true, 'enabled', true],
  [false, 'disabled', false],
  [true, 'disabled', false],
];

describe('isPortalVisible', () => {
  it.each(VISIBILITY)('general=%s override=%s -> %s', (generalEnabled, override, visible) => {
    expect(isPortalVisible(generalEnabled, override)).toBe(visible);
  });
});

describe('canSeeSelfPortalLinks', () => {
  const cases = VISIBILITY.flatMap(([generalEnabled, override, visible]) => [
    [generalEnabled, override, 'resident-1', visible] as const,
    [generalEnabled, override, null, false] as const,
  ]);

  it('covers all 12 combinations', () => {
    expect(cases).toHaveLength(12);
  });

  it.each(cases)('general=%s override=%s residentId=%s -> %s', (generalEnabled, override, residentId, expected) => {
    expect(canSeeSelfPortalLinks({ generalEnabled, override, residentId })).toBe(expected);
  });
});

describe('canSeeImpersonationLink', () => {
  const cases = VISIBILITY.flatMap(([generalEnabled, override, visible]) => [
    [generalEnabled, override, true, visible] as const,
    [generalEnabled, override, false, false] as const,
  ]);

  it('covers all 12 combinations', () => {
    expect(cases).toHaveLength(12);
  });

  it.each(cases)(
    'general=%s override=%s hasImpersonationPermission=%s -> %s',
    (generalEnabled, override, hasImpersonationPermission, expected) => {
      expect(canSeeImpersonationLink({ generalEnabled, override, hasImpersonationPermission })).toBe(expected);
    }
  );

  it('does not depend on a resident link', () => {
    // The input type has no residentId at all; an admin with no resident record
    // still sees "View as Resident" when the portal is visible for them.
    expect(canSeeImpersonationLink({ generalEnabled: true, override: null, hasImpersonationPermission: true })).toBe(true);
    expect(canSeeSelfPortalLinks({ generalEnabled: true, override: null, residentId: null })).toBe(false);
  });
});

describe('parsePortalAccessOverride', () => {
  it.each(PORTAL_ACCESS_OVERRIDES)('accepts %s', (value) => {
    expect(parsePortalAccessOverride(value)).toBe(value);
  });

  it.each([
    null,
    undefined,
    '',
    'Enabled',
    'DISABLED',
    ' enabled',
    'inherit',
    true,
    false,
    1,
    0,
    {},
    ['enabled'],
  ])('reads %j as null', (value) => {
    expect(parsePortalAccessOverride(value)).toBeNull();
  });
});

describe('describeEffectiveAccess', () => {
  it.each([
    [false, null, 'Inherit (currently off)'],
    [true, null, 'Inherit (currently on)'],
    [false, 'enabled', 'Enabled'],
    [true, 'enabled', 'Enabled'],
    [false, 'disabled', 'Disabled'],
    [true, 'disabled', 'Disabled'],
  ] as const)('general=%s override=%s -> %s', (generalEnabled, override, label) => {
    expect(describeEffectiveAccess(generalEnabled, override)).toBe(label);
  });
});
