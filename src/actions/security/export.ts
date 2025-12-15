'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { hasSecurityPermission } from './settings';
import { formatDateTime } from '@/lib/utils';
import type { SecurityContactFilters } from '@/lib/validators/security-contact';

export interface ExportSecurityContactsResponse {
  data: string | null;
  error: string | null;
}

/**
 * Exports security contacts to CSV format
 */
export async function exportSecurityContactsCSV(
  filters: SecurityContactFilters = {}
): Promise<ExportSecurityContactsResponse> {
  const supabase = await createServerSupabaseClient();

  // Check permission
  const canExport = await hasSecurityPermission('export_contacts');
  if (!canExport) {
    return { data: null, error: 'Permission denied: Cannot export security contacts' };
  }

  const { search, resident_id, category_id, status } = filters;

  let query = supabase
    .from('security_contacts')
    .select(`
      *,
      category:security_contact_categories(name),
      resident:residents(first_name, last_name, resident_code, phone_primary),
      access_codes(code, code_type, valid_from, valid_until, is_active)
    `);

  // Apply filters
  if (search) {
    query = query.or(
      `full_name.ilike.%${search}%,phone_primary.ilike.%${search}%,id_number.ilike.%${search}%`
    );
  }

  if (resident_id) {
    query = query.eq('resident_id', resident_id);
  }

  if (category_id) {
    query = query.eq('category_id', category_id);
  }

  if (status) {
    query = query.eq('status', status);
  }

  query = query.order('created_at', { ascending: false });

  const { data, error } = await query;

  if (error) {
    console.error('Export security contacts error:', error);
    return { data: null, error: 'Failed to export security contacts' };
  }

  if (!data || data.length === 0) {
    return { data: null, error: 'No contacts found to export' };
  }

  // Generate CSV
  const headers = [
    'Full Name',
    'Phone Primary',
    'Phone Secondary',
    'Category',
    'Status',
    'Resident Name',
    'Resident Code',
    'Resident Phone',
    'ID Type',
    'ID Number',
    'Address',
    'Employer',
    'Relationship',
    'Next of Kin Name',
    'Next of Kin Phone',
    'Active Access Code',
    'Code Valid Until',
    'Notes',
    'Created At',
  ];

  const rows = data.map((contact) => {
    const category = contact.category as { name: string } | null;
    const resident = contact.resident as {
      first_name: string;
      last_name: string;
      resident_code: string;
      phone_primary: string;
    } | null;
    const accessCodes = contact.access_codes as Array<{
      code: string;
      code_type: string;
      valid_from: string;
      valid_until: string | null;
      is_active: boolean;
    }> | null;

    // Find the active access code
    const activeCode = accessCodes?.find(
      (code) =>
        code.is_active && (!code.valid_until || new Date(code.valid_until) > new Date())
    );

    return [
      contact.full_name || '',
      contact.phone_primary || '',
      contact.phone_secondary || '',
      category?.name || '',
      contact.status || '',
      resident ? `${resident.first_name} ${resident.last_name}` : '',
      resident?.resident_code || '',
      resident?.phone_primary || '',
      contact.id_type || '',
      contact.id_number || '',
      contact.address || '',
      contact.employer || '',
      contact.relationship || '',
      contact.next_of_kin_name || '',
      contact.next_of_kin_phone || '',
      activeCode?.code || '',
      activeCode?.valid_until ? formatDateTime(activeCode.valid_until) : '',
      contact.notes || '',
      contact.created_at ? formatDateTime(contact.created_at) : '',
    ];
  });

  // Escape CSV values
  const escapeCSV = (value: string) => {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  const csv = [
    headers.join(','),
    ...rows.map((row) => row.map(escapeCSV).join(',')),
  ].join('\n');

  return { data: csv, error: null };
}

/**
 * Exports access logs to CSV format
 */
export async function exportAccessLogsCSV(
  filters: {
    date_from?: string;
    date_to?: string;
    flagged_only?: boolean;
  } = {}
): Promise<ExportSecurityContactsResponse> {
  const supabase = await createServerSupabaseClient();

  // Check permission
  const canViewLogs = await hasSecurityPermission('view_access_logs');
  if (!canViewLogs) {
    return { data: null, error: 'Permission denied: Cannot export access logs' };
  }

  let query = supabase
    .from('access_logs')
    .select(`
      *,
      contact:security_contacts(full_name, phone_primary),
      resident:residents(first_name, last_name, resident_code),
      verified_by_profile:profiles!access_logs_verified_by_fkey(full_name)
    `);

  // Apply filters
  if (filters.date_from) {
    query = query.gte('check_in_time', filters.date_from);
  }

  if (filters.date_to) {
    query = query.lte('check_in_time', filters.date_to);
  }

  if (filters.flagged_only) {
    query = query.eq('flagged', true);
  }

  query = query.order('check_in_time', { ascending: false });

  const { data, error } = await query;

  if (error) {
    console.error('Export access logs error:', error);
    return { data: null, error: 'Failed to export access logs' };
  }

  if (!data || data.length === 0) {
    return { data: null, error: 'No logs found to export' };
  }

  // Generate CSV
  const headers = [
    'Contact Name',
    'Contact Phone',
    'Resident Name',
    'Resident Code',
    'Check-in Time',
    'Check-out Time',
    'Gate Location',
    'Verified By',
    'Flagged',
    'Flag Reason',
    'Notes',
  ];

  const rows = data.map((log) => {
    const contact = log.contact as { full_name: string; phone_primary: string } | null;
    const resident = log.resident as {
      first_name: string;
      last_name: string;
      resident_code: string;
    } | null;
    const verifiedBy = log.verified_by_profile as { full_name: string } | null;

    return [
      contact?.full_name || '',
      contact?.phone_primary || '',
      resident ? `${resident.first_name} ${resident.last_name}` : '',
      resident?.resident_code || '',
      log.check_in_time ? formatDateTime(log.check_in_time) : '',
      log.check_out_time ? formatDateTime(log.check_out_time) : '',
      log.gate_location || '',
      verifiedBy?.full_name || '',
      log.flagged ? 'Yes' : 'No',
      log.flag_reason || '',
      log.notes || '',
    ];
  });

  // Escape CSV values
  const escapeCSV = (value: string) => {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  const csv = [
    headers.join(','),
    ...rows.map((row) => row.map(escapeCSV).join(',')),
  ].join('\n');

  return { data: csv, error: null };
}
