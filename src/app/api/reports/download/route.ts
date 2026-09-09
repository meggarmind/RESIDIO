import { NextRequest, NextResponse } from 'next/server';
import { generateReport } from '@/actions/reports/report-engine';
import { renderReportPdf } from '@/lib/pdf/reports/renderer';
import { storeReportPdf } from '@/lib/pdf/reports/archive';
import { logAudit } from '@/lib/audit/logger';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { createAdminClient } from '@/lib/supabase/server';
import type { ReportRequestFormData } from '@/lib/validators/reports';

export async function GET(request: NextRequest) {
  const auth = await authorizePermission(PERMISSIONS.REPORTS_VIEW_FINANCIAL);
  if (!auth.authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const type = request.nextUrl.searchParams.get('type') as ReportRequestFormData['reportType'];
  const archiveId = request.nextUrl.searchParams.get('archiveId');
   const preset = request.nextUrl.searchParams.get('preset') || 'last_month';
  const includeAmount = request.nextUrl.searchParams.get('includeAmount') === 'true';
  const includeUnoccupied = request.nextUrl.searchParams.get('includeUnoccupied') === 'true';
   const bankAccountId = request.nextUrl.searchParams.get('bankAccountId');
  const includeCharts = request.nextUrl.searchParams.get('includeCharts') === 'true';
   const categoryId = request.nextUrl.searchParams.get('categoryId');
   const paymentStatus = request.nextUrl.searchParams.get('paymentStatus');

  if (archiveId) {
    const supabase = createAdminClient();
    const { data: archive, error } = await supabase
      .from('report_archive')
      .select('report_type, file_path')
      .eq('id', archiveId)
      .single();
    if (error || !archive) return NextResponse.json({ error: 'Archived report not found' }, { status: 404 });

    const { data: file, error: downloadError } = await supabase.storage.from('report-pdfs').download(archive.file_path);
    if (downloadError || !file) return NextResponse.json({ error: 'Archived report file not found' }, { status: 404 });

    await logAudit({
      action: 'VERIFY', entityType: 'report_archive', entityId: archiveId,
      entityDisplay: `Archived PDF: ${archive.report_type}`, description: 'Downloaded archived PDF report',
    });
    return new NextResponse(await file.arrayBuffer(), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${archive.report_type}-${archiveId.slice(0, 8)}.pdf"`,
      },
    });
  }

  if (!type) return NextResponse.json({ error: 'Missing report type' }, { status: 400 });

  const params: ReportRequestFormData = {
    reportType: type,
     periodPreset: preset === 'last_month' ? 'last_month' : 'this_month',
     startDate: '',
     endDate: '',
     bankAccountIds: bankAccountId ? [bankAccountId] : [],
     categoryIds: categoryId ? [categoryId] : [],
     transactionType: 'all',
     aggregation: 'monthly',
     includeAmount,
     includeUnoccupied,
     includeCharts,
     includeDetails: true,
     paymentStatus: paymentStatus === 'paid' || paymentStatus === 'unpaid' ? paymentStatus : 'all',
   };

  const result = await generateReport(params);
   if (result.error || !result.report) return NextResponse.json({ error: result.error || 'No data' }, { status: 500 });

   const buffer = await renderReportPdf(type, result.report.data);
  if (!buffer) return NextResponse.json({ error: 'PDF rendering failed' }, { status: 500 });

  try { await storeReportPdf(type, buffer, auth.userId!); } catch { /* non-critical */ }

  await logAudit({
    action: 'CREATE',
     entityType: 'report_archive',
    entityId: type,
    entityDisplay: `PDF report: ${type}`,
    description: `Downloaded ${type} report as PDF`,
  });

  const fileName = `${type}-${new Date().toISOString().split('T')[0]}.pdf`;
   return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  });
}
