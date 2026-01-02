'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import type {
  ImpersonationSession,
  ImpersonationSessionWithDetails,
  ResidentForImpersonation,
} from '@/types/database';

// =====================================================
// Core Impersonation Actions
// =====================================================

/**
 * Check if current user can impersonate (is super_admin or has permission)
 */
export async function canImpersonate(): Promise<{
  canImpersonate: boolean;
  requiresApproval: boolean;
  isSuperAdmin: boolean;
  impersonationEnabled: boolean;
}> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { canImpersonate: false, requiresApproval: false, isSuperAdmin: false, impersonationEnabled: false };
  }

  // Get profile with role info
  const { data: profile } = await supabase
    .from('profiles')
    .select(`
      id,
      impersonation_enabled,
      role_id,
      app_roles!inner (
        name
      )
    `)
    .eq('id', user.id)
    .single();

  if (!profile) {
    return { canImpersonate: false, requiresApproval: false, isSuperAdmin: false, impersonationEnabled: false };
  }

  const roleName = (profile.app_roles as unknown as { name: string })?.name;
  const isSuperAdmin = roleName === 'super_admin';
  const impersonationEnabled = profile.impersonation_enabled || false;

  // Super admins can always impersonate without approval
  if (isSuperAdmin) {
    return { canImpersonate: true, requiresApproval: false, isSuperAdmin: true, impersonationEnabled: true };
  }

  // Other admins need impersonation_enabled and require approval
  if (impersonationEnabled) {
    return { canImpersonate: true, requiresApproval: true, isSuperAdmin: false, impersonationEnabled: true };
  }

  return { canImpersonate: false, requiresApproval: false, isSuperAdmin: false, impersonationEnabled: false };
}

/**
 * Start an impersonation session (super admin only - no approval needed)
 */
export async function startImpersonationSession(residentId: string): Promise<{
  success: boolean;
  data?: ImpersonationSessionWithDetails;
  error?: string;
}> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Check if user can impersonate
  const impersonationCheck = await canImpersonate();

  if (!impersonationCheck.canImpersonate) {
    return { success: false, error: 'You do not have permission to impersonate residents' };
  }

  // For now, only super admins can directly start (others need approval flow)
  if (impersonationCheck.requiresApproval) {
    return { success: false, error: 'You need approval to impersonate residents. Please submit an impersonation request.' };
  }

  // Get resident details
  const { data: resident, error: residentError } = await supabase
    .from('residents')
    .select(`
      id,
      first_name,
      last_name,
      resident_code,
      resident_houses!resident_houses_resident_id_fkey (
        house:houses (
          id,
          address,
          short_name
        )
      )
    `)
    .eq('id', residentId)
    .single();

  if (residentError || !resident) {
    return { success: false, error: 'Resident not found' };
  }

  // Create impersonation session
  const { data: session, error: sessionError } = await supabase
    .from('impersonation_sessions')
    .insert({
      admin_profile_id: user.id,
      impersonated_resident_id: residentId,
      session_type: 'direct',
    })
    .select()
    .single();

  if (sessionError) {
    return { success: false, error: sessionError.message };
  }

  // Get admin profile for details
  const { data: adminProfile } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('id', user.id)
    .single();

  // Log audit event
  await logAudit({
    action: 'CREATE',
    entityType: 'impersonation_sessions',
    entityId: session.id,
    entityDisplay: `${resident.first_name} ${resident.last_name}`,
    newValues: {
      resident_id: residentId,
      resident_name: `${resident.first_name} ${resident.last_name}`,
      session_type: 'direct',
    },
  });

  // Build response with details
  const residentHouse = (resident.resident_houses as unknown as Array<{ house: { id: string; address: string; short_name: string | null } }>)?.[0]?.house;

  const sessionWithDetails: ImpersonationSessionWithDetails = {
    ...session,
    admin: {
      id: adminProfile?.id || user.id,
      full_name: adminProfile?.full_name || 'Unknown',
      email: adminProfile?.email || '',
    },
    resident: {
      id: resident.id,
      first_name: resident.first_name,
      last_name: resident.last_name,
      resident_code: resident.resident_code,
    },
    house: residentHouse ? {
      id: residentHouse.id,
      address: residentHouse.address,
      short_name: residentHouse.short_name,
    } : null,
  };

  return { success: true, data: sessionWithDetails };
}

/**
 * End an impersonation session
 */
export async function endImpersonationSession(sessionId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Get the session to verify ownership
  const { data: session, error: sessionError } = await supabase
    .from('impersonation_sessions')
    .select(`
      id,
      admin_profile_id,
      is_active,
      impersonated_resident_id,
      residents!inner (
        first_name,
        last_name
      )
    `)
    .eq('id', sessionId)
    .single();

  if (sessionError || !session) {
    return { success: false, error: 'Session not found' };
  }

  if (session.admin_profile_id !== user.id) {
    return { success: false, error: 'You can only end your own impersonation sessions' };
  }

  if (!session.is_active) {
    return { success: false, error: 'Session is already ended' };
  }

  // End the session
  const { error: updateError } = await supabase
    .from('impersonation_sessions')
    .update({
      is_active: false,
      ended_at: new Date().toISOString(),
    })
    .eq('id', sessionId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  // Log audit event
  const resident = session.residents as unknown as { first_name: string; last_name: string };
  await logAudit({
    action: 'UPDATE',
    entityType: 'impersonation_sessions',
    entityId: sessionId,
    entityDisplay: `${resident.first_name} ${resident.last_name}`,
    oldValues: { is_active: true },
    newValues: { is_active: false, ended_at: new Date().toISOString() },
  });

  return { success: true };
}

/**
 * Get the current active impersonation session for the logged-in admin
 */
export async function getActiveImpersonation(): Promise<{
  success: boolean;
  data?: ImpersonationSessionWithDetails | null;
  error?: string;
}> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { data: session, error } = await supabase
    .from('impersonation_sessions')
    .select(`
      *,
      profiles!inner (
        id,
        full_name,
        email
      ),
      residents!inner (
        id,
        first_name,
        last_name,
        resident_code,
        resident_houses!resident_houses_resident_id_fkey (
          house:houses (
            id,
            address,
            short_name
          )
        )
      )
    `)
    .eq('admin_profile_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    return { success: false, error: error.message };
  }

  if (!session) {
    return { success: true, data: null };
  }

  // Transform response
  const adminProfile = session.profiles as unknown as { id: string; full_name: string; email: string };
  const resident = session.residents as unknown as {
    id: string;
    first_name: string;
    last_name: string;
    resident_code: string;
    resident_houses: Array<{ house: { id: string; address: string; short_name: string | null } }>;
  };

  const residentHouse = resident.resident_houses?.[0]?.house;

  const sessionWithDetails: ImpersonationSessionWithDetails = {
    id: session.id,
    admin_profile_id: session.admin_profile_id,
    impersonated_resident_id: session.impersonated_resident_id,
    started_at: session.started_at,
    ended_at: session.ended_at,
    is_active: session.is_active,
    session_type: session.session_type,
    approval_request_id: session.approval_request_id,
    page_views: session.page_views || [],
    created_at: session.created_at,
    updated_at: session.updated_at,
    admin: {
      id: adminProfile.id,
      full_name: adminProfile.full_name,
      email: adminProfile.email,
    },
    resident: {
      id: resident.id,
      first_name: resident.first_name,
      last_name: resident.last_name,
      resident_code: resident.resident_code,
    },
    house: residentHouse ? {
      id: residentHouse.id,
      address: residentHouse.address,
      short_name: residentHouse.short_name,
    } : null,
  };

  return { success: true, data: sessionWithDetails };
}

/**
 * Search residents for impersonation (reuses existing search pattern)
 */
export async function searchResidentsForImpersonation(query: string): Promise<{
  success: boolean;
  data?: ResidentForImpersonation[];
  error?: string;
}> {
  // Check if user can impersonate
  const impersonationCheck = await canImpersonate();

  if (!impersonationCheck.canImpersonate) {
    return { success: false, error: 'You do not have permission to impersonate residents' };
  }

  const supabase = await createServerSupabaseClient();

  // Search by name, email, phone, or resident code
  const searchPattern = `%${query}%`;

  const { data: residents, error } = await supabase
    .from('residents')
    .select(`
      id,
      first_name,
      last_name,
      email,
      phone_primary,
      resident_code,
      avatar_url,
      portal_enabled,
      resident_houses!resident_houses_resident_id_fkey (
        house:houses (
          id,
          address,
          short_name,
          street:streets (
            name
          )
        )
      )
    `)
    .or(`first_name.ilike.${searchPattern},last_name.ilike.${searchPattern},email.ilike.${searchPattern},phone_primary.ilike.${searchPattern},resident_code.ilike.${searchPattern}`)
    .limit(20);

  if (error) {
    return { success: false, error: error.message };
  }

  // Transform results
  const transformedResidents: ResidentForImpersonation[] = (residents || []).map((r) => {
    const houseData = (r.resident_houses as unknown as Array<{
      house: {
        id: string;
        address: string;
        short_name: string | null;
        street: { name: string };
      };
    }>)?.[0]?.house;

    return {
      id: r.id,
      first_name: r.first_name,
      last_name: r.last_name,
      email: r.email,
      phone_primary: r.phone_primary,
      resident_code: r.resident_code,
      avatar_url: r.avatar_url,
      portal_enabled: r.portal_enabled || false,
      house: houseData ? {
        id: houseData.id,
        address: houseData.address,
        short_name: houseData.short_name,
        street_name: houseData.street?.name || '',
      } : null,
    };
  });

  return { success: true, data: transformedResidents };
}

/**
 * Log a page view during impersonation (for audit trail)
 */
export async function logImpersonationPageView(sessionId: string, path: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Get current session
  const { data: session, error: sessionError } = await supabase
    .from('impersonation_sessions')
    .select('id, admin_profile_id, page_views')
    .eq('id', sessionId)
    .eq('admin_profile_id', user.id)
    .eq('is_active', true)
    .single();

  if (sessionError || !session) {
    return { success: false, error: 'Active session not found' };
  }

  // Add page view
  const currentViews = (session.page_views || []) as Array<{ path: string; timestamp: string }>;
  const newViews = [...currentViews, { path, timestamp: new Date().toISOString() }];

  const { error: updateError } = await supabase
    .from('impersonation_sessions')
    .update({ page_views: newViews })
    .eq('id', sessionId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  return { success: true };
}

/**
 * Get impersonation session history (for audit logs)
 */
export async function getImpersonationHistory(params: {
  adminId?: string;
  residentId?: string;
  limit?: number;
  offset?: number;
}): Promise<{
  success: boolean;
  data?: ImpersonationSessionWithDetails[];
  total?: number;
  error?: string;
}> {
  const auth = await authorizePermission(PERMISSIONS.IMPERSONATION_VIEW_SESSIONS);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();
  const { adminId, residentId, limit = 50, offset = 0 } = params;

  let query = supabase
    .from('impersonation_sessions')
    .select(`
      *,
      profiles!inner (
        id,
        full_name,
        email
      ),
      residents!inner (
        id,
        first_name,
        last_name,
        resident_code,
        resident_houses!resident_houses_resident_id_fkey (
          house:houses (
            id,
            address,
            short_name
          )
        )
      )
    `, { count: 'exact' });

  if (adminId) {
    query = query.eq('admin_profile_id', adminId);
  }

  if (residentId) {
    query = query.eq('impersonated_resident_id', residentId);
  }

  const { data: sessions, error, count } = await query
    .order('started_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return { success: false, error: error.message };
  }

  // Transform results
  const transformedSessions: ImpersonationSessionWithDetails[] = (sessions || []).map((session) => {
    const adminProfile = session.profiles as unknown as { id: string; full_name: string; email: string };
    const resident = session.residents as unknown as {
      id: string;
      first_name: string;
      last_name: string;
      resident_code: string;
      resident_houses: Array<{ house: { id: string; address: string; short_name: string | null } }>;
    };

    const residentHouse = resident.resident_houses?.[0]?.house;

    return {
      id: session.id,
      admin_profile_id: session.admin_profile_id,
      impersonated_resident_id: session.impersonated_resident_id,
      started_at: session.started_at,
      ended_at: session.ended_at,
      is_active: session.is_active,
      session_type: session.session_type,
      approval_request_id: session.approval_request_id,
      page_views: session.page_views || [],
      created_at: session.created_at,
      updated_at: session.updated_at,
      admin: {
        id: adminProfile.id,
        full_name: adminProfile.full_name,
        email: adminProfile.email,
      },
      resident: {
        id: resident.id,
        first_name: resident.first_name,
        last_name: resident.last_name,
        resident_code: resident.resident_code,
      },
      house: residentHouse ? {
        id: residentHouse.id,
        address: residentHouse.address,
        short_name: residentHouse.short_name,
      } : null,
    };
  });

  return { success: true, data: transformedSessions, total: count || 0 };
}
