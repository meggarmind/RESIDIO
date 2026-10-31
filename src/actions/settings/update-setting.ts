'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { SystemSetting } from '@/types/database';
import { authorizeAnyPermission, authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS, type Permission } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { settingValueError } from '@/lib/validators/setting-value';
import { EMAIL_AUTO_PROCESS_LIMIT_KEY } from '@/lib/email-imports/utils';
import { ALL_DEBT_STATUS_SETTING_KEYS } from '@/lib/billing/debt-status';

type UpdateSettingResponse = {
    data: SystemSetting | null;
    error: string | null;
}

/**
 * Only super_admin may change the email auto-process limit: a very large value
 * switches the approval control off (owner decision on #710). Checked before
 * any write, so a refusal writes and audits nothing.
 */
function superAdminOnlyError(keys: string[], roleName: string | null): string | null {
    if (roleName === 'super_admin' || !keys.includes(EMAIL_AUTO_PROCESS_LIMIT_KEY)) return null;
    return `Only a super admin can change "${EMAIL_AUTO_PROCESS_LIMIT_KEY}"`;
}

/**
 * Keys owned by a narrower settings area need that area's permission, the same
 * one its route admits (owner decision on #840); every other key needs
 * settings.manage_general.
 */
const SETTING_AREAS: { permissions: Permission[]; keys: string[] }[] = [
    {
        // /settings/billing, late fees and the development-levy profile
        permissions: [PERMISSIONS.SETTINGS_MANAGE_BILLING, PERMISSIONS.BILLING_MANAGE_PROFILES],
        keys: [
            'bill_vacant_houses',
            'bill_under_renovation_houses',
            'bill_under_construction_houses',
            'auto_generate_levies',
            'pro_rata_first_month',
            'invoice_due_window_days',
            'payment_reminder_days',
            'late_fee_enabled',
            'late_fee_type',
            'late_fee_amount',
            'grace_period_days',
            'late_fee_auto_apply',
            'late_fee_application_day',
            'current_development_levy_profile_id',
            'clearance_copy_recipient_group_id',
        ],
    },
    {
        // /settings/debt-status (#980)
        permissions: [PERMISSIONS.SETTINGS_MANAGE_DEBT_STATUS],
        keys: ALL_DEBT_STATUS_SETTING_KEYS,
    },
    {
        permissions: [PERMISSIONS.SYSTEM_MANAGE_DATA_RETENTION],
        keys: ['audit_log_retention_days'],
    },
    {
        permissions: [PERMISSIONS.SYSTEM_MANAGE_MAINTENANCE],
        keys: ['maintenance_mode', 'maintenance_message', 'session_timeout_minutes', 'duplicate_matching_threshold'],
    },
    {
        // Reminder config (src/actions/notifications/reminder-config.ts SETTINGS_KEYS)
        permissions: [PERMISSIONS.NOTIFICATIONS_MANAGE],
        keys: ['invoice_reminder_schedule', 'invoice_reminders_enabled'],
    },
];

const GENERAL_PERMISSIONS: Permission[] = [PERMISSIONS.SETTINGS_MANAGE_GENERAL];

/** One permission set per area the keys touch; any one permission in a set satisfies it. */
function permissionSetsFor(keys: string[]): Permission[][] {
    const sets = new Set(
        keys.map((key) => SETTING_AREAS.find((area) => area.keys.includes(key))?.permissions ?? GENERAL_PERMISSIONS)
    );
    return sets.size > 0 ? [...sets] : [GENERAL_PERMISSIONS];
}

/**
 * Updates a system setting value. A key with no row fails, unless `createIfMissing` is given:
 * then the row is inserted with that category (a setting no migration has seeded, #903).
 */
export async function updateSetting(
    key: string,
    value: unknown,
    createIfMissing?: { category: string; description?: string }
): Promise<UpdateSettingResponse> {
    const supabase = await createServerSupabaseClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { data: null, error: 'Unauthorized' };
    }

    // Permission check: the area permission for area keys (#840)
    const checks = await Promise.all(permissionSetsFor([key]).map((set) => authorizeAnyPermission(set)));
    const auth = checks.find((check) => !check.authorized) ?? checks[0];
    if (!auth.authorized) {
        return { data: null, error: auth.error || 'Unauthorized' };
    }

    const roleError = superAdminOnlyError([key], auth.roleName);
    if (roleError) return { data: null, error: roleError };

    const valueError = settingValueError(key, value);
    if (valueError) return { data: null, error: valueError };

    // Get old value for audit comparison
    const { data: oldSetting } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', key)
        .single();

    // Normalize value for storage
    // Store simple values as strings for consistency
    let storageValue = value;
    if (typeof value === 'boolean') {
        storageValue = value.toString();
    } else if (typeof value === 'number') {
        storageValue = value.toString();
    }

    let { data, error } = await supabase
        .from('system_settings')
        .update({ value: storageValue })
        .eq('key', key)
        .select()
        .single();

    let created = false;
    // PGRST116: the update matched no row
    if (error?.code === 'PGRST116' && createIfMissing) {
        ({ data, error } = await supabase
            .from('system_settings')
            .insert({ key, value: storageValue, description: createIfMissing.description ?? null, category: createIfMissing.category })
            .select()
            .single());
        created = true;
    }

    if (error || !data) {
        console.error('Update setting "%s" error:', key, error);
        return { data: null, error: 'Failed to update setting' };
    }

    // Audit log (audit_logs.entity_id is a uuid: use the row id, keep the key as the label)
    if (data?.id) {
        await logAudit({
            action: created ? 'CREATE' : 'UPDATE',
            entityType: 'system_settings',
            entityId: data.id,
            entityDisplay: key,
            oldValues: { key, value: oldSetting?.value },
            newValues: { key, value: storageValue },
            description: `${created ? 'Created' : 'Updated'} setting: ${key}`,
        });
    }

    revalidatePath('/settings');
    revalidatePath('/settings/billing');
    return { data, error: null };
}

/**
 * Updates multiple settings at once
 */
export async function updateSettings(settings: Record<string, unknown>): Promise<{ success: boolean; error: string | null }> {
    const supabase = await createServerSupabaseClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { success: false, error: 'Unauthorized' };
    }

    // Permission check: every area the keys touch (#840)
    const checks = await Promise.all(permissionSetsFor(Object.keys(settings)).map((set) => authorizeAnyPermission(set)));
    const auth = checks.find((check) => !check.authorized) ?? checks[0];
    if (!auth.authorized) {
        return { success: false, error: auth.error || 'Unauthorized' };
    }

    const roleError = superAdminOnlyError(Object.keys(settings), auth.roleName);
    if (roleError) return { success: false, error: roleError };

    for (const [key, value] of Object.entries(settings)) {
        const valueError = settingValueError(key, value);
        if (valueError) return { success: false, error: valueError };
    }

    const keys = Object.keys(settings);

    // Get old values for audit comparison
    const { data: oldSettings } = await supabase
        .from('system_settings')
        .select('key, value')
        .in('key', keys);

    const oldValuesMap = new Map((oldSettings || []).map(s => [s.key, s.value]));

    const errors: string[] = [];
    const updatedKeys: string[] = [];
    const updatedIds: string[] = [];

    for (const [key, value] of Object.entries(settings)) {
        let storageValue = value;
        if (typeof value === 'boolean') {
            storageValue = value.toString();
        } else if (typeof value === 'number') {
            storageValue = value.toString();
        }

        const { data: upserted, error } = await supabase
            .from('system_settings')
            .upsert({
                key,
                value: storageValue,
                category: 'general' // Default to general for bulk updates from UI
            }, { onConflict: 'key' })
            .select('id')
            .single();

        if (error) {
            errors.push(`${key}: ${error.message}`);
        } else {
            updatedKeys.push(key);
            if (upserted?.id) updatedIds.push(upserted.id);
        }
    }

    if (errors.length > 0) {
        return { success: false, error: errors.join('; ') };
    }

    // Audit log for bulk update
    // audit_logs.entity_id is a uuid: use the first updated row's id; skip if none came back
    if (updatedKeys.length > 0 && updatedIds.length > 0) {
        const oldValues: Record<string, unknown> = {};
        const newValues: Record<string, unknown> = {};
        for (const key of updatedKeys) {
            oldValues[key] = oldValuesMap.get(key);
            newValues[key] = settings[key];
        }

        await logAudit({
            action: 'BULK_UPDATE',
            entityType: 'system_settings',
            entityId: updatedIds[0],
            entityDisplay: `Bulk settings update (${updatedKeys.length} settings)`,
            oldValues,
            newValues: { ...newValues, keys: updatedKeys, total_count: updatedKeys.length },
            description: `Updated ${updatedKeys.length} settings: ${updatedKeys.join(', ')}`,
        });
    }

    revalidatePath('/settings');
    revalidatePath('/settings/billing');
    return { success: true, error: null };
}

/**
 * Sets the current Development Levy profile ID
 * Pass null or empty string to disable Development Levy auto-application
 */
export async function setCurrentDevelopmentLevyProfileId(profileId: string | null): Promise<UpdateSettingResponse> {
    // Store as 'null' string if null, or the actual UUID
    const value = profileId || 'null';
    return updateSetting('current_development_levy_profile_id', value);
}

/**
 * Creates a new system setting (admin only)
 */
export async function createSetting(
    key: string,
    value: unknown,
    description?: string,
    category?: string
): Promise<UpdateSettingResponse> {
    const supabase = await createServerSupabaseClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { data: null, error: 'Unauthorized' };
    }

    // Permission check
    const auth = await authorizePermission(PERMISSIONS.SETTINGS_MANAGE_GENERAL);
    if (!auth.authorized) {
        return { data: null, error: auth.error || 'Unauthorized' };
    }

    const roleError = superAdminOnlyError([key], auth.roleName);
    if (roleError) return { data: null, error: roleError };

    const valueError = settingValueError(key, value);
    if (valueError) return { data: null, error: valueError };

    let storageValue = value;
    if (typeof value === 'boolean') {
        storageValue = value.toString();
    } else if (typeof value === 'number') {
        storageValue = value.toString();
    }

    const { data, error } = await supabase
        .from('system_settings')
        .insert({
            key,
            value: storageValue,
            description: description || null,
            category: category || 'general',
        })
        .select()
        .single();

    if (error) {
        if (error.code === '23505') {
            return { data: null, error: `Setting "${key}" already exists` };
        }
        console.error('Create setting "%s" error:', key, error);
        return { data: null, error: 'Failed to create setting' };
    }

    // Audit log (entity_id is a uuid: use the row id)
    if (data?.id) await logAudit({
        action: 'CREATE',
        entityType: 'system_settings',
        entityId: data.id,
        entityDisplay: key,
        newValues: { key, value: storageValue, description, category: category || 'general' },
        description: `Created new setting: ${key}`,
    });

    revalidatePath('/settings');
    return { data, error: null };
}
