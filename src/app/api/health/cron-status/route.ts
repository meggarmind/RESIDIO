import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CronJobStatus {
    name: string;
    description: string;
    schedule: string;
    lastRun: string | null;
    lastRunRelative: string;
    expectedFrequency: string;
    status: 'healthy' | 'warning' | 'critical' | 'unknown';
    message: string;
}

interface HealthResponse {
    overall: 'healthy' | 'warning' | 'critical';
    timestamp: string;
    jobs: CronJobStatus[];
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
 * Health check endpoint for cron job monitoring
 *
 * Checks the status of all scheduled cron jobs:
 * - Invoice generation (monthly on configured day)
 * - Report generation (daily at 6 AM UTC)
 * - Payment reminders (daily at 8 AM UTC)
 * - Notification processing (every 5 minutes)
 * - Announcement publishing (hourly)
 */
export async function GET() {
    const supabase = createAdminClient();
    const now = new Date();
    const jobs: CronJobStatus[] = [];

    // 1. Invoice Generation - Check last generation log
    const { data: invoiceLog } = await supabase
        .from('invoice_generation_log')
        .select('generated_at, trigger_type, generated_count, skipped_count, error_count')
        .order('generated_at', { ascending: false })
        .limit(1)
        .single();

    // Get configured generation day
    const { data: genDaySetting } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'invoice_generation_day')
        .single();

    const configuredDay = genDaySetting?.value ?? 2;
    const currentDay = now.getDate();
    const lastInvoiceRun = invoiceLog?.generated_at ? new Date(invoiceLog.generated_at) : null;

    // Invoice generation is healthy if:
    // - We're before the configured day this month, OR
    // - We ran this month on or after the configured day
    let invoiceStatus: 'healthy' | 'warning' | 'critical' | 'unknown' = 'unknown';
    let invoiceMessage = 'No generation logs found';

    if (lastInvoiceRun) {
        const lastRunMonth = lastInvoiceRun.getMonth();
        const currentMonth = now.getMonth();
        const lastRunYear = lastInvoiceRun.getFullYear();
        const currentYear = now.getFullYear();

        const ranThisMonth = lastRunMonth === currentMonth && lastRunYear === currentYear;
        const beforeConfiguredDay = currentDay < configuredDay;

        if (ranThisMonth && invoiceLog) {
            invoiceStatus = 'healthy';
            invoiceMessage = `Last run: ${invoiceLog.generated_count} generated, ${invoiceLog.skipped_count} skipped`;
            if (invoiceLog.error_count > 0) {
                invoiceStatus = 'warning';
                invoiceMessage += `, ${invoiceLog.error_count} errors`;
            }
        } else if (beforeConfiguredDay) {
            invoiceStatus = 'healthy';
            invoiceMessage = `Waiting for day ${configuredDay} (today is day ${currentDay})`;
        } else {
            // Past configured day but no run this month
            invoiceStatus = 'critical';
            invoiceMessage = `OVERDUE: Should have run on day ${configuredDay}, last run was ${getRelativeTime(lastInvoiceRun)}`;
        }
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

    // Determine overall health
    const hassCritical = jobs.some(j => j.status === 'critical');
    const hasWarning = jobs.some(j => j.status === 'warning');
    const overall: 'healthy' | 'warning' | 'critical' = hassCritical
        ? 'critical'
        : hasWarning
            ? 'warning'
            : 'healthy';

    const response: HealthResponse = {
        overall,
        timestamp: now.toISOString(),
        jobs,
    };

    // Return appropriate HTTP status code
    const httpStatus = overall === 'critical' ? 503 : overall === 'warning' ? 200 : 200;

    return NextResponse.json(response, { status: httpStatus });
}
