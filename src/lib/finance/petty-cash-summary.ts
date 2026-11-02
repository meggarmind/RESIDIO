/**
 * Pure part of the petty cash metrics: turns an account row into the figures the Expenditure page and
 * the Petty cash report both show. No auth and no database access, so a report that runs under its own
 * permission (REPORTS_VIEW_FINANCIAL) can share it with `getPettyCashMetrics` (#1404).
 */

export interface PettyCashAccountRow {
    id: string;
    name: string;
    current_balance: number | string | null;
    initial_float: number | string | null;
    last_replenishment_at: string | null;
    is_active: boolean;
}

export interface PettyCashAccountSummary {
    id: string;
    name: string;
    currentBalance: number;
    initialFloat: number;
    lastReplenishmentAt: string | null;
    isActive: boolean;
}

export function summarizePettyCashAccount(acc: PettyCashAccountRow): PettyCashAccountSummary {
    return {
        id: acc.id,
        name: acc.name,
        currentBalance: Number(acc.current_balance) || 0,
        initialFloat: Number(acc.initial_float) || 0,
        lastReplenishmentAt: acc.last_replenishment_at,
        isActive: acc.is_active,
    };
}
