import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
    currentMonthPeriod,
    prepareInvoiceGenerationRunCore,
    processInvoiceGenerationRunToCompletion,
} from '@/lib/billing/invoice-generation-run-service';
import { processInvoiceGenerationRunChunk } from '@/lib/billing/invoice-generation-worker';
import { getSystemSetting } from '@/lib/settings/get-system-setting';
import { createAdminClient } from '@/lib/supabase/server';

vi.mock('@/lib/billing/invoice-generation-worker', () => ({
    processInvoiceGenerationRunChunk: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
    createAdminClient: vi.fn(),
    createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/settings/get-system-setting', () => ({
    getSystemSetting: vi.fn(),
}));

const chunkMock = processInvoiceGenerationRunChunk as ReturnType<typeof vi.fn>;
const createAdminClientMock = createAdminClient as ReturnType<typeof vi.fn>;
const getSystemSettingMock = getSystemSetting as ReturnType<typeof vi.fn>;

describe('currentMonthPeriod', () => {
    it('formats the current month as a first-of-month period string', () => {
        expect(currentMonthPeriod(new Date('2026-08-15T10:00:00Z'))).toBe('2026-08-01');
        expect(currentMonthPeriod(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01-01');
        expect(currentMonthPeriod(new Date('2025-12-15T10:00:00Z'))).toBe('2025-12-01');
    });
});

describe('prepareInvoiceGenerationRunCore', () => {
    beforeEach(() => {
        createAdminClientMock.mockReset();
        getSystemSettingMock.mockReset();
        getSystemSettingMock.mockResolvedValue(false);
    });

    it('persists earliest-version fallback details in the durable run summary', async () => {
        const inserts: Array<Record<string, unknown>> = [];
        const houses = [{
            id: '11111111-1111-4111-8111-111111111111',
            house_number: '18A',
            street_id: '22222222-2222-4222-8222-222222222222',
            house_type_id: null,
            billing_profile_id: '33333333-3333-4333-8333-333333333333',
            property_status: 'occupied',
            is_active: true,
            resident_houses: [{
                resident_id: '44444444-4444-4444-8444-444444444444',
                resident_role: 'tenant',
                move_in_date: '2025-01-01',
                is_active: true,
                resident: { id: '44444444-4444-4444-8444-444444444444', first_name: 'Ada', last_name: 'Okafor', account_status: 'active' },
            }],
        }];
        const profiles = [{
            id: '33333333-3333-4333-8333-333333333333',
            name: 'Standard levy',
            target_type: 'house',
            applicable_roles: ['tenant'],
            is_one_time: false,
        }];
        const versions = [{
            id: '55555555-5555-4555-8555-555555555555',
            billing_profile_id: '33333333-3333-4333-8333-333333333333',
            effective_from: '2026-08-01',
            billing_profile_version_items: [{ id: 'item-1', name: 'Levy', amount: 5000, frequency: 'monthly', is_mandatory: true }],
        }];
        const from = vi.fn((table: string) => {
            if (table === 'houses') return { select: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ data: houses, error: null }) })) };
            if (table === 'billing_profiles') return { select: vi.fn(() => ({ in: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ data: profiles, error: null }) })) })) };
            if (table === 'billing_profile_versions') return { select: vi.fn(() => ({ in: vi.fn().mockResolvedValue({ data: versions, error: null }) })) };
            if (table === 'invoice_generation_runs') return {
                insert: vi.fn((payload: Record<string, unknown>) => {
                    inserts.push(payload);
                    return { select: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: { id: 'run-1', total_amount: 5000, status: 'queued' }, error: null }) })) };
                }),
            };
            if (table === 'invoice_generation_candidates') return { insert: vi.fn().mockResolvedValue({ error: null }) };
            throw new Error(`Unexpected table ${table}`);
        });
        createAdminClientMock.mockReturnValue({ from });

        const result = await prepareInvoiceGenerationRunCore({
            mode: 'selected_month',
            targetMonth: '2025-07-01',
            walletAllocation: false,
            sendEmails: false,
            assessLateFees: false,
            trigger: 'manual',
        }, 'actor-1');

        expect(result.error).toBeNull();
        expect(inserts).toHaveLength(1);
        expect(inserts[0]).toMatchObject({
            result_summary: {
                versionFallbacks: [{
                    houseId: '11111111-1111-4111-8111-111111111111',
                    house: '18A',
                    billingProfileId: '33333333-3333-4333-8333-333333333333',
                    billingProfileName: 'Standard levy',
                    periodStart: '2025-07-01',
                    versionId: '55555555-5555-4555-8555-555555555555',
                    effectiveFrom: '2026-08-01',
                }],
            },
        });
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
