'use server';

import { createAdminClient, createServerSupabaseClient } from '@/lib/supabase/server';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { authorizePermission } from '@/lib/auth/authorize';
import { getReportPermission, type ReportRequestFormData } from '@/lib/validators/reports';
import { generateReportWithClient } from '@/lib/reports/report-generator';
import type { GenerateReportResult } from '@/lib/reports/report-generator';

// Generators and types live in @/lib/reports/report-generator (no directive) so the cron paths
// can run them with the admin client without a session (#483). A 'use server' file may only
// export async functions, so the types are re-exported (erased) for existing importers.
export type {
  CategoryBreakdown,
  FinancialOverviewData,
  CollectionReportData,
  InvoiceAgingData,
  TransactionLogData,
  DebtorInfo,
  DebtorsReportData,
  HouseIndebtednessRow,
  IndebtednessReportData,
  DevelopmentLevyRow,
  DevelopmentLevyData,
  ReportData,
  GenerateReportResult,
} from '@/lib/reports/report-generator';

export async function generateReport(
  params: ReportRequestFormData
): Promise<GenerateReportResult> {
  // Each report carries its own view permission (#1397); an unlisted type is refused.
  const permission = getReportPermission(params.reportType);
  if (!permission) {
    return { success: false, error: 'Unknown report type' };
  }

  const auth = await authorizePermission(permission);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Forbidden' };
  }

  const supabase =
    permission === PERMISSIONS.REPORTS_VIEW_SECURITY ? createAdminClient() : await createServerSupabaseClient();
  return generateReportWithClient(supabase, params);
}
