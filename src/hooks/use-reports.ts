import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getFinancialOverview, getBankAccountsForFilter } from '@/actions/reports/get-financial-overview';
import { generateReport, type ReportData } from '@/actions/reports/report-engine';
import { getTransactionTags } from '@/actions/reference/transaction-tags';
import {
    getReportSchedules,
    getReportSchedule,
    createReportSchedule,
    updateReportSchedule,
    deleteReportSchedule,
    getGeneratedReports,
    getGeneratedReport,
    saveGeneratedReport,
    deleteGeneratedReport,
    createReportVersion,
    getReportVersionHistory,
    type ReportSchedule,
    type GeneratedReport as DBGeneratedReport,
    type CreateScheduleInput,
} from '@/actions/reports/report-schedules';
import type { ReportRequestFormData } from '@/lib/validators/reports';
import { getDateRangeFromPreset, REPORT_TYPE_LABELS } from '@/lib/validators/reports';
import { toast } from 'sonner';

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
    // Versioning fields
    version: number;
    parentReportId: string | null;
    isLatest: boolean;
    editNotes: string | null;
};

// In-memory store for generated reports (will be replaced with server storage later)
let generatedReports: GeneratedReport[] = [];

// Use central labels from validator
const reportTypeLabels = REPORT_TYPE_LABELS;

// Reports that are always "As of Today"
const REALTIME_REPORTS: ReportRequestFormData['reportType'][] = ['debtors_report', 'indebtedness_summary', 'indebtedness_detail', 'development_levy', 'invoice_aging'];

export function useGenerateReport() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (params: ReportRequestFormData & { saveToHistory?: boolean }): Promise<GeneratedReport> => {
            const startTime = Date.now();

            // Use the new report engine that supports all 4 report types
            const result = await generateReport(params);

            if (!result.success || !result.report) {
                throw new Error(result.error || 'Failed to generate report');
            }

            const durationMs = Date.now() - startTime;

            // Calculate date range for title
            const dateRange = params.periodPreset === 'custom'
                ? { startDate: params.startDate || '', endDate: params.endDate || '' }
                : getDateRangeFromPreset(params.periodPreset);

            // Format title based on report type
            let title = reportTypeLabels[params.reportType];
            if (REALTIME_REPORTS.includes(params.reportType)) {
                title += ` - As of ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
            } else {
                title += ` - ${new Date(dateRange.startDate).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })} to ${new Date(dateRange.endDate).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`;
            }

            // Save to database if requested (default: true)
            if (params.saveToHistory !== false) {
                await saveGeneratedReport({
                    name: title,
                    report_type: params.reportType,
                    period_start: dateRange.startDate,
                    period_end: dateRange.endDate,
                    period_preset: params.periodPreset !== 'custom' ? params.periodPreset : undefined,
                    bank_account_ids: params.bankAccountIds,
                    template_style: 'modern',
                    report_data: result.report,
                    generation_trigger: 'manual',
                    generation_duration_ms: durationMs,
                });
            }

            const report: GeneratedReport = {
                id: crypto.randomUUID(),
                type: params.reportType,
                title,
                generatedAt: new Date().toISOString(),
                parameters: params,
                data: result.report,
                version: 1,
                parentReportId: null,
                isLatest: true,
                editNotes: null,
            };

            // Also keep in memory for immediate access
            generatedReports = [report, ...generatedReports.slice(0, 9)];

            return report;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['generated-reports'] });
        },
    });
}

// ============================================================
// Generated Reports List Hook (Database-backed)
// ============================================================

// Map database record to component-expected format
function mapDbReportToGeneratedReport(dbReport: DBGeneratedReport): GeneratedReport {
    return {
        id: dbReport.id,
        type: dbReport.report_type,
        title: dbReport.name,
        generatedAt: dbReport.created_at,
        parameters: {
            reportType: dbReport.report_type,
            periodPreset: (dbReport.period_preset || 'custom') as ReportRequestFormData['periodPreset'],
            startDate: dbReport.period_start,
            endDate: dbReport.period_end,
            bankAccountIds: dbReport.bank_account_ids || [],
            categoryIds: [],
            transactionType: 'all',
            aggregation: 'monthly',
            includeCharts: true,
            includeDetails: true,
        },
        data: dbReport.report_data as ReportData,
        // Versioning fields
        version: dbReport.version ?? 1,
        parentReportId: dbReport.parent_report_id ?? null,
        isLatest: dbReport.is_latest ?? true,
        editNotes: dbReport.edit_notes ?? null,
    };
}

export function useGeneratedReports(options?: {
    limit?: number;
    offset?: number;
    report_type?: ReportRequestFormData['reportType'];
}) {
    return useQuery({
        queryKey: ['generated-reports', options],
        queryFn: async () => {
            const result = await getGeneratedReports(options);
            if (result.error) throw new Error(result.error);
            // Map database records to component-expected format
            const mappedReports = result.data?.map(mapDbReportToGeneratedReport) || [];
            return { data: mappedReports, count: result.count };
        },
        staleTime: 30 * 1000, // 30 seconds
    });
}

// ============================================================
// Single Generated Report Hook
// ============================================================

export function useGeneratedReportDetail(id: string | null) {
    return useQuery({
        queryKey: ['generated-report', id],
        queryFn: async () => {
            if (!id) throw new Error('No report ID');
            const result = await getGeneratedReport(id);
            if (result.error) throw new Error(result.error);
            if (!result.data) return null;
            return mapDbReportToGeneratedReport(result.data);
        },
        enabled: !!id,
    });
}

// ============================================================
// Delete Generated Report Hook
// ============================================================

export function useDeleteGeneratedReport() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const result = await deleteGeneratedReport(id);
            if (!result.success) throw new Error(result.error || 'Failed to delete report');
            return result;
        },
        onSuccess: () => {
            toast.success('Report deleted');
            queryClient.invalidateQueries({ queryKey: ['generated-reports'] });
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : 'Failed to delete report');
        },
    });
}

// ============================================================
// Report Schedules Hooks
// ============================================================

export function useReportSchedules() {
    return useQuery({
        queryKey: ['report-schedules'],
        queryFn: async () => {
            const result = await getReportSchedules();
            if (result.error) throw new Error(result.error);
            return result.data;
        },
        staleTime: 60 * 1000, // 1 minute
    });
}

export function useReportSchedule(id: string | null) {
    return useQuery({
        queryKey: ['report-schedule', id],
        queryFn: async () => {
            if (!id) throw new Error('No schedule ID');
            const result = await getReportSchedule(id);
            if (result.error) throw new Error(result.error);
            return result.data;
        },
        enabled: !!id,
    });
}

export function useCreateReportSchedule() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (input: CreateScheduleInput) => {
            const result = await createReportSchedule(input);
            if (!result.data) throw new Error(result.error || 'Failed to create schedule');
            return result.data;
        },
        onSuccess: () => {
            toast.success('Report schedule created');
            queryClient.invalidateQueries({ queryKey: ['report-schedules'] });
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : 'Failed to create schedule');
        },
    });
}

export function useUpdateReportSchedule() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, input }: { id: string; input: Partial<CreateScheduleInput> & { is_active?: boolean } }) => {
            const result = await updateReportSchedule(id, input);
            if (!result.data) throw new Error(result.error || 'Failed to update schedule');
            return result.data;
        },
        onSuccess: () => {
            toast.success('Report schedule updated');
            queryClient.invalidateQueries({ queryKey: ['report-schedules'] });
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : 'Failed to update schedule');
        },
    });
}

export function useDeleteReportSchedule() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const result = await deleteReportSchedule(id);
            if (!result.success) throw new Error(result.error || 'Failed to delete schedule');
            return result;
        },
        onSuccess: () => {
            toast.success('Report schedule deleted');
            queryClient.invalidateQueries({ queryKey: ['report-schedules'] });
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : 'Failed to delete schedule');
        },
    });
}

// ============================================================
// Report Versioning Hooks
// ============================================================

export function useCreateReportVersion() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (input: { parentReportId: string; reportData: unknown; editNotes: string }) => {
            const result = await createReportVersion({
                parent_report_id: input.parentReportId,
                report_data: input.reportData,
                edit_notes: input.editNotes,
            });
            if (!result.data) throw new Error(result.error || 'Failed to create version');
            return mapDbReportToGeneratedReport(result.data);
        },
        onSuccess: () => {
            toast.success('New version created');
            queryClient.invalidateQueries({ queryKey: ['generated-reports'] });
            queryClient.invalidateQueries({ queryKey: ['generated-report'] });
            queryClient.invalidateQueries({ queryKey: ['report-versions'] });
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : 'Failed to create version');
        },
    });
}

export function useReportVersionHistory(reportId: string | null) {
    return useQuery({
        queryKey: ['report-versions', reportId],
        queryFn: async () => {
            if (!reportId) return [];
            const result = await getReportVersionHistory(reportId);
            if (result.error) throw new Error(result.error);
            return result.data?.map(mapDbReportToGeneratedReport) || [];
        },
        enabled: !!reportId,
        staleTime: 30 * 1000,
    });
}

// Export types for use in components
export type { ReportSchedule, DBGeneratedReport as ServerGeneratedReport, CreateScheduleInput };
