import { NextRequest, NextResponse } from 'next/server';
import {
    getInvoiceGenerationDay,
    getAutoGenerateEnabled,
} from '@/actions/billing/get-generation-log';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { createLogger } from '@/lib/logger';
import {
    currentMonthPeriod,
    findReusableInvoiceGenerationRun,
    parseInvoiceGenerationRequest,
    prepareInvoiceGenerationRunCore,
} from '@/lib/billing/invoice-generation-run-service';
import { processInvoiceGenerationRunChunk } from '@/lib/billing/invoice-generation-worker';
import { createAdminClient } from '@/lib/supabase/server';

const log = createLogger('[Cron]');

// Configure for Vercel
export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Vercel Cron endpoint for automated monthly invoice generation
 * (scheduled daily at 6 AM UTC in vercel.json).
 *
 * Conservative behavior:
 * 1. Every invocation may advance the newest queued/processing run by ONE
 *    bounded chunk (<= 50 candidates) via the idempotent RPC.
 * 2. Only on the configured generation day, and only when no run exists for
 *    the current month, it prepares a current-month estate-wide run with
 *    wallet allocation, resident emails, and late fees disabled.
 *
 * Authentication: Bearer token matching CRON_SECRET env var (timing-safe)
 */
export async function GET(request: NextRequest) {
    // Verify cron secret using timing-safe comparison
    const authError = verifyCronAuth(request);
    if (authError) return authError;

    try {
        const period = currentMonthPeriod();
        const response: Record<string, unknown> = { period, timestamp: new Date().toISOString() };

        // Check if auto-generation is enabled
        const autoGenResult = await getAutoGenerateEnabled();
        if (!autoGenResult.data) {
            log.info('Auto-generation is disabled');
            return NextResponse.json({ skipped: true, reason: 'Auto-generation is disabled', ...response });
        }

        // Advance the newest queued/processing run by one bounded chunk
        const admin = createAdminClient();
        const { data: activeRuns, error: activeError } = await admin
            .from('invoice_generation_runs')
            .select('id, status')
            .in('status', ['queued', 'processing'])
            .order('requested_at', { ascending: false })
            .limit(1);
        if (activeError) throw new Error(activeError.message);
        if (activeRuns && activeRuns.length > 0) {
            const active = activeRuns[0];
            const chunk = await processInvoiceGenerationRunChunk(active.id, null);
            response.advanced = { runId: active.id, processed: chunk.processed, status: chunk.run ? (chunk.run as { status: string }).status : null };
            log.info('Advanced invoice generation run', response.advanced as Record<string, unknown>);
        }

        // Prepare a current-month run only on the configured generation day
        const genDayResult = await getInvoiceGenerationDay();
        const configuredDay = genDayResult.data;
        const dayOfMonth = new Date().getDate();
        if (dayOfMonth !== configuredDay) {
            log.info(`Not generation day (today: ${dayOfMonth}, configured: ${configuredDay})`);
            return NextResponse.json({ skipped: true, reason: `Not generation day (today: ${dayOfMonth}, configured: ${configuredDay})`, ...response });
        }

        const existing = await findReusableInvoiceGenerationRun('cron', period);
        if (existing) {
            response.prepared = { skipped: true, runId: existing.id, status: existing.status, reason: 'Run already exists for this period' };
            return NextResponse.json({ success: true, ...response });
        }

        const prepared = await prepareInvoiceGenerationRunCore(
            parseInvoiceGenerationRequest({ mode: 'selected_month', targetMonth: period, trigger: 'cron', walletAllocation: false, sendEmails: false, assessLateFees: false }),
            null
        );
        if (!prepared.data) {
            return NextResponse.json({ success: false, error: prepared.error, ...response }, { status: 500 });
        }
        const chunk = await processInvoiceGenerationRunChunk(prepared.data.id, null);
        response.prepared = {
            runId: prepared.data.id,
            status: chunk.run ? (chunk.run as { status: string }).status : 'queued',
            candidates: prepared.data.candidateCount,
            processed: chunk.processed,
            walletAllocation: false,
            sendEmails: false,
            assessLateFees: false,
        };
        log.info('Prepared conservative invoice generation run', response.prepared as Record<string, unknown>);
        return NextResponse.json({ success: true, ...response });
    } catch (error) {
        log.error('Invoice generation error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
