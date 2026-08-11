import { NextRequest, NextResponse } from 'next/server';
import { generateReport } from '@/actions/reports/report-engine';
import { renderReportPdf } from '@/lib/pdf/reports/renderer';
import { storeReportPdf } from '@/lib/pdf/reports/archive';
import { logAudit } from '@/lib/audit/logger';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import type { ReportRequestFormData } from '@/lib/validators/reports';

export async function GET(request: NextRequest) {
  const auth = await authorizePermission(PERMISSIONS.REPORTS_VIEW_FINANCIAL);
  if (!auth.authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const type = request.nextUrl.searchParams.get('type') as ReportRequestFormData['reportType'];
  const preset = request.nextUrl.searchParams.get('preset') || 'last_month';
  const includeAmount = request.nextUrl.searchParams.get('includeAmount') === 'true';
  const includeUnoccupied = request.nextUrl.searchParams.get('includeUnoccupied') === 'true';
  const bankAccountId = request.nextUrl.searchParams.get('bankAccountId') || undefined;
  const includeCharts = request.nextUrl.searchParams.get('includeCharts') === 'true';
  const dateRangePreset = request.nextUrl.searchParams.get('dateRangePreset') || 'last_month';
  const categoryId = request.nextUrl.searchParams.get('categoryId') || undefined;
  const residentId = request.nextUrl.searchParams.get('residentId') || undefined;
  const paymentStatus = request.nextUrl.searchParams.get('paymentStatus') || undefined;

  if (!type) return NextResponse.json({ error: 'Missing report type' }, { status: 400 });

  const params: ReportRequestFormData = {
    reportType: type,
    preset: preset === 'last_month' ? 'last_month' as const : 'last_month',
    includeAmount,
    includeUnoccupied,
    bankAccountId,
    includeCharts: false,
    dateRangePreset: dateRangePreset as 'last_month' | 'last_3_months' | 'last_6_months' | 'year_to_date' | 'custom' || 'last_month',
    categoryId,
    residentId,
    paymentStatus,
  };

  const result = await generateReport(params);
  if (result.error || !result.data) return NextResponse.json({ error: result.error || 'No data' }, { status: 500 });

  const buffer = await renderReportPdf(type, result.data);
  if (!buffer) return NextResponse.json({ error: 'PDF rendering failed' }, { status: 500 });

  try { await storeReportPdf(type, buffer, auth.userId!); } catch { /* non-critical */ }

  await logAudit({
    action: 'CREATE',
    entityType: 'reports',
    entityId: type,
    entityDisplay: `PDF report: ${type}`,
    description: `Downloaded ${type} report as PDF`,
  });

  const fileName = `${type}-${new Date().toISOString().split('T')[0]}.pdf`;
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  });
}
