'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type {
  VisitorAnalytics,
  FrequentVisitor,
  VisitorHistorySummary,
  SecurityContact,
} from '@/types/database';
import type {
  VisitorAnalyticsFilters,
  UpdateRecurringScheduleData,
} from '@/lib/validators/security-contact';
import { hasSecurityPermission } from './settings';
import { logAudit } from '@/lib/audit/logger';
import { getChangedValues } from '@/lib/audit/helpers';
import { revalidatePath } from 'next/cache';

type AnalyticsResponse = {
  data: VisitorAnalytics[];
  count: number;
  error: string | null;
};

type FrequentVisitorsResponse = {
  data: FrequentVisitor[];
  error: string | null;
};

type HistorySummaryResponse = {
  data: VisitorHistorySummary | null;
  error: string | null;
};

/**
 * Gets visitor analytics from the visitor_analytics view
 */
export async function getVisitorAnalytics(
  filters: VisitorAnalyticsFilters = {}
): Promise<AnalyticsResponse> {
  const supabase = await createServerSupabaseClient();

  // Check permission
  const canView = await hasSecurityPermission('view_access_logs');
  if (!canView) {
    return { data: [], count: 0, error: 'Permission denied' };
  }

  const {
    resident_id,
    category_id,
    is_recurring,
    is_frequent_visitor,
    page = 1,
    limit = 20,
  } = filters;

  let query = supabase
    .from('visitor_analytics')
    .select('*', { count: 'exact' });

  // Apply filters
  if (resident_id) {
    query = query.eq('resident_id', resident_id);
  }

  if (category_id) {
    query = query.eq('category_id', category_id);
  }

  if (is_recurring !== undefined) {
    query = query.eq('is_recurring', is_recurring);
  }

  if (is_frequent_visitor !== undefined) {
    query = query.eq('is_frequent_visitor', is_frequent_visitor);
  }

  // Pagination
  const offset = (page - 1) * limit;
  query = query.range(offset, offset + limit - 1).order('visit_count', { ascending: false });

  const { data, count, error } = await query;

  if (error) {
    console.error('Get visitor analytics error:', error);
    return { data: [], count: 0, error: 'Failed to fetch analytics' };
  }

  return {
    data: (data || []) as VisitorAnalytics[],
    count: count || 0,
    error: null,
  };
}

/**
 * Gets frequent visitors using the database function
 */
export async function getFrequentVisitors(
  minVisits: number = 5,
  days: number = 30,
  limit: number = 20
): Promise<FrequentVisitorsResponse> {
  const supabase = await createServerSupabaseClient();

  // Check permission
  const canView = await hasSecurityPermission('view_access_logs');
  if (!canView) {
    return { data: [], error: 'Permission denied' };
  }

  const { data, error } = await supabase.rpc('get_frequent_visitors', {
    p_min_visits: minVisits,
    p_days: days,
    p_limit: limit,
  });

  if (error) {
    console.error('Get frequent visitors error:', error);
    return { data: [], error: 'Failed to fetch frequent visitors' };
  }

  return { data: (data || []) as FrequentVisitor[], error: null };
}

/**
 * Gets visitor history summary for a specific contact
 */
export async function getVisitorHistorySummary(
  contactId: string,
  days: number = 90
): Promise<HistorySummaryResponse> {
  const supabase = await createServerSupabaseClient();

  // Check permission
  const canView = await hasSecurityPermission('view_access_logs');
  if (!canView) {
    return { data: null, error: 'Permission denied' };
  }

  const { data, error } = await supabase.rpc('get_visitor_history_summary', {
    p_contact_id: contactId,
    p_days: days,
  });

  if (error) {
    console.error('Get visitor history summary error:', error);
    return { data: null, error: 'Failed to fetch history summary' };
  }

  // The RPC returns an array with one row
  const summary = Array.isArray(data) && data.length > 0 ? data[0] : data;

  return { data: summary as VisitorHistorySummary, error: null };
}

/**
 * Updates the recurring schedule for a security contact
 */
export async function updateRecurringSchedule(
  data: UpdateRecurringScheduleData
): Promise<{ data: SecurityContact | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  // Check permission
  const canUpdate = await hasSecurityPermission('update_contacts');
  if (!canUpdate) {
    return { data: null, error: 'Permission denied: Cannot update recurring schedule' };
  }

  const { contact_id, ...scheduleData } = data;

  // Get existing contact for audit
  const { data: existingContact, error: fetchError } = await supabase
    .from('security_contacts')
    .select('*, category:security_contact_categories(name), resident:residents(first_name, last_name)')
    .eq('id', contact_id)
    .single();

  if (fetchError || !existingContact) {
    return { data: null, error: 'Security contact not found' };
  }

  // Update the schedule fields
  const { data: contact, error: updateError } = await supabase
    .from('security_contacts')
    .update({
      is_recurring: scheduleData.is_recurring,
      recurrence_pattern: scheduleData.is_recurring ? scheduleData.recurrence_pattern : null,
      recurrence_days: scheduleData.is_recurring ? scheduleData.recurrence_days : null,
      recurrence_start_date: scheduleData.is_recurring ? scheduleData.recurrence_start_date : null,
      recurrence_end_date: scheduleData.is_recurring ? scheduleData.recurrence_end_date : null,
      expected_arrival_time: scheduleData.expected_arrival_time || null,
      expected_departure_time: scheduleData.expected_departure_time || null,
      purpose: scheduleData.purpose || null,
    })
    .eq('id', contact_id)
    .select()
    .single();

  if (updateError) {
    console.error('Update recurring schedule error:', updateError);
    return { data: null, error: 'Failed to update recurring schedule' };
  }

  // Audit log
  const changes = getChangedValues(existingContact, contact);
  if (Object.keys(changes.new).length > 0) {
    const categoryData = existingContact.category as { name: string } | null;
    const residentData = existingContact.resident as { first_name: string; last_name: string } | null;
    await logAudit({
      action: 'UPDATE',
      entityType: 'security_contacts',
      entityId: contact.id,
      entityDisplay: `${contact.full_name} (${categoryData?.name || 'Unknown'} for ${residentData?.first_name || ''} ${residentData?.last_name || ''})`,
      oldValues: changes.old,
      newValues: changes.new,
      description: scheduleData.is_recurring
        ? `Set as recurring visitor (${scheduleData.recurrence_pattern})`
        : 'Removed recurring schedule',
    });
  }

  revalidatePath('/security');
  revalidatePath('/security/contacts');
  revalidatePath(`/security/contacts/${contact_id}`);

  return { data: contact, error: null };
}

/**
 * Gets statistics for the security dashboard
 */
export async function getVisitorDashboardStats(): Promise<{
  data: {
    totalActiveContacts: number;
    recurringVisitors: number;
    frequentVisitors: number;
    todayVisits: number;
    weeklyVisits: number;
    monthlyVisits: number;
    averageDurationMinutes: number | null;
    vehiclesRegistered: number;
  } | null;
  error: string | null;
}> {
  const supabase = await createServerSupabaseClient();

  // Check permission
  const canView = await hasSecurityPermission('view_access_logs');
  if (!canView) {
    return { data: null, error: 'Permission denied' };
  }

  try {
    // Run all queries in parallel
    const [
      activeContactsResult,
      recurringResult,
      frequentResult,
      todayVisitsResult,
      weeklyVisitsResult,
      monthlyVisitsResult,
      avgDurationResult,
      vehiclesResult,
    ] = await Promise.all([
      // Total active contacts
      supabase
        .from('security_contacts')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active'),
      // Recurring visitors
      supabase
        .from('security_contacts')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
        .eq('is_recurring', true),
      // Frequent visitors
      supabase
        .from('security_contacts')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
        .eq('is_frequent_visitor', true),
      // Today's visits
      supabase
        .from('access_logs')
        .select('*', { count: 'exact', head: true })
        .gte('check_in_time', new Date().toISOString().split('T')[0]),
      // Weekly visits (last 7 days)
      supabase
        .from('access_logs')
        .select('*', { count: 'exact', head: true })
        .gte('check_in_time', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
      // Monthly visits (last 30 days)
      supabase
        .from('access_logs')
        .select('*', { count: 'exact', head: true })
        .gte('check_in_time', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
      // Average duration (from completed visits in last 30 days)
      supabase
        .from('access_logs')
        .select('actual_duration_minutes')
        .not('actual_duration_minutes', 'is', null)
        .gte('check_in_time', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
      // Registered vehicles
      supabase
        .from('visitor_vehicles')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true),
    ]);

    // Calculate average duration
    let averageDurationMinutes: number | null = null;
    if (avgDurationResult.data && avgDurationResult.data.length > 0) {
      const durations = avgDurationResult.data
        .map((d) => d.actual_duration_minutes)
        .filter((d): d is number => d !== null);
      if (durations.length > 0) {
        averageDurationMinutes = Math.round(
          durations.reduce((sum, d) => sum + d, 0) / durations.length
        );
      }
    }

    return {
      data: {
        totalActiveContacts: activeContactsResult.count || 0,
        recurringVisitors: recurringResult.count || 0,
        frequentVisitors: frequentResult.count || 0,
        todayVisits: todayVisitsResult.count || 0,
        weeklyVisits: weeklyVisitsResult.count || 0,
        monthlyVisits: monthlyVisitsResult.count || 0,
        averageDurationMinutes,
        vehiclesRegistered: vehiclesResult.count || 0,
      },
      error: null,
    };
  } catch (err) {
    console.error('Get dashboard stats error:', err);
    return { data: null, error: 'Failed to fetch dashboard statistics' };
  }
}

/**
 * Gets the visit history for a contact with pagination
 */
export async function getContactVisitHistory(
  contactId: string,
  page: number = 1,
  limit: number = 20
): Promise<{
  data: Array<{
    id: string;
    check_in_time: string;
    check_out_time: string | null;
    gate_location: string | null;
    actual_duration_minutes: number | null;
    entry_method: string | null;
    flagged: boolean;
    vehicle?: {
      plate_number: string;
      vehicle_type: string;
    } | null;
  }>;
  count: number;
  error: string | null;
}> {
  const supabase = await createServerSupabaseClient();

  const canView = await hasSecurityPermission('view_access_logs');
  if (!canView) {
    return { data: [], count: 0, error: 'Permission denied' };
  }

  const offset = (page - 1) * limit;

  const { data, count, error } = await supabase
    .from('access_logs')
    .select(
      `
      id,
      check_in_time,
      check_out_time,
      gate_location,
      actual_duration_minutes,
      entry_method,
      flagged,
      vehicle:visitor_vehicles(plate_number, vehicle_type)
    `,
      { count: 'exact' }
    )
    .eq('contact_id', contactId)
    .order('check_in_time', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('Get contact visit history error:', error);
    return { data: [], count: 0, error: 'Failed to fetch visit history' };
  }

  return {
    data: (data || []).map((d) => ({
      ...d,
      vehicle: Array.isArray(d.vehicle) ? d.vehicle[0] || null : d.vehicle,
    })),
    count: count || 0,
    error: null,
  };
}

/**
 * Gets recurring visitors whose expected visit is today
 */
export async function getTodayExpectedRecurringVisitors(): Promise<{
  data: Array<{
    id: string;
    full_name: string;
    phone_primary: string;
    photo_url: string | null;
    expected_arrival_time: string | null;
    expected_departure_time: string | null;
    purpose: string | null;
    resident: {
      first_name: string;
      last_name: string;
      resident_code: string;
    };
  }>;
  error: string | null;
}> {
  const supabase = await createServerSupabaseClient();

  const canView = await hasSecurityPermission('view_contacts');
  if (!canView) {
    return { data: [], error: 'Permission denied' };
  }

  // Get current day of week (lowercase)
  const daysMap: Record<number, string> = {
    0: 'sunday',
    1: 'monday',
    2: 'tuesday',
    3: 'wednesday',
    4: 'thursday',
    5: 'friday',
    6: 'saturday',
  };
  const today = daysMap[new Date().getDay()];
  const todayDate = new Date().toISOString().split('T')[0];

  // Query recurring visitors
  const { data, error } = await supabase
    .from('security_contacts')
    .select(`
      id,
      full_name,
      phone_primary,
      photo_url,
      expected_arrival_time,
      expected_departure_time,
      purpose,
      recurrence_pattern,
      recurrence_days,
      recurrence_start_date,
      recurrence_end_date,
      resident:residents(first_name, last_name, resident_code)
    `)
    .eq('status', 'active')
    .eq('is_recurring', true);

  if (error) {
    console.error('Get today expected visitors error:', error);
    return { data: [], error: 'Failed to fetch expected visitors' };
  }

  // Filter visitors based on their schedule
  const expectedVisitors = (data || []).filter((contact) => {
    // Check date range
    if (contact.recurrence_start_date && new Date(contact.recurrence_start_date) > new Date(todayDate)) {
      return false;
    }
    if (contact.recurrence_end_date && new Date(contact.recurrence_end_date) < new Date(todayDate)) {
      return false;
    }

    // Check pattern
    switch (contact.recurrence_pattern) {
      case 'daily':
        return true;
      case 'weekly':
      case 'biweekly':
        return contact.recurrence_days?.includes(today);
      case 'monthly':
        // For monthly, we'd need to check the day of month
        // Simplified: assume monthly is on the same day as start date
        if (contact.recurrence_start_date) {
          const startDay = new Date(contact.recurrence_start_date).getDate();
          return new Date().getDate() === startDay;
        }
        return false;
      default:
        return false;
    }
  });

  return {
    data: expectedVisitors.map((v) => ({
      id: v.id,
      full_name: v.full_name,
      phone_primary: v.phone_primary,
      photo_url: v.photo_url,
      expected_arrival_time: v.expected_arrival_time,
      expected_departure_time: v.expected_departure_time,
      purpose: v.purpose,
      resident: v.resident as { first_name: string; last_name: string; resident_code: string },
    })),
    error: null,
  };
}
