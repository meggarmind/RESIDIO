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

export type MoveOutDestination = 'leaving_estate' | 'moving_within_estate';

export interface RenterClearanceCheck {
  canProceed: boolean;
  walletBalance: number;
  totalUnpaid: number;
  netBalance: number; // walletBalance - totalUnpaid
  unpaidInvoiceCount: number;
  message: string;
}

export interface RenterMoveOutInput {
  residentId: string;
  houseId: string;
  destination: MoveOutDestination;
  destinationHouseId?: string | null;
  destinationRole?: ResidentRole | null;
  validityDays?: number; // Admin can override, defaults to system setting
  notes?: string;
}

export interface ClearanceCertificate {
  id: string;
  residentId: string;
  residentName: string;
  residentCode: string;
  houseId: string;
  houseAddress: string;
  clearanceDate: string;
  validUntil: string;
  validityDays: number;
  destination: MoveOutDestination;
  destinationHouse?: {
    id: string;
    address: string;
    role: ResidentRole;
  } | null;
  certificateNumber: string;
  status: 'pending_confirmation' | 'confirmed' | 'expired';
  createdBy: string;
  createdAt: string;
}

export type MoveOutRenterResponse = {
  success: boolean;
  error: string | null;
  certificate?: ClearanceCertificate;
  movedOutSecondaryCount?: number;
};

/**
 * Check if a renter can move out (financial clearance check)
 */
export async function checkRenterClearance(
  residentId: string
): Promise<{ data: RenterClearanceCheck | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();

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
      ? `Renter has a credit balance of ₦${netBalance.toLocaleString()}. Proceed with move-out.`
      : 'Renter has no outstanding balance. Proceed with move-out.'
    : `Renter has an outstanding balance of ₦${Math.abs(netBalance).toLocaleString()}. Please clear before move-out.`;

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
 * Get available houses for moving within estate
 * Returns houses that don't have an Owner-Occupier or Renter already assigned
 */
export async function getAvailableHousesForMoveIn(excludeHouseId?: string): Promise<{
  data: Array<{
    id: string;
    house_number: string;
    short_name: string | null;
    street_name: string | null;
    hasOwnerOccupier: boolean;
    hasRenter: boolean;
    canAcceptRenter: boolean;
  }> | null;
  error: string | null;
}> {
  const supabase = await createServerSupabaseClient();

  // Get all active houses
  const { data: houses, error } = await supabase
    .from('houses')
    .select(`
      id,
      house_number,
      short_name,
      street:streets(name),
      resident_houses!inner(resident_role, is_active)
    `)
    .eq('is_active', true)
    .order('house_number');

  if (error) {
    return { data: null, error: error.message };
  }

  // Get houses without active Owner-Occupier or Renter
  // A house can accept a renter if:
  // 1. It has no Owner-Occupier (resident_landlord)
  // 2. It has no existing Renter (tenant)
  // 3. It has a Non-Resident Landlord (owner who doesn't live there)

  const result = houses
    ?.filter((h) => h.id !== excludeHouseId)
    .map((house) => {
      const activeLinks = (house.resident_houses as any[])?.filter((rh) => rh.is_active) || [];
      const hasOwnerOccupier = activeLinks.some(
        (rh) => rh.resident_role === 'resident_landlord'
      );
      const hasRenter = activeLinks.some((rh) => rh.resident_role === 'tenant');

      // Can accept a renter if there's no Owner-Occupier and no existing Renter
      const canAcceptRenter = !hasOwnerOccupier && !hasRenter;

      return {
        id: house.id,
        house_number: house.house_number,
        short_name: house.short_name,
        street_name: (house.street as any)?.name || null,
        hasOwnerOccupier,
        hasRenter,
        canAcceptRenter,
      };
    })
    .filter((h) => h.canAcceptRenter);

  return { data: result || [], error: null };
}

/**
 * Generate clearance certificate number
 */
function generateCertificateNumber(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `CLR-${year}${month}-${random}`;
}

/**
 * Initiate renter move-out process
 *
 * This action:
 * 1. Verifies the resident is a tenant at the house
 * 2. Checks financial clearance (wallet balance vs unpaid invoices)
 * 3. Creates a clearance certificate record
 * 4. Sends notifications to renter, CSO, and Finance roles
 * 5. Records the pending move-out in ownership history
 *
 * Physical move-out confirmation must be done separately by CSO.
 */
export async function initiateRenterMoveOut(
  input: RenterMoveOutInput
): Promise<MoveOutRenterResponse> {
  // Permission check - allow self-service or admin
  const supabase = await createServerSupabaseClient();
  const adminClient = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }

  const {
    residentId,
    houseId,
    destination,
    destinationHouseId,
    destinationRole,
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

  // Check if user is the resident themselves (self-service) or admin
  const isSelfService = resident.user_id === user.id;
  if (!isSelfService) {
    const auth = await authorizePermission(PERMISSIONS.HOUSES_ASSIGN_RESIDENT);
    if (!auth.authorized) {
      return { success: false, error: auth.error || 'Unauthorized' };
    }
  }

  // Verify the resident is a tenant at this house
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

  if (assignment.resident_role !== 'tenant') {
    return {
      success: false,
      error: `Only Renters can use Move Out. This resident is a ${assignment.resident_role}.`,
    };
  }

  // Financial clearance check
  const { data: clearance, error: clearanceError } = await checkRenterClearance(residentId);
  if (clearanceError || !clearance) {
    return { success: false, error: clearanceError || 'Failed to check clearance' };
  }

  if (!clearance.canProceed) {
    return {
      success: false,
      error: clearance.message,
    };
  }

  // If moving within estate, verify destination house
  let destinationHouseDetails: {
    id: string;
    address: string;
    role: ResidentRole;
  } | null = null;

  if (destination === 'moving_within_estate') {
    if (!destinationHouseId) {
      return { success: false, error: 'Destination house is required when moving within estate' };
    }
    if (!destinationRole) {
      return { success: false, error: 'Destination role is required when moving within estate' };
    }

    const { data: destHouse, error: destError } = await supabase
      .from('houses')
      .select('id, house_number, short_name, street:streets(name)')
      .eq('id', destinationHouseId)
      .single();

    if (destError || !destHouse) {
      return { success: false, error: 'Destination house not found' };
    }

    // Verify destination can accept the role
    const { data: destAssignments } = await supabase
      .from('resident_houses')
      .select('resident_role')
      .eq('house_id', destinationHouseId)
      .eq('is_active', true);

    const hasOwnerOccupier = destAssignments?.some((a) => a.resident_role === 'resident_landlord');
    const hasRenter = destAssignments?.some((a) => a.resident_role === 'tenant');

    if (destinationRole === 'tenant' && (hasOwnerOccupier || hasRenter)) {
      return {
        success: false,
        error: 'Destination house already has an Owner-Occupier or Renter',
      };
    }

    destinationHouseDetails = {
      id: destHouse.id,
      address: `${destHouse.short_name || destHouse.house_number}, ${(destHouse.street as any)?.name || ''}`,
      role: destinationRole,
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

  // Get default validity period from settings
  const defaultValidityDays = await getSystemSetting<number>(supabase, 'moveout_validity_days') || 7;

  // Self-service uses default, admins can customize
  const validityDays = isSelfService ? defaultValidityDays : (customValidityDays || defaultValidityDays);

  const today = new Date();
  const validUntil = new Date(today);
  validUntil.setDate(validUntil.getDate() + validityDays);

  // Create clearance certificate record
  const certificateNumber = generateCertificateNumber();
  const houseAddress = `${house.short_name || house.house_number}, ${(house.street as any)?.name || ''}`;

  const certificate: ClearanceCertificate = {
    id: crypto.randomUUID(),
    residentId,
    residentName: `${resident.first_name} ${resident.last_name}`,
    residentCode: resident.resident_code,
    houseId,
    houseAddress,
    clearanceDate: today.toISOString().split('T')[0],
    validUntil: validUntil.toISOString().split('T')[0],
    validityDays,
    destination,
    destinationHouse: destinationHouseDetails,
    certificateNumber,
    status: 'pending_confirmation',
    createdBy: user.id,
    createdAt: today.toISOString(),
  };

  // Store certificate in database (using metadata field in house_ownership_history)
  const { error: historyError } = await adminClient
    .from('house_ownership_history')
    .insert({
      house_id: houseId,
      resident_id: residentId,
      resident_role: 'tenant' as ResidentRole,
      event_type: 'pending_move_out',
      event_date: today.toISOString().split('T')[0],
      notes: notes || `Move-out initiated. Certificate: ${certificateNumber}. Valid until: ${certificate.validUntil}`,
      is_current: true,
      created_by: user.id,
      metadata: {
        certificate_number: certificateNumber,
        valid_until: certificate.validUntil,
        validity_days: validityDays,
        destination,
        destination_house_id: destinationHouseId || null,
        destination_role: destinationRole || null,
        clearance_wallet_balance: clearance.walletBalance,
        clearance_total_unpaid: clearance.totalUnpaid,
        clearance_net_balance: clearance.netBalance,
      },
    });

  if (historyError) {
    console.error('[moveOutRenter] Error creating history record:', historyError);
    return { success: false, error: 'Failed to create clearance record' };
  }

  // Create in-app notification for the renter
  await adminClient
    .from('in_app_notifications')
    .insert({
      recipient_id: residentId,
      title: 'Move-Out Clearance Certificate',
      body: `Your clearance certificate (${certificateNumber}) has been generated. Valid until ${validUntil.toLocaleDateString()}.`,
      category: 'resident',
      entity_type: 'clearance_certificate',
      entity_id: certificate.id,
      action_url: `/portal/properties/${houseId}`,
      priority: 'high',
      metadata: { certificate },
    });

  // Get CSO and Finance users for notifications
  const { data: csoUsers } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role', 'cso');

  const { data: financeUsers } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role', 'finance_officer');

  // Get resident IDs for these users
  const userIds = [
    ...(csoUsers || []).map((u) => u.user_id),
    ...(financeUsers || []).map((u) => u.user_id),
  ];

  if (userIds.length > 0) {
    const { data: staffResidents } = await supabase
      .from('residents')
      .select('id, user_id')
      .in('user_id', userIds);

    if (staffResidents && staffResidents.length > 0) {
      const notifications = staffResidents.map((sr) => ({
        recipient_id: sr.id,
        title: 'Renter Move-Out Initiated',
        body: `${resident.first_name} ${resident.last_name} (${resident.resident_code}) has initiated move-out from ${houseAddress}. Certificate: ${certificateNumber}`,
        category: 'admin',
        entity_type: 'clearance_certificate',
        entity_id: certificate.id,
        action_url: `/houses/${houseId}`,
        priority: 'normal' as const,
        metadata: { certificate },
      }));

      await adminClient.from('in_app_notifications').insert(notifications);
    }
  }

  // Send email to the renter
  if (resident.email) {
    await sendEmail({
      to: {
        email: resident.email,
        name: `${resident.first_name} ${resident.last_name}`,
        residentId,
      },
      subject: 'Move-Out Clearance Certificate',
      emailType: 'clearance_certificate',
      react: null, // Would normally use a react template
      metadata: {
        certificateNumber,
        validUntil: certificate.validUntil,
        houseAddress,
      },
    }).catch(err => {
      console.error('[moveOutRenter] Email failed:', err);
    });
  }

  // Audit log
  await logAudit({
    action: 'CREATE',
    entityType: 'clearance_certificate',
    entityId: certificate.id,
    entityDisplay: `Clearance certificate ${certificateNumber} for ${resident.first_name} ${resident.last_name}`,
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

/**
 * CSO confirms physical move-out
 *
 * This action:
 * 1. Verifies user has CSO role
 * 2. Deactivates the renter's assignment to the house
 * 3. Removes (deactivates) all secondary residents from the house
 * 4. Updates house occupancy status
 * 5. If moving within estate, assigns to new house
 * 6. Records the confirmed move-out in ownership history
 */
export async function confirmRenterMoveOut(
  residentId: string,
  houseId: string,
  certificateNumber: string
): Promise<MoveOutRenterResponse> {
  const supabase = await createServerSupabaseClient();
  const adminClient = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }

  // Check CSO permission (security.record_access covers physical access confirmation)
  const auth = await authorizePermission(PERMISSIONS.SECURITY_RECORD_ACCESS);
  if (!auth.authorized) {
    return { success: false, error: 'Only CSO can confirm move-outs' };
  }

  // Get the pending move-out record
  const { data: pendingRecord, error: pendingError } = await supabase
    .from('house_ownership_history')
    .select('*')
    .eq('house_id', houseId)
    .eq('resident_id', residentId)
    .eq('event_type', 'pending_move_out')
    .eq('is_current', true)
    .single();

  if (pendingError || !pendingRecord) {
    return { success: false, error: 'No pending move-out found for this resident' };
  }

  const metadata = pendingRecord.metadata as any;
  if (metadata?.certificate_number !== certificateNumber) {
    return { success: false, error: 'Certificate number mismatch' };
  }

  const today = new Date().toISOString().split('T')[0];

  // Check if certificate has expired
  const validUntil = metadata?.valid_until;
  if (validUntil && new Date(validUntil) < new Date(today)) {
    // Certificate expired - update status but allow confirmation anyway
    console.warn('[confirmMoveOut] Certificate expired, but proceeding with confirmation');
  }

  // Get resident details
  const { data: resident } = await supabase
    .from('residents')
    .select('first_name, last_name, resident_code')
    .eq('id', residentId)
    .single();

  // Get count of secondary residents to remove
  const { data: secondaryResidents, error: secondaryError } = await supabase
    .from('resident_houses')
    .select('id, resident_id, resident_role')
    .eq('house_id', houseId)
    .eq('is_active', true)
    .in('resident_role', ['co_resident', 'household_member', 'domestic_staff', 'caretaker', 'contractor']);

  const secondaryCount = secondaryResidents?.length || 0;

  // 1. Deactivate the renter's assignment
  const { error: deactivateError } = await supabase
    .from('resident_houses')
    .update({
      is_active: false,
      move_out_date: today,
    })
    .eq('resident_id', residentId)
    .eq('house_id', houseId)
    .eq('is_active', true);

  if (deactivateError) {
    console.error('[confirmMoveOut] Error deactivating assignment:', deactivateError);
    return { success: false, error: 'Failed to deactivate assignment' };
  }

  // 2. Deactivate all secondary residents
  if (secondaryCount > 0) {
    await supabase
      .from('resident_houses')
      .update({
        is_active: false,
        move_out_date: today,
      })
      .eq('house_id', houseId)
      .eq('is_active', true)
      .in('resident_role', ['co_resident', 'household_member', 'domestic_staff', 'caretaker', 'contractor']);
  }

  // 3. Update house occupancy status
  await supabase
    .from('houses')
    .update({ is_occupied: false })
    .eq('id', houseId);

  // 4. If moving within estate, assign to new house
  const destinationHouseId = metadata?.destination_house_id;
  const destinationRole = metadata?.destination_role;

  if (metadata?.destination === 'moving_within_estate' && destinationHouseId && destinationRole) {
    // Create new assignment at destination
    const { error: assignError } = await supabase
      .from('resident_houses')
      .insert({
        resident_id: residentId,
        house_id: destinationHouseId,
        resident_role: destinationRole,
        is_primary: true,
        is_active: true,
        move_in_date: today,
      });

    if (assignError) {
      console.error('[confirmMoveOut] Error assigning to destination:', assignError);
      // Don't fail the whole operation, but log it
    }

    // Update destination house occupancy
    await supabase
      .from('houses')
      .update({ is_occupied: true })
      .eq('id', destinationHouseId);

    // Record move-in at destination
    await adminClient
      .from('house_ownership_history')
      .insert({
        house_id: destinationHouseId,
        resident_id: residentId,
        resident_role: destinationRole,
        event_type: 'move_in',
        event_date: today,
        notes: `Moved from ${certificateNumber}`,
        is_current: true,
        created_by: user.id,
      });
  }

  // 5. Update the pending record to confirmed
  await adminClient
    .from('house_ownership_history')
    .update({
      is_current: false,
      notes: `${pendingRecord.notes} - CONFIRMED by CSO on ${today}`,
    })
    .eq('id', pendingRecord.id);

  // 6. Record the confirmed move-out
  await adminClient
    .from('house_ownership_history')
    .insert({
      house_id: houseId,
      resident_id: residentId,
      resident_role: 'tenant' as ResidentRole,
      event_type: 'move_out',
      event_date: today,
      notes: `Move-out confirmed. Certificate: ${certificateNumber}. Secondary residents removed: ${secondaryCount}`,
      is_current: false,
      created_by: user.id,
      metadata: {
        ...metadata,
        confirmed_by: user.id,
        confirmed_at: new Date().toISOString(),
        secondary_residents_removed: secondaryCount,
      },
    });

  // Record move_out events for each secondary resident
  if (secondaryResidents && secondaryResidents.length > 0) {
    const historyRecords = secondaryResidents.map((sr) => ({
      house_id: houseId,
      resident_id: sr.resident_id,
      resident_role: sr.resident_role as ResidentRole,
      event_type: 'move_out' as const,
      event_date: today,
      notes: 'Removed due to Renter move-out',
      is_current: false,
      created_by: user.id,
    }));

    await adminClient.from('house_ownership_history').insert(historyRecords);
  }

  // Notify the renter
  await adminClient
    .from('in_app_notifications')
    .insert({
      recipient_id: residentId,
      title: 'Move-Out Confirmed',
      body: `Your move-out has been confirmed by security. You are no longer associated with the property.`,
      category: 'resident',
      priority: 'high',
    });

  // Audit log
  await logAudit({
    action: 'UPDATE',
    entityType: 'clearance_certificate',
    entityId: certificateNumber,
    entityDisplay: `Confirmed move-out for ${resident?.first_name} ${resident?.last_name}`,
    oldValues: { status: 'pending_confirmation' },
    newValues: { status: 'confirmed', confirmed_by: user.id, secondary_removed: secondaryCount },
  });

  revalidatePath('/houses');
  revalidatePath(`/houses/${houseId}`);
  revalidatePath('/residents');
  revalidatePath(`/residents/${residentId}`);
  if (destinationHouseId) {
    revalidatePath(`/houses/${destinationHouseId}`);
  }

  return {
    success: true,
    error: null,
    movedOutSecondaryCount: secondaryCount,
  };
}

/**
 * Get pending move-out for a house/resident
 */
export async function getPendingMoveOut(
  houseId: string,
  residentId?: string
): Promise<{
  data: {
    certificate: ClearanceCertificate;
    isExpired: boolean;
    daysRemaining: number;
  } | null;
  error: string | null;
}> {
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from('house_ownership_history')
    .select('*, resident:residents(first_name, last_name, resident_code)')
    .eq('house_id', houseId)
    .eq('event_type', 'pending_move_out')
    .eq('is_current', true);

  if (residentId) {
    query = query.eq('resident_id', residentId);
  }

  const { data, error } = await query.single();

  if (error || !data) {
    return { data: null, error: null }; // No pending move-out
  }

  const metadata = data.metadata as any;
  const today = new Date();
  const validUntil = new Date(metadata?.valid_until || today);
  const isExpired = validUntil < today;
  const daysRemaining = Math.ceil((validUntil.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  // Get house address
  const { data: house } = await supabase
    .from('houses')
    .select('house_number, short_name, street:streets(name)')
    .eq('id', houseId)
    .single();

  const houseAddress = house
    ? `${house.short_name || house.house_number}, ${(house.street as any)?.name || ''}`
    : '';

  const residentData = data.resident as any;

  const certificate: ClearanceCertificate = {
    id: data.id,
    residentId: data.resident_id,
    residentName: `${residentData?.first_name || ''} ${residentData?.last_name || ''}`,
    residentCode: residentData?.resident_code || '',
    houseId,
    houseAddress,
    clearanceDate: data.event_date,
    validUntil: metadata?.valid_until || '',
    validityDays: metadata?.validity_days || 7,
    destination: metadata?.destination || 'leaving_estate',
    destinationHouse: metadata?.destination_house_id
      ? {
        id: metadata.destination_house_id,
        address: '', // Would need another query
        role: metadata.destination_role,
      }
      : null,
    certificateNumber: metadata?.certificate_number || '',
    status: isExpired ? 'expired' : 'pending_confirmation',
    createdBy: data.created_by,
    createdAt: data.created_at,
  };

  return {
    data: {
      certificate,
      isExpired,
      daysRemaining: Math.max(0, daysRemaining),
    },
    error: null,
  };
}
