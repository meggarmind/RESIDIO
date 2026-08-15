import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
    currentMonthPeriod,
    processInvoiceGenerationRunToCompletion,
} from '@/lib/billing/invoice-generation-run-service';
import { processInvoiceGenerationRunChunk } from '@/lib/billing/invoice-generation-worker';

vi.mock('@/lib/billing/invoice-generation-worker', () => ({
    processInvoiceGenerationRunChunk: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
    createAdminClient: vi.fn(),
    createServerSupabaseClient: vi.fn(),
}));

const chunkMock = processInvoiceGenerationRunChunk as ReturnType<typeof vi.fn>;

describe('currentMonthPeriod', () => {
    it('formats the current month as a first-of-month period string', () => {
        expect(currentMonthPeriod(new Date('2026-08-15T10:00:00Z'))).toBe('2026-08-01');
        expect(currentMonthPeriod(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01-01');
        expect(currentMonthPeriod(new Date('2025-12-15T10:00:00Z'))).toBe('2025-12-01');
    });
});

describe('processInvoiceGenerationRunToCompletion', () => {
    beforeEach(() => {
        chunkMock.mockReset();
    });

    it('advances chunks until the run reaches a terminal state', async () => {
        chunkMock
            .mockResolvedValueOnce({ processed: 50, run: { status: 'processing' } })
            .mockResolvedValueOnce({ processed: 50, run: { status: 'processing' } })
            .mockResolvedValueOnce({ processed: 0, run: { status: 'completed' } });
        const outcome = await processInvoiceGenerationRunToCompletion('run-1', null);
        expect(outcome.processed).toBe(100);
        expect(outcome.capped).toBe(false);
        expect(outcome.run).toMatchObject({ status: 'completed' });
        expect(chunkMock).toHaveBeenCalledTimes(3);
    });

    it('stops as soon as a chunk reports a terminal status', async () => {
        chunkMock.mockResolvedValueOnce({ processed: 50, run: { status: 'completed_with_errors' } });
        const outcome = await processInvoiceGenerationRunToCompletion('run-2', null);
        expect(outcome.processed).toBe(50);
        expect(outcome.capped).toBe(false);
        expect(chunkMock).toHaveBeenCalledTimes(1);
    });

    it('caps the loop at the chunk budget when work remains', async () => {
        chunkMock.mockResolvedValue({ processed: 50, run: { status: 'processing' } });
        const outcome = await processInvoiceGenerationRunToCompletion('run-3', null, 3);
        expect(outcome.processed).toBe(150);
        expect(outcome.capped).toBe(true);
        expect(chunkMock).toHaveBeenCalledTimes(3);
    });
});
