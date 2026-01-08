'use server';

import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';

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
 * Get cron job health status from health endpoint
 *
 * Fetches the status of all scheduled cron jobs including:
 * - Invoice generation (monthly)
 * - Report generation (daily)
 * - Notification processing (every 5 minutes)
 * - Announcement publishing (hourly)
 * - Email import (hourly)
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
    // Call existing health endpoint
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/health/cron-status`, {
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store', // Always get fresh data
    });

    if (!response.ok) {
      return { error: `Health endpoint returned ${response.status}` };
    }

    const data: HealthResponse = await response.json();
    return { data };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch cron status';
    return { error: errorMessage };
  }
}
