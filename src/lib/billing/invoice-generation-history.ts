/**
 * Pure mapping and merge helpers for invoice generation history.
 *
 * New generation records live in `invoice_generation_runs`; legacy records
 * remain in `invoice_generation_log`. These helpers map run rows into the
 * legacy history-entry shape so readers can merge both sources into one
 * timeline without double counting (new code no longer writes legacy rows).
 */

export type InvoiceGenerationTrigger = 'manual' | 'cron' | 'api';

export interface GenerationHistoryEntry {
    id: string;
    generated_at: string;
    generated_by: string | null;
    trigger_type: InvoiceGenerationTrigger;
    target_period: string | null;
    generated_count: number;
    skipped_count: number;
    error_count: number;
    skip_reasons: Array<{ house: string; reason: string }> | null;
    errors: string[] | null;
    duration_ms: number | null;
    created_at: string;
    actor?: {
        id: string;
        full_name: string;
        email: string;
    } | null;
    /** Which durable source produced this entry. */
    source: 'run' | 'legacy';
    /** Present for run-sourced entries: candidates still awaiting work. */
    pending_count?: number;
    /** Present for run-sourced entries: candidates cancelled before processing. */
    cancelled_count?: number;
    /** Present for run-sourced entries: wallet allocation total. */
    wallet_allocated?: number;
    email_queued?: number;
    email_sent?: number;
    email_failed?: number;
    /** Present for run-sourced entries: lifecycle status of the run. */
    run_status?: string;
}

export interface InvoiceGenerationRunHistoryRow {
    id: string;
    requested_at: string;
    requested_by: string | null;
    started_at: string | null;
    completed_at: string | null;
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
}

const asTrigger = (value: unknown): InvoiceGenerationTrigger =>
    value === 'cron' || value === 'api' ? value : 'manual';

const asPeriod = (value: unknown): string | null =>
    typeof value === 'string' ? value : null;

const asSkipReasons = (value: unknown): Array<{ house: string; reason: string }> | null => {
    if (!Array.isArray(value)) return null;
    return value.flatMap((item) =>
        item && typeof item === 'object' && 'house' in item && 'reason' in item
            ? [{ house: String((item as { house: unknown }).house), reason: String((item as { reason: unknown }).reason) }]
            : []
    );
};

/** Map a durable generation run row into the shared history-entry shape. */
export function mapInvoiceGenerationRunToHistoryEntry(run: InvoiceGenerationRunHistoryRow): GenerationHistoryEntry {
    const scope = run.scope ?? {};
    const summary = run.result_summary ?? {};
    const pending = typeof summary.pending === 'number' ? summary.pending : 0;
    return {
        id: run.id,
        generated_at: run.completed_at ?? run.started_at ?? run.requested_at,
        generated_by: run.requested_by,
        trigger_type: asTrigger(scope.trigger),
        target_period: asPeriod(scope.targetMonth),
        generated_count: run.created_count ?? 0,
        skipped_count: run.skipped_count ?? 0,
        error_count: run.failed_count ?? 0,
        skip_reasons: asSkipReasons(summary.skips),
        errors: null,
        duration_ms:
            run.started_at && run.completed_at
                ? new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()
                : null,
        created_at: run.requested_at,
        source: 'run',
        pending_count: pending,
        cancelled_count: run.cancelled_count ?? 0,
        wallet_allocated: run.total_wallet_allocated ?? 0,
        email_queued: run.email_queued_count ?? 0,
        email_sent: run.email_sent_count ?? 0,
        email_failed: run.email_failed_count ?? 0,
        run_status: run.status,
    };
}

/**
 * Merge run-sourced and legacy-sourced entries (each already sorted newest
 * first) into one newest-first page. Both lists are disjoint in time for new
 * records, so totals add without double counting.
 */
export function mergeGenerationHistory(
    runEntries: GenerationHistoryEntry[],
    legacyEntries: GenerationHistoryEntry[],
    page: number,
    limit: number
): { entries: GenerationHistoryEntry[]; total: number } {
    const merged = [...runEntries, ...legacyEntries].sort(
        (a, b) => new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime()
    );
    const start = (page - 1) * limit;
    return { entries: merged.slice(start, start + limit), total: merged.length };
}
