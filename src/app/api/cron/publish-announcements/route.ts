import { NextRequest, NextResponse } from 'next/server';
import { publishAnnouncementCore } from '@/lib/announcements/publish';
import { insertBulkNotifications } from '@/lib/notifications/in-app';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { withSystemLog, type SystemLogRun } from '@/lib/system-log/with-system-log';
import { createLogger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/server';

const log = createLogger('[Cron:PublishAnnouncements]');

// Configure for Vercel
export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes max

/**
 * Vercel Cron endpoint for automated announcement publishing
 * Scheduled to run hourly (configured in vercel.json)
 *
 * The endpoint:
 * 1. Queries announcements with status='scheduled' AND scheduled_for <= NOW()
 * 2. Publishes each announcement
 * 3. Creates in-app notifications for target residents
 *
 * Authentication: Bearer token matching CRON_SECRET env var (timing-safe)
 *
 * There is no user session here, so it uses the admin client and the session-free publish and
 * notification cores; the System Action Log row records the run instead of an audit entry (#876).
 */
export async function GET(request: NextRequest) {
  // Verify cron secret using timing-safe comparison
  const authError = verifyCronAuth(request);
  if (authError) return authError;
  return withSystemLog('cron:publish-announcements', 'publish', runAnnouncementPublishing);
}

async function runAnnouncementPublishing(run: SystemLogRun) {

  try {
    log.info('Starting scheduled announcement publishing');

    const supabase = createAdminClient();
    const now = new Date().toISOString();

    // Query scheduled announcements ready to be published
    const { data: announcements, error: queryError } = await supabase
      .from('announcements')
      .select('*')
      .eq('status', 'scheduled')
      .lte('scheduled_for', now)
      .order('scheduled_for', { ascending: true });

    if (queryError) {
      log.error('Error querying scheduled announcements:', queryError);
      run.error = queryError;
      return NextResponse.json(
        { error: 'Database query failed' },
        { status: 500 }
      );
    }

    if (!announcements || announcements.length === 0) {
      log.info('No scheduled announcements ready for publishing');
      run.summary = { due: 0, published: 0, notificationsSent: 0 };
      return NextResponse.json({
        success: true,
        published: 0,
        notificationsSent: 0,
        message: 'No announcements to publish',
        timestamp: new Date().toISOString(),
      });
    }

    log.info(`Found ${announcements.length} announcements to publish`);

    const results = {
      published: 0,
      notificationsSent: 0,
      errors: [] as Array<{ id: string; error: string }>,
    };

    // Process each announcement
    for (const announcement of announcements) {
      try {
        // 1. Publish the announcement
        const publishResult = await publishAnnouncementCore(supabase, announcement.id, null);

        if (publishResult.error) {
          log.error(`Failed to publish announcement ${announcement.id}:`, publishResult.error);
          results.errors.push({
            id: announcement.id,
            error: publishResult.error,
          });
          continue;
        }

        log.info(`Published announcement: ${announcement.title}`);

        // 2. Determine target residents
        let recipientIds: string[] = [];

        if (announcement.target_audience === 'all' || announcement.target_audience === 'residents') {
          // Get all active residents
          const { data: residents } = await supabase
            .from('residents')
            .select('id')
            .eq('account_status', 'active');

          recipientIds = residents?.map((r) => r.id) || [];
        } else if (announcement.target_houses && announcement.target_houses.length > 0) {
          // Get residents in specific houses
          const { data: residentHouses } = await supabase
            .from('resident_houses')
            .select('resident_id')
            .in('house_id', announcement.target_houses)
            .eq('is_active', true);

          // Deduplicate resident IDs
          recipientIds = [...new Set(residentHouses?.map((rh) => rh.resident_id) || [])];
        }

        if (recipientIds.length === 0) {
          log.warn(`No target residents for announcement ${announcement.id}, skipping notifications`);
          results.published++;
          continue;
        }

        // 3. Create bulk in-app notifications
        const notifications = recipientIds.map((residentId) => ({
          recipient_id: residentId,
          title: announcement.title,
          body: announcement.summary || announcement.content.substring(0, 150),
          category: 'announcement' as const,
          entity_type: 'announcements',
          entity_id: announcement.id,
          action_url: '/portal/announcements',
          priority: (announcement.priority === 'emergency' ? 'urgent' : 'normal') as 'urgent' | 'normal',
          icon: 'megaphone',
        }));

        const notifResult = await insertBulkNotifications(supabase, notifications);

        if (notifResult.error) {
          log.error(`Failed to create notifications for announcement ${announcement.id}:`, notifResult.error);
          // Don't fail the whole process - announcement is already published
        } else {
          const count = notifResult.data?.length ?? 0;
          log.info(`Created ${count} notifications for announcement ${announcement.id}`);
          results.notificationsSent += count;
        }

        results.published++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        log.error(`Error processing announcement ${announcement.id}:`, error);
        results.errors.push({
          id: announcement.id,
          error: errorMessage,
        });
      }
    }

    log.info('Scheduled announcement publishing completed:', {
      published: results.published,
      notificationsSent: results.notificationsSent,
      errors: results.errors.length,
    });

    run.summary = {
      due: announcements.length,
      published: results.published,
      notificationsSent: results.notificationsSent,
      errorCount: results.errors.length,
      failedAnnouncementIds: results.errors.map((e) => e.id),
    };
    if (results.errors.length > 0) {
      run.outcome = results.published > 0 ? 'partial' : 'failure';
      run.error = results.errors[0].error;
    }

    return NextResponse.json({
      success: true,
      published: results.published,
      notificationsSent: results.notificationsSent,
      errorCount: results.errors.length,
      errors: results.errors.slice(0, 10), // Limit error output
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    run.error = error;
    log.error('Scheduled announcement publishing error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
