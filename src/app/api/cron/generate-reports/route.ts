import { NextRequest, NextResponse } from 'next/server';
import { getDueSchedules, markScheduleExecuted, saveGeneratedReport } from '@/actions/reports/report-schedules';
import { generateReport } from '@/actions/reports/report-engine';
import { getDateRangeFromPreset } from '@/lib/validators/reports';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Cron endpoint for generating scheduled reports
 * Runs daily at 6 AM UTC, checks for due schedules
 */
export async function GET(request: NextRequest) {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        console.log('[ReportsCron] Unauthorized request');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[ReportsCron] Checking for due report schedules');

    try {
        // Get all schedules that are due
        const { data: dueSchedules, error: fetchError } = await getDueSchedules();

        if (fetchError) {
            console.error('[ReportsCron] Failed to fetch due schedules:', fetchError);
            return NextResponse.json({ error: fetchError }, { status: 500 });
        }

        if (!dueSchedules || dueSchedules.length === 0) {
            console.log('[ReportsCron] No schedules due for execution');
            return NextResponse.json({
                success: true,
                message: 'No schedules due',
                processed: 0,
                timestamp: new Date().toISOString(),
            });
        }

        console.log(`[ReportsCron] Found ${dueSchedules.length} schedules to process`);

        const results: Array<{
            scheduleId: string;
            scheduleName: string;
            success: boolean;
            reportId?: string;
            error?: string;
        }> = [];

        for (const schedule of dueSchedules) {
            const startTime = Date.now();

            try {
                console.log(`[ReportsCron] Processing schedule: ${schedule.name} (${schedule.id})`);

                // Get date range from preset
                const dateRange = getDateRangeFromPreset(schedule.period_preset || 'last_month');

                // Generate the report
                const reportResult = await generateReport({
                    reportType: schedule.report_type,
                    periodPreset: schedule.period_preset || 'last_month',
                    startDate: dateRange.startDate,
                    endDate: dateRange.endDate,
                    bankAccountIds: schedule.bank_account_ids || [],
                    categoryIds: [],
                    transactionType: 'all',
                    aggregation: 'monthly',
                    includeCharts: schedule.include_charts,
                    includeDetails: schedule.include_summary,
                });

                if (!reportResult.success || !reportResult.report) {
                    throw new Error(reportResult.error || 'Report generation failed');
                }

                const durationMs = Date.now() - startTime;

                // Build summary from report data
                const summary = buildReportSummary(reportResult.report);

                // Save the generated report
                const { data: savedReport, error: saveError } = await saveGeneratedReport({
                    name: `${schedule.name} - ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
                    report_type: schedule.report_type,
                    schedule_id: schedule.id,
                    period_start: dateRange.startDate,
                    period_end: dateRange.endDate,
                    period_preset: schedule.period_preset || undefined,
                    bank_account_ids: schedule.bank_account_ids || undefined,
                    template_style: schedule.template_style,
                    report_data: reportResult.report,
                    summary,
                    generation_trigger: 'scheduled',
                    generation_duration_ms: durationMs,
                });

                if (saveError) {
                    throw new Error(`Failed to save report: ${saveError}`);
                }

                // Update schedule with next run time
                await markScheduleExecuted(
                    schedule.id,
                    schedule.frequency,
                    schedule.day_of_week ?? undefined,
                    schedule.day_of_month ?? undefined
                );

                console.log(`[ReportsCron] Successfully generated report for ${schedule.name}`);

                results.push({
                    scheduleId: schedule.id,
                    scheduleName: schedule.name,
                    success: true,
                    reportId: savedReport?.id,
                });

            } catch (error) {
                console.error(`[ReportsCron] Failed to process schedule ${schedule.name}:`, error);

                results.push({
                    scheduleId: schedule.id,
                    scheduleName: schedule.name,
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                });

                // Still update the schedule to prevent infinite retries
                await markScheduleExecuted(
                    schedule.id,
                    schedule.frequency,
                    schedule.day_of_week ?? undefined,
                    schedule.day_of_month ?? undefined
                );
            }
        }

        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;

        console.log(`[ReportsCron] Completed: ${successCount} succeeded, ${failCount} failed`);

        return NextResponse.json({
            success: true,
            processed: dueSchedules.length,
            succeeded: successCount,
            failed: failCount,
            results,
            timestamp: new Date().toISOString(),
        });

    } catch (error) {
        console.error('[ReportsCron] Unexpected error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

// Build a quick summary from report data for display
function buildReportSummary(reportData: any): Record<string, unknown> {
    const summary: Record<string, unknown> = {
        generated_at: new Date().toISOString(),
    };

    if (reportData.type === 'financial_overview' && reportData.data) {
        const data = reportData.data;
        summary.total_income = data.totalIncome;
        summary.total_expenses = data.totalExpenses;
        summary.net_balance = data.netBalance;
        summary.transaction_count = data.transactionCount;
    } else if (reportData.type === 'collection_report' && reportData.data) {
        const data = reportData.data;
        summary.total_billed = data.totalBilled;
        summary.total_collected = data.totalCollected;
        summary.collection_rate = data.collectionRate;
        summary.resident_count = data.residents?.length || 0;
    } else if (reportData.type === 'invoice_aging' && reportData.data) {
        const data = reportData.data;
        summary.total_outstanding = data.totalOutstanding;
        summary.current_amount = data.currentAmount;
        summary.overdue_amount = data.overdueAmount;
        summary.invoice_count = data.invoiceCount;
    } else if (reportData.type === 'transaction_log' && reportData.data) {
        const data = reportData.data;
        summary.total_transactions = data.transactions?.length || 0;
        summary.total_credits = data.totalCredits;
        summary.total_debits = data.totalDebits;
    }

    return summary;
}
