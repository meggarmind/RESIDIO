import { NextRequest, NextResponse } from 'next/server';
import { applyLateFees, getLateFeeSettings } from '@/actions/billing/apply-late-fees';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { createLogger } from '@/lib/logger';

const log = createLogger('[Cron]');

// Configure for Vercel
export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes max

/**
 * Vercel Cron endpoint for automated late fee application
 * Scheduled to run daily at 7 AM UTC (configured in vercel.json)
 *
 * The endpoint checks:
 * 1. If late fee auto-application is enabled
 * 2. If today matches the configured application day
 *
 * Authentication: Bearer token matching CRON_SECRET env var (timing-safe)
 */
export async function GET(request: NextRequest) {
  // Verify cron secret using timing-safe comparison
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  try {
    log.info('Checking late fee application conditions');

    // Get late fee settings
    const settings = await getLateFeeSettings();

    // Check if late fees are enabled
    if (!settings.enabled) {
      log.info('Late fees are disabled');
      return NextResponse.json({
        skipped: true,
        reason: 'Late fees are disabled',
        timestamp: new Date().toISOString(),
      });
    }

    // Check if auto-application is enabled
    if (!settings.autoApply) {
      log.info('Late fee auto-application is disabled');
      return NextResponse.json({
        skipped: true,
        reason: 'Late fee auto-application is disabled',
        timestamp: new Date().toISOString(),
      });
    }

    // Check if today matches the configured application day
    const today = new Date();
    const dayOfMonth = today.getDate();

    if (dayOfMonth !== settings.applicationDay) {
      log.info(`Not application day (today: ${dayOfMonth}, configured: ${settings.applicationDay})`);
      return NextResponse.json({
        skipped: true,
        reason: `Not application day (today: ${dayOfMonth}, configured: ${settings.applicationDay})`,
        timestamp: new Date().toISOString(),
      });
    }

    log.info('Starting automated late fee application');
    const result = await applyLateFees('cron');

    log.info('Late fee application completed:', {
      processed: result.processed,
      applied: result.applied,
      totalLateFees: result.totalLateFees,
      skippedWaiver: result.skippedWaiver,
      skippedAlreadyApplied: result.skippedAlreadyApplied,
      errors: result.errors.length,
    });

    return NextResponse.json({
      success: result.success,
      processed: result.processed,
      applied: result.applied,
      totalLateFees: result.totalLateFees,
      skippedWaiver: result.skippedWaiver,
      skippedAlreadyApplied: result.skippedAlreadyApplied,
      errorCount: result.errors.length,
      errors: result.errors.slice(0, 10), // Limit error output
      logId: result.logId,
      durationMs: result.durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error('Late fee application error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
