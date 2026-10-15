import { currentMonthPeriod } from '@/lib/billing/invoice-generation-run-service';
import { createAdminClient } from '@/lib/supabase/server';

export interface CronJobStatus {
    name: string;
    description: string;
    schedule: string;
    lastRun: string | null;
    lastRunRelative: string;
    expectedFrequency: string;
    status: 'healthy' | 'warning' | 'critical' | 'unknown';
    message: string;
}

export interface HealthResponse {
    overall: 'healthy' | 'warning' | 'critical';
    timestamp: string;
    jobs: CronJobStatus[];
    // Aliases kept for CronHealthCard, which historically read `status` /
    // `lastChecked` from the raw health endpoint response.
    status: 'healthy' | 'warning' | 'critical';
    lastChecked: string;
}

/**
 * Calculate relative time string
 */
function getRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
}

/**
 * Compute the health status of all scheduled cron jobs:
 * - Invoice generation (monthly on configured day)
 * - Report generation (daily at 6 AM UTC)
 * - Payment reminders (daily at 8 AM UTC)
 * - Notification processing (every 5 minutes)
 * - Announcement publishing (hourly)
 * - Email import (hourly)
 *
 * This is the shared implementation behind both `GET /api/health/cron-status`
 * (the guarded route handler) and `getCronStatus()` (the guarded server
 * action). Neither should call the other over HTTP — a server action's own
 * `fetch()` of its own app's route does not forward the caller's session
 * cookies, so once the route requires auth that round trip fails. Both call
 * this function directly instead, and each performs its own
 * `authorizePermission(SYSTEM_MONITOR)` check before doing so.
 *
 * Uses the service-role admin client, which bypasses RLS — callers MUST
 * authorize the caller before invoking this.
 */
export async function computeCronStatus(): Promise<HealthResponse> {
    const supabase = createAdminClient();
    const now = new Date();
    const jobs: CronJobStatus[] = [];

    // 1. Invoice Generation - derived from invoice_generation_runs (#638).
    //
    // The legacy invoice_generation_log table is no longer written by any code
    // and is deliberately not read here.
    //
    // Status rules, for the CURRENT month period, over non-cancelled runs of any
    // trigger (draft / awaiting_approval do not count as "ran"):
    //   latest run completed              -> healthy
    //   latest run completed_with_errors  -> warning
    //   latest run queued / processing    -> healthy ("in progress")
    //   only a cancelled cron run this month -> warning (the route will not recreate it)
    //   no such run, today < configured day  -> healthy ("Waiting for day N")
    //   no such run, today >= configured day -> critical ("OVERDUE")
    //   runs table unreadable             -> unknown (the only remaining use of
    //                                        'unknown'; we cannot say either way)
    const { data: genDaySetting } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'invoice_generation_day')
        .single();

    const configuredDay = genDaySetting?.value ?? 2;
    const currentDay = now.getDate();
    const period = currentMonthPeriod(now);
    const RUN_COLUMNS = 'status, requested_at, completed_at, created_count, skipped_count, failed_count';

    const { data: monthRuns, error: monthRunsError } = await supabase
        .from('invoice_generation_runs')
        .select(RUN_COLUMNS)
        .neq('status', 'cancelled')
        .in('status', ['completed', 'completed_with_errors', 'queued', 'processing'])
        .contains('scope', { targetMonth: period })
        .order('requested_at', { ascending: false })
        .limit(1);

    // A cron run an admin cancelled this month holds for the month (the cron route
    // will not recreate it), so "no run" would be a misleading Critical.
    const { data: cancelledRuns } = await supabase
        .from('invoice_generation_runs')
        .select('status')
        .eq('status', 'cancelled')
        .contains('scope', { trigger: 'cron', targetMonth: period })
        .limit(1);

    const { data: lastRuns } = await supabase
        .from('invoice_generation_runs')
        .select(RUN_COLUMNS)
        .neq('status', 'cancelled')
        .order('requested_at', { ascending: false })
        .limit(1);

    const lastRunRow = lastRuns?.[0] ?? null;
    const lastRunStamp = lastRunRow ? (lastRunRow.completed_at ?? lastRunRow.requested_at) : null;
    const lastInvoiceRun = lastRunStamp ? new Date(lastRunStamp) : null;
    const monthRun = monthRuns?.[0] ?? null;

    let invoiceStatus: 'healthy' | 'warning' | 'critical' | 'unknown';
    let invoiceMessage: string;

    if (monthRunsError) {
        invoiceStatus = 'unknown';
        invoiceMessage = 'Could not read invoice generation runs';
    } else if (monthRun?.status === 'completed') {
        invoiceStatus = 'healthy';
        invoiceMessage = `Generated for ${period.slice(0, 7)}: ${monthRun.created_count} created, ${monthRun.skipped_count} skipped`;
    } else if (monthRun?.status === 'completed_with_errors') {
        invoiceStatus = 'warning';
        invoiceMessage = `Generated for ${period.slice(0, 7)} with errors: ${monthRun.created_count} created, ${monthRun.skipped_count} skipped, ${monthRun.failed_count} failed`;
    } else if (monthRun) {
        invoiceStatus = 'healthy';
        invoiceMessage = `Generation for ${period.slice(0, 7)} is in progress`;
    } else if (cancelledRuns && cancelledRuns.length > 0) {
        invoiceStatus = 'warning';
        invoiceMessage = `The scheduled run for ${period.slice(0, 7)} was cancelled and will not be recreated this month; generate it manually if it is still needed`;
    } else if (currentDay < configuredDay) {
        invoiceStatus = 'healthy';
        invoiceMessage = `Waiting for day ${configuredDay} (today is day ${currentDay})`;
    } else {
        invoiceStatus = 'critical';
        invoiceMessage = `OVERDUE: No invoice generation run for ${period.slice(0, 7)} (due day ${configuredDay})${lastInvoiceRun ? `, last run was ${getRelativeTime(lastInvoiceRun)}` : ''}`;
    }

    jobs.push({
        name: 'invoice-generation',
        description: 'Monthly Invoice Generation',
        schedule: `Day ${configuredDay} of each month at 6 AM UTC`,
        lastRun: lastInvoiceRun?.toISOString() || null,
        lastRunRelative: lastInvoiceRun ? getRelativeTime(lastInvoiceRun) : 'never',
        expectedFrequency: 'monthly',
        status: invoiceStatus,
        message: invoiceMessage,
    });

    // 2. Report Generation - Check report_schedules for recent executions
    const { data: recentReports } = await supabase
        .from('generated_reports')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    const lastReportRun = recentReports?.created_at ? new Date(recentReports.created_at) : null;
    const reportHoursAgo = lastReportRun
        ? (now.getTime() - lastReportRun.getTime()) / 3600000
        : Infinity;

    jobs.push({
        name: 'report-generation',
        description: 'Scheduled Report Generation',
        schedule: 'Daily at 6 AM UTC',
        lastRun: lastReportRun?.toISOString() || null,
        lastRunRelative: lastReportRun ? getRelativeTime(lastReportRun) : 'never',
        expectedFrequency: 'daily',
        status: reportHoursAgo < 26 ? 'healthy' : reportHoursAgo < 48 ? 'warning' : 'critical',
        message: lastReportRun
            ? `Last report generated ${getRelativeTime(lastReportRun)}`
            : 'No reports generated yet',
    });

    // 3. Notification Processing - Check notification_queue
    const { data: recentNotification } = await supabase
        .from('notification_queue')
        .select('processed_at')
        .eq('status', 'sent')
        .order('processed_at', { ascending: false })
        .limit(1)
        .single();

    const lastNotifRun = recentNotification?.processed_at ? new Date(recentNotification.processed_at) : null;
    const notifMinsAgo = lastNotifRun
        ? (now.getTime() - lastNotifRun.getTime()) / 60000
        : Infinity;

    // Also check for pending notifications as an indicator
    const { count: pendingCount } = await supabase
        .from('notification_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

    jobs.push({
        name: 'notification-processing',
        description: 'Notification Queue Processing',
        schedule: 'Every 5 minutes',
        lastRun: lastNotifRun?.toISOString() || null,
        lastRunRelative: lastNotifRun ? getRelativeTime(lastNotifRun) : 'never',
        expectedFrequency: '5 minutes',
        status: notifMinsAgo < 10 ? 'healthy' : notifMinsAgo < 30 ? 'warning' : 'critical',
        message: pendingCount && pendingCount > 0
            ? `${pendingCount} notifications pending`
            : lastNotifRun ? 'Queue is clear' : 'No notifications processed yet',
    });

    // 4. Announcement Publishing - Check recently published announcements
    const { data: recentAnnouncement } = await supabase
        .from('announcements')
        .select('published_at')
        .eq('status', 'published')
        .not('scheduled_for', 'is', null)
        .order('published_at', { ascending: false })
        .limit(1)
        .single();

    const lastAnnouncementRun = recentAnnouncement?.published_at
        ? new Date(recentAnnouncement.published_at)
        : null;

    // Check for pending scheduled announcements
    const { count: pendingAnnouncements } = await supabase
        .from('announcements')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'scheduled')
        .lte('scheduled_for', now.toISOString());

    jobs.push({
        name: 'announcement-publishing',
        description: 'Scheduled Announcement Publishing',
        schedule: 'Hourly',
        lastRun: lastAnnouncementRun?.toISOString() || null,
        lastRunRelative: lastAnnouncementRun ? getRelativeTime(lastAnnouncementRun) : 'never',
        expectedFrequency: 'hourly',
        status: pendingAnnouncements && pendingAnnouncements > 0 ? 'warning' : 'healthy',
        message: pendingAnnouncements && pendingAnnouncements > 0
            ? `${pendingAnnouncements} announcements waiting to be published`
            : 'No pending announcements',
    });

    // 5. Email Import - Check recent email imports
    const { data: recentEmailImport } = await supabase
        .from('email_imports')
        .select('created_at, status, emails_fetched, transactions_extracted, transactions_auto_processed')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    // Check Gmail connection status
    const { data: gmailConnection } = await supabase
        .from('gmail_oauth_credentials')
        .select('is_active, last_sync_at, last_sync_status')
        .eq('is_active', true)
        .single();

    const lastEmailImportRun = recentEmailImport?.created_at ? new Date(recentEmailImport.created_at) : null;
    const emailImportHoursAgo = lastEmailImportRun
        ? (now.getTime() - lastEmailImportRun.getTime()) / 3600000
        : Infinity;

    let emailImportStatus: 'healthy' | 'warning' | 'critical' | 'unknown' = 'unknown';
    let emailImportMessage = 'No email imports yet';

    if (!gmailConnection?.is_active) {
        emailImportStatus = 'warning';
        emailImportMessage = 'Gmail not connected';
    } else if (lastEmailImportRun) {
        if (emailImportHoursAgo < 2) {
            emailImportStatus = 'healthy';
            emailImportMessage = recentEmailImport
                ? `Last: ${recentEmailImport.emails_fetched || 0} emails, ${recentEmailImport.transactions_auto_processed || 0} auto-processed`
                : 'Running normally';
        } else if (emailImportHoursAgo < 4) {
            emailImportStatus = 'warning';
            emailImportMessage = `Last run ${getRelativeTime(lastEmailImportRun)}`;
        } else {
            emailImportStatus = 'critical';
            emailImportMessage = `OVERDUE: Last run ${getRelativeTime(lastEmailImportRun)}`;
        }
    } else if (gmailConnection?.is_active) {
        emailImportStatus = 'healthy';
        emailImportMessage = 'Gmail connected, awaiting first import';
    }

    jobs.push({
        name: 'email-import',
        description: 'Gmail Email Import (Bank Statements)',
        schedule: 'Hourly',
        lastRun: lastEmailImportRun?.toISOString() || null,
        lastRunRelative: lastEmailImportRun ? getRelativeTime(lastEmailImportRun) : 'never',
        expectedFrequency: 'hourly',
        status: emailImportStatus,
        message: emailImportMessage,
    });

    // Determine overall health
    const hassCritical = jobs.some(j => j.status === 'critical');
    const hasWarning = jobs.some(j => j.status === 'warning');
    const overall: 'healthy' | 'warning' | 'critical' = hassCritical
        ? 'critical'
        : hasWarning
            ? 'warning'
            : 'healthy';

    return {
        overall,
        status: overall, // Match CronHealthCard
        timestamp: now.toISOString(),
        lastChecked: now.toISOString(), // Match CronHealthCard
        jobs,
    };
}
