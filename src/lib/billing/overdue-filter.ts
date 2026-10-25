// Overdue is derived, never stored: no job writes invoices.status = 'overdue'. An invoice is
// overdue when it is still open and its due date is strictly before today (due today is not overdue).
// The list filter, the summary and the Overdue card all go through here so they cannot disagree.
export const OVERDUE_OPEN_STATUSES = ['unpaid', 'partially_paid'] as const;

export function overdueCutoffDate(now: Date = new Date()): string {
    return now.toISOString().split('T')[0];
}

// Typed as `any` for the same reason as applyInvoiceFilters in get-invoices.ts (TS2589).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyOverdueFilter(query: any, today: string = overdueCutoffDate()): any {
    return query.in('status', [...OVERDUE_OPEN_STATUSES]).lt('due_date', today);
}
