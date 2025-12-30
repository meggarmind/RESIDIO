'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import type { VerificationStatus } from '@/types/database';

/**
 * Verify a resident's identity - marks them as verified
 */
export async function verifyResident(id: string): Promise<{
    success: boolean;
    error?: string;
}> {
    const auth = await authorizePermission(PERMISSIONS.RESIDENTS_VERIFY);
    if (!auth.authorized) {
        return { success: false, error: auth.error || 'Unauthorized' };
    }

    const supabase = await createServerSupabaseClient();

    // Get current state for audit
    const { data: oldResident } = await supabase
        .from('residents')
        .select('first_name, last_name, verification_status')
        .eq('id', id)
        .single();

    const { error } = await supabase
        .from('residents')
        .update({
            verification_status: 'verified' as VerificationStatus,
            updated_by: auth.userId
        })
        .eq('id', id);

    if (error) {
        return { success: false, error: error.message };
    }

    // Audit log
    await logAudit({
        action: 'VERIFY',
        entityType: 'residents',
        entityId: id,
        entityDisplay: oldResident ? `${oldResident.first_name} ${oldResident.last_name}` : 'Resident',
        oldValues: { verification_status: oldResident?.verification_status },
        newValues: { verification_status: 'verified' },
    });

    revalidatePath('/residents');
    revalidatePath(`/residents/${id}`);

    return { success: true };
}

/**
 * Reject a resident's verification
 */
export async function rejectResidentVerification(
    id: string,
    reason?: string
): Promise<{
    success: boolean;
    error?: string;
}> {
    const auth = await authorizePermission(PERMISSIONS.RESIDENTS_VERIFY);
    if (!auth.authorized) {
        return { success: false, error: auth.error || 'Unauthorized' };
    }

    const supabase = await createServerSupabaseClient();

    // Get current state for audit
    const { data: oldResident } = await supabase
        .from('residents')
        .select('first_name, last_name, verification_status')
        .eq('id', id)
        .single();

    const { error } = await supabase
        .from('residents')
        .update({
            verification_status: 'rejected' as VerificationStatus,
            updated_by: auth.userId
        })
        .eq('id', id);

    if (error) {
        return { success: false, error: error.message };
    }

    // Audit log
    await logAudit({
        action: 'REJECT',
        entityType: 'residents',
        entityId: id,
        entityDisplay: oldResident ? `${oldResident.first_name} ${oldResident.last_name}` : 'Resident',
        oldValues: { verification_status: oldResident?.verification_status },
        newValues: { verification_status: 'rejected', rejection_reason: reason },
    });

    revalidatePath('/residents');
    revalidatePath(`/residents/${id}`);

    return { success: true };
}

/**
 * Check if a resident is verified (for role assignment validation)
 */
export async function isResidentVerified(residentId: string): Promise<{
    success: boolean;
    isVerified: boolean;
    status?: VerificationStatus;
    error?: string;
}> {
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
        .from('residents')
        .select('verification_status')
        .eq('id', residentId)
        .single();

    if (error) {
        return { success: false, isVerified: false, error: error.message };
    }

    return {
        success: true,
        isVerified: data.verification_status === 'verified',
        status: data.verification_status as VerificationStatus,
    };
}
