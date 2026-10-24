'use server';

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { Resident, ResidentRole } from '@/types/database';
import type { CreateResidentData } from '@/lib/validators/resident';
import { isValidCorporateRole } from '@/lib/validators/resident';
import { sendWelcomeEmail } from '@/actions/email/send-welcome-email';
import { sendEmailVerification, sendPhoneVerification } from '@/actions/verification/send-verification';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { resolveSponsor, validateHouseAssignment } from './validation';
import { canManageResidentOverride } from '@/lib/comms-override/resident-flag';
import { loadDuplicateMatches } from '@/lib/residents/find-duplicates';
import type { DuplicateResidentMatch } from '@/lib/residents/duplicate-match';
import { assignHouse } from './assign-house';
import { allowedResidentTypes, deriveHouseState } from '@/lib/residents/house-state';

type CreateResidentResponse = {
  data: Resident | null;
  error: string | null;
  /** Set (with data null) when an existing resident matches and the admin has not chosen yet (#820). */
  duplicates?: DuplicateResidentMatch[];
}

/**
 * How the admin answered the duplicate prompt (#820). Neither set: the action looks for a match
 * and stops with `duplicates` if it finds one.
 */
export type CreateResidentOptions = {
  /** Add the house to this existing resident instead of inserting a second one. */
  linkToResidentId?: string;
  /** Deliberate second choice: insert a new resident although a match exists. */
  createAnyway?: boolean;
};

export async function createResident(
  formData: CreateResidentData,
  options: CreateResidentOptions = {}
): Promise<CreateResidentResponse> {
  // Permission check
  const auth = await authorizePermission(PERMISSIONS.RESIDENTS_CREATE);
  if (!auth.authorized) {
    return { data: null, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { data: null, error: 'Unauthorized' };
  }

  if (options.linkToResidentId) {
    return linkHouseToExistingResident(options.linkToResidentId, formData);
  }

  if (!options.createAnyway) {
    const { matches, error: lookupError } = await loadDuplicateMatches({
      first_name: formData.first_name,
      last_name: formData.last_name,
      email: formData.email,
      phone_primary: formData.phone_primary,
      phone_secondary: formData.phone_secondary,
      company_name: formData.entity_type === 'corporate' ? formData.company_name : null,
    });
    // Fail closed: a roster we could not read must not turn into a silent duplicate.
    if (lookupError) {
      return { data: null, error: `Could not check for an existing resident: ${lookupError}` };
    }
    if (matches.length > 0) {
      return { data: null, error: null, duplicates: matches };
    }
  }

  // Pre-validate house assignment if provided to avoid creating resident then deleting
  let sponsorId: string | null = formData.sponsor_resident_id || null;
  if (formData.house_id && formData.resident_role) {
    const role = formData.resident_role as ResidentRole;
    const entityType = formData.entity_type || 'individual';

    // Validate corporate role restriction
    if (entityType === 'corporate' && !isValidCorporateRole(role)) {
      return {
        data: null,
        error: 'Corporate entities can only be Property Owner, Corporate Renter, or Developer',
      };
    }

    // Sponsor rule (co-residents default to the house's resident, #1067)
    const sponsor = await resolveSponsor(supabase, formData.house_id, role, formData.sponsor_resident_id);
    if (sponsor.error) {
      return { data: null, error: sponsor.error };
    }
    sponsorId = sponsor.sponsorId;

    // Validate occupancy rules (Single Owner, Single Renter, etc.)
    const validation = await validateHouseAssignment(supabase, formData.house_id, role);
    if (!validation.valid) {
      return { data: null, error: validation.error || 'Invalid assignment' };
    }

    // The resident type must fit the house as it is now, not as the form last saw it.
    const { data: activeRoles, error: rolesError } = await supabase
      .from('resident_houses')
      .select('resident_role')
      .eq('house_id', formData.house_id)
      .eq('is_active', true);
    if (rolesError) {
      return { data: null, error: `Could not check the house: ${rolesError.message}` };
    }
    const state = deriveHouseState((activeRoles ?? []).map((r) => r.resident_role));
    if (!allowedResidentTypes(state, role).includes(formData.resident_type)) {
      return { data: null, error: 'This house already has a primary resident. Only secondary residents can be added.' };
    }
  }

  // Communications override flag (#716): written only for a caller who also holds
  // settings.manage_general; for anyone else the submitted value is ignored. It goes in the
  // insert itself so the welcome email and verification codes below already honour it.
  // The column is not in the generated insert type yet, hence the spread (see resident-flag.ts).
  const overrideColumn =
    formData.use_override_comms !== undefined && canManageResidentOverride(auth.permissions)
      ? { use_override_comms: formData.use_override_comms }
      : {};

  // Create resident (resident_code is auto-generated by trigger)
  const { data: resident, error: residentError } = await supabase
    .from('residents')
    .insert({
      first_name: formData.first_name,
      last_name: formData.last_name,
      email: formData.email || null,
      phone_primary: formData.phone_primary,
      phone_secondary: formData.phone_secondary || null,
      resident_type: formData.resident_type,
      verification_status: 'verified', // Auto-verify residents added by admins
      // Entity type fields
      entity_type: formData.entity_type || 'individual',
      company_name: formData.company_name || null,
      rc_number: formData.rc_number || null,
      liaison_contact_name: formData.liaison_contact_name || null,
      liaison_contact_phone: formData.liaison_contact_phone || null,
      // Emergency contact
      emergency_contact_name: formData.emergency_contact_name || null,
      emergency_contact_phone: formData.emergency_contact_phone || null,
      emergency_contact_relationship: formData.emergency_contact_relationship || null,
      notes: formData.notes || null,
      created_by: user.id,
      updated_by: user.id,
      ...overrideColumn,
    })
    .select()
    .single();

  if (residentError) {
    return { data: null, error: residentError.message };
  }

  // Create house assignment if provided
  if (formData.house_id && formData.resident_role) {
    // Validations already performed above

    const { error: assignmentError } = await supabase
      .from('resident_houses')
      .insert({
        resident_id: resident.id,
        house_id: formData.house_id,
        resident_role: formData.resident_role,
        move_in_date: formData.move_in_date || new Date().toISOString().split('T')[0],
        sponsor_resident_id: sponsorId,
        created_by: user.id,
      });

    if (assignmentError) {
      // Rollback: delete resident if house assignment fails
      await supabase.from('residents').delete().eq('id', resident.id);
      return { data: null, error: `Failed to assign house: ${assignmentError.message}` };
    }
  }

  // Send welcome email and verification codes if resident has email/phone (non-blocking)
  // These run in parallel for better performance
  const notifications: Promise<unknown>[] = [];

  if (resident.email) {
    // Send welcome email
    notifications.push(
      sendWelcomeEmail(resident.id).catch((err) => {
        console.error(`[Resident] Failed to send welcome email for ${resident.resident_code}:`, err);
      })
    );

    // Send email verification code
    notifications.push(
      sendEmailVerification(resident.id).catch((err) => {
        console.error(`[Resident] Failed to send email verification for ${resident.resident_code}:`, err);
      })
    );
  }

  // Send phone verification code (SMS)
  if (resident.phone_primary) {
    notifications.push(
      sendPhoneVerification(resident.id).catch((err) => {
        console.error(`[Resident] Failed to send phone verification for ${resident.resident_code}:`, err);
      })
    );
  }

  // Wait for all notifications to complete (or fail gracefully)
  await Promise.allSettled(notifications);

  // Audit log
  await logAudit({
    action: 'CREATE',
    entityType: 'residents',
    entityId: resident.id,
    entityDisplay: `${resident.first_name} ${resident.last_name} (${resident.resident_code})`,
    newValues: {
      name: `${resident.first_name} ${resident.last_name}`,
      resident_type: formData.resident_type,
      entity_type: formData.entity_type || 'individual',
      email: formData.email || null,
      phone: formData.phone_primary,
      house_id: formData.house_id || null,
      resident_role: formData.resident_role || null,
      ...('use_override_comms' in overrideColumn ? { use_override_comms: overrideColumn.use_override_comms } : {}),
    },
    description: formData.house_id
      ? `Created resident with house assignment`
      : `Created resident`,
  });

  revalidatePath('/residents');
  revalidatePath('/houses');
  return { data: resident, error: null };
}

// Linking adds a resident_houses row through assignHouse, which owns the occupancy, sponsor and
// corporate-role rules plus its own permission check and audit entry. No resident is inserted.
async function linkHouseToExistingResident(
  residentId: string,
  formData: CreateResidentData
): Promise<CreateResidentResponse> {
  if (!formData.house_id || !formData.resident_role) {
    return { data: null, error: 'Choose a house and role to link this house to the existing resident.' };
  }

  const assigned = await assignHouse(residentId, {
    house_id: formData.house_id,
    resident_role: formData.resident_role,
    move_in_date: formData.move_in_date,
    sponsor_resident_id: formData.sponsor_resident_id,
  });
  if (assigned.error) {
    return { data: null, error: assigned.error };
  }

  const { data: resident, error } = await createAdminClient()
    .from('residents')
    .select('*')
    .eq('id', residentId)
    .single();
  if (error || !resident) {
    return { data: null, error: error?.message || 'Resident not found' };
  }

  revalidatePath('/residents');
  revalidatePath('/houses');
  return { data: resident, error: null };
}
