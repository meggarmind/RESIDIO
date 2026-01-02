import { NextRequest, NextResponse } from 'next/server';
import { generateMonthlyInvoices } from '@/actions/billing/generate-invoices';
import {
    getInvoiceGenerationDay,
    getAutoGenerateEnabled,
} from '@/actions/billing/get-generation-log';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { createLogger } from '@/lib/logger';

const log = createLogger('[Cron]');

// Configure for Vercel
export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes max (invoice generation can take time)

/**
 * Vercel Cron endpoint for automated monthly invoice generation
 * Scheduled to run daily at 6 AM UTC (configured in vercel.json)
 *
 * The endpoint checks:
 * 1. If auto-generation is enabled
 * 2. If today matches the configured generation day
 *
 * Authentication: Bearer token matching CRON_SECRET env var (timing-safe)
 */
export async function GET(request: NextRequest) {
    // Verify cron secret using timing-safe comparison
    const authError = verifyCronAuth(request);
    if (authError) return authError;

    try {
        log.info('Checking invoice generation conditions');

        // Check if auto-generation is enabled
        const autoGenResult = await getAutoGenerateEnabled();
        if (!autoGenResult.data) {
            log.info('Auto-generation is disabled');
            return NextResponse.json({
                skipped: true,
                reason: 'Auto-generation is disabled',
                timestamp: new Date().toISOString(),
            });
        }

        // Check if today matches the configured generation day
        const genDayResult = await getInvoiceGenerationDay();
        const configuredDay = genDayResult.data;
        const today = new Date();
        const dayOfMonth = today.getDate();

        if (dayOfMonth !== configuredDay) {
            log.info(`Not generation day (today: ${dayOfMonth}, configured: ${configuredDay})`);
            return NextResponse.json({
                skipped: true,
                reason: `Not generation day (today: ${dayOfMonth}, configured: ${configuredDay})`,
                timestamp: new Date().toISOString(),
            });
        }

        log.info('Starting automated invoice generation');
        const result = await generateMonthlyInvoices(new Date(), 'cron');

        log.info('Invoice generation completed:', {
            generated: result.generated,
            skipped: result.skipped,
            errors: result.errors.length,
        });

        return NextResponse.json({
            success: result.success,
            generated: result.generated,
            skipped: result.skipped,
            errorCount: result.errors.length,
            errors: result.errors.slice(0, 10), // Limit error output
            logId: result.logId,
            durationMs: result.durationMs,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        log.error('Invoice generation error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
