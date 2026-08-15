'use server';

import { generateReport } from '@/actions/reports/report-engine';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { storeReportPdf } from '@/lib/pdf/reports/archive';
import { renderReportPdf } from '@/lib/pdf/reports/renderer';
import type { ReportRequestFormData } from '@/lib/validators/reports';

export async function generateReportPdf(
  params: ReportRequestFormData
): Promise<{ data: Buffer | null; reportId: string | null; error: string | null }> {
  const auth = await authorizePermission(PERMISSIONS.REPORTS_VIEW_FINANCIAL);
  if (!auth.authorized) return { data: null, reportId: null, error: auth.error || 'Unauthorized' };

  const result = await generateReport(params);
   if (result.error || !result.report) return { data: null, reportId: null, error: result.error || 'No data' };

   const buffer = await renderReportPdf(params.reportType, result.report.data);
  if (!buffer) return { data: null, reportId: null, error: 'PDF rendering failed' };

  let reportId: string | null = null;
  try {
    reportId = await storeReportPdf(params.reportType, buffer, auth.userId!);
  } catch (e) {
    console.error('[generateReportPdf] Archive store failed:', e);
  }

  await logAudit({
    action: 'CREATE',
     entityType: 'report_archive',
    entityId: reportId || 'unknown',
    entityDisplay: `PDF report: ${params.reportType}`,
    description: `Generated ${params.reportType} report as PDF`,
  });

  return { data: buffer, reportId, error: null };
}
