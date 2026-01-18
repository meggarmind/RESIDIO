import { z } from 'zod';

// Report Types
export const reportTypes = [
    { value: 'financial_overview', label: 'Financial Overview', description: 'Summary of income, expenses, and net balance' },
    { value: 'collection_report', label: 'Collection Report', description: 'Payment collection summary by resident' },
    { value: 'invoice_aging', label: 'Invoice Aging Report', description: 'Outstanding invoices by age brackets' },
    { value: 'transaction_log', label: 'Transaction Log', description: 'Detailed list of all transactions' },
    { value: 'debtors_report', label: 'Debtors Report', description: 'Detailed debtors list with aging buckets and contact info' },
    { value: 'indebtedness_summary', label: 'Indebtedness Summary', description: 'Simple indebted/non-indebted status per house' },
    { value: 'indebtedness_detail', label: 'Indebtedness Report', description: 'Detailed indebtedness with amounts per house' },
    { value: 'development_levy', label: 'Development Levy Report', description: 'Development levy status per property' },
] as const;

export type ReportType = typeof reportTypes[number]['value'];
export const REPORT_TYPE_LABELS = Object.fromEntries(
    reportTypes.map(rt => [rt.value, rt.label])
) as Record<ReportType, string>;

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

// Report Request Schema
export const reportRequestSchema = z.object({
    reportType: z.enum(['financial_overview', 'collection_report', 'invoice_aging', 'transaction_log', 'debtors_report', 'indebtedness_summary', 'indebtedness_detail', 'development_levy']),
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
});

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
