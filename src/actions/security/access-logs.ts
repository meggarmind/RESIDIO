'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { AccessLog, AccessLogWithDetails } from '@/types/database';
import type { CheckInData, CheckOutData, FlagAccessData, AccessLogsFilters } from '@/lib/validators/security-contact';
import { hasSecurityPermission } from './settings';
import { logAudit } from '@/lib/audit/logger';

export interface AccessLogResponse {
  data: AccessLog | null;
  error: string | null;
}

export interface AccessLogsResponse {
  data: AccessLogWithDetails[];
  count: number;
  error: string | null;
}

/**
 * Records a check-in event at the gate
 */
export async function recordCheckIn(data: CheckInData): Promise<AccessLogResponse> {
  const supabase = await createServerSupabaseClient();

  // Check permission
  const canRecord = await hasSecurityPermission('record_checkin');
  if (!canRecord) {
    return { data: null, error: 'Permission denied: Cannot record check-ins' };
  }

  // Get current user (security officer)
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { data: null, error: 'Unauthorized' };
  }

  // Verify contact exists and get resident_id
  const { data: contact, error: contactError } = await supabase
    .from('security_contacts')
    .select('id, full_name, resident_id, status, resident:residents(first_name, last_name)')
    .eq('id', data.contact_id)
    .single();

  if (contactError || !contact) {
    return { data: null, error: 'Security contact not found' };
  }

  if (contact.status !== 'active') {
    return { data: null, error: `Contact is ${contact.status}. Cannot record check-in.` };
  }

  // If access_code_id provided, verify it's valid
  if (data.access_code_id) {
    const { data: accessCode, error: codeError } = await supabase
      .from('access_codes')
      .select('id, is_active, valid_from, valid_until, max_uses, current_uses')
      .eq('id', data.access_code_id)
      .single();

    if (codeError || !accessCode) {
      return { data: null, error: 'Access code not found' };
    }

    if (!accessCode.is_active) {
      return { data: null, error: 'Access code is not active' };
    }

    const now = new Date();
    if (accessCode.valid_until && new Date(accessCode.valid_until) < now) {
      return { data: null, error: 'Access code has expired' };
    }

    if (accessCode.max_uses !== null && accessCode.current_uses >= accessCode.max_uses) {
      return { data: null, error: 'Access code has reached maximum uses' };
    }
  }

  // Create access log entry
  const { data: accessLog, error: createError } = await supabase
    .from('access_logs')
    .insert({
      access_code_id: data.access_code_id || null,
      contact_id: data.contact_id,
      resident_id: contact.resident_id,
      check_in_time: new Date().toISOString(),
      verified_by: user.id,
      gate_location: data.gate_location || null,
      notes: data.notes || null,
      flagged: false,
    })
    .select()
    .single();

  if (createError) {
    console.error('Record check-in error:', createError);
    return { data: null, error: 'Failed to record check-in' };
  }

  // The access_codes.current_uses is auto-incremented by trigger

  // Audit log
  const residentData = contact.resident as unknown as { first_name: string; last_name: string } | null;
  await logAudit({
    action: 'CREATE',
    entityType: 'access_logs',
    entityId: accessLog.id,
    entityDisplay: `Check-in: ${contact.full_name} (for ${residentData?.first_name || ''} ${residentData?.last_name || ''})`,
    newValues: {
      contact_name: contact.full_name,
      gate_location: data.gate_location,
      check_in_time: accessLog.check_in_time,
    },
  });

  revalidatePath('/security');
  revalidatePath('/security/logs');
  revalidatePath('/security/verify');

  return { data: accessLog, error: null };
}

/**
 * Records a check-out event
 */
export async function recordCheckOut(data: CheckOutData): Promise<AccessLogResponse> {
  const supabase = await createServerSupabaseClient();

  // Check permission
  const canRecord = await hasSecurityPermission('record_checkin');
  if (!canRecord) {
    return { data: null, error: 'Permission denied' };
  }

  // Get existing log
  const { data: existingLog, error: fetchError } = await supabase
    .from('access_logs')
    .select('*, contact:security_contacts(full_name)')
    .eq('id', data.log_id)
    .single();

  if (fetchError || !existingLog) {
    return { data: null, error: 'Access log not found' };
  }

  if (existingLog.check_out_time) {
    return { data: null, error: 'Check-out already recorded' };
  }

  // Update with check-out time
  const { data: accessLog, error: updateError } = await supabase
    .from('access_logs')
    .update({
      check_out_time: new Date().toISOString(),
      notes: data.notes ? `${existingLog.notes || ''}\n[Check-out] ${data.notes}`.trim() : existingLog.notes,
    })
    .eq('id', data.log_id)
    .select()
    .single();

  if (updateError) {
    console.error('Record check-out error:', updateError);
    return { data: null, error: 'Failed to record check-out' };
  }

  // Audit log
  const contactData = existingLog.contact as unknown as { full_name: string } | null;
  await logAudit({
    action: 'UPDATE',
    entityType: 'access_logs',
    entityId: accessLog.id,
    entityDisplay: `Check-out: ${contactData?.full_name || 'Unknown'}`,
    oldValues: { check_out_time: null },
    newValues: { check_out_time: accessLog.check_out_time },
  });

  revalidatePath('/security');
  revalidatePath('/security/logs');

  return { data: accessLog, error: null };
}

/**
 * Flags an access log entry for suspicious activity
 */
export async function flagAccess(data: FlagAccessData): Promise<AccessLogResponse> {
  const supabase = await createServerSupabaseClient();

  // Check permission - only admin/chairman can flag
  const canFlag = await hasSecurityPermission('view_access_logs');
  if (!canFlag) {
    return { data: null, error: 'Permission denied' };
  }

  // Get existing log
  const { data: existingLog, error: fetchError } = await supabase
    .from('access_logs')
    .select('*, contact:security_contacts(full_name)')
    .eq('id', data.log_id)
    .single();

  if (fetchError || !existingLog) {
    return { data: null, error: 'Access log not found' };
  }

  // Update with flag
  const { data: accessLog, error: updateError } = await supabase
    .from('access_logs')
    .update({
      flagged: true,
      flag_reason: data.flag_reason,
    })
    .eq('id', data.log_id)
    .select()
    .single();

  if (updateError) {
    console.error('Flag access error:', updateError);
    return { data: null, error: 'Failed to flag access' };
  }

  // Audit log
  const contactData = existingLog.contact as unknown as { full_name: string } | null;
  await logAudit({
    action: 'UPDATE',
    entityType: 'access_logs',
    entityId: accessLog.id,
    entityDisplay: `Flagged: ${contactData?.full_name || 'Unknown'}`,
    oldValues: { flagged: false },
    newValues: { flagged: true, flag_reason: data.flag_reason },
  });

  revalidatePath('/security');
  revalidatePath('/security/logs');

  return { data: accessLog, error: null };
}

/**
 * Removes a flag from an access log entry
 */
export async function unflagAccess(logId: string): Promise<AccessLogResponse> {
  const supabase = await createServerSupabaseClient();

  // Check permission - only admin/chairman can unflag
  const canUnflag = await hasSecurityPermission('view_access_logs');
  if (!canUnflag) {
    return { data: null, error: 'Permission denied' };
  }

  const { data: accessLog, error: updateError } = await supabase
    .from('access_logs')
    .update({
      flagged: false,
      flag_reason: null,
    })
    .eq('id', logId)
    .select()
    .single();

  if (updateError) {
    console.error('Unflag access error:', updateError);
    return { data: null, error: 'Failed to unflag access' };
  }

  revalidatePath('/security');
  revalidatePath('/security/logs');

  return { data: accessLog, error: null };
}

/**
 * Gets access logs with pagination and filters
 */
export async function getAccessLogs(filters: AccessLogsFilters = {}): Promise<AccessLogsResponse> {
  const supabase = await createServerSupabaseClient();

  // Check permission
  const canView = await hasSecurityPermission('view_access_logs');
  if (!canView) {
    return { data: [], count: 0, error: 'Permission denied' };
  }

  const {
    contact_id,
    resident_id,
    date_from,
    date_to,
    flagged_only,
    gate_location,
    page = 1,
    limit = 20,
  } = filters;

  let query = supabase
    .from('access_logs')
    .select(
      `
      *,
      contact:security_contacts(
        id, full_name, phone_primary, status,
        category:security_contact_categories(id, name)
      ),
      resident:residents(id, first_name, last_name, resident_code),
      access_code:access_codes(id, code, code_type),
      verified_by_profile:profiles!access_logs_verified_by_fkey(id, full_name)
    `,
      { count: 'exact' }
    );

  // Apply filters
  if (contact_id) {
    query = query.eq('contact_id', contact_id);
  }

  if (resident_id) {
    query = query.eq('resident_id', resident_id);
  }

  if (date_from) {
    query = query.gte('check_in_time', date_from);
  }

  if (date_to) {
    query = query.lte('check_in_time', date_to);
  }

  if (flagged_only) {
    query = query.eq('flagged', true);
  }

  if (gate_location) {
    query = query.eq('gate_location', gate_location);
  }

  // Pagination
  const offset = (page - 1) * limit;
  query = query.range(offset, offset + limit - 1).order('check_in_time', { ascending: false });

  const { data, count, error } = await query;

  if (error) {
    console.error('Get access logs error:', error);
    return { data: [], count: 0, error: 'Failed to fetch access logs' };
  }

  return {
    data: (data || []) as unknown as AccessLogWithDetails[],
    count: count || 0,
    error: null,
  };
}

/**
 * Gets access history for a specific contact
 */
export async function getContactAccessHistory(
  contactId: string,
  limit: number = 50
): Promise<AccessLogsResponse> {
  return getAccessLogs({ contact_id: contactId, limit });
}

/**
 * Gets today's access logs (for dashboard)
 */
export async function getTodayAccessLogs(): Promise<AccessLogsResponse> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return getAccessLogs({
    date_from: today.toISOString(),
    limit: 100,
  });
}

/**
 * Gets flagged access logs (for review)
 */
export async function getFlaggedAccessLogs(): Promise<AccessLogsResponse> {
  return getAccessLogs({ flagged_only: true, limit: 100 });
}

/**
 * Gets access log statistics for dashboard
 */
export async function getAccessLogStats(): Promise<{
  today: number;
  thisWeek: number;
  flagged: number;
  error: string | null;
}> {
  const supabase = await createServerSupabaseClient();

  // Check permission
  const canView = await hasSecurityPermission('view_access_logs');
  if (!canView) {
    return { today: 0, thisWeek: 0, flagged: 0, error: 'Permission denied' };
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);

  // Count today's entries
  const { count: todayCount } = await supabase
    .from('access_logs')
    .select('*', { count: 'exact', head: true })
    .gte('check_in_time', todayStart.toISOString());

  // Count this week's entries
  const { count: weekCount } = await supabase
    .from('access_logs')
    .select('*', { count: 'exact', head: true })
    .gte('check_in_time', weekStart.toISOString());

  // Count flagged entries
  const { count: flaggedCount } = await supabase
    .from('access_logs')
    .select('*', { count: 'exact', head: true })
    .eq('flagged', true);

  return {
    today: todayCount || 0,
    thisWeek: weekCount || 0,
    flagged: flaggedCount || 0,
    error: null,
  };
}
