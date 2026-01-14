'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ReportRequestWizard } from '@/components/reports/report-request-wizard';
import { ReportViewer } from '@/components/reports/report-viewer';
import { ReportSchedulesPanel } from '@/components/reports/report-schedules';
import { useGenerateReport, useGeneratedReports, useReportSchedules, type GeneratedReport } from '@/hooks/use-reports';
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
};

// ============================================================
// Report Card Component
// ============================================================

function ReportCard({
    report,
    onView,
}: {
    report: GeneratedReport;
    onView: (report: GeneratedReport) => void;
}) {
    const config = reportTypeConfig[report.type];
    const Icon = config.icon;
    const timeAgo = formatDistanceToNow(new Date(report.generatedAt), { addSuffix: true });

    return (
        <Card className="group overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/5 hover:border-emerald-500/30">
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
                                <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
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
                    </div>
                </div>
            </CardContent>
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
// Quick Stats Card
// ============================================================

function QuickStatsCard() {
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

    return (
        <Card className="border-dashed">
            <CardContent className="p-4">
                <div className="flex items-center gap-4">
                    <div className="p-2.5 rounded-lg bg-emerald-500/10">
                        <TrendingUp className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold">{reportsResult?.count || 0}</p>
                        <p className="text-xs text-muted-foreground">
                            {reportsThisMonth} generated this month
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

// ============================================================
// Main Component
// ============================================================

export function ReportsPageClient() {
    const [activeTab, setActiveTab] = useState<string>('new');
    const [selectedReport, setSelectedReport] = useState<GeneratedReport | null>(null);
    const { data: reportsData, isLoading: reportsLoading } = useGeneratedReports();
    const reports = reportsData?.data || [];
    const reportsCount = reportsData?.count || 0;
    const generateReport = useGenerateReport();

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
                estateName="Residio Estate"
            />
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Financial Reports</h1>
                    <p className="text-muted-foreground mt-1">
                        Generate detailed financial reports and analytics for your estate
                    </p>
                </div>

                {/* Quick Stats */}
                <QuickStatsCard />
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                <TabsList className="grid w-full max-w-lg grid-cols-3">
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
                                className="ml-1.5 h-5 w-5 p-0 flex items-center justify-center text-[10px]"
                            >
                                {reports.length}
                            </Badge>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="schedules" className="gap-2">
                        <CalendarClock className="h-4 w-4" />
                        Schedules
                    </TabsTrigger>
                </TabsList>

                {/* New Report Tab */}
                <TabsContent value="new" className="mt-6">
                    <ReportRequestWizard
                        onGenerate={handleGenerate}
                        isGenerating={generateReport.isPending}
                    />
                </TabsContent>

                {/* Recent Reports Tab */}
                <TabsContent value="recent" className="mt-6">
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
                <TabsContent value="schedules" className="mt-6">
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
            </Tabs>
        </div>
    );
}
