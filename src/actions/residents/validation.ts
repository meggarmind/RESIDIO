import type { SupabaseClient } from '@supabase/supabase-js';
import type { ResidentRole } from '@/types/database';
import { RESIDENT_ROLE_LABELS } from '@/types/database';
import { isPrimaryRole } from '@/lib/validators/resident';

type ValidationResult = {
    valid: boolean;
    error?: string;
};

/**
 * Validates if a resident role can be assigned to a house based on existing residents.
 * Enforces:
 * 1. Single Owner Policy: Only one owner (Resident Landlord, Non-Resident Landlord, Developer) per house.
 * 2. Single Renter Policy: Only one Renter per house.
 * 3. Mutual Exclusivity: Owner-Occupier (Resident Landlord) cannot coexist with Renter.
 */
export async function validateHouseAssignment(
    supabase: SupabaseClient,
    houseId: string,
    newRole: ResidentRole
): Promise<ValidationResult> {
    // Only validate primary roles (Secondary roles like co_resident don't have these restrictions)
    // HOWEVER, we might want to prevent assigning secondary roles if there is no primary?
    // But the requirement is specifically about Owner/Renter conflicts.
    // Existing code restricts blocking logic to `isPrimaryRole`.
    if (!isPrimaryRole(newRole)) {
        return { valid: true };
    }

    const roleLabel = RESIDENT_ROLE_LABELS[newRole];

    // Fetch all active primary residents for the house
    const { data: activePrimaryResidents, error } = await supabase
        .from('resident_houses')
        .select(`
            id,
            resident_role,
            resident:residents!resident_id(first_name, last_name)
        `)
        .eq('house_id', houseId)
        .in('resident_role', ['resident_landlord', 'non_resident_landlord', 'tenant', 'developer'])
        .eq('is_active', true);

    if (error) {
        console.error('Validation fetch error:', error);
        return { valid: false, error: `Validation error: ${error.message} ` };
    }

    const existingResidents = activePrimaryResidents || [];

    // Helper to get name
    const getName = (record: any) => {
        const r = record.resident;
        return r ? `${(r as any).first_name} ${(r as any).last_name} ` : 'someone';
    };

    // 1. Single Owner Policy
    // If new role is an Ownership role
    if (['resident_landlord', 'non_resident_landlord', 'developer'].includes(newRole)) {
        const existingOwner = existingResidents.find(r =>
            ['resident_landlord', 'non_resident_landlord', 'developer'].includes(r.resident_role)
        );

        if (existingOwner) {
            const existingLabel = RESIDENT_ROLE_LABELS[existingOwner.resident_role as ResidentRole];
            return {
                valid: false,
                error: `This house already has an owner(${existingLabel}: ${getName(existingOwner)}).Only one owner is allowed per house.`
            };
        }
    }

    // 2. Owner-Occupier vs Renter Conflict
    // Case A: Adding Owner-Occupier (resident_landlord) checks for existing Tenant
    if (newRole === 'resident_landlord') {
        const existingTenant = existingResidents.find(r => r.resident_role === 'tenant');
        if (existingTenant) {
            return {
                valid: false,
                error: `This house already has a Renter(${getName(existingTenant)}).Cannot have an Owner - Occupier and Renter in the same unit.`
            };
        }
    }

    // Case B: Adding Renter (tenant) checks for existing Owner-Occupier
    if (newRole === 'tenant') {
        // Check for Owner-Occupier
        const existingBroadOwner = existingResidents.find(r => r.resident_role === 'resident_landlord');
        if (existingBroadOwner) {
            return {
                valid: false,
                error: `This house has an Owner - Occupier(${getName(existingBroadOwner)}).Cannot assign a Renter.`
            };
        }

        // 3. Single Renter Policy
        // Check for existing Renter
        const existingTenant = existingResidents.find(r => r.resident_role === 'tenant');
        if (existingTenant) {
            return {
                valid: false,
                error: `This house already has a Renter(${getName(existingTenant)}).only one Renter is allowed.`
            };
        }
    }

    return { valid: true };
}
