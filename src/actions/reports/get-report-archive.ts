'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizeAnyPermission } from '@/lib/auth/authorize';
import { REPORT_VIEW_PERMISSIONS, reportsForPermissions } from '@/lib/validators/reports';

export interface ArchivedReport {
  id: string;
  report_type: string;
  schedule_id: string | null;
  generated_by: string | null;
  generated_at: string;
  file_path: string;
  file_size_bytes: number | null;
  format: string;
  recipients: Array<{ email: string; name?: string }> | null;
}

export async function getReportArchive(limit = 50): Promise<{ data: ArchivedReport[]; count: number; error: string | null }> {
  // Any report's view permission opens the archive; it lists only the types that user may run (#1397).
  const auth = await authorizeAnyPermission(REPORT_VIEW_PERMISSIONS);
  if (!auth.authorized) return { data: [], count: 0, error: auth.error || 'Unauthorized' };

  const supabase = await createServerSupabaseClient();
  const { data, error, count } = await supabase
    .from('report_archive')
    .select('*', { count: 'exact' })
    .in('report_type', reportsForPermissions(auth.permissions))
    .order('generated_at', { ascending: false })
    .limit(limit);

  return { data: (data as ArchivedReport[]) ?? [], count: count ?? 0, error: error?.message || null };
}
