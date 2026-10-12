/**
 * Server-only store for scheduled (cron) report work.
 *
 * Deliberately NOT a server-action module (no directive): these functions use the admin
 * (service-role) client and must never be reachable as client-callable server
 * actions. Sole caller is the CRON_SECRET-authenticated route
 * `/api/cron/generate-reports`, which is responsible for authentication. See #388.
 */

import { createAdminClient } from '@/lib/supabase/server';
import type {
    GeneratedReport,
    ReportSchedule,
    ReportType,
    ScheduleFrequency,
    TemplateStyle,
} from '@/actions/reports/report-schedules';

// Calculate next run date based on frequency
export function calculateNextRunDate(frequency: ScheduleFrequency, dayOfWeek?: number, dayOfMonth?: number): Date {
    const now = new Date();
    const next = new Date(now);

    // Set to 6 AM UTC (same as other crons)
    next.setUTCHours(6, 0, 0, 0);

    switch (frequency) {
        case 'daily':
            // Next day at 6 AM
            next.setUTCDate(next.getUTCDate() + 1);
            break;

        case 'weekly':
            // Next occurrence of day_of_week
            const targetDay = dayOfWeek ?? 1; // Default to Monday
            const currentDay = next.getUTCDay();
            let daysUntilTarget = targetDay - currentDay;
            if (daysUntilTarget <= 0) daysUntilTarget += 7;
            next.setUTCDate(next.getUTCDate() + daysUntilTarget);
            break;

        case 'monthly':
            // Next occurrence of day_of_month
            const targetDayOfMonth = dayOfMonth ?? 1;
            next.setUTCDate(targetDayOfMonth);
            if (next <= now) {
                next.setUTCMonth(next.getUTCMonth() + 1);
            }
            break;

        case 'quarterly':
            // First day of next quarter
            const currentQuarter = Math.floor(now.getUTCMonth() / 3);
            const nextQuarterMonth = (currentQuarter + 1) * 3;
            next.setUTCMonth(nextQuarterMonth);
            next.setUTCDate(dayOfMonth ?? 1);
            if (next <= now) {
                next.setUTCMonth(next.getUTCMonth() + 3);
            }
            break;

        case 'yearly':
            // January of next year (or specified day)
            next.setUTCMonth(0);
            next.setUTCDate(dayOfMonth ?? 1);
            if (next <= now) {
                next.setUTCFullYear(next.getUTCFullYear() + 1);
            }
            break;
    }

    return next;
}

// Save a scheduled report to history (service role, no session)
export async function saveScheduledReport(input: {
    name: string;
    report_type: ReportType;
    schedule_id: string;
    period_start: string;
    period_end: string;
    period_preset?: string;
    bank_account_ids?: string[];
    template_style?: TemplateStyle;
    report_data: unknown;
    summary?: unknown;
    generation_duration_ms?: number;
}): Promise<{ data: GeneratedReport | null; error: string | null }> {
    const supabase = createAdminClient();

    const { data, error } = await supabase
        .from('generated_reports')
        .insert({
            name: input.name,
            report_type: input.report_type,
            schedule_id: input.schedule_id,
            period_start: input.period_start,
            period_end: input.period_end,
            period_preset: input.period_preset || null,
            bank_account_ids: input.bank_account_ids || null,
            template_style: input.template_style || 'modern',
            report_data: input.report_data,
            summary: input.summary || null,
            generation_trigger: 'scheduled',
            generation_duration_ms: input.generation_duration_ms || null,
            generated_by: null,
        })
        .select()
        .single();

    if (error) {
        console.error('[Reports] Failed to save scheduled report:', error);
        return { data: null, error: error.message };
    }

    return { data, error: null };
}

// Get schedules due for execution (for cron job)
export async function getDueSchedules(): Promise<{ data: ReportSchedule[] | null; error: string | null }> {
    const supabase = createAdminClient();

    const now = new Date().toISOString();

    const { data, error } = await supabase
        .from('report_schedules')
        .select('*')
        .eq('is_active', true)
        .lte('next_run_at', now);

    if (error) {
        console.error('[Reports] Failed to fetch due schedules:', error);
        return { data: null, error: error.message };
    }

    return { data, error: null };
}

// Update schedule after execution
export async function markScheduleExecuted(id: string, frequency: ScheduleFrequency, dayOfWeek?: number, dayOfMonth?: number): Promise<void> {
    const supabase = createAdminClient();

    const nextRunAt = calculateNextRunDate(frequency, dayOfWeek, dayOfMonth);

    await supabase
        .from('report_schedules')
        .update({
            last_run_at: new Date().toISOString(),
            next_run_at: nextRunAt.toISOString(),
        })
        .eq('id', id);
}
