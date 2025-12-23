import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getFinancialOverview, getBankAccountsForFilter } from '@/actions/reports/get-financial-overview';
import { generateReport, type ReportData } from '@/actions/reports/report-engine';
import { getTransactionTags } from '@/actions/reference/transaction-tags';
import type { ReportRequestFormData } from '@/lib/validators/reports';
import { getDateRangeFromPreset } from '@/lib/validators/reports';

// ============================================================
// Bank Accounts Hook (for report filters)
// ============================================================

export function useBankAccountsForFilter() {
    return useQuery({
        queryKey: ['bank-accounts-filter'],
        queryFn: () => getBankAccountsForFilter(),
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}

// ============================================================
// Transaction Tags Hook (for report filters)
// ============================================================

export function useTransactionTagsForFilter() {
    return useQuery({
        queryKey: ['transaction-tags-filter'],
        queryFn: async () => {
            const result = await getTransactionTags({ include_inactive: false });
            if (result.error) throw new Error(result.error);
            return result.data;
        },
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}

// ============================================================
// Financial Overview Report Hook
// ============================================================

interface FinancialOverviewParams {
    startDate: string;
    endDate: string;
    transactionType?: 'credit' | 'debit' | 'all';
    bankAccountId?: string;
}

export function useFinancialOverview(params: FinancialOverviewParams | null) {
    return useQuery({
        queryKey: ['financial-overview', params],
        queryFn: () => {
            if (!params) throw new Error('No parameters provided');
            return getFinancialOverview({
                startDate: params.startDate,
                endDate: params.endDate,
                transactionType: params.transactionType,
                bankAccountId: params.bankAccountId,
            });
        },
        enabled: !!params && !!params.startDate && !!params.endDate,
    });
}

// ============================================================
// Report Generation Hook
// ============================================================

export type GeneratedReport = {
    id: string;
    type: ReportRequestFormData['reportType'];
    title: string;
    generatedAt: string;
    parameters: ReportRequestFormData;
    data: ReportData;
};

// In-memory store for generated reports (will be replaced with server storage later)
let generatedReports: GeneratedReport[] = [];

const reportTypeLabels: Record<ReportRequestFormData['reportType'], string> = {
    financial_overview: 'Financial Overview',
    collection_report: 'Collection Report',
    invoice_aging: 'Invoice Aging Report',
    transaction_log: 'Transaction Log',
};

export function useGenerateReport() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (params: ReportRequestFormData): Promise<GeneratedReport> => {
            // Use the new report engine that supports all 4 report types
            const result = await generateReport(params);

            if (!result.success || !result.report) {
                throw new Error(result.error || 'Failed to generate report');
            }

            // Calculate date range for title
            const dateRange = params.periodPreset === 'custom'
                ? { startDate: params.startDate || '', endDate: params.endDate || '' }
                : getDateRangeFromPreset(params.periodPreset);

            // Format title based on report type
            let title = reportTypeLabels[params.reportType];
            if (params.reportType !== 'invoice_aging') {
                title += ` - ${new Date(dateRange.startDate).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })} to ${new Date(dateRange.endDate).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`;
            } else {
                title += ` - As of ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
            }

            const report: GeneratedReport = {
                id: crypto.randomUUID(),
                type: params.reportType,
                title,
                generatedAt: new Date().toISOString(),
                parameters: params,
                data: result.report,
            };

            // Store in memory (will be replaced with server storage)
            generatedReports = [report, ...generatedReports.slice(0, 9)];

            return report;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['generated-reports'] });
        },
    });
}

// ============================================================
// Generated Reports List Hook
// ============================================================

export function useGeneratedReports() {
    return useQuery({
        queryKey: ['generated-reports'],
        queryFn: async () => {
            // Return in-memory reports (will be replaced with server fetch)
            return generatedReports;
        },
        staleTime: 0, // Always refetch
    });
}
