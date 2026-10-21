'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { resolveAccess, toAccessClient } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { isResidentRollForwardEnabled } from '@/lib/billing/account-balance';
import {
    loadAccountStatement,
    type GetAccountStatementParams,
    type GetAccountStatementResponse,
} from '@/lib/billing/account-statement-data';

export type {
    AccountStatementData,
    StatementTransaction,
} from '@/lib/billing/account-statement-data';

/**
 * Get comprehensive account statement for a resident
 * Shows all invoices, payments, and wallet transactions for a date range.
 * Admins (billing.view) always get the roll-forward balance; anyone else only once the resident
 * setting is on (#863).
 */
export async function getAccountStatement(
    params: GetAccountStatementParams
): Promise<GetAccountStatementResponse> {
    const supabase = await createServerSupabaseClient();
    const access = await resolveAccess(toAccessClient(supabase));
    const isAdmin = access.status === 'resolved' && access.permissions.includes(PERMISSIONS.BILLING_VIEW);
    return loadAccountStatement(supabase, params, { rollForward: isAdmin || await isResidentRollForwardEnabled() });
}

/**
 * Get account statement for the current resident (portal use)
 */
export async function getMyAccountStatement(
    params: Omit<GetAccountStatementParams, 'residentId'> & { houseId?: string }
): Promise<GetAccountStatementResponse> {
    const supabase = await createServerSupabaseClient();

    // Get current user's resident record
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { data: null, error: 'Not authenticated' };
    }

    // Find the resident linked to this profile
    const { data: resident, error: residentError } = await supabase
        .from('residents')
        .select('id')
        .eq('profile_id', user.id)
        .single();

    if (residentError || !resident) {
        return { data: null, error: 'Resident record not found' };
    }

    return loadAccountStatement(supabase, {
        residentId: resident.id,
        houseId: params.houseId,
        fromDate: params.fromDate,
        toDate: params.toDate,
    }, { rollForward: await isResidentRollForwardEnabled() });
}
