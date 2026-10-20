'use server';

import { createAdminClient, createServerSupabaseClient } from '@/lib/supabase/server';
import { normalizePhoneNumber } from '@/lib/sms/termii';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { revalidatePath } from 'next/cache';
import type { Resident } from '@/types/database';
import type { ResidentFormData } from '@/lib/validators/resident';
import { canManageResidentOverride, loadResidentOverrideFlags } from '@/lib/comms-override/resident-flag';

const OVERRIDE_DENIED =
  "Unauthorized: Missing permission 'settings.manage_general' to change the communications override";

type UpdateResidentResponse = {
  data: Resident | null;
  error: string | null;
}

export async function updateResident(id: string, formData: ResidentFormData): Promise<UpdateResidentResponse> {
  const auth = await authorizePermission(PERMISSIONS.RESIDENTS_UPDATE);
  if (!auth.authorized) {
    return { data: null, error: auth.error };
  }

  const supabase = await createServerSupabaseClient();

  // Validate corporate entity fields
  if (formData.entity_type === 'corporate' && !formData.company_name?.trim()) {
    return { data: null, error: 'Company name is required for corporate entities' };
  }

  // Fetch current resident to check for contact changes
  const { data: currentResident, error: fetchError } = await supabase
    .from('residents')
    .select('email, phone_primary, phone_secondary, email_verified_at, phone_verified_at, first_name, last_name')
    .eq('id', id)
    .single();

  if (fetchError) {
    return { data: null, error: 'Failed to fetch current resident data' };
  }

  // Communications override flag (#716). Only settings.manage_general may change it, enforced here and
  // not only by hiding the control. Resubmitting the stored value is not a change.
  let flagChanged = false;
  let currentFlag: boolean | null = null;
  const submittedFlag = formData.use_override_comms;
  if (submittedFlag !== undefined) {
    const lookup = await loadResidentOverrideFlags([id]);
    if (!lookup.ok || !lookup.flags.has(id)) {
      return { data: null, error: 'Failed to read the current communications override' };
    }
    currentFlag = lookup.flags.get(id) ?? null;
    flagChanged = submittedFlag !== currentFlag;
    if (flagChanged && !canManageResidentOverride(auth.permissions)) {
      return {
        data: null,
        error: OVERRIDE_DENIED,
      };
    }
  }

  // Determine if contacts have changed
  const emailChanged = (formData.email || null) !== currentResident.email;
  const phoneChanged = formData.phone_primary !== currentResident.phone_primary;

  // Prepare update object
  const updateData: Record<string, unknown> = {
    first_name: formData.first_name,
    last_name: formData.last_name,
    email: formData.email || null,
    phone_primary: formData.phone_primary,
    phone_secondary: formData.phone_secondary || null,
    resident_type: formData.resident_type,
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
    updated_by: auth.userId,
  };

  if (flagChanged) {
    updateData.use_override_comms = submittedFlag;
  }

  // Reset verification status if contact info has changed.
  if (emailChanged) {
    updateData.email_verified_at = null;
  }

  if (phoneChanged) {
    updateData.phone_verified_at = null;

  }

  const { data, error } = await supabase
    .from('residents')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    // 42501 from the residents_guard_use_override_comms trigger: same answer as the check above.
    return { data: null, error: error.code === '42501' && flagChanged ? OVERRIDE_DENIED : error.message };
  }

  // A WhatsApp link for a number taken off the roster must not keep answering for this resident (#849).
  const keptNumbers = [formData.phone_primary, formData.phone_secondary]
    .filter(Boolean)
    .map((phone) => normalizePhoneNumber(phone as string));
  const removedNumbers = [currentResident.phone_primary, currentResident.phone_secondary]
    .filter(Boolean)
    .map((phone) => normalizePhoneNumber(phone as string))
    .filter((phone) => !keptNumbers.includes(phone));
  let deactivatedNumbers: string[] = [];
  let failedNumbers: string[] = [];
  if (removedNumbers.length > 0) {
    const { error: optinError } = await createAdminClient()
      .from('whatsapp_optins')
      .update({ deactivated_at: new Date().toISOString(), link_verified_at: null })
      .eq('resident_id', id)
      .in('phone_number', removedNumbers)
      .is('deactivated_at', null);
    if (optinError) {
      // These links stay active; a code-verified one keeps the financial tier, so record the failure for follow-up.
      console.error('[updateResident] failed to deactivate WhatsApp links for removed numbers', { residentId: id, removedNumbers, error: optinError });
      failedNumbers = removedNumbers;
    } else {
      deactivatedNumbers = removedNumbers;
    }
  }

  await logAudit({
    action: 'UPDATE',
    entityType: 'residents',
    entityId: id,
    entityDisplay: `${currentResident.first_name} ${currentResident.last_name}`,
    oldValues: {
      email: currentResident.email,
      phone_primary: currentResident.phone_primary,
      phone_secondary: currentResident.phone_secondary,
      email_verified_at: currentResident.email_verified_at,
      phone_verified_at: currentResident.phone_verified_at,
      ...(flagChanged ? { use_override_comms: currentFlag } : {}),
    },
    newValues: {
      email: formData.email || null,
      phone_primary: formData.phone_primary,
      phone_secondary: formData.phone_secondary || null,
      email_verified_at: emailChanged ? null : currentResident.email_verified_at,
      phone_verified_at: phoneChanged ? null : currentResident.phone_verified_at,
      ...(flagChanged ? { use_override_comms: submittedFlag } : {}),
      ...(deactivatedNumbers.length > 0 ? { whatsapp_links_deactivated_for: deactivatedNumbers } : {}),
      ...(failedNumbers.length > 0 ? { whatsapp_links_deactivation_failed_for: failedNumbers } : {}),
    },
    description: 'Updated resident profile',
  });

  revalidatePath('/residents');
  revalidatePath(`/residents/${id}`);
  revalidatePath('/portal/profile');
  return { data, error: null };
}
