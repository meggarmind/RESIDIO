/**
 * Service core for durable invoice generation runs.
 *
 * Shared by the authorized server actions (`invoice-generation-runs.ts`), the
 * cron route, and the legacy compatibility wrapper (`generate-invoices.ts`).
 * Callers are responsible for authorization; this module only performs data
 * work with the admin (service-role) client.
 */

import {
    InvoiceGenerationRequestSchema,
    resolveBillableCandidates,
    resolveInvoiceGenerationEligibility,
    type BillingProfileVersion,
    type GenerationHouse,
    type GenerationProfile,
    type InvoiceGenerationRequest,
} from '@/lib/billing/invoice-generation';
import { requiresDistinctInvoiceGenerationApproval, type InvoiceGenerationRunStatus } from '@/lib/billing/invoice-generation-run-policy';
import { processInvoiceGenerationRunChunk } from '@/lib/billing/invoice-generation-worker';
import type { InvoiceGenerationTrigger } from '@/lib/billing/invoice-generation-history';
import { getSystemSetting } from '@/lib/settings/get-system-setting';
import { createAdminClient } from '@/lib/supabase/server';

export interface PreparedInvoiceGenerationRun {
    id: string;
    status: InvoiceGenerationRunStatus;
    totalAmount: number;
    candidateCount: number;
    skipReasons: Array<{ house: string; reason: string }>;
}

export interface InvoiceGenerationRunRow {
    id: string;
    status: string;
    scope: Record<string, unknown> | null;
    options: Record<string, unknown> | null;
    candidate_count: number | null;
    created_count: number | null;
    skipped_count: number | null;
    failed_count: number | null;
    cancelled_count: number | null;
    total_amount: number | null;
    total_wallet_allocated: number | null;
    email_queued_count: number | null;
    email_sent_count: number | null;
    email_failed_count: number | null;
    result_summary: Record<string, unknown> | null;
    requested_at: string;
    requested_by: string | null;
    started_at: string | null;
    completed_at: string | null;
}

/** Build and persist a generation run with candidates; never creates invoices. */
export async function prepareInvoiceGenerationRunCore(
    request: InvoiceGenerationRequest,
    actorId: string | null
): Promise<{ data: PreparedInvoiceGenerationRun | null; error: string | null }> {
    const supabase = createAdminClient();
    const [dualSetting, thresholdSetting] = await Promise.all([
        getSystemSetting(supabase, 'invoice_generation_dual_approval_enabled'),
        getSystemSetting(supabase, 'invoice_generation_high_value_threshold'),
    ]);
    const { data: houses, error: housesError } = await supabase.from('houses').select('id, house_number, street_id, house_type_id, billing_profile_id, property_status, is_active, resident_houses(resident_id, resident_role, move_in_date, is_active, resident:residents!resident_id(id, first_name, last_name, account_status))').eq('is_active', true);
    if (housesError) return { data: null, error: housesError.message };
    const houseTypeIds = [...new Set((houses || []).map((house) => house.house_type_id).filter((id): id is string => Boolean(id)))];
    const { data: houseTypes, error: typeError } = houseTypeIds.length ? await supabase.from('house_types').select('id, billing_profile_id').in('id', houseTypeIds) : { data: [], error: null };
    if (typeError) return { data: null, error: typeError.message };
    const profileForType = new Map((houseTypes || []).map((item) => [item.id, item.billing_profile_id]));
    const profileIds = [...new Set((houses || []).map((house) => house.billing_profile_id || profileForType.get(house.house_type_id || '')).filter((id): id is string => Boolean(id)))];
    const [{ data: profiles, error: profileError }, { data: versions, error: versionError }, billVacant, billRenovation, billConstruction, dueWindow] = await Promise.all([
        profileIds.length ? supabase.from('billing_profiles').select('id, name, target_type, applicable_roles, is_one_time').in('id', profileIds).eq('is_active', true) : Promise.resolve({ data: [], error: null }),
        profileIds.length ? supabase.from('billing_profile_versions').select('id, billing_profile_id, effective_from, billing_profile_version_items(id, name, amount, frequency, is_mandatory)').in('billing_profile_id', profileIds) : Promise.resolve({ data: [], error: null }),
        getSystemSetting(supabase, 'bill_vacant_houses'), getSystemSetting(supabase, 'bill_under_renovation_houses'), getSystemSetting(supabase, 'bill_under_construction_houses'), getSystemSetting(supabase, 'invoice_due_window_days'),
    ]);
    if (profileError || versionError) return { data: null, error: profileError?.message || versionError?.message || 'Could not load billing profiles' };
    const resolution = resolveBillableCandidates({
        request,
        profiles: (profiles || []).filter((profile) => !profile.is_one_time).map((profile) => ({ id: profile.id, name: profile.name, targetType: profile.target_type as GenerationProfile['targetType'], applicableRoles: profile.applicable_roles as GenerationProfile['applicableRoles'] })),
        versions: (versions || []).map((version) => ({ id: version.id, billingProfileId: version.billing_profile_id, effectiveFrom: version.effective_from, items: (version.billing_profile_version_items || []).map((item) => ({ id: item.id, name: item.name, amount: Number(item.amount), frequency: item.frequency, isMandatory: item.is_mandatory })) })) as BillingProfileVersion[],
        houses: (houses || []).map((house) => ({ id: house.id, label: house.house_number, streetId: house.street_id, billingProfileId: house.billing_profile_id || profileForType.get(house.house_type_id || '') || null, propertyStatus: house.property_status || 'occupied', isActive: house.is_active, residents: (house.resident_houses || []).map((link) => { const resident = Array.isArray(link.resident) ? link.resident[0] : link.resident; return { id: link.resident_id, name: resident ? `${resident.first_name} ${resident.last_name}` : 'Unknown', accountStatus: resident?.account_status || 'inactive', role: link.resident_role, moveInDate: link.move_in_date, isActive: link.is_active }; }) })) as GenerationHouse[],
        eligibility: resolveInvoiceGenerationEligibility({ billVacantHouses: billVacant, billUnderRenovation: billRenovation, billUnderConstruction: billConstruction, dueWindowDays: dueWindow }),
    });
    const totalAmount = resolution.candidates.reduce((total, candidate) => total + candidate.amountDue, 0);
    const status: InvoiceGenerationRunStatus = requiresDistinctInvoiceGenerationApproval({
        mode: request.mode,
        dualApprovalEnabled: Boolean(dualSetting),
        totalAmount,
        threshold: Number(thresholdSetting) || 1_000_000,
    }) ? 'awaiting_approval' : 'queued';
    const created = await supabase.from('invoice_generation_runs').insert({ requested_by: actorId, scope: { mode: request.mode, targetMonth: request.targetMonth, fromMonth: request.fromMonth, houseId: request.houseId, streetId: request.streetId, residentId: request.residentId, trigger: request.trigger }, options: { walletAllocation: request.walletAllocation, sendEmails: request.sendEmails, assessLateFees: request.assessLateFees, confirmation: request.confirmation }, status, candidate_count: resolution.candidates.length, skipped_count: resolution.skips.length, total_amount: totalAmount, result_summary: { skips: resolution.skips } }).select('id, total_amount, status').single();
    if (created.error || !created.data) return { data: null, error: created.error?.message || 'Could not create invoice generation run' };
    if (resolution.candidates.length) {
        const inserted = await supabase.from('invoice_generation_candidates').insert(resolution.candidates.map((candidate) => ({ run_id: created.data.id, resident_id: candidate.residentId, house_id: candidate.houseId, billing_profile_id: candidate.billingProfileId, billing_profile_version_id: candidate.billingProfileVersionId, period_start: candidate.periodStart, period_end: candidate.periodEnd, due_date: candidate.dueDate, amount_due: candidate.amountDue, rate_snapshot: { items: candidate.invoiceItems }, invoice_items: candidate.invoiceItems, wallet_allocation_requested: request.walletAllocation })));
        if (inserted.error) {
            await supabase.from('invoice_generation_runs').delete().eq('id', created.data.id);
            return { data: null, error: inserted.error.message };
        }
    }
    return {
        data: {
            id: created.data.id,
            status: created.data.status as InvoiceGenerationRunStatus,
            totalAmount: Number(created.data.total_amount ?? totalAmount),
            candidateCount: resolution.candidates.length,
            skipReasons: resolution.skips.map(({ house, reason }) => ({ house, reason })),
        },
        error: null,
    };
}

/** Find the newest non-cancelled run for a trigger + target month, if any. */
export async function findReusableInvoiceGenerationRun(
    trigger: InvoiceGenerationTrigger,
    targetMonth: string
): Promise<InvoiceGenerationRunRow | null> {
    const supabase = createAdminClient();
    const { data } = await supabase
        .from('invoice_generation_runs')
        .select('*')
        .contains('scope', { trigger, targetMonth })
        .neq('status', 'cancelled')
        .order('requested_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    return (data as unknown as InvoiceGenerationRunRow) ?? null;
}

export interface ProcessedInvoiceGenerationRun {
    run: InvoiceGenerationRunRow | null;
    processed: number;
    capped: boolean;
}

/**
 * Advance a run chunk-by-chunk until it reaches a terminal state or the
 * chunk budget is exhausted. Never recreates invoices (the RPC is idempotent).
 */
export async function processInvoiceGenerationRunToCompletion(
    runId: string,
    actorId: string | null,
    maxChunks = 40
): Promise<ProcessedInvoiceGenerationRun> {
    let processed = 0;
    let run: InvoiceGenerationRunRow | null = null;
    for (let chunk = 0; chunk < maxChunks; chunk += 1) {
        const result = await processInvoiceGenerationRunChunk(runId, actorId);
        processed += result.processed;
        run = (result.run as unknown as InvoiceGenerationRunRow) ?? run;
        if (result.processed === 0) return { run, processed, capped: false };
        if (run && run.status !== 'queued' && run.status !== 'processing') return { run, processed, capped: false };
    }
    return { run, processed, capped: true };
}

/** Human-readable error messages for a run's failed candidates. */
export async function collectInvoiceGenerationRunErrors(runId: string): Promise<string[]> {
    const supabase = createAdminClient();
    const { data } = await supabase
        .from('invoice_generation_candidates')
        .select('id, error_message')
        .eq('run_id', runId)
        .eq('status', 'failed')
        .limit(50);
    return (data || []).flatMap((candidate) =>
        candidate.error_message ? [`Candidate ${candidate.id.slice(0, 8)}: ${candidate.error_message}`] : []
    );
}

/** Current month as a `YYYY-MM-01` period string. */
export function currentMonthPeriod(now = new Date()): string {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Validate a raw request payload with the shared schema. */
export function parseInvoiceGenerationRequest(input: unknown): InvoiceGenerationRequest {
    return InvoiceGenerationRequestSchema.parse(input);
}
