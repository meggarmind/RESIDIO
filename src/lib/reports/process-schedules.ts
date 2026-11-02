/**
 * Server-only processing of due report schedules (cron path).
 *
 * Deliberately NOT a server-action module (no directive): this runs on the admin
 * (service-role) client with no authorization of its own, so it must never be reachable as a
 * client-callable server action. Sole caller is the CRON_SECRET-authenticated route
 * `/api/cron/process-report-schedules`, which is responsible for authentication. See #483 (and
 * #388 for the same pattern).
 */

import { createAdminClient } from '@/lib/supabase/server';
import { generateReportWithClient } from '@/lib/reports/report-generator';
import { renderReportPdf } from '@/lib/pdf/reports/renderer';
import { sendEmail, getEstateEmailSettings } from '@/lib/email/send-email';
import { ScheduledReportEmail } from '@/emails/scheduled-report';
import { logAudit } from '@/lib/audit/logger';
import { REPORT_TYPE_LABELS, getDateRangeFromPreset, resolveRetiredReport, type ReportRequestFormData } from '@/lib/validators/reports';

const formatEmailDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

// Debtors and aging is a point-in-time report, so it has no period to state.
function periodLabelFor(params: ReportRequestFormData): string | undefined {
  if (params.reportType === 'debtors_aging' || params.reportType === 'dues_collection_status') return undefined;
  const { startDate, endDate } = getDateRangeFromPreset(params.periodPreset);
  return `${formatEmailDate(startDate)} to ${formatEmailDate(endDate)}`;
}

// Debtors and aging, Dues, levies and collection status, and Expenses by category show lines only when the
// schedule saved that choice; a schedule of a retired report saved none. Every other report keeps
// its old value (#1399, #1400).
function includeDetailsFor(savedType: ReportRequestFormData['reportType'], includeSummary: boolean | null): boolean {
  const runsAs = resolveRetiredReport(savedType);
  if (runsAs !== 'debtors_aging' && runsAs !== 'dues_collection_status' && runsAs !== 'expenses_by_category') return true;
  return savedType === runsAs && includeSummary === true;
}

export async function processDueSchedules(): Promise<{ processed: number; failed: number; errors: string[] }> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const { data: schedules, error: fetchError } = await supabase
    .from('report_schedules')
    .select('*')
    .eq('is_active', true)
    .lte('next_run_at', now)
    .order('next_run_at');

  if (fetchError || !schedules) return { processed: 0, failed: 0, errors: [fetchError?.message || 'No schedules'] };

  // Service-role read (#1198): the cron request has no session.
  const estate = await getEstateEmailSettings();

  let processed = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const schedule of schedules) {
    try {
      const params: ReportRequestFormData = {
        // A schedule saved for a retired report runs as the report that replaced it (#1399).
        reportType: resolveRetiredReport(schedule.report_type),
         periodPreset: (schedule.period_preset || 'last_month') as ReportRequestFormData['periodPreset'],
         startDate: '',
         endDate: '',
        includeAmount: schedule.configuration?.includeAmount ?? false,
        includeUnoccupied: schedule.configuration?.includeUnoccupied ?? false,
        // The charge a dues schedule covers; a schedule of a retired Indebtedness report saved none, so it is Dues (#1400).
        chargeCategory: schedule.report_type === 'dues_collection_status' && typeof schedule.configuration?.chargeCategory === 'string' ? schedule.configuration.chargeCategory : 'dues',
        // Whose statement a Statement of account schedule makes; saved with the schedule (#1402).
        statementFor: schedule.configuration?.statementFor === 'resident' ? 'resident' : 'house',
        statementId: typeof schedule.configuration?.statementId === 'string' ? schedule.configuration.statementId : undefined,
         bankAccountIds: schedule.bank_account_ids || [],
         includeCharts: schedule.include_charts ?? false,
         categoryIds: [],
         transactionType: 'all',
         aggregation: 'monthly',
         // Invoice lines are a Debtors and aging choice; a retired schedule has none saved, so none are shown.
         includeDetails: includeDetailsFor(schedule.report_type, schedule.include_summary),
         paymentStatus: 'all',
      };

      const result = await generateReportWithClient(supabase, params);
       if (result.error || !result.report) { failed++; errors.push(`Schedule ${schedule.id}: ${result.error || 'No data'}`); continue; }

       const buffer = await renderReportPdf(params.reportType, result.report.data, estate.estateName);
      if (!buffer) { failed++; errors.push(`Schedule ${schedule.id}: PDF rendering failed`); continue; }

      // Store in archive
      const fileName = `${params.reportType}-${new Date().toISOString().split('T')[0]}-${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage.from('report-pdfs').upload(fileName, buffer, { contentType: 'application/pdf' });
      if (uploadError) throw new Error(`PDF archive upload failed: ${uploadError.message}`);

        const { error: archiveError } = await supabase
        .from('report_archive')
        .insert({
          report_type: params.reportType,
          schedule_id: schedule.id,
          generated_by: schedule.created_by || null,
          file_path: fileName,
          file_size_bytes: buffer.length,
          format: 'pdf',
          recipients: schedule.recipients || [],
        })
        .select('id')
         .single();
       if (archiveError) throw new Error(`PDF archive record failed: ${archiveError.message}`);

      // Email recipients
      const chargeName = params.reportType === 'dues_collection_status' ? (result.report.data as { chargeName?: string }).chargeName : undefined;
      const subject = params.reportType === 'statement_of_account' ? (result.report.data as { subject?: string }).subject : undefined;
      const reportLabel = `${REPORT_TYPE_LABELS[params.reportType] ?? schedule.report_type}${chargeName ? ` - ${chargeName}` : ''}${subject ? ` - ${subject}` : ''}`;
      const periodLabel = periodLabelFor(params);
       const recipients = ((schedule.recipients || []) as string[]).map((email: string) => ({ email, name: schedule.name }));
      if (recipients.length > 0) {
        const emailResult = await sendEmail({
          to: recipients,
          subject: `Scheduled Report: ${params.reportType}`,
          react: ScheduledReportEmail({ ...estate, reportLabel, periodLabel }),
            emailType: 'notification',
          attachments: [{ filename: fileName, content: buffer }],
          metadata: { reportType: params.reportType, scheduleId: schedule.id },
        });
        if (!emailResult.success) throw new Error(`Scheduled report email failed: ${emailResult.error || 'Unknown error'}`);
      }

      // Update next_run_at
      const frequency = schedule.frequency;
      const nextRun = new Date();
      switch (frequency) {
        case 'daily': nextRun.setDate(nextRun.getDate() + 1); break;
        case 'weekly': nextRun.setDate(nextRun.getDate() + 7); break;
        case 'monthly': nextRun.setMonth(nextRun.getMonth() + 1); break;
        case 'quarterly': nextRun.setMonth(nextRun.getMonth() + 3); break;
        case 'yearly': nextRun.setFullYear(nextRun.getFullYear() + 1); break;
        default: nextRun.setDate(nextRun.getDate() + 1);
      }

      await supabase.from('report_schedules')
        .update({ last_run_at: now, next_run_at: nextRun.toISOString() })
        .eq('id', schedule.id);

      await logAudit({
        action: 'GENERATE',
         entityType: 'report_archive',
        entityId: schedule.id,
        entityDisplay: `Scheduled report: ${schedule.report_type}`,
        description: `Auto-generated ${schedule.report_type} report on schedule`,
      });

      processed++;
    } catch (e) {
      failed++;
      errors.push(`Schedule ${schedule.id}: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  }

  return { processed, failed, errors };
}
