'use server';

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { getResidentIndebtedness } from '@/actions/billing/get-invoices';
import { getOrCreateWallet } from '@/actions/billing/wallet';
import { getSystemSetting } from '@/lib/settings/get-system-setting';
import { sendEmail } from '@/lib/email/send-email';
import type { ResidentRole } from '@/types/database';

export interface OwnerClearanceCheck {
    canProceed: boolean;
    walletBalance: number;
    totalUnpaid: number;
    netBalance: number;
    unpaidInvoiceCount: number;
    message: string;
}

export interface OwnerMoveOutInput {
    residentId: string;
    houseId: string;
    validityDays?: number;
    notes?: string;
}

export interface OwnerClearanceCertificate {
    id: string;
    residentId: string;
    residentName: string;
    residentCode: string;
    houseId: string;
    houseAddress: string;
    clearanceDate: string;
    validUntil: string;
    validityDays: number;
    newRole: ResidentRole;
    certificateNumber: string;
    status: 'pending_confirmation' | 'confirmed' | 'expired';
    createdBy: string;
    createdAt: string;
    secondaryResidentsRemoved: number;
}

export type MoveOutOwnerResponse = {
    success: boolean;
    error: string | null;
    certificate?: OwnerClearanceCertificate;
};

/**
 * Check if an owner-occupier can move out (financial clearance check)
 */
export async function checkOwnerClearance(
    residentId: string
): Promise<{ data: OwnerClearanceCheck | null; error: string | null }> {
    // Get wallet balance
    const { data: wallet } = await getOrCreateWallet(residentId);
    const walletBalance = wallet?.balance || 0;

    // Get unpaid invoices
    const { data: indebtedness, error } = await getResidentIndebtedness(residentId);
    if (error) {
        return { data: null, error };
    }

    const totalUnpaid = indebtedness?.totalUnpaid || 0;
    const netBalance = walletBalance - totalUnpaid;
    const unpaidInvoiceCount = indebtedness?.invoiceCount || 0;

    const canProceed = netBalance >= 0;
    const message = canProceed
        ? netBalance > 0
            ? `Owner has a credit balance of ₦${netBalance.toLocaleString()}. Proceed with move-out.`
            : 'Owner has no outstanding balance. Proceed with move-out.'
        : `Owner has an outstanding balance of ₦${Math.abs(netBalance).toLocaleString()}. Please clear before move-out.`;

    return {
        data: {
            canProceed,
            walletBalance,
            totalUnpaid,
            netBalance,
            unpaidInvoiceCount,
            message,
        },
        error: null,
    };
}

/**
 * Generate clearance certificate number
 */
function generateCertificateNumber(): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `OWN-${year}${month}-${random}`;
}

/**
 * Initiate owner-occupier move-out process with clearance
 *
 * This action:
 * 1. Verifies the resident is an owner-occupier at the house
 * 2. Checks financial clearance (wallet balance vs unpaid invoices)
 * 3. Creates a clearance certificate record
 * 4. Converts owner to non-resident landlord
 * 5. Removes secondary residents
 * 6. Sends notifications and email
 */
export async function initiateOwnerMoveOut(
    input: OwnerMoveOutInput
): Promise<MoveOutOwnerResponse> {
    const supabase = await createServerSupabaseClient();
    const adminClient = createAdminClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { success: false, error: 'Unauthorized' };
    }

    const {
        residentId,
        houseId,
        validityDays: customValidityDays,
        notes,
    } = input;

    // Get resident details
    const { data: resident, error: residentError } = await supabase
        .from('residents')
        .select('id, first_name, last_name, resident_code, email, phone_primary, user_id')
        .eq('id', residentId)
        .single();

    if (residentError || !resident) {
        return { success: false, error: 'Resident not found' };
    }

    // Check if user is the resident themselves or admin
    const isSelfService = resident.user_id === user.id;
    if (!isSelfService) {
        const auth = await authorizePermission(PERMISSIONS.HOUSES_ASSIGN_RESIDENT);
        if (!auth.authorized) {
            return { success: false, error: auth.error || 'Unauthorized' };
        }
    }

    // Verify the resident is an owner-occupier at this house
    const { data: assignment, error: assignmentError } = await supabase
        .from('resident_houses')
        .select('id, resident_role')
        .eq('resident_id', residentId)
        .eq('house_id', houseId)
        .eq('is_active', true)
        .single();

    if (assignmentError || !assignment) {
        return { success: false, error: 'Resident is not currently assigned to this house' };
    }

    if (assignment.resident_role !== 'resident_landlord') {
        return {
            success: false,
            error: `Only Owner-Occupiers can use this Move Out. This resident is a ${assignment.resident_role}.`,
        };
    }

    // Financial clearance check
    const { data: clearance, error: clearanceError } = await checkOwnerClearance(residentId);
    if (clearanceError || !clearance) {
        return { success: false, error: clearanceError || 'Failed to check clearance' };
    }

    if (!clearance.canProceed) {
        return {
            success: false,
            error: clearance.message,
        };
    }

    // Get house details
    const { data: house, error: houseError } = await supabase
        .from('houses')
        .select('id, house_number, short_name, street:streets(name)')
        .eq('id', houseId)
        .single();

    if (houseError || !house) {
        return { success: false, error: 'House not found' };
    }

    // Get secondary residents to remove
    const { data: secondaryResidents } = await supabase
        .from('resident_houses')
        .select('id, resident_id, resident_role')
        .eq('house_id', houseId)
        .eq('is_active', true)
        .in('resident_role', ['co_resident', 'household_member', 'domestic_staff', 'caretaker', 'contractor']);

    const secondaryCount = secondaryResidents?.length || 0;

    // Get default validity period from settings
    const defaultValidityDays = await getSystemSetting<number>(supabase, 'moveout_validity_days') || 7;
    const validityDays = isSelfService ? defaultValidityDays : (customValidityDays || defaultValidityDays);

    const today = new Date();
    const validUntil = new Date(today);
    validUntil.setDate(validUntil.getDate() + validityDays);

    // Create clearance certificate
    const certificateNumber = generateCertificateNumber();
    const houseAddress = `${house.short_name || house.house_number}, ${(house.street as any)?.name || ''}`;

    const certificate: OwnerClearanceCertificate = {
        id: crypto.randomUUID(),
        residentId,
        residentName: `${resident.first_name} ${resident.last_name}`,
        residentCode: resident.resident_code,
        houseId,
        houseAddress,
        clearanceDate: today.toISOString().split('T')[0],
        validUntil: validUntil.toISOString().split('T')[0],
        validityDays,
        newRole: 'non_resident_landlord',
        certificateNumber,
        status: 'confirmed', // Owner move-out is immediately confirmed
        createdBy: user.id,
        createdAt: today.toISOString(),
        secondaryResidentsRemoved: secondaryCount,
    };

    // 1. Convert owner-occupier to non-resident landlord
    const { error: updateError } = await supabase
        .from('resident_houses')
        .update({
            resident_role: 'non_resident_landlord' as ResidentRole,
            move_out_date: today.toISOString().split('T')[0],
        })
        .eq('id', assignment.id);

    if (updateError) {
        return { success: false, error: 'Failed to update resident role' };
    }

    // 2. Remove secondary residents
    if (secondaryCount > 0) {
        await supabase
            .from('resident_houses')
            .update({
                is_active: false,
                move_out_date: today.toISOString().split('T')[0],
            })
            .eq('house_id', houseId)
            .eq('is_active', true)
            .in('resident_role', ['co_resident', 'household_member', 'domestic_staff', 'caretaker', 'contractor']);
    }

    // 3. Update house occupancy
    await supabase
        .from('houses')
        .update({ is_occupied: false })
        .eq('id', houseId);

    // 4. Record in ownership history
    await adminClient
        .from('house_ownership_history')
        .insert({
            house_id: houseId,
            resident_id: residentId,
            resident_role: 'non_resident_landlord' as ResidentRole,
            event_type: 'role_change',
            previous_role: 'resident_landlord' as ResidentRole,
            event_date: today.toISOString().split('T')[0],
            notes: notes || `Owner-Occupier moved out with clearance. Certificate: ${certificateNumber}. Secondary residents removed: ${secondaryCount}`,
            is_current: true,
            created_by: user.id,
            metadata: {
                certificate_number: certificateNumber,
                valid_until: certificate.validUntil,
                validity_days: validityDays,
                clearance_wallet_balance: clearance.walletBalance,
                clearance_total_unpaid: clearance.totalUnpaid,
                clearance_net_balance: clearance.netBalance,
                secondary_residents_removed: secondaryCount,
            },
        });

    // Record move_out events for secondary residents
    if (secondaryResidents && secondaryResidents.length > 0) {
        const historyRecords = secondaryResidents.map((sr) => ({
            house_id: houseId,
            resident_id: sr.resident_id,
            resident_role: sr.resident_role as ResidentRole,
            event_type: 'move_out' as const,
            event_date: today.toISOString().split('T')[0],
            notes: 'Removed due to Owner-Occupier move-out',
            is_current: false,
            created_by: user.id,
        }));

        await adminClient.from('house_ownership_history').insert(historyRecords);
    }

    // 5. Create in-app notification
    await adminClient
        .from('in_app_notifications')
        .insert({
            recipient_id: residentId,
            title: 'Move-Out Clearance Certificate',
            body: `Your clearance certificate (${certificateNumber}) has been generated. You are now a Property Owner.`,
            category: 'resident',
            entity_type: 'clearance_certificate',
            entity_id: certificate.id,
            action_url: `/portal/properties/${houseId}`,
            priority: 'high',
            metadata: { certificate },
        });

    // 6. Send email
    if (resident.email) {
        await sendEmail({
            to: {
                email: resident.email,
                name: `${resident.first_name} ${resident.last_name}`,
                residentId,
            },
            subject: 'Move-Out Clearance Certificate',
            emailType: 'clearance_certificate',
            react: undefined,
            metadata: {
                certificateNumber,
                validUntil: certificate.validUntil,
                houseAddress,
                newRole: 'Property Owner',
            },
        }).catch(err => {
            console.error('[moveOutOwner] Email failed:', err);
        });
    }

    // Audit log
    await logAudit({
        action: 'CREATE',
        entityType: 'clearance_certificate',
        entityId: certificate.id,
        entityDisplay: `Clearance certificate ${certificateNumber} for ${resident.first_name} ${resident.last_name} (Owner-Occupier)`,
        newValues: { ...certificate } as Record<string, unknown>,
    });

    revalidatePath('/houses');
    revalidatePath(`/houses/${houseId}`);
    revalidatePath('/residents');
    revalidatePath(`/residents/${residentId}`);

    return {
        success: true,
        error: null,
        certificate,
    };
}
