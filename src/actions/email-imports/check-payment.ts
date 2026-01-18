'use server';

import { fetchNewEmails } from './fetch-emails';
import { parseAllPendingEmails } from './parse-email';
import { matchEmailTransactions } from './process-email-import';
import { logAudit } from '@/lib/audit/logger';

/**
 * Orchestrates the full email import pipeline for manual payment verification.
 * 1. Fetches new emails (looking for recent alerts)
 * 2. Parses any pending raw emails
 * 3. Matches transactions to residents/wallets
 */
export async function checkPaymentEmails() {
    try {
        console.log('Starting manual payment check...');

        // 1. Fetch new emails
        // We limit scope to recent emails (last 3 days) to be fast
        const fetchResult = await fetchNewEmails({
            trigger: 'manual',
            maxEmails: 20,
            sinceDays: 3
        });

        if (!fetchResult.success || !fetchResult.importId) {
            console.error('Fetch failed:', fetchResult.error);
            return {
                success: false,
                message: fetchResult.error || 'Failed to check email server'
            };
        }

        const importId = fetchResult.importId;

        // 2. Parse pending
        // This processes any emails currently in 'pending' or 'parsing' state
        const parseResult = await parseAllPendingEmails(importId);

        // 3. Match transactions
        // This tries to match extracted transactions to residents
        const matchResult = await matchEmailTransactions(importId);

        const summary = {
            fetched: fetchResult.emailsFetched,
            parsed: parseResult.messagesParsed,
            matched: matchResult.matched
        };

        console.log('Payment check summary:', summary);

        // Audit this manual check
        await logAudit({
            action: 'VERIFY',
            entityType: 'email_imports',
            entityId: fetchResult.importId || 'manual-check',
            entityDisplay: 'Manual Payment Verification Check',
            newValues: summary
        });

        return {
            success: true,
            message: 'Verification check complete',
            details: summary
        };

    } catch (error) {
        console.error('Check payment emails failed:', error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Failed to verify payments'
        };
    }
}
