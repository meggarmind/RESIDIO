import type { SupabaseClient } from '@supabase/supabase-js';
import type { ResidentRole } from '@/types/database';
import { RESIDENT_ROLE_LABELS } from '@/types/database';
import { describeSponsorRoles, isPrimaryRole, requiresSponsor, sponsorRolesFor } from '@/lib/validators/resident';
import { embed } from '@/lib/utils';

type ValidationResult = {
    valid: boolean;
    error?: string;
};

/**
 * Validates if a resident role can be assigned to a house based on existing residents.
 * Enforces:
 * 1. Single Owner Policy: Only one owner (Owner-Occupier, Property Owner, Developer) per house.
 * 2. Single Renter Policy: Only one Renter per house.
 * 3. Mutual Exclusivity: Owner-Occupier (resident_landlord) cannot coexist with Renter.
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
    const getName = (record: unknown) => {
        const r = embed((record as { resident?: unknown }).resident as
            { first_name: string; last_name: string }[] | { first_name: string; last_name: string } | null | undefined);
        return r ? `${r.first_name} ${r.last_name} ` : 'someone';
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
    // Case A: Adding Owner-Occupier (resident_landlord) checks for existing Renter
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

type SponsorResult = {
    sponsorId: string | null;
    error?: string;
};

/**
 * Resolves and checks the sponsor for a new or changed assignment, mirroring the
 * validate_sponsor_requirement trigger so the caller gets a clear error before the database rejects it.
 * - Roles that need no sponsor: the given sponsor (or null) is passed through unchecked.
 * - co_resident (#1067): sponsored by the house's active Owner-Occupier or Renter. With no sponsor
 *   given, that resident becomes the sponsor.
 * - Other sponsor roles: a sponsor must be given and hold an active sponsoring role on the house.
 */
export async function resolveSponsor(
    supabase: SupabaseClient,
    houseId: string,
    role: ResidentRole,
    sponsorId?: string | null
): Promise<SponsorResult> {
    if (!requiresSponsor(role)) {
        return { sponsorId: sponsorId || null };
    }

    const roleLabel = RESIDENT_ROLE_LABELS[role];
    const allowed = sponsorRolesFor(role);
    const allowedLabels = describeSponsorRoles(role);

    if (!sponsorId && role !== 'co_resident') {
        return { sponsorId: null, error: `${roleLabel} must have a sponsor. Please select a sponsor.` };
    }

    let query = supabase
        .from('resident_houses')
        .select('resident_id')
        .eq('house_id', houseId)
        .eq('is_active', true)
        .in('resident_role', allowed);
    if (sponsorId) {
        query = query.eq('resident_id', sponsorId);
    }
    const { data, error } = await query.limit(1);

    if (error) {
        console.error('Sponsor lookup error:', error);
        return { sponsorId: null, error: `Could not check the sponsor: ${error.message}` };
    }
    if (!data || data.length === 0) {
        return {
            sponsorId: null,
            error: sponsorId
                ? `The sponsor for ${roleLabel} must be the ${allowedLabels} of the same house.`
                : `${roleLabel} must be sponsored by the ${allowedLabels} of the house, and this house has none.`,
        };
    }

    return { sponsorId: data[0].resident_id as string };
}
