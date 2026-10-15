'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import type { ReportRequestFormData } from '@/lib/validators/reports';
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

// ============================================================
// Authorization Check
// ============================================================

async function checkReportAccess() {
  // Permission check (migrated off the legacy role-list check)
  const auth = await authorizePermission(PERMISSIONS.REPORTS_VIEW_FINANCIAL);
  if (!auth.authorized) {
    return { authorized: false as const, error: auth.error || 'Forbidden' };
  }

  return { authorized: true as const };
}

export async function generateReport(
  params: ReportRequestFormData
): Promise<GenerateReportResult> {
  const supabase = await createServerSupabaseClient();

  // Check authorization
  const authCheck = await checkReportAccess();
  if (!authCheck.authorized) {
    return { success: false, error: authCheck.error };
  }

  return generateReportWithClient(supabase, params);
}
