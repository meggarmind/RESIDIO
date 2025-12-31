'use server';

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { ResidentRole } from '@/types/database';
import { RESIDENT_ROLE_LABELS } from '@/types/database';

/**
 * Types for property transition workflow
 */
export type TransitionType =
  | 'developer_to_owner'      // Developer sells to new owner (resident or non-resident landlord)
  | 'landlord_to_tenant'      // Non-resident landlord leases to tenant
  | 'tenant_turnover'         // Tenant leaves, new tenant moves in
  | 'owner_move_in'           // Non-resident landlord becomes resident landlord
  | 'owner_move_out';         // Resident landlord becomes non-resident landlord

export type StaffTransitionAction =
  | 'remove'                  // Remove from property
  | 'transfer'                // Transfer to new primary resident
  | 'keep_until_date';        // Keep with expiration date

export type StaffMember = {
  assignment_id: string;
  resident_id: string;
  first_name: string;
  last_name: string;
  resident_role: ResidentRole;
  is_live_in: boolean;
  sponsor_name: string;
};

export type StaffAction = {
  assignment_id: string;
  action: StaffTransitionAction;
  new_sponsor_id?: string;      // For 'transfer' action
  keep_until_date?: string;     // For 'keep_until_date' action
};

type GetTransitionPreviewResponse = {
  success: boolean;
  error: string | null;
  data?: {
    current_owner: {
      id: string;
      name: string;
      role: ResidentRole;
    };
    affected_staff: StaffMember[];
    has_tenant: boolean;
    tenant_info?: {
      id: string;
      name: string;
    };
  };
};

type ExecuteTransitionResponse = {
  success: boolean;
  error: string | null;
  stats?: {
    staff_removed: number;
    staff_transferred: number;
    staff_extended: number;
  };
};

/**
 * Get a preview of what will happen during a property transition
 *
 * This helps the user understand who will be affected before executing
 * the transition.
 */
export async function getTransitionPreview(
  houseId: string,
  transitionType: TransitionType
): Promise<GetTransitionPreviewResponse> {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }

  // Get current house assignments
  const { data: assignments, error: fetchError } = await supabase
    .from('resident_houses')
    .select(`
      id,
      resident_id,
      resident_role,
      is_live_in,
      sponsor_resident_id,
      residents!inner(
        id,
        first_name,
        last_name
      )
    `)
    .eq('house_id', houseId)
    .eq('is_active', true);

  if (fetchError) {
    console.error('[getTransitionPreview] Error:', fetchError);
    return { success: false, error: 'Failed to fetch house assignments' };
  }

  if (!assignments || assignments.length === 0) {
    return { success: false, error: 'No active residents found at this property' };
  }

  // Find the current owner based on transition type
  let ownerRoles: ResidentRole[];
  switch (transitionType) {
    case 'developer_to_owner':
      ownerRoles = ['developer'];
      break;
    case 'landlord_to_tenant':
    case 'owner_move_in':
      ownerRoles = ['non_resident_landlord'];
      break;
    case 'owner_move_out':
      ownerRoles = ['resident_landlord'];
      break;
    case 'tenant_turnover':
      ownerRoles = ['tenant'];
      break;
    default:
      return { success: false, error: 'Invalid transition type' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ownerAssignment = assignments.find((a: any) =>
    ownerRoles.includes(a.resident_role as ResidentRole)
  );

  if (!ownerAssignment) {
    const roleLabels = ownerRoles.map(r => RESIDENT_ROLE_LABELS[r]).join(' or ');
    return {
      success: false,
      error: `No ${roleLabels} found at this property for ${transitionType} transition`
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ownerResident = (ownerAssignment as any).residents;

  // Get staff (caretaker, contractor, domestic_staff) sponsored by the owner
  const sponsorRoles: ResidentRole[] = ['domestic_staff', 'caretaker', 'contractor'];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const affectedStaff = assignments.filter((a: any) =>
    sponsorRoles.includes(a.resident_role as ResidentRole) &&
    a.sponsor_resident_id === ownerAssignment.resident_id
  );

  // Get sponsor names for the affected staff
  const sponsorIds = [...new Set(affectedStaff.map((s: { sponsor_resident_id: string | null }) => s.sponsor_resident_id).filter(Boolean))];
  const { data: sponsors } = await supabase
    .from('residents')
    .select('id, first_name, last_name')
    .in('id', sponsorIds);

  const sponsorMap = new Map(
    (sponsors || []).map(s => [s.id, `${s.first_name} ${s.last_name}`])
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const staffMembers: StaffMember[] = affectedStaff.map((a: any) => ({
    assignment_id: a.id,
    resident_id: a.resident_id,
    first_name: a.residents?.first_name || '',
    last_name: a.residents?.last_name || '',
    resident_role: a.resident_role as ResidentRole,
    is_live_in: a.is_live_in ?? false,
    sponsor_name: sponsorMap.get(a.sponsor_resident_id) || 'Unknown',
  }));

  // Check if there's a tenant
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantAssignment = assignments.find((a: any) => a.resident_role === 'tenant');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantResident = tenantAssignment ? (tenantAssignment as any).residents : null;

  return {
    success: true,
    error: null,
    data: {
      current_owner: {
        id: ownerAssignment.resident_id,
        name: `${ownerResident?.first_name || ''} ${ownerResident?.last_name || ''}`.trim(),
        role: ownerAssignment.resident_role as ResidentRole,
      },
      affected_staff: staffMembers,
      has_tenant: !!tenantAssignment,
      tenant_info: tenantAssignment && tenantResident ? {
        id: tenantAssignment.resident_id,
        name: `${tenantResident.first_name} ${tenantResident.last_name}`,
      } : undefined,
    },
  };
}

/**
 * Execute Developer to Owner transition
 *
 * This is used when a developer sells a property to a new owner.
 *
 * Workflow:
 * 1. Validate current developer assignment
 * 2. Process staff according to provided actions
 * 3. Deactivate developer's assignment
 * 4. Create new owner's assignment
 * 5. Record ownership history
 */
export async function executeDeveloperToOwner(
  houseId: string,
  newOwnerId: string,
  newOwnerRole: 'resident_landlord' | 'non_resident_landlord',
  staffActions: StaffAction[],
  transitionDate?: string,
  notes?: string
): Promise<ExecuteTransitionResponse> {
  const supabase = await createServerSupabaseClient();
  const adminClient = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }

  const today = transitionDate || new Date().toISOString().split('T')[0];
  const stats = { staff_removed: 0, staff_transferred: 0, staff_extended: 0 };

  // Get current developer assignment
  const { data: developerAssignment, error: devError } = await supabase
    .from('resident_houses')
    .select(`
      id,
      resident_id,
      residents!inner(first_name, last_name)
    `)
    .eq('house_id', houseId)
    .eq('resident_role', 'developer')
    .eq('is_active', true)
    .single();

  if (devError || !developerAssignment) {
    return { success: false, error: 'No active developer found at this property' };
  }

  // Verify new owner exists and is not already at this property
  const { data: newOwner, error: ownerError } = await supabase
    .from('residents')
    .select('id, first_name, last_name, entity_type')
    .eq('id', newOwnerId)
    .single();

  if (ownerError || !newOwner) {
    return { success: false, error: 'New owner not found' };
  }

  // Corporate entities cannot be resident_landlord
  if (newOwner.entity_type === 'corporate' && newOwnerRole === 'resident_landlord') {
    return { success: false, error: 'Corporate entities cannot be Resident Landlords' };
  }

  // Check if new owner already has an active assignment
  const { data: existingAssignment } = await supabase
    .from('resident_houses')
    .select('id')
    .eq('resident_id', newOwnerId)
    .eq('house_id', houseId)
    .eq('is_active', true)
    .single();

  if (existingAssignment) {
    return { success: false, error: 'New owner is already assigned to this property' };
  }

  // Process staff actions
  for (const action of staffActions) {
    const { data: staffAssignment } = await supabase
      .from('resident_houses')
      .select('id, resident_id, resident_role')
      .eq('id', action.assignment_id)
      .eq('house_id', houseId)
      .eq('is_active', true)
      .single();

    if (!staffAssignment) continue;

    switch (action.action) {
      case 'remove': {
        const { error: removeError } = await supabase
          .from('resident_houses')
          .update({
            is_active: false,
            move_out_date: today,
          })
          .eq('id', action.assignment_id);

        if (!removeError) {
          stats.staff_removed++;

          // Record history
          try {
            await adminClient.from('house_ownership_history').insert({
              house_id: houseId,
              resident_id: staffAssignment.resident_id,
              resident_role: staffAssignment.resident_role as ResidentRole,
              event_type: 'move_out',
              event_date: today,
              notes: notes || 'Removed during developer to owner transition',
              is_current: false,
              created_by: user.id,
            });
          } catch (e) {
            console.error('[executeDeveloperToOwner] History error:', e);
          }
        }
        break;
      }

      case 'transfer': {
        if (!action.new_sponsor_id) {
          return { success: false, error: 'Transfer action requires a new sponsor ID' };
        }

        const { error: transferError } = await supabase
          .from('resident_houses')
          .update({
            sponsor_resident_id: action.new_sponsor_id,
          })
          .eq('id', action.assignment_id);

        if (!transferError) {
          stats.staff_transferred++;
        }
        break;
      }

      case 'keep_until_date': {
        // Add an expiration tag
        const expirationDate = action.keep_until_date || today;
        const { error: extendError } = await supabase
          .from('resident_houses')
          .update({
            tags: [`expires_${expirationDate}`],
            // Transfer to new owner as sponsor
            sponsor_resident_id: newOwnerId,
          })
          .eq('id', action.assignment_id);

        if (!extendError) {
          stats.staff_extended++;
        }
        break;
      }
    }
  }

  // Deactivate developer assignment
  const { error: deactivateError } = await supabase
    .from('resident_houses')
    .update({
      is_active: false,
      move_out_date: today,
    })
    .eq('id', developerAssignment.id);

  if (deactivateError) {
    console.error('[executeDeveloperToOwner] Error deactivating developer:', deactivateError);
    return { success: false, error: 'Failed to deactivate developer assignment' };
  }

  // Create new owner assignment
  const { error: createError } = await supabase
    .from('resident_houses')
    .insert({
      resident_id: newOwnerId,
      house_id: houseId,
      resident_role: newOwnerRole,
      move_in_date: today,
      is_active: true,
      is_primary: newOwnerRole === 'resident_landlord',
      created_by: user.id,
    });

  if (createError) {
    console.error('[executeDeveloperToOwner] Error creating owner assignment:', createError);
    // Rollback developer deactivation
    await supabase
      .from('resident_houses')
      .update({ is_active: true, move_out_date: null })
      .eq('id', developerAssignment.id);
    return { success: false, error: 'Failed to create new owner assignment' };
  }

  // Update house occupancy
  await supabase
    .from('houses')
    .update({ is_occupied: newOwnerRole === 'resident_landlord' })
    .eq('id', houseId);

  // Record ownership history
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const devResident = (developerAssignment as any).residents;
  try {
    // Developer ownership end
    await adminClient.from('house_ownership_history').insert({
      house_id: houseId,
      resident_id: developerAssignment.resident_id,
      resident_role: 'developer',
      event_type: 'ownership_end',
      event_date: today,
      notes: `Property sold to ${newOwner.first_name} ${newOwner.last_name}. ${notes || ''}`.trim(),
      is_current: false,
      created_by: user.id,
    });

    // Clear existing current ownership flags
    await adminClient
      .from('house_ownership_history')
      .update({ is_current: false })
      .eq('house_id', houseId)
      .eq('is_current', true);

    // New owner acquisition
    await adminClient.from('house_ownership_history').insert({
      house_id: houseId,
      resident_id: newOwnerId,
      resident_role: newOwnerRole,
      event_type: 'ownership_transfer',
      event_date: today,
      notes: `Acquired from developer ${devResident?.first_name || ''} ${devResident?.last_name || ''}. ${notes || ''}`.trim(),
      is_current: true,
      created_by: user.id,
    });
  } catch (historyError) {
    console.error('[executeDeveloperToOwner] History error:', historyError);
  }

  // Revalidate paths
  revalidatePath('/houses');
  revalidatePath(`/houses/${houseId}`);
  revalidatePath('/residents');
  revalidatePath(`/residents/${developerAssignment.resident_id}`);
  revalidatePath(`/residents/${newOwnerId}`);

  return {
    success: true,
    error: null,
    stats,
  };
}

/**
 * Execute Landlord to Tenant transition (lease)
 *
 * This is used when a non-resident landlord leases a property to a tenant.
 *
 * Workflow:
 * 1. Validate landlord assignment
 * 2. Process staff (caretakers typically removed, some may transfer to tenant)
 * 3. Create tenant assignment
 * 4. Record history
 */
export async function executeLandlordToTenant(
  houseId: string,
  tenantId: string,
  staffActions: StaffAction[],
  leaseStartDate?: string,
  notes?: string
): Promise<ExecuteTransitionResponse> {
  const supabase = await createServerSupabaseClient();
  const adminClient = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }

  const today = leaseStartDate || new Date().toISOString().split('T')[0];
  const stats = { staff_removed: 0, staff_transferred: 0, staff_extended: 0 };

  // Verify landlord exists at this property
  const { data: landlordAssignment, error: landlordError } = await supabase
    .from('resident_houses')
    .select('id, resident_id')
    .eq('house_id', houseId)
    .eq('resident_role', 'non_resident_landlord')
    .eq('is_active', true)
    .single();

  if (landlordError || !landlordAssignment) {
    return { success: false, error: 'No active Non-Resident Landlord found at this property' };
  }

  // Verify tenant exists
  const { data: tenant, error: tenantError } = await supabase
    .from('residents')
    .select('id, first_name, last_name, entity_type')
    .eq('id', tenantId)
    .single();

  if (tenantError || !tenant) {
    return { success: false, error: 'Tenant not found' };
  }

  // Corporate entities cannot be tenants
  if (tenant.entity_type === 'corporate') {
    return { success: false, error: 'Corporate entities cannot be tenants' };
  }

  // Check if tenant already has an active assignment
  const { data: existingAssignment } = await supabase
    .from('resident_houses')
    .select('id')
    .eq('resident_id', tenantId)
    .eq('house_id', houseId)
    .eq('is_active', true)
    .single();

  if (existingAssignment) {
    return { success: false, error: 'This resident is already assigned to this property' };
  }

  // Check if there's already a tenant
  const { data: existingTenant } = await supabase
    .from('resident_houses')
    .select('id')
    .eq('house_id', houseId)
    .eq('resident_role', 'tenant')
    .eq('is_active', true)
    .single();

  if (existingTenant) {
    return { success: false, error: 'This property already has a tenant. Remove existing tenant first.' };
  }

  // Process staff actions
  for (const action of staffActions) {
    const { data: staffAssignment } = await supabase
      .from('resident_houses')
      .select('id, resident_id, resident_role')
      .eq('id', action.assignment_id)
      .eq('house_id', houseId)
      .eq('is_active', true)
      .single();

    if (!staffAssignment) continue;

    switch (action.action) {
      case 'remove': {
        const { error: removeError } = await supabase
          .from('resident_houses')
          .update({
            is_active: false,
            move_out_date: today,
          })
          .eq('id', action.assignment_id);

        if (!removeError) {
          stats.staff_removed++;

          try {
            await adminClient.from('house_ownership_history').insert({
              house_id: houseId,
              resident_id: staffAssignment.resident_id,
              resident_role: staffAssignment.resident_role as ResidentRole,
              event_type: 'move_out',
              event_date: today,
              notes: notes || 'Removed during lease transition',
              is_current: false,
              created_by: user.id,
            });
          } catch (e) {
            console.error('[executeLandlordToTenant] History error:', e);
          }
        }
        break;
      }

      case 'transfer': {
        // Transfer to new tenant as sponsor
        const { error: transferError } = await supabase
          .from('resident_houses')
          .update({
            sponsor_resident_id: tenantId,
          })
          .eq('id', action.assignment_id);

        if (!transferError) {
          stats.staff_transferred++;
        }
        break;
      }

      case 'keep_until_date': {
        const expirationDate = action.keep_until_date || today;
        const { error: extendError } = await supabase
          .from('resident_houses')
          .update({
            tags: [`expires_${expirationDate}`],
            sponsor_resident_id: tenantId,
          })
          .eq('id', action.assignment_id);

        if (!extendError) {
          stats.staff_extended++;
        }
        break;
      }
    }
  }

  // Create tenant assignment
  const { error: createError } = await supabase
    .from('resident_houses')
    .insert({
      resident_id: tenantId,
      house_id: houseId,
      resident_role: 'tenant',
      move_in_date: today,
      is_active: true,
      is_primary: true,
      created_by: user.id,
    });

  if (createError) {
    console.error('[executeLandlordToTenant] Error creating tenant assignment:', createError);
    return { success: false, error: 'Failed to create tenant assignment' };
  }

  // Update house occupancy
  await supabase
    .from('houses')
    .update({ is_occupied: true })
    .eq('id', houseId);

  // Record history
  try {
    await adminClient.from('house_ownership_history').insert({
      house_id: houseId,
      resident_id: tenantId,
      resident_role: 'tenant',
      event_type: 'move_in',
      event_date: today,
      notes: notes || 'Lease started',
      is_current: true,
      created_by: user.id,
    });
  } catch (historyError) {
    console.error('[executeLandlordToTenant] History error:', historyError);
  }

  // Revalidate paths
  revalidatePath('/houses');
  revalidatePath(`/houses/${houseId}`);
  revalidatePath('/residents');
  revalidatePath(`/residents/${tenantId}`);

  return {
    success: true,
    error: null,
    stats,
  };
}

/**
 * Get available residents for a transition
 *
 * Returns residents who can be assigned as new owner or tenant
 */
export async function getAvailableResidentsForTransition(
  houseId: string,
  targetRole: 'resident_landlord' | 'non_resident_landlord' | 'tenant'
): Promise<{ success: boolean; error: string | null; data?: Array<{ id: string; name: string; resident_code: string; entity_type: string }> }> {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }

  // Get current residents at this house to exclude them
  const { data: currentAssignments } = await supabase
    .from('resident_houses')
    .select('resident_id')
    .eq('house_id', houseId)
    .eq('is_active', true);

  const excludeIds = (currentAssignments || []).map(a => a.resident_id);

  // Base query for residents
  let query = supabase
    .from('residents')
    .select('id, first_name, last_name, resident_code, entity_type')
    .eq('account_status', 'active')
    .order('first_name');

  // Exclude current residents
  if (excludeIds.length > 0) {
    query = query.not('id', 'in', `(${excludeIds.join(',')})`);
  }

  // Corporate entities can only be non_resident_landlord
  if (targetRole === 'resident_landlord' || targetRole === 'tenant') {
    query = query.eq('entity_type', 'individual');
  }

  const { data, error } = await query;

  if (error) {
    console.error('[getAvailableResidentsForTransition] Error:', error);
    return { success: false, error: 'Failed to fetch available residents' };
  }

  const residents = (data || []).map(r => ({
    id: r.id,
    name: `${r.first_name} ${r.last_name}`,
    resident_code: r.resident_code,
    entity_type: r.entity_type,
  }));

  return { success: true, error: null, data: residents };
}
