'use server';

/**
 * Write path for `billing_profile_versions` -- the estate's historical rate
 * schedule (#242).
 *
 * Until now these rows were read-only from the application: the only references
 * were two SELECTs (`generate-invoices-preview.ts`,
 * `invoice-generation-run-service.ts`), so every profile carried a single
 * version and any period earlier than it was silently priced by the
 * earliest-version fallback in `resolveProfileVersion`. Entering the rate that
 * actually applied is the fix; this file is how an authorized admin does it.
 *
 * `authenticated` holds only SELECT on these tables (see
 * `20260812235852_invoice_generation_redesign.sql`), so the writes go through
 * the admin client after `authorizePermission()` -- the same shape as
 * `invoice-generation-runs.ts`.
 */

import { revalidatePath } from 'next/cache';

import { logAudit, getChangedValues } from '@/lib/audit/logger';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { authorizePermission } from '@/lib/auth/authorize';
import { createAdminClient } from '@/lib/supabase/server';
import {
    billingProfileVersionSchema,
    billingProfileVersionUpdateSchema,
    type BillingProfileVersionData,
    type BillingProfileVersionUpdateData,
} from '@/lib/validators/billing';

const VERSION_SELECT =
    'id, billing_profile_id, effective_from, profile_snapshot, created_by, approved_by, approved_at, is_locked, created_at, updated_at, items:billing_profile_version_items(id, name, amount, frequency, is_mandatory, item_snapshot)';

export interface BillingProfileVersionRow {
    id: string;
    billing_profile_id: string;
    effective_from: string;
    profile_snapshot: unknown;
    created_by: string | null;
    approved_by: string | null;
    approved_at: string | null;
    is_locked: boolean;
    created_at: string;
    updated_at: string;
    items: Array<{
        id: string;
        name: string;
        amount: number;
        frequency: string;
        is_mandatory: boolean;
        item_snapshot: unknown;
    }>;
}

interface VersionActionResult {
    data: BillingProfileVersionRow | null;
    error: string | null;
}

/**
 * A version is immutable once it is locked or approved: the invoices it priced
 * carry permanent invoice numbers, so silently repricing it would rewrite
 * history. Creating a new version with a later `effective_from` is the
 * supported way to change a rate.
 */
function immutabilityRefusal(version: { is_locked: boolean; approved_by: string | null }): string | null {
    if (version.is_locked) {
        return 'This rate version is locked and cannot be edited. Create a new version with a later effective month to change the rate.';
    }
    if (version.approved_by) {
        return 'This rate version has been approved and cannot be edited. Create a new version with a later effective month to change the rate.';
    }
    return null;
}

/** Lists the rate schedule for one profile, oldest first. */
export async function listBillingProfileVersions(
    billingProfileId: string,
): Promise<{ data: BillingProfileVersionRow[]; error: string | null }> {
    const auth = await authorizePermission(PERMISSIONS.BILLING_VIEW);
    if (!auth.authorized) return { data: [], error: auth.error || 'Unauthorized' };

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from('billing_profile_versions')
        .select(VERSION_SELECT)
        .eq('billing_profile_id', billingProfileId)
        .order('effective_from', { ascending: true });

    if (error) {
        console.error('[billing] List profile versions failed', { billingProfileId, error });
        return { data: [], error: 'Failed to load rate versions' };
    }

    return { data: (data || []) as unknown as BillingProfileVersionRow[], error: null };
}

/**
 * Creates a rate version with an arbitrary (including historical)
 * `effective_from`, plus its items.
 */
export async function createBillingProfileVersion(
    input: BillingProfileVersionData,
): Promise<VersionActionResult> {
    const auth = await authorizePermission(PERMISSIONS.BILLING_MANAGE_PROFILE_VERSIONS);
    if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };

    const parsed = billingProfileVersionSchema.safeParse(input);
    if (!parsed.success) {
        return { data: null, error: parsed.error.issues[0]?.message || 'Invalid rate version' };
    }
    const { billing_profile_id, effective_from, items } = parsed.data;

    const supabase = createAdminClient();

    const { data: profile, error: profileError } = await supabase
        .from('billing_profiles')
        .select('*')
        .eq('id', billing_profile_id)
        .maybeSingle();
    if (profileError) {
        console.error('[billing] Load profile for version failed', { billing_profile_id, error: profileError });
        return { data: null, error: 'Failed to load the billing profile' };
    }
    if (!profile) return { data: null, error: 'Billing profile not found' };

    // `UNIQUE (billing_profile_id, effective_from)` would reject this anyway;
    // check first so the admin gets a sentence instead of a constraint name.
    const { data: clash, error: clashError } = await supabase
        .from('billing_profile_versions')
        .select('id')
        .eq('billing_profile_id', billing_profile_id)
        .eq('effective_from', effective_from)
        .maybeSingle();
    if (clashError) {
        console.error('[billing] Version uniqueness check failed', { billing_profile_id, effective_from, error: clashError });
        return { data: null, error: 'Failed to check existing rate versions' };
    }
    if (clash) {
        return { data: null, error: `A rate version already exists for ${effective_from.slice(0, 7)} on this profile.` };
    }

    const { data: version, error: versionError } = await supabase
        .from('billing_profile_versions')
        .insert({
            billing_profile_id,
            effective_from,
            profile_snapshot: {
                name: profile.name,
                description: profile.description,
                target_type: profile.target_type,
                applicable_roles: profile.applicable_roles,
                is_one_time: profile.is_one_time,
                is_development_levy: profile.is_development_levy,
            },
            created_by: auth.userId,
        })
        .select('id')
        .single();
    if (versionError || !version) {
        console.error('[billing] Create profile version failed', { billing_profile_id, effective_from, error: versionError });
        return { data: null, error: versionError?.message || 'Failed to create the rate version' };
    }

    const { error: itemsError } = await supabase
        .from('billing_profile_version_items')
        .insert(items.map((item) => ({
            billing_profile_version_id: version.id,
            name: item.name,
            amount: item.amount,
            frequency: item.frequency,
            is_mandatory: item.is_mandatory,
            item_snapshot: item,
        })));
    if (itemsError) {
        // No items landed, so nothing references the version: removing it leaves
        // no half-built rate card behind for generation to price against.
        await supabase.from('billing_profile_versions').delete().eq('id', version.id);
        console.error('[billing] Create profile version items failed', { versionId: version.id, error: itemsError });
        return { data: null, error: 'Failed to save the rate items; the version was not created' };
    }

    const created = await supabase.from('billing_profile_versions').select(VERSION_SELECT).eq('id', version.id).single();

    await logAudit({
        action: 'CREATE',
        entityType: 'billing_profile_versions',
        entityId: version.id,
        entityDisplay: `${profile.name} rate effective ${effective_from}`,
        newValues: { billing_profile_id, effective_from, items },
        description: `Created rate version effective ${effective_from} for "${profile.name}"`,
        metadata: { item_count: items.length, historical: effective_from < new Date().toISOString().slice(0, 8) + '01' },
    });

    revalidatePath('/settings/billing');
    revalidatePath('/settings/billing/profiles');
    return { data: (created.data as unknown as BillingProfileVersionRow) ?? null, error: null };
}

/**
 * Edits an unlocked, unapproved rate version. A locked or approved version is
 * refused -- see `immutabilityRefusal`.
 */
export async function updateBillingProfileVersion(
    id: string,
    input: BillingProfileVersionUpdateData,
): Promise<VersionActionResult> {
    const auth = await authorizePermission(PERMISSIONS.BILLING_MANAGE_PROFILE_VERSIONS);
    if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };

    const parsed = billingProfileVersionUpdateSchema.safeParse(input);
    if (!parsed.success) {
        return { data: null, error: parsed.error.issues[0]?.message || 'Invalid rate version' };
    }
    if (parsed.data.effective_from === undefined && parsed.data.items === undefined) {
        return { data: null, error: 'Nothing to update' };
    }

    const supabase = createAdminClient();
    const { data: existing, error: existingError } = await supabase
        .from('billing_profile_versions')
        .select(VERSION_SELECT)
        .eq('id', id)
        .maybeSingle();
    if (existingError) {
        console.error('[billing] Load profile version failed', { id, error: existingError });
        return { data: null, error: 'Failed to load the rate version' };
    }
    if (!existing) return { data: null, error: 'Rate version not found' };

    const current = existing as unknown as BillingProfileVersionRow;
    const refusal = immutabilityRefusal(current);
    if (refusal) return { data: null, error: refusal };

    if (parsed.data.effective_from && parsed.data.effective_from !== current.effective_from) {
        const { data: clash, error: clashError } = await supabase
            .from('billing_profile_versions')
            .select('id')
            .eq('billing_profile_id', current.billing_profile_id)
            .eq('effective_from', parsed.data.effective_from)
            .maybeSingle();
        if (clashError) {
            console.error('[billing] Version uniqueness check failed', { id, error: clashError });
            return { data: null, error: 'Failed to check existing rate versions' };
        }
        if (clash) {
            return { data: null, error: `A rate version already exists for ${parsed.data.effective_from.slice(0, 7)} on this profile.` };
        }
    }

    const { data: touched, error: updateError } = await supabase
        .from('billing_profile_versions')
        .update({
            ...(parsed.data.effective_from ? { effective_from: parsed.data.effective_from } : {}),
            updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        // Re-assert immutability at the write: a lock or approval landing between
        // the read above and here must not be overwritten. `updated_at` always
        // changes, so a zero-row result means the guard fired, not a no-op edit.
        .eq('is_locked', false)
        .is('approved_by', null)
        .select('id');
    if (updateError) {
        console.error('[billing] Update profile version failed', { id, error: updateError });
        return { data: null, error: 'Failed to update the rate version' };
    }
    if (!touched || touched.length === 0) {
        return { data: null, error: 'This rate version was locked or approved while being edited. Create a new version instead.' };
    }

    if (parsed.data.items) {
        // The guarded UPDATE above protects the version row only; the item
        // writes below are separate statements against a separate table, and
        // the items ARE the mutation that matters -- they carry the amounts. A
        // lock or approval landing after that UPDATE succeeded would otherwise
        // still get its rates rewritten, so re-assert the guard here and bail
        // before touching a single item.
        const { data: stillEditable, error: guardError } = await supabase
            .from('billing_profile_versions')
            .select('id')
            .eq('id', id)
            .eq('is_locked', false)
            .is('approved_by', null)
            .maybeSingle();
        if (guardError) {
            console.error('[billing] Re-check before item write failed', { id, error: guardError });
            return { data: null, error: 'Failed to confirm the rate version is still editable' };
        }
        if (!stillEditable) {
            return {
                data: null,
                error: 'This rate version was locked or approved while being edited, so its rate items were left unchanged. Create a new version instead.',
            };
        }

        const { error: deleteError } = await supabase
            .from('billing_profile_version_items')
            .delete()
            .eq('billing_profile_version_id', id);
        if (deleteError) {
            console.error('[billing] Replace version items failed on delete', { id, error: deleteError });
            return { data: null, error: 'Failed to replace the rate items' };
        }
        const { error: insertError } = await supabase
            .from('billing_profile_version_items')
            .insert(parsed.data.items.map((item) => ({
                billing_profile_version_id: id,
                name: item.name,
                amount: item.amount,
                frequency: item.frequency,
                is_mandatory: item.is_mandatory,
                item_snapshot: item,
            })));
        if (insertError) {
            console.error('[billing] Replace version items failed on insert', { id, error: insertError });
            return { data: null, error: 'Failed to replace the rate items' };
        }
    }

    const updated = await supabase.from('billing_profile_versions').select(VERSION_SELECT).eq('id', id).single();
    const changes = getChangedValues(
        { effective_from: current.effective_from, items: current.items },
        { effective_from: parsed.data.effective_from ?? current.effective_from, items: parsed.data.items ?? current.items },
    );

    await logAudit({
        action: 'UPDATE',
        entityType: 'billing_profile_versions',
        entityId: id,
        entityDisplay: `Rate effective ${parsed.data.effective_from ?? current.effective_from}`,
        oldValues: changes.old,
        newValues: changes.new,
        ...(parsed.data.items ? { description: 'Rate items replaced' } : {}),
    });

    revalidatePath('/settings/billing');
    revalidatePath('/settings/billing/profiles');
    return { data: (updated.data as unknown as BillingProfileVersionRow) ?? null, error: null };
}
