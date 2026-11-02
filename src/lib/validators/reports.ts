import { z } from 'zod';

import { PERMISSIONS, type Permission } from '@/lib/auth/action-roles';

// Picker groups. Occupancy and Security have no entries yet; their reports come in later issues.
export type ReportGroup = 'Money in and out' | 'Debts' | 'Levies' | 'Occupancy' | 'Security';

// Report Types: the single list of reports. The request and schedule schemas, the page guard,
// the picker, the engine and the menu all derive from it (#1397). `permission` is what a user
// needs to run, list or schedule that report. `retired` marks a report that is no longer offered:
// it stays in the list so History and Archive still show and open old rows, but it is not picked,
// scheduled or generated again (#1399).
export const reportTypes = [
    { value: 'financial_overview', label: 'Financial Overview', description: 'Summary of income, expenses, and net balance', group: 'Money in and out', permission: PERMISSIONS.REPORTS_VIEW_FINANCIAL },
    { value: 'collection_report', label: 'Collection Report', description: 'Payment collection summary by resident', group: 'Money in and out', permission: PERMISSIONS.REPORTS_VIEW_FINANCIAL },
    { value: 'invoice_aging', label: 'Invoice Aging Report', description: 'Outstanding invoices by age brackets', group: 'Debts', permission: PERMISSIONS.REPORTS_VIEW_FINANCIAL, retired: true },
    { value: 'transaction_log', label: 'Transaction Log', description: 'Detailed list of all transactions', group: 'Money in and out', permission: PERMISSIONS.REPORTS_VIEW_FINANCIAL },
    { value: 'debtors_report', label: 'Debtors Report', description: 'Detailed debtors list with aging buckets and contact info', group: 'Debts', permission: PERMISSIONS.REPORTS_VIEW_FINANCIAL, retired: true },
    { value: 'statement_of_account', label: 'Statement of account', description: 'Every charge and payment of one house or one resident in the period, with a running balance', group: 'Money in and out', permission: PERMISSIONS.REPORTS_VIEW_FINANCIAL },
    { value: 'debtors_aging', label: 'Debtors and aging', description: 'Who owes what, and for how long: every debtor with contact details and the amount in each age bucket', group: 'Debts', permission: PERMISSIONS.REPORTS_VIEW_FINANCIAL },
    { value: 'dues_collection_status', label: 'Dues, levies and collection status', description: 'One sheet per house: each month paid or not paid in the period, the levy status and the total owed', group: 'Debts', permission: PERMISSIONS.REPORTS_VIEW_FINANCIAL },
    { value: 'indebtedness_summary', label: 'Indebtedness Report', description: 'Simple indebted/non-indebted status per house with optional amounts', group: 'Debts', permission: PERMISSIONS.REPORTS_VIEW_FINANCIAL, retired: true },
    { value: 'indebtedness_detail', label: 'Indebtedness Detail Report', description: 'Detailed breakdown of indebtedness per property', group: 'Debts', permission: PERMISSIONS.REPORTS_VIEW_FINANCIAL, retired: true },
    { value: 'development_levy', label: 'Development Levy Report', description: 'Development levy status per property', group: 'Levies', permission: PERMISSIONS.REPORTS_VIEW_FINANCIAL },
] as const satisfies readonly { value: string; label: string; description: string; group: ReportGroup; permission: Permission; retired?: true }[];

export type ReportType = typeof reportTypes[number]['value'];
export const REPORT_TYPE_LABELS = Object.fromEntries(
    reportTypes.map(rt => [rt.value, rt.label])
) as Record<ReportType, string>;

/**
 * The reports the generator can produce: one per case in `generateReportWithClient`
 * (`@/lib/reports/report-generator`); a test keeps the two in step. A listed report not here can be
 * picked but not generated, so it must not be scheduled (#1397).
 */
export const GENERATABLE_REPORT_TYPES: readonly ReportType[] = [
    'financial_overview',
    'collection_report',
    'transaction_log',
    'debtors_aging',
    'dues_collection_status',
    'development_levy',
    'statement_of_account',
];

/** True when `type` is a retired report: still listed for old rows, never run again (#1399). */
export function isRetiredReport(type: string): boolean {
    return reportTypes.some((rt) => rt.value === type && 'retired' in rt && rt.retired === true);
}

/** The report that took over from each retired one. A schedule saved for a retired report runs as this. */
export const RETIRED_REPORT_REPLACEMENTS: Partial<Record<ReportType, ReportType>> = {
    debtors_report: 'debtors_aging',
    invoice_aging: 'debtors_aging',
    indebtedness_summary: 'dues_collection_status',
    indebtedness_detail: 'dues_collection_status',
};

/** `type`, or the report that replaced it when `type` is retired. */
export function resolveRetiredReport<T extends ReportType>(type: T): ReportType {
    return RETIRED_REPORT_REPLACEMENTS[type] ?? type;
}

/** True when the generator has a case for `type`. */
export function hasGenerator(type: string): boolean {
    return (GENERATABLE_REPORT_TYPES as readonly string[]).includes(type);
}

/** Every report value, as a tuple for z.enum. */
export const REPORT_TYPE_VALUES = reportTypes.map((rt) => rt.value) as [ReportType, ...ReportType[]];

/** The distinct permissions the reports ask for. Holding any one of them opens the Reports page. */
export const REPORT_VIEW_PERMISSIONS: Permission[] = [...new Set(reportTypes.map((rt) => rt.permission))];

/** The permission that runs `type`, or null for a value that is not a listed report. */
export function getReportPermission(type: string): Permission | null {
    return reportTypes.find((rt) => rt.value === type)?.permission ?? null;
}

/** The reports a user holding `permissions` may run, list and see in history. */
export function reportsForPermissions(permissions: readonly string[]): ReportType[] {
    return reportTypes.filter((rt) => permissions.includes(rt.permission)).map((rt) => rt.value);
}

/** The reports a user holding `permissions` may start or schedule: `reportsForPermissions` without the retired ones. */
export function runnableReportsForPermissions(permissions: readonly string[]): ReportType[] {
    return reportTypes
        .filter((rt) => permissions.includes(rt.permission) && !isRetiredReport(rt.value))
        .map((rt) => rt.value);
}

// Period Presets
export const periodPresets = [
    { value: 'this_month', label: 'This Month', description: 'Current calendar month' },
    { value: 'last_month', label: 'Last Month', description: 'Previous calendar month' },
    { value: 'this_quarter', label: 'This Quarter', description: 'Current calendar quarter' },
    { value: 'last_quarter', label: 'Last Quarter', description: 'Previous calendar quarter' },
    { value: 'this_year', label: 'This Year', description: 'Current calendar year to date' },
    { value: 'last_year', label: 'Last Year', description: 'Previous calendar year' },
    { value: 'custom', label: 'Custom Range', description: 'Select specific start and end dates' },
] as const;

export type PeriodPreset = typeof periodPresets[number]['value'];

// Aggregation Options
export const aggregationOptions = [
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'none', label: 'No Aggregation' },
] as const;

export type AggregationType = typeof aggregationOptions[number]['value'];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Report Request Schema
export const reportRequestSchema = z.object({
    reportType: z.enum(REPORT_TYPE_VALUES),
    periodPreset: z.enum(['this_month', 'last_month', 'this_quarter', 'last_quarter', 'this_year', 'last_year', 'custom']),
    startDate: z.string().default(''),
    endDate: z.string().default(''),
    bankAccountIds: z.array(z.string()).default([]),
    categoryIds: z.array(z.string()).default([]),
    transactionType: z.enum(['all', 'credit', 'debit']).default('all'),
    aggregation: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'none']).default('monthly'),
    includeCharts: z.boolean().default(true),
    includeDetails: z.boolean().default(true),
    includeUnoccupied: z.boolean().default(false),
    includeAmount: z.boolean().default(false),
    paymentStatus: z.enum(['all', 'paid', 'unpaid']).default('all'),
    // What the dues sheet covers: a `charge_categories.code` (#1400). Other reports ignore it.
    chargeCategory: z.string().regex(/^[a-z][a-z0-9_]*$/).default('dues'),
    // Whose statement a Statement of account is: a house or a resident, by id (#1402). Other reports ignore them.
    statementFor: z.enum(['house', 'resident']).optional(),
    statementId: z.string().regex(UUID_PATTERN, 'Choose a house or a resident').optional(),
});

/**
 * Why a schedule cannot be saved with this configuration, or null. A Statement of account schedule
 * must carry the house or resident it is for (#1402), or every run would fail.
 */
export function scheduleConfigurationError(type: string, configuration: Record<string, unknown> | null | undefined): string | null {
    if (type !== 'statement_of_account') return null;
    const statementFor = configuration?.statementFor;
    const statementId = configuration?.statementId;
    if ((statementFor !== 'house' && statementFor !== 'resident') || typeof statementId !== 'string' || !UUID_PATTERN.test(statementId)) {
        return 'A Statement of account schedule needs the house or resident it is for.';
    }
    return null;
}

export type ReportRequestFormData = z.infer<typeof reportRequestSchema>;

// Helper to calculate dates from preset
export function getDateRangeFromPreset(preset: PeriodPreset): { startDate: string; endDate: string } {
    const now = new Date();
    let startDate: Date;
    let endDate: Date;

    switch (preset) {
        case 'this_month':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            break;
        case 'last_month':
            startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            endDate = new Date(now.getFullYear(), now.getMonth(), 0);
            break;
        case 'this_quarter':
            const currentQuarter = Math.floor(now.getMonth() / 3);
            startDate = new Date(now.getFullYear(), currentQuarter * 3, 1);
            endDate = new Date(now.getFullYear(), (currentQuarter + 1) * 3, 0);
            break;
        case 'last_quarter':
            const lastQuarter = Math.floor(now.getMonth() / 3) - 1;
            const yearAdjust = lastQuarter < 0 ? -1 : 0;
            const adjustedQuarter = lastQuarter < 0 ? 3 : lastQuarter;
            startDate = new Date(now.getFullYear() + yearAdjust, adjustedQuarter * 3, 1);
            endDate = new Date(now.getFullYear() + yearAdjust, (adjustedQuarter + 1) * 3, 0);
            break;
        case 'this_year':
            startDate = new Date(now.getFullYear(), 0, 1);
            endDate = now;
            break;
        case 'last_year':
            startDate = new Date(now.getFullYear() - 1, 0, 1);
            endDate = new Date(now.getFullYear() - 1, 11, 31);
            break;
        default:
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }

    return {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
    };
}
