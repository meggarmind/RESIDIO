'use server';

import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { createAdminClient } from '@/lib/supabase/server';
import { assertCanManageTarget } from '@/lib/auth/account-guards';
import { revalidatePath } from 'next/cache';
import {
  PORTAL_ACCESS_OVERRIDES,
  parsePortalAccessOverride,
  type PortalAccessOverride,
} from '@/lib/auth/portal-visibility';

// profiles.portal_access_override is added by
// supabase/migrations/20261011140000_resident_portal_visibility_switches.sql.
// The Supabase clients here are not parameterised with the generated Database
// type, so the column needs no local typing.

const SETTING_KEY = 'resident_portal_enabled';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidOverrideInput(value: unknown): value is PortalAccessOverride {
  return value === null || (PORTAL_ACCESS_OVERRIDES as readonly unknown[]).includes(value);
}

function readBoolean(value: unknown): boolean {
  return value === true || value === 'true';
}

/**
 * Reads the estate-wide resident-portal switch. A missing row, false, or any
 * non-true value reads as `false` (fail closed).
 */
export async function getResidentPortalEnabled(): Promise<{ success: boolean; data: boolean | null; error: string | null }> {
  const authorization = await authorizePermission(PERMISSIONS.SETTINGS_VIEW);
  if (!authorization.authorized) return { success: false, data: null, error: authorization.error || 'Unauthorized' };

  const { data, error } = await createAdminClient()
    .from('system_settings')
    .select('value')
    .eq('key', SETTING_KEY)
    .maybeSingle();

  if (error) {
    console.error('[getResidentPortalEnabled] Failed to read resident_portal_enabled:', error);
    return { success: false, data: null, error: error.message };
  }

  return { success: true, data: readBoolean(data?.value), error: null };
}

/**
 * Flips the estate-wide resident-portal switch. Upserts so the control works
 * even where the seed migration has not run.
 */
export async function setResidentPortalEnabled(enabled: boolean): Promise<{ success: boolean; error: string | null }> {
  const authorization = await authorizePermission(PERMISSIONS.SETTINGS_MANAGE_GENERAL);
  if (!authorization.authorized) return { success: false, error: authorization.error || 'Unauthorized' };

  if (typeof enabled !== 'boolean') return { success: false, error: 'Invalid value for the resident portal switch' };

  const adminClient = createAdminClient();
  const { data: previous, error: readError } = await adminClient
    .from('system_settings')
    .select('value')
    .eq('key', SETTING_KEY)
    .maybeSingle();

  // Without the previous value the audit row would record a false "null".
  if (readError) {
    console.error('[setResidentPortalEnabled] Failed to read resident_portal_enabled:', readError);
    return { success: false, error: 'Failed to load the resident portal switch' };
  }

  const { data: saved, error } = await adminClient
    .from('system_settings')
    .upsert({ key: SETTING_KEY, value: enabled, category: 'general' }, { onConflict: 'key' })
    .select('id')
    .single();

  if (error) {
    console.error('[setResidentPortalEnabled] Failed to upsert resident_portal_enabled:', error);
    return { success: false, error: 'Failed to update the resident portal switch' };
  }

  // audit_logs.entity_id is a uuid: use the settings row id; no row, no audit (#594).
  if (saved?.id) {
    await logAudit({
      action: 'UPDATE',
      entityType: 'system_settings',
      entityId: saved.id,
      entityDisplay: 'Resident portal estate-wide switch',
      oldValues: { key: SETTING_KEY, [SETTING_KEY]: previous ? readBoolean(previous.value) : null },
      newValues: { key: SETTING_KEY, [SETTING_KEY]: enabled },
    });
  }
  revalidatePath('/settings/estate-info');
  return { success: true, error: null };
}

/**
 * Per-user overrides for the given profiles, keyed by profile id. Profiles
 * that do not exist are absent from the result.
 */
export async function getPortalAccessOverrides(
  profileIds: string[]
): Promise<{ success: boolean; data: Record<string, PortalAccessOverride> | null; error: string | null }> {
  const authorization = await authorizePermission(PERMISSIONS.SYSTEM_ASSIGN_ROLES);
  if (!authorization.authorized) return { success: false, data: null, error: authorization.error || 'Unauthorized' };

  if (!Array.isArray(profileIds) || profileIds.some((id) => typeof id !== 'string' || !UUID_PATTERN.test(id))) {
    return { success: false, data: null, error: 'Invalid profile id' };
  }
  if (profileIds.length === 0) return { success: true, data: {}, error: null };

  const { data, error } = await createAdminClient()
    .from('profiles')
    .select('id, portal_access_override')
    .in('id', [...new Set(profileIds)]);

  if (error) {
    console.error('[getPortalAccessOverrides] Failed to read portal_access_override:', error);
    return { success: false, data: null, error: error.message };
  }

  const overrides: Record<string, PortalAccessOverride> = {};
  for (const row of (data ?? []) as Array<{ id: string; portal_access_override: unknown }>) {
    overrides[row.id] = parsePortalAccessOverride(row.portal_access_override);
  }
  return { success: true, data: overrides, error: null };
}

/**
 * Sets (or clears, with null) one user's resident-portal override. Written
 * through the service-role client: the column is not granted to API roles.
 */
export async function setPortalAccessOverride(
  profileId: string,
  override: PortalAccessOverride
): Promise<{ success: boolean; error: string | null }> {
  const authorization = await authorizePermission(PERMISSIONS.SYSTEM_ASSIGN_ROLES);
  if (!authorization.authorized) return { success: false, error: authorization.error || 'Unauthorized' };

  if (typeof profileId !== 'string' || !UUID_PATTERN.test(profileId)) {
    return { success: false, error: 'Invalid profile id' };
  }
  if (!isValidOverrideInput(override)) {
    return { success: false, error: 'Invalid portal access override' };
  }

  // Target guard (#475, #826): an account holding super_admin or chairman needs
  // system.assign_board_roles, as for every other change to that account.
  const targetGuard = await assertCanManageTarget(authorization.userId!, profileId);
  if (!targetGuard.ok) return { success: false, error: targetGuard.error };

  const adminClient = createAdminClient();
  const { data: previous, error: readError } = await adminClient
    .from('profiles')
    .select('id, full_name, email, portal_access_override')
    .eq('id', profileId)
    .maybeSingle();

  if (readError) {
    console.error('[setPortalAccessOverride] Failed to read profile:', readError);
    return { success: false, error: 'Failed to load the profile' };
  }
  if (!previous) return { success: false, error: 'Profile not found' };

  const { error } = await adminClient
    .from('profiles')
    .update({ portal_access_override: override })
    .eq('id', profileId);

  if (error) {
    console.error('[setPortalAccessOverride] Failed to update portal_access_override:', error);
    return { success: false, error: 'Failed to update the portal access override' };
  }

  await logAudit({
    action: 'UPDATE',
    entityType: 'profiles',
    entityId: profileId,
    entityDisplay: previous.full_name || previous.email || profileId,
    oldValues: { portal_access_override: parsePortalAccessOverride(previous.portal_access_override) },
    newValues: { portal_access_override: override },
  });
  revalidatePath('/system/accounts');
  return { success: true, error: null };
}
