/**
 * Resident-portal link visibility in the admin dashboard (#423).
 *
 * Two inputs decide it: the estate-wide `resident_portal_enabled` system
 * setting and the per-user `profiles.portal_access_override`. A NULL
 * override inherits the estate-wide switch; 'enabled' or 'disabled' wins
 * over it. Pure functions only -- callers fetch the inputs.
 */

export type PortalAccessOverride = 'enabled' | 'disabled' | null;

export const PORTAL_ACCESS_OVERRIDES = ['enabled', 'disabled'] as const;

/** Anything other than 'enabled' or 'disabled' reads as "inherit" (null). */
export function parsePortalAccessOverride(value: unknown): PortalAccessOverride {
  return value === 'enabled' || value === 'disabled' ? value : null;
}

export function isPortalVisible(generalEnabled: boolean, override: PortalAccessOverride): boolean {
  return override === 'enabled' || (override === null && generalEnabled);
}

/** "My Portal" / "Resident Portal": the user must also be linked to a resident. */
export function canSeeSelfPortalLinks(input: {
  generalEnabled: boolean;
  override: PortalAccessOverride;
  residentId: string | null;
}): boolean {
  return isPortalVisible(input.generalEnabled, input.override) && input.residentId != null;
}

/** "View as Resident": needs the impersonation permission, not a resident link. */
export function canSeeImpersonationLink(input: {
  generalEnabled: boolean;
  override: PortalAccessOverride;
  hasImpersonationPermission: boolean;
}): boolean {
  return isPortalVisible(input.generalEnabled, input.override) && input.hasImpersonationPermission;
}

export function describeEffectiveAccess(generalEnabled: boolean, override: PortalAccessOverride): string {
  if (override === 'enabled') return 'Enabled';
  if (override === 'disabled') return 'Disabled';
  return generalEnabled ? 'Inherit (currently on)' : 'Inherit (currently off)';
}
