'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ResidentRole } from '@/types/database';
import { RESIDENT_ROLE_LABELS } from '@/types/database';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';

export type TransitionType =
  | 'developer_to_owner'
  | 'landlord_to_tenant'
  | 'tenant_turnover'
  | 'owner_move_in'
  | 'owner_move_out';

export type StaffTransitionAction = 'remove' | 'transfer' | 'keep_until_date';

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
  new_sponsor_id?: string;
  keep_until_date?: string;
};

type GetTransitionPreviewResponse = {
  success: boolean;
  error: string | null;
  data?: {
    current_owner: { id: string; name: string; role: ResidentRole };
    affected_staff: StaffMember[];
    has_tenant: boolean;
    tenant_info?: { id: string; name: string };
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

type AssignmentRow = {
  id: string;
  resident_id: string;
  resident_role: ResidentRole;
  is_live_in: boolean | null;
  sponsor_resident_id: string | null;
  residents: { first_name: string; last_name: string } | null;
};

export async function getTransitionPreview(
  houseId: string,
  transitionType: TransitionType
): Promise<GetTransitionPreviewResponse> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data, error } = await supabase
    .from('resident_houses')
    .select(`
      id,
      resident_id,
      resident_role,
      is_live_in,
      sponsor_resident_id,
      residents!inner(first_name, last_name)
    `)
    .eq('house_id', houseId)
    .eq('is_active', true);

  if (error) return { success: false, error: 'Failed to fetch house assignments' };
  const assignments = (data || []) as unknown as AssignmentRow[];
  if (assignments.length === 0) return { success: false, error: 'No active residents found at this property' };

  const ownerRoles: ResidentRole[] = transitionType === 'developer_to_owner'
    ? ['developer']
    : transitionType === 'landlord_to_tenant' || transitionType === 'owner_move_in'
      ? ['non_resident_landlord']
      : transitionType === 'owner_move_out'
        ? ['resident_landlord']
        : ['tenant'];
  const ownerAssignment = assignments.find((assignment) => ownerRoles.includes(assignment.resident_role));
  if (!ownerAssignment) {
    return {
      success: false,
      error: `No ${ownerRoles.map((role) => RESIDENT_ROLE_LABELS[role]).join(' or ')} found at this property for ${transitionType} transition`,
    };
  }

  const sponsorRoles: ResidentRole[] = ['domestic_staff', 'caretaker', 'contractor'];
  const affectedStaff = assignments.filter((assignment) =>
    sponsorRoles.includes(assignment.resident_role) && assignment.sponsor_resident_id === ownerAssignment.resident_id
  );
  const sponsorIds = [...new Set(affectedStaff.flatMap((assignment) => assignment.sponsor_resident_id ? [assignment.sponsor_resident_id] : []))];
  const { data: sponsors } = sponsorIds.length === 0
    ? { data: [] }
    : await supabase.from('residents').select('id, first_name, last_name').in('id', sponsorIds);
  const sponsorMap = new Map((sponsors || []).map((sponsor) => [sponsor.id, `${sponsor.first_name} ${sponsor.last_name}`]));
  const tenantAssignment = assignments.find((assignment) => assignment.resident_role === 'tenant');

  return {
    success: true,
    error: null,
    data: {
      current_owner: {
        id: ownerAssignment.resident_id,
        name: `${ownerAssignment.residents?.first_name || ''} ${ownerAssignment.residents?.last_name || ''}`.trim(),
        role: ownerAssignment.resident_role,
      },
      affected_staff: affectedStaff.map((assignment) => ({
        assignment_id: assignment.id,
        resident_id: assignment.resident_id,
        first_name: assignment.residents?.first_name || '',
        last_name: assignment.residents?.last_name || '',
        resident_role: assignment.resident_role,
        is_live_in: assignment.is_live_in ?? false,
        sponsor_name: sponsorMap.get(assignment.sponsor_resident_id || '') || 'Unknown',
      })),
      has_tenant: Boolean(tenantAssignment),
      tenant_info: tenantAssignment ? {
        id: tenantAssignment.resident_id,
        name: `${tenantAssignment.residents?.first_name || ''} ${tenantAssignment.residents?.last_name || ''}`.trim(),
      } : undefined,
    },
  };
}

async function executeTransition(
  transitionType: 'developer_to_owner' | 'landlord_to_tenant',
  houseId: string,
  targetResidentId: string,
  targetRole: 'resident_landlord' | 'non_resident_landlord' | 'tenant',
  staffActions: StaffAction[],
  requestKey: string,
  transitionDate?: string,
  notes?: string,
): Promise<ExecuteTransitionResponse> {
  const auth = await authorizePermission(PERMISSIONS.HOUSES_UPDATE);
  if (!auth.authorized) return { success: false, error: auth.error || 'Unauthorized' };
  if (!requestKey.trim()) return { success: false, error: 'A request key is required' };

  const supabase = await createServerSupabaseClient();
  const transitionDay = transitionDate || new Date().toISOString().split('T')[0];
  const { data, error } = await supabase.rpc('execute_property_transition', {
    p_request_key: requestKey,
    p_transition_type: transitionType,
    p_house_id: houseId,
    p_target_resident_id: targetResidentId,
    p_target_role: targetRole,
    p_staff_actions: staffActions,
    p_transition_date: transitionDay,
    p_notes: notes || null,
    p_created_by: auth.userId,
  });
  if (error) return { success: false, error: error.message };

  const result = data as { success?: boolean; stats?: ExecuteTransitionResponse['stats']; existing?: boolean } | null;
  if (!result?.success) return { success: false, error: 'Property transition failed' };

  if (!result.existing) await logAudit({
    action: transitionType === 'developer_to_owner' ? 'TRANSFER' : 'ASSIGN',
    entityType: 'houses',
    entityId: houseId,
    entityDisplay: `${transitionType === 'developer_to_owner' ? 'Ownership' : 'Lease'} transition for property ${houseId}`,
    newValues: {
      target_resident_id: targetResidentId,
      target_role: targetRole,
      transition_date: transitionDay,
      request_key: requestKey,
      staff_actions: result.stats,
    },
    description: notes,
  });

  revalidatePath('/houses');
  revalidatePath(`/houses/${houseId}`);
  revalidatePath('/residents');
  revalidatePath(`/residents/${targetResidentId}`);
  return { success: true, error: null, stats: result.stats };
}

export async function executeDeveloperToOwner(
  houseId: string,
  newOwnerId: string,
  newOwnerRole: 'resident_landlord' | 'non_resident_landlord',
  staffActions: StaffAction[],
  requestKey: string,
  transitionDate?: string,
  notes?: string
): Promise<ExecuteTransitionResponse> {
  return executeTransition('developer_to_owner', houseId, newOwnerId, newOwnerRole, staffActions, requestKey, transitionDate, notes);
}

export async function executeLandlordToTenant(
  houseId: string,
  tenantId: string,
  staffActions: StaffAction[],
  requestKey: string,
  leaseStartDate?: string,
  notes?: string
): Promise<ExecuteTransitionResponse> {
  return executeTransition('landlord_to_tenant', houseId, tenantId, 'tenant', staffActions, requestKey, leaseStartDate, notes);
}

export async function getAvailableResidentsForTransition(
  houseId: string,
  targetRole: 'resident_landlord' | 'non_resident_landlord' | 'tenant'
): Promise<{ success: boolean; error: string | null; data?: Array<{ id: string; name: string; resident_code: string; entity_type: string }> }> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data: currentAssignments } = await supabase
    .from('resident_houses')
    .select('resident_id')
    .eq('house_id', houseId)
    .eq('is_active', true);
  const excludeIds = (currentAssignments || []).map((assignment) => assignment.resident_id);
  let query = supabase.from('residents').select('id, first_name, last_name, resident_code, entity_type').order('first_name');
  if (excludeIds.length > 0) query = query.not('id', 'in', `(${excludeIds.join(',')})`);
  if (targetRole === 'resident_landlord') query = query.eq('entity_type', 'individual');

  const { data, error } = await query;
  if (error) return { success: false, error: 'Failed to fetch available residents' };
  return {
    success: true,
    error: null,
    data: (data || []).map((resident) => ({
      id: resident.id,
      name: `${resident.first_name} ${resident.last_name}`,
      resident_code: resident.resident_code,
      entity_type: resident.entity_type,
    })),
  };
}
