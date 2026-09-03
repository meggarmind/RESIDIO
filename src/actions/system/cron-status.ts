'use server';

import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { computeCronStatus, type HealthResponse } from '@/lib/system/cron-status';

/**
 * Get cron job health status.
 *
 * Fetches the status of all scheduled cron jobs including:
 * - Invoice generation (monthly)
 * - Report generation (daily)
 * - Notification processing (every 5 minutes)
 * - Announcement publishing (hourly)
 * - Email import (hourly)
 *
 * Calls `computeCronStatus()` directly rather than making an HTTP round trip
 * to `GET /api/health/cron-status` — a server action's own `fetch()` of its
 * own app's route does not forward the caller's session cookies, so once
 * that route requires SYSTEM_MONITOR the fetch would always fail. Calling
 * the shared module here means this permission check actually gates the
 * data, instead of sitting in front of a route that fetches it anyway.
 *
 * @returns Health status with job details
 */
export async function getCronStatus(): Promise<{ data?: HealthResponse; error?: string }> {
  // Check permission
  const auth = await authorizePermission(PERMISSIONS.SYSTEM_MONITOR);
  if (!auth.authorized) {
    return { error: auth.error || 'Unauthorized' };
  }

  try {
    const data = await computeCronStatus();
    return { data };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch cron status';
    return { error: errorMessage };
  }
}
