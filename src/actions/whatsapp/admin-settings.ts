'use server';

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { getSettingResultAsService } from '@/lib/settings/service';
import { normalizePhoneNumber } from '@/lib/sms/termii';
import { createAdminClient } from '@/lib/supabase/server';
import { maskPhone } from '@/lib/utils';
import {
  ADMIN_IDLE_DAYS,
  ADMIN_REVERIFY_DAYS,
  WHATSAPP_ADMIN_ROLE_CATEGORIES,
  accountFingerprint,
  adminIneligibility,
  bindingEndReason,
  createSupabaseWhatsAppAdminRepository,
  hashAdminLinkCode,
  loadWhatsAppAdminAccount,
  type WhatsAppAdminIneligibility,
} from '@/lib/whatsapp/admin';
import {
  WHATSAPP_ADMIN_ITEM_PERMISSIONS,
  type WhatsAppAdminCandidate,
  type WhatsAppAdminRoleGridRole,
  type WhatsAppAdminRow,
  type WhatsAppAdminSettingsState,
} from '@/lib/whatsapp/admin-settings';

type ActionResult<T> = { success: boolean; data: T | null; error: string | null };

const PAGE = '/settings/whatsapp-admin';
const DAY = 24 * 60 * 60 * 1000;
const CODE_SETTING = 'whatsapp_admin_code_required';

function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

const INELIGIBLE_ERRORS: Record<WhatsAppAdminIneligibility, string> = {
  account_inactive: 'That account is not active',
  role_not_allowed: 'That role cannot use WhatsApp admin tools',
  missing_permission: 'That role does not have WhatsApp admin access',
  authenticator_off: 'That admin has no authenticator app. Turn the code off for this admin, or ask them to set up 2FA',
};

function one<T>(value: T | T[] | null | undefined): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

async function globalCodeRequired(): Promise<boolean> {
  const result = await getSettingResultAsService(CODE_SETTING);
  return !(result.status === 'ok' && (result.value === false || result.value === 'false'));
}

/**
 * Everything the WhatsApp admin settings page shows. A viewer with the roles-management permission
 * sees every linked admin, the admins still to link and the role grid; anyone else sees only their own row.
 */
export async function getWhatsAppAdminSettings(): Promise<ActionResult<WhatsAppAdminSettingsState>> {
  const auth = await authorizePermission(PERMISSIONS.WHATSAPP_ADMIN_QUERY);
  if (!auth.authorized || !auth.userId) return { success: false, data: null, error: auth.error || 'Unauthorized' };

  const canManage = auth.permissions.includes(PERMISSIONS.SYSTEM_MANAGE_ROLES);
  const supabase = db();

  try {
    const codeOn = await globalCodeRequired();
    let query = supabase
      .from('whatsapp_admin_bindings')
      .select('id, profile_id, phone_number, bound_at, last_used_at, last_totp_step, session_expires_at, account_fingerprint, code_required')
      .is('revoked_at', null)
      .not('bound_at', 'is', null)
      .order('bound_at', { ascending: false });
    if (!canManage) query = query.eq('profile_id', auth.userId);
    const { data: bindings, error } = await query;
    if (error) throw error;

    const now = new Date();
    const rows: WhatsAppAdminRow[] = [];
    for (const binding of bindings || []) {
      const account = await loadWhatsAppAdminAccount(binding.profile_id);
      const codeRequired = binding.code_required !== false;
      const ended = bindingEndReason({
        id: binding.id,
        profileId: binding.profile_id,
        phoneNumber: binding.phone_number,
        boundAt: binding.bound_at,
        lastUsedAt: binding.last_used_at,
        lastTotpStep: binding.last_totp_step === null ? null : Number(binding.last_totp_step),
        sessionExpiresAt: binding.session_expires_at,
        accountFingerprint: binding.account_fingerprint,
        codeRequired,
      }, account, now, codeOn && codeRequired);
      rows.push({
        bindingId: binding.id,
        profileId: binding.profile_id,
        name: account?.fullName ?? 'Unknown admin',
        roleName: account?.roleDisplayName ?? '-',
        maskedNumber: maskPhone(binding.phone_number),
        boundAt: binding.bound_at,
        endsAt: new Date(Math.min(
          Date.parse(binding.bound_at) + ADMIN_REVERIFY_DAYS * DAY,
          Date.parse(binding.last_used_at ?? binding.bound_at) + ADMIN_IDLE_DAYS * DAY
        )).toISOString(),
        lastUsedAt: binding.last_used_at,
        codeRequired,
        status: ended ? 'ending' : 'active',
      });
    }

    let candidates: WhatsAppAdminCandidate[] = [];
    let roles: WhatsAppAdminRoleGridRole[] = [];
    if (canManage) {
      const linked = new Set(rows.map((row) => row.profileId));
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, app_roles!profiles_role_id_fkey!inner(display_name, category)')
        .eq('approval_status', 'active')
        .in('app_roles.category', WHATSAPP_ADMIN_ROLE_CATEGORIES)
        .order('full_name');
      if (profileError) throw profileError;
      candidates = (profiles || [])
        .filter((profile) => !linked.has(profile.id))
        .map((profile) => ({ profileId: profile.id, name: profile.full_name, roleName: one<{ display_name?: string }>(profile.app_roles)?.display_name ?? '-' }));

      const { data: roleRows, error: roleError } = await supabase
        .from('app_roles')
        .select('id, name, display_name, role_permissions(permission:app_permissions(name))')
        .in('category', WHATSAPP_ADMIN_ROLE_CATEGORIES)
        .order('display_name');
      if (roleError) throw roleError;
      roles = (roleRows || []).map((role) => ({
        roleId: role.id,
        name: role.display_name || role.name,
        granted: ((role.role_permissions || []) as { permission: { name?: string } | { name?: string }[] | null }[])
          .map((grant) => one(grant.permission)?.name)
          .filter((name): name is string => !!name && WHATSAPP_ADMIN_ITEM_PERMISSIONS.includes(name)),
      }));
    }

    return { success: true, data: { canManage, viewerProfileId: auth.userId, globalCodeRequired: codeOn, rows, candidates, roles }, error: null };
  } catch (error) {
    console.error('[whatsapp-admin] Could not read the admin settings:', error);
    return { success: false, data: null, error: 'Could not read the WhatsApp admin settings' };
  }
}

/** Links a number to an admin account on the admin's behalf. The link is active at once; the admin gets the usual alert email. */
export async function linkWhatsAppAdminNumber(input: {
  profileId: string;
  phone: string;
  codeRequired: boolean;
}): Promise<ActionResult<{ bindingId: string }>> {
  const auth = await authorizePermission(PERMISSIONS.SYSTEM_MANAGE_ROLES);
  if (!auth.authorized || !auth.userId) return { success: false, data: null, error: auth.error || 'Unauthorized' };

  const phoneNumber = normalizePhoneNumber(input.phone.trim());
  if (!/^\+\d{10,15}$/.test(phoneNumber)) return { success: false, data: null, error: 'Enter a valid phone number' };

  let account;
  try {
    account = await loadWhatsAppAdminAccount(input.profileId);
  } catch (error) {
    console.error('[whatsapp-admin] Could not load the admin account:', error);
    return { success: false, data: null, error: 'Could not check that account' };
  }
  const codeNeeded = (await globalCodeRequired()) && input.codeRequired;
  const ineligible = adminIneligibility(account, codeNeeded);
  if (ineligible) return { success: false, data: null, error: INELIGIBLE_ERRORS[ineligible] };

  const supabase = db();
  const now = new Date().toISOString();
  // An unused link code would hold the admin's one pending slot.
  const { error: cancelError } = await supabase
    .from('whatsapp_admin_bindings')
    .update({ revoked_at: now, revoked_reason: 'code_replaced', updated_at: now })
    .eq('profile_id', input.profileId)
    .is('bound_at', null)
    .is('revoked_at', null);
  if (cancelError) {
    console.error('[whatsapp-admin] Could not cancel the earlier link code:', cancelError);
    return { success: false, data: null, error: 'Failed to link the WhatsApp number' };
  }

  const { data, error } = await supabase
    .from('whatsapp_admin_bindings')
    .insert({
      profile_id: input.profileId,
      // No link code was used: an unguessable placeholder that is never looked up (bound_at is set).
      link_code_hash: hashAdminLinkCode(`owner:${randomUUID()}`),
      link_code_expires_at: now,
      phone_number: phoneNumber,
      bound_at: now,
      account_fingerprint: accountFingerprint(account!),
      code_required: input.codeRequired,
      created_by: auth.userId,
    })
    .select('id')
    .single();
  // The partial unique indexes refuse a second active link for the admin or the number.
  if (error?.code === '23505') return { success: false, data: null, error: 'That admin or that number is already linked' };
  if (error || !data) {
    console.error('[whatsapp-admin] Could not link the number:', error);
    return { success: false, data: null, error: 'Failed to link the WhatsApp number' };
  }

  await logAudit({
    action: 'ACTIVATE',
    entityType: 'whatsapp_admin_bindings',
    entityId: data.id,
    entityDisplay: `WhatsApp admin link for ${account!.fullName}`,
    description: 'WhatsApp number linked to an admin account by a role manager',
    newValues: { phone_number: maskPhone(phoneNumber), bound_at: now, code_required: input.codeRequired },
  });
  try {
    await createSupabaseWhatsAppAdminRepository().emailAdmin(account!, 'linked', phoneNumber);
  } catch (emailError) {
    console.error('[whatsapp-admin] Link alert email failed:', emailError);
  }

  revalidatePath(PAGE);
  return { success: true, data: { bindingId: data.id }, error: null };
}

/** Ends another admin's WhatsApp link. An admin ends their own with `unlinkMyWhatsAppAdminNumber`. */
export async function unlinkWhatsAppAdminBinding(bindingId: string): Promise<ActionResult<{ unlinked: number }>> {
  const auth = await authorizePermission(PERMISSIONS.SYSTEM_MANAGE_ROLES);
  if (!auth.authorized) return { success: false, data: null, error: auth.error || 'Unauthorized' };

  const now = new Date().toISOString();
  const { data, error } = await db()
    .from('whatsapp_admin_bindings')
    .update({ revoked_at: now, revoked_reason: 'unlinked', session_expires_at: null, updated_at: now })
    .eq('id', bindingId)
    .is('revoked_at', null)
    .select('id, phone_number');
  if (error) {
    console.error('[whatsapp-admin] Could not unlink the number:', error);
    return { success: false, data: null, error: 'Failed to unlink the WhatsApp number' };
  }

  for (const row of data || []) {
    await logAudit({
      action: 'DEACTIVATE',
      entityType: 'whatsapp_admin_bindings',
      entityId: row.id,
      entityDisplay: 'WhatsApp admin link',
      description: 'WhatsApp admin link ended by a role manager',
      oldValues: { phone_number: row.phone_number ? maskPhone(row.phone_number) : null },
      newValues: { revoked_at: now, revoked_reason: 'unlinked' },
    });
  }

  revalidatePath(PAGE);
  return { success: true, data: { unlinked: (data || []).length }, error: null };
}

/** The per-admin "Code required" switch. Off: that admin opens Admin tools from the linked number alone. */
export async function setWhatsAppAdminCodeRequired(bindingId: string, codeRequired: boolean): Promise<ActionResult<{ codeRequired: boolean }>> {
  const auth = await authorizePermission(PERMISSIONS.SYSTEM_MANAGE_ROLES);
  if (!auth.authorized) return { success: false, data: null, error: auth.error || 'Unauthorized' };

  const { data, error } = await db()
    .from('whatsapp_admin_bindings')
    .update({ code_required: codeRequired, updated_at: new Date().toISOString() })
    .eq('id', bindingId)
    .is('revoked_at', null)
    .select('id, code_required')
    .maybeSingle();
  if (error || !data) {
    if (error) console.error('[whatsapp-admin] Could not save the code switch:', error);
    return { success: false, data: null, error: error ? 'Failed to save the code switch' : 'That link has ended' };
  }

  await logAudit({
    action: 'UPDATE',
    entityType: 'whatsapp_admin_bindings',
    entityId: bindingId,
    entityDisplay: 'WhatsApp admin link: code required',
    oldValues: { code_required: !codeRequired },
    newValues: { code_required: codeRequired },
  });

  revalidatePath(PAGE);
  return { success: true, data: { codeRequired }, error: null };
}

/** The global "Code required" switch. Off: no admin needs a code. On: a code is needed unless that admin's own switch is off. */
export async function setWhatsAppAdminGlobalCodeRequired(codeRequired: boolean): Promise<ActionResult<{ codeRequired: boolean }>> {
  const auth = await authorizePermission(PERMISSIONS.SYSTEM_MANAGE_ROLES);
  if (!auth.authorized) return { success: false, data: null, error: auth.error || 'Unauthorized' };

  const supabase = createAdminClient();
  const { data: old } = await supabase.from('system_settings').select('value').eq('key', CODE_SETTING).maybeSingle();
  const { data: saved, error } = await supabase
    .from('system_settings')
    .upsert({ key: CODE_SETTING, value: codeRequired, description: 'WhatsApp Admin tools code required', category: 'notifications' }, { onConflict: 'key' })
    .select('id')
    .single();
  if (error) {
    console.error(`Failed to save ${CODE_SETTING}:`, error);
    return { success: false, data: null, error: 'Failed to save the code switch' };
  }

  // audit_logs.entity_id is a uuid: use the settings row id; the key goes in newValues (#594).
  if (saved?.id) {
    await logAudit({
      action: 'UPDATE',
      entityType: 'system_settings',
      entityId: saved.id,
      entityDisplay: 'WhatsApp Admin tools: code required',
      oldValues: { value: old?.value },
      newValues: { key: CODE_SETTING, value: codeRequired },
    });
  }

  revalidatePath(PAGE);
  return { success: true, data: { codeRequired }, error: null };
}

export interface WhatsAppAdminGrantChange {
  roleId: string;
  permission: string;
  granted: boolean;
}

/**
 * Grants or removes Admin tools item permissions for roles. It touches only the five item
 * permissions, so it cannot be used to change any other access. The bot reads the grants live.
 */
export async function saveWhatsAppAdminRoleGrid(changes: WhatsAppAdminGrantChange[]): Promise<ActionResult<{ changed: number }>> {
  const auth = await authorizePermission(PERMISSIONS.SYSTEM_MANAGE_ROLES);
  if (!auth.authorized) return { success: false, data: null, error: auth.error || 'Unauthorized' };

  if (changes.some((change) => !WHATSAPP_ADMIN_ITEM_PERMISSIONS.includes(change.permission))) {
    return { success: false, data: null, error: 'Only Admin tools items can be changed here' };
  }
  if (changes.length === 0) return { success: true, data: { changed: 0 }, error: null };

  const supabase = db();
  const { data: permissions, error: permissionError } = await supabase
    .from('app_permissions')
    .select('id, name')
    .in('name', WHATSAPP_ADMIN_ITEM_PERMISSIONS);
  if (permissionError) {
    console.error('[whatsapp-admin] Could not read the item permissions:', permissionError);
    return { success: false, data: null, error: 'Failed to save the role access' };
  }
  const idByName = new Map((permissions || []).map((permission) => [permission.name as string, permission.id as string]));

  const { data: roles, error: roleError } = await supabase
    .from('app_roles')
    .select('id, name, display_name')
    .in('id', [...new Set(changes.map((change) => change.roleId))])
    .in('category', WHATSAPP_ADMIN_ROLE_CATEGORIES);
  if (roleError) {
    console.error('[whatsapp-admin] Could not read the roles:', roleError);
    return { success: false, data: null, error: 'Failed to save the role access' };
  }
  const roleById = new Map((roles || []).map((role) => [role.id as string, (role.display_name || role.name) as string]));

  const byRole = new Map<string, WhatsAppAdminGrantChange[]>();
  for (const change of changes) {
    if (!roleById.has(change.roleId) || !idByName.has(change.permission)) {
      return { success: false, data: null, error: 'A role or permission in the change was not found' };
    }
    byRole.set(change.roleId, [...(byRole.get(change.roleId) || []), change]);
  }

  for (const [roleId, roleChanges] of byRole) {
    for (const change of roleChanges) {
      const permissionId = idByName.get(change.permission)!;
      const { error } = change.granted
        ? await supabase.from('role_permissions').upsert({ role_id: roleId, permission_id: permissionId }, { onConflict: 'role_id,permission_id', ignoreDuplicates: true })
        : await supabase.from('role_permissions').delete().eq('role_id', roleId).eq('permission_id', permissionId);
      if (error) {
        console.error('[whatsapp-admin] Could not save a role grant:', error);
        return { success: false, data: null, error: 'Failed to save the role access' };
      }
    }
    await logAudit({
      action: 'UPDATE',
      entityType: 'role_permissions',
      entityId: roleId,
      entityDisplay: `${roleById.get(roleId)}: WhatsApp Admin tools`,
      oldValues: Object.fromEntries(roleChanges.map((change) => [change.permission, !change.granted])),
      newValues: Object.fromEntries(roleChanges.map((change) => [change.permission, change.granted])),
    });
  }

  revalidatePath(PAGE);
  return { success: true, data: { changed: changes.length }, error: null };
}
