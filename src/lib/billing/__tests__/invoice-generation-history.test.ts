import { describe, expect, it } from 'vitest';
import {
    mapInvoiceGenerationRunToHistoryEntry,
    mergeGenerationHistory,
    type GenerationHistoryEntry,
    type InvoiceGenerationRunHistoryRow,
} from '@/lib/billing/invoice-generation-history';

const baseRun: InvoiceGenerationRunHistoryRow = {
    id: '11111111-1111-1111-1111-111111111111',
    requested_at: '2026-08-02T06:00:00Z',
    requested_by: null,
    started_at: '2026-08-02T06:00:05Z',
    completed_at: '2026-08-02T06:01:00Z',
    status: 'completed',
    scope: { trigger: 'cron', targetMonth: '2026-08-01', mode: 'selected_month' },
    options: { walletAllocation: false, sendEmails: false, assessLateFees: false },
    candidate_count: 10,
    created_count: 8,
    skipped_count: 2,
    failed_count: 0,
    cancelled_count: 0,
    total_amount: 80000,
    total_wallet_allocated: 0,
    email_queued_count: 0,
    email_sent_count: 0,
    email_failed_count: 0,
    result_summary: { pending: 0, created: 8, skipped: 2, skips: [{ house: 'IBB-1', reason: 'vacant' }] },
};

describe('invoice generation history mapping', () => {
    it('maps a durable run row into the shared history-entry shape', () => {
        const entry = mapInvoiceGenerationRunToHistoryEntry(baseRun);
        expect(entry).toMatchObject({
            id: baseRun.id,
            source: 'run',
            trigger_type: 'cron',
            target_period: '2026-08-01',
            generated_count: 8,
            skipped_count: 2,
            error_count: 0,
            run_status: 'completed',
            wallet_allocated: 0,
        });
        expect(entry.skip_reasons).toEqual([{ house: 'IBB-1', reason: 'vacant' }]);
        expect(entry.duration_ms).toBe(55000);
    });

    it('reports pending candidates separately instead of counting them as skipped', () => {
        const entry = mapInvoiceGenerationRunToHistoryEntry({
            ...baseRun,
            status: 'processing',
            completed_at: null,
            created_count: 3,
            skipped_count: 0,
            result_summary: { pending: 7, created: 3, skipped: 0 },
        });
        expect(entry.skipped_count).toBe(0);
        expect(entry.pending_count).toBe(7);
        expect(entry.run_status).toBe('processing');
    });

    it('falls back to requested_at when a run has not started', () => {
        const entry = mapInvoiceGenerationRunToHistoryEntry({
            ...baseRun,
            started_at: null,
            completed_at: null,
        });
        expect(entry.generated_at).toBe('2026-08-02T06:00:00Z');
        expect(entry.duration_ms).toBeNull();
    });

    it('normalises unknown triggers to manual and missing periods to null', () => {
        const entry = mapInvoiceGenerationRunToHistoryEntry({ ...baseRun, scope: {} });
        expect(entry.trigger_type).toBe('manual');
        expect(entry.target_period).toBeNull();
    });
});

describe('invoice generation history merge', () => {
    const runEntry = (id: string, at: string): GenerationHistoryEntry => ({
        id, generated_at: at, generated_by: null, trigger_type: 'cron', target_period: '2026-08-01',
        generated_count: 1, skipped_count: 0, error_count: 0, skip_reasons: null, errors: null,
        duration_ms: null, created_at: at, source: 'run',
    });
    const legacyEntry = (id: string, at: string): GenerationHistoryEntry => ({
        id, generated_at: at, generated_by: null, trigger_type: 'manual', target_period: '2026-07-01',
        generated_count: 1, skipped_count: 0, error_count: 0, skip_reasons: null, errors: null,
        duration_ms: null, created_at: at, source: 'legacy',
    });

    it('merges run and legacy entries newest-first without double counting', () => {
        const runs = [runEntry('r1', '2026-08-02T06:00:00Z'), runEntry('r2', '2026-08-01T06:00:00Z')];
        const legacy = [legacyEntry('l1', '2026-07-31T06:00:00Z'), legacyEntry('l2', '2026-07-30T06:00:00Z')];
        const page1 = mergeGenerationHistory(runs, legacy, 1, 2);
        expect(page1.total).toBe(4);
        expect(page1.entries.map((entry) => entry.id)).toEqual(['r1', 'r2']);
        const page2 = mergeGenerationHistory(runs, legacy, 2, 2);
        expect(page2.entries.map((entry) => entry.id)).toEqual(['l1', 'l2']);
    });

    it('returns an empty page when both sources are empty', () => {
        const page = mergeGenerationHistory([], [], 1, 10);
        expect(page.total).toBe(0);
        expect(page.entries).toEqual([]);
    });
});
