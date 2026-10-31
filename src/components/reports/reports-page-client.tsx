'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
    FileBarChart,
    Receipt,
    Clock,
    ScrollText,
    Plus,
    History,
    Eye,
    Download,
    FileText,
    Sparkles,
    Calendar,
    CalendarClock,
    TrendingUp,
    Users,
    Trash2,
    Loader2,
    ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ReportRequestWizard } from '@/components/reports/report-request-wizard';
import { ReportViewer } from '@/components/reports/report-viewer';
import { ReportSchedulesPanel } from '@/components/reports/report-schedules';
import { useCan } from '@/components/auth/can';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { WalletBatchReconciliationPanel } from '@/components/reports/wallet-batch-reconciliation-panel';
import { useGeneralSettings } from '@/hooks/use-settings';
import { useGenerateReport, useGeneratedReports, useDeleteGeneratedReport, useReportSchedules, useReportArchive, type GeneratedReport } from '@/hooks/use-reports';
import type { ArchivedReport } from '@/actions/reports/get-report-archive';
import type { ReportRequestFormData } from '@/lib/validators/reports';
import { formatDistanceToNow } from 'date-fns';

// ============================================================
// Report Type Configuration
// ============================================================

const reportTypeConfig: Record<
    ReportRequestFormData['reportType'],
    {
        icon: React.ElementType;
        label: string;
        gradient: string;
        iconBg: string;
    }
> = {
    financial_overview: {
        icon: FileBarChart,
        label: 'Financial Overview',
        gradient: 'from-emerald-500 to-teal-500',
        iconBg: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    },
    collection_report: {
        icon: Receipt,
        label: 'Collection Report',
        gradient: 'from-blue-500 to-cyan-500',
        iconBg: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
    },
    invoice_aging: {
        icon: Clock,
        label: 'Invoice Aging',
        gradient: 'from-amber-500 to-orange-500',
        iconBg: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    },
    transaction_log: {
        icon: ScrollText,
        label: 'Transaction Log',
        gradient: 'from-purple-500 to-violet-500',
        iconBg: 'bg-purple-500/15 text-purple-600 dark:text-purple-400',
    },
    debtors_report: {
        icon: Users,
        label: 'Debtors Report',
        gradient: 'from-red-500 to-rose-500',
        iconBg: 'bg-red-500/15 text-red-600 dark:text-red-400',
    },
    indebtedness_summary: {
        icon: Users,
        label: 'Indebtedness Report',
        gradient: 'from-orange-500 to-amber-500',
        iconBg: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
    },
    development_levy: {
        icon: Sparkles,
        label: 'Development Levy Report',
        gradient: 'from-amber-600 to-yellow-500',
        iconBg: 'bg-amber-600/15 text-amber-600 dark:text-amber-400',
    },
};

// ============================================================
// Report Card Component
// ============================================================

function ReportCard({
    report,
    onView,
    onDelete,
}: {
    report: GeneratedReport;
    onView: (report: GeneratedReport) => void;
    onDelete: (report: GeneratedReport) => void;
}) {
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const canDelete = useCan(PERMISSIONS.REPORTS_MANAGE_SCHEDULES);
    const config = reportTypeConfig[report.type];
    const Icon = config.icon;
    const timeAgo = formatDistanceToNow(new Date(report.generatedAt), { addSuffix: true });

    const handleDelete = () => {
        onDelete(report);
        setShowDeleteDialog(false);
    };

    return (
        <Card variant="featured" interactive animate className="group overflow-hidden">
            {/* Top gradient accent */}
            <div className={cn('h-1 bg-gradient-to-r', config.gradient)} />

            <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 min-w-0">
                        {/* Icon */}
                        <div className={cn('p-3 rounded-xl shrink-0', config.iconBg)}>
                            <Icon className="h-5 w-5" />
                        </div>

                        {/* Content */}
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <Badge variant="secondary" className="text-xs uppercase tracking-wide">
                                    {config.label}
                                </Badge>
                            </div>
                            <h3 className="font-semibold text-sm truncate">{report.title}</h3>
                            <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                                <Calendar className="h-3.5 w-3.5" />
                                <span>Generated {timeAgo}</span>
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5"
                            onClick={() => onView(report)}
                        >
                            <Eye className="h-3.5 w-3.5" />
                            View
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5"
                            onClick={(e) => {
                                e.stopPropagation();
                                const params = new URLSearchParams({ type: report.type, preset: 'last_month' });
                                const url = `/api/reports/download?${params.toString()}`;
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `${report.type}-${new Date().toISOString().split('T')[0]}.pdf`;
                                a.click();
                            }}
                        >
                            <Download className="h-3.5 w-3.5" />
                            PDF
                        </Button>
                        {/* deleteGeneratedReport enforces reports.manage_schedules */}
                        {canDelete && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                onClick={() => setShowDeleteDialog(true)}
                                aria-label={`Delete report ${report.title}`}
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                        )}
                    </div>
                </div>
            </CardContent>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Report?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete “{report.title}”? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    );
}

// ============================================================
// Reports List Skeleton
// ============================================================

function ReportsListSkeleton() {
    return (
        <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
                <Card key={i} className="overflow-hidden">
                    <div className="h-1 bg-muted" />
                    <CardContent className="p-5">
                        <div className="flex items-start gap-4">
                            <Skeleton className="h-11 w-11 rounded-xl" />
                            <div className="flex-1 space-y-2">
                                <Skeleton className="h-4 w-24" />
                                <Skeleton className="h-4 w-48" />
                                <Skeleton className="h-3 w-32" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}

// ============================================================
// Empty State Component
// ============================================================

function EmptyReportsState({ onCreateNew }: { onCreateNew: () => void }) {
    return (
        <div className="flex flex-col items-center justify-center py-16 px-4">
            <div className="relative mb-6">
                {/* Background decorative elements */}
                <div className="absolute -inset-4 bg-gradient-to-br from-emerald-500/10 via-transparent to-teal-500/10 rounded-full blur-xl" />

                {/* Main icon container */}
                <div className="relative p-6 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-teal-500/5 border border-emerald-500/20">
                    <FileText className="h-12 w-12 text-emerald-600/60" />
                </div>

                {/* Floating accent */}
                <div className="absolute -top-1 -right-1 p-1.5 rounded-full bg-emerald-500/20">
                    <Sparkles className="h-4 w-4 text-emerald-500" />
                </div>
            </div>

            <h3 className="text-xl font-semibold mb-2">No reports yet</h3>
            <p className="text-muted-foreground text-center max-w-sm mb-6">
                Generate your first financial report to track income, expenses, and collections across your estate.
            </p>

            <Button onClick={onCreateNew} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                <Plus className="h-4 w-4" />
                Create New Report
            </Button>
        </div>
    );
}

// ============================================================
// Quick Stats Chip
// ============================================================

function QuickStatsChip() {
    const { data: reportsResult } = useGeneratedReports();
    const reports = reportsResult?.data || [];
    const reportsThisMonth = reports.filter((r) => {
        const reportDate = new Date(r.generatedAt);
        const now = new Date();
        return (
            reportDate.getMonth() === now.getMonth() &&
            reportDate.getFullYear() === now.getFullYear()
        );
    }).length;
    const total = reportsResult?.count || 0;

    return (
        <Badge variant="outline" className="shrink-0 gap-1.5 px-2.5 py-1 text-xs font-normal text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
            <span>
                <span className="font-semibold text-foreground">{total}</span> {total === 1 ? 'report' : 'reports'} ·{' '}
                <span className="font-semibold text-foreground">{reportsThisMonth}</span> this month
            </span>
        </Badge>
    );
}

// ============================================================
// Main Component
// ============================================================

const REPORTS_TABS = ['new', 'recent', 'schedules', 'archive', 'wallet-check'] as const;
type ReportsTab = (typeof REPORTS_TABS)[number];

/** The tab a `?tab=` value opens; a missing or unknown value opens New Report (#1373). */
export function parseReportsTab(value: string | null | undefined): ReportsTab {
    return REPORTS_TABS.find((tab) => tab === value) ?? 'new';
}

export function ReportsPageClient() {
    // The tab lives in the URL, so the main menu's tab links open it and highlight the right entry.
    const activeTab = parseReportsTab(useSearchParams().get('tab'));
    // replaceState, not router.replace: no server round trip and no history entry per tab;
    // Next.js still updates useSearchParams from it.
    const setActiveTab = (tab: string) => window.history.replaceState(null, '', `?tab=${parseReportsTab(tab)}`);
    const [selectedReport, setSelectedReport] = useState<GeneratedReport | null>(null);
    const { data: generalSettings } = useGeneralSettings();
    // Empty falls through to ReportViewer's own default.
    const estateName = String(generalSettings?.find((setting) => setting.key === 'estate_name')?.value ?? '').trim() || undefined;
    const { data: reportsData, isLoading: reportsLoading } = useGeneratedReports();
    const reports = reportsData?.data || [];
    const reportsCount = reportsData?.count || 0;
    const generateReport = useGenerateReport();
    const deleteReport = useDeleteGeneratedReport();

    // The wizard's step bar pins itself under this header, so it needs the header's real height.
    const stickyRef = useRef<HTMLDivElement>(null);
    const [stickyHeight, setStickyHeight] = useState(96);
    useEffect(() => {
        const el = stickyRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(() => setStickyHeight(Math.round(el.getBoundingClientRect().height)));
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    const handleGenerate = async (data: ReportRequestFormData) => {
        try {
            const report = await generateReport.mutateAsync(data);
            toast.success('Report generated successfully', {
                description: report.title,
            });
            // Open the viewer for the newly generated report
            setSelectedReport(report);
        } catch (error) {
            toast.error('Failed to generate report', {
                description: error instanceof Error ? error.message : 'An unexpected error occurred',
            });
        }
    };

    const handleViewReport = (report: GeneratedReport) => {
        setSelectedReport(report);
    };

    const handleDeleteReport = async (report: GeneratedReport) => {
        await deleteReport.mutateAsync(report.id);
    };

    const handleBackFromViewer = () => {
        setSelectedReport(null);
        setActiveTab('recent');
    };

    // Show the report viewer when a report is selected
    if (selectedReport) {
        return (
            <ReportViewer
                report={selectedReport}
                onBack={handleBackFromViewer}
                onSelectVersion={setSelectedReport}
                estateName={estateName}
            />
        );
    }

    return (
        // The Tabs root is the parent of the sticky bar, so the bar stays pinned for the whole page.
        <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="gap-6"
            style={{ '--reports-sticky-h': `${stickyHeight}px` } as React.CSSProperties}
        >
            {/* <main> is the scroller (p-4 md:p-6). A sticky top-0 bar would stop below that padding and let content show above it,
                so the bar pins at minus the padding and fills that strip with its own matching top padding. */}
            <div ref={stickyRef} className="sticky -top-4 z-30 -mx-1 -mt-4 space-y-3 bg-background px-1 pb-3 pt-4 md:-top-6 md:-mt-6 md:pt-6">
                <div className="flex items-center justify-between gap-3">
                    <h1 className="flex min-w-0 items-center gap-2 text-xl font-bold tracking-tight">
                        <FileBarChart className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
                        <span className="truncate">Generate reports</span>
                    </h1>
                    <QuickStatsChip />
                </div>

                <TabsList className="w-full justify-start overflow-x-auto sm:grid sm:grid-cols-5">
                    <TabsTrigger value="new" className="gap-2">
                        <Plus className="h-4 w-4" />
                        New Report
                    </TabsTrigger>
                    <TabsTrigger value="recent" className="gap-2">
                        <History className="h-4 w-4" />
                        History
                        {reports.length > 0 && (
                            <Badge
                                variant="secondary"
                                className="ml-1.5 h-5 w-5 p-0 flex items-center justify-center text-xs"
                            >
                                {reports.length}
                            </Badge>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="schedules" className="gap-2">
                        <CalendarClock className="h-4 w-4" />
                        Schedules
                    </TabsTrigger>
                    <TabsTrigger value="archive" className="gap-2">
                        <Download className="h-4 w-4" />
                        Archive
                    </TabsTrigger>
                    <TabsTrigger value="wallet-check" className="gap-2">
                        <ShieldCheck className="h-4 w-4" />
                        Wallet Check
                    </TabsTrigger>
                </TabsList>
            </div>

            {/* New Report Tab */}
            <TabsContent value="new">
                <ReportRequestWizard
                    onGenerate={handleGenerate}
                    isGenerating={generateReport.isPending}
                />
            </TabsContent>

            {/* Recent Reports Tab */}
            <TabsContent value="recent">
                <Card>
                    <CardHeader className="pb-4">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <History className="h-5 w-5 text-emerald-600" />
                            Generated Reports
                        </CardTitle>
                        <CardDescription>
                            View and download previously generated reports
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {reportsLoading ? (
                            <ReportsListSkeleton />
                        ) : reports && reports.length > 0 ? (
                            <div className="space-y-3">
                                {reports.map((report) => (
                                    <ReportCard
                                        key={report.id}
                                        report={report}
                                        onView={handleViewReport}
                                        onDelete={handleDeleteReport}
                                    />
                                ))}
                            </div>
                        ) : (
                            <EmptyReportsState onCreateNew={() => setActiveTab('new')} />
                        )}
                    </CardContent>
                </Card>
            </TabsContent>

            {/* Schedules Tab */}
            <TabsContent value="schedules">
                <Card>
                    <CardHeader className="pb-4">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <CalendarClock className="h-5 w-5 text-emerald-600" />
                            Report Schedules
                        </CardTitle>
                        <CardDescription>
                            Configure automated recurring report generation
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ReportSchedulesPanel />
                    </CardContent>
                </Card>
            </TabsContent>
            {/* Archive Tab */}
            <TabsContent value="archive">
                <ArchivePanel />
            </TabsContent>
            <TabsContent value="wallet-check">
                <WalletBatchReconciliationPanel />
            </TabsContent>
        </Tabs>
    );
}

// ============================================================
// Archive Panel
// ============================================================

function ArchivePanel() {
    const { data: archiveData, isLoading } = useReportArchive();
    const archives = archiveData?.data || [];

    const handleDownload = (archive: ArchivedReport) => {
        const link = document.createElement('a');
        link.href = `/api/reports/download?archiveId=${archive.id}`;
        link.download = `${archive.report_type}-${archive.generated_at?.split('T')[0] || 'report'}.pdf`;
        link.click();
    };

    if (isLoading) return <ReportsListSkeleton />;

    if (archives.length === 0) return (
        <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
                <Download className="h-12 w-12 mx-auto mb-3 opacity-40" />
                <p className="font-medium">No archived reports yet</p>
                <p className="text-sm mt-1">Generated PDFs will appear here once created.</p>
            </CardContent>
        </Card>
    );

    return (
        <div className="space-y-3">
            {archives.map((archive) => {
                const config = reportTypeConfig[archive.report_type as keyof typeof reportTypeConfig];
                const Icon = config?.icon || FileText;

                return (
                    <Card key={archive.id} variant="featured" interactive>
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className={cn('p-2.5 rounded-lg', config?.iconBg || 'bg-muted')}>
                                        <Icon className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-sm">{config?.label || archive.report_type}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {formatDistanceToNow(new Date(archive.generated_at), { addSuffix: true })}
                                            {archive.file_size_bytes && ` - ${(archive.file_size_bytes / 1024).toFixed(0)} KB`}
                                        </p>
                                    </div>
                                </div>
                                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => handleDownload(archive)}>
                                    <Download className="h-3.5 w-3.5" />
                                    Download
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}
