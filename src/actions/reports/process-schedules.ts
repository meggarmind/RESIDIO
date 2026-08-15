'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { generateReport } from '@/actions/reports/report-engine';
import { renderReportPdf } from '@/lib/pdf/reports/renderer';
import { sendEmail } from '@/lib/email/send-email';
import { logAudit } from '@/lib/audit/logger';
import type { ReportRequestFormData } from '@/lib/validators/reports';

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

  let processed = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const schedule of schedules) {
    try {
      const params: ReportRequestFormData = {
        reportType: schedule.report_type,
         periodPreset: (schedule.period_preset || 'last_month') as ReportRequestFormData['periodPreset'],
         startDate: '',
         endDate: '',
        includeAmount: schedule.configuration?.includeAmount ?? false,
        includeUnoccupied: schedule.configuration?.includeUnoccupied ?? false,
         bankAccountIds: schedule.bank_account_ids || [],
         includeCharts: schedule.include_charts ?? false,
         categoryIds: [],
         transactionType: 'all',
         aggregation: 'monthly',
         includeDetails: true,
         paymentStatus: 'all',
      };

      const result = await generateReport(params);
       if (result.error || !result.report) { failed++; errors.push(`Schedule ${schedule.id}: ${result.error || 'No data'}`); continue; }

       const buffer = await renderReportPdf(schedule.report_type, result.report.data);
      if (!buffer) { failed++; errors.push(`Schedule ${schedule.id}: PDF rendering failed`); continue; }

      // Store in archive
      const fileName = `${schedule.report_type}-${new Date().toISOString().split('T')[0]}-${Date.now()}.pdf`;
      await supabase.storage.from('report-pdfs').upload(fileName, buffer, { contentType: 'application/pdf' });

       await supabase
        .from('report_archive')
        .insert({
          report_type: schedule.report_type,
          schedule_id: schedule.id,
          generated_by: schedule.created_by || null,
          file_path: fileName,
          file_size_bytes: buffer.length,
          format: 'pdf',
          recipients: schedule.recipients || [],
        })
        .select('id')
        .single();

      // Email recipients
       const recipients = ((schedule.recipients || []) as string[]).map((email: string) => ({ email, name: schedule.name }));
      if (recipients.length > 0) {
        await sendEmail({
          to: recipients[0],
          subject: `Scheduled Report: ${schedule.report_type}`,
           emailType: 'notification',
          metadata: { reportType: schedule.report_type, scheduleId: schedule.id },
        });
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
