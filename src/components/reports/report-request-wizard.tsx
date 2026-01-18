'use client';

import { useState, useEffect, useCallback, memo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    FileBarChart,
    Receipt,
    Clock,
    ScrollText,
    Calendar,
    CalendarDays,
    CalendarRange,
    Building2,
    ChevronRight,
    ChevronLeft,
    Check,
    Loader2,
    BarChart3,
    LineChart,
    TableProperties,
    ArrowUpDown,
    Sparkles,
    Users,
    LayoutList,
    ClipboardList,
    Construction,
    CalendarClock,
    Mail,
    Repeat,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    reportTypes,
    periodPresets,
    aggregationOptions,
    reportRequestSchema,
    getDateRangeFromPreset,
    type ReportRequestFormData,
    type ReportType,
    type PeriodPreset,
    type AggregationType,
} from '@/lib/validators/reports';
import { getBankAccountsForFilter } from '@/actions/reports/get-financial-overview';
import { useCreateReportSchedule, type CreateScheduleInput } from '@/hooks/use-reports';
import { toast } from 'sonner';

// ============================================================
// Types
// ============================================================

interface ReportRequestWizardProps {
    onGenerate: (data: ReportRequestFormData) => Promise<void>;
    isGenerating?: boolean;
}

type Step = {
    id: number;
    title: string;
    description: string;
};

const STEPS: Step[] = [
    { id: 1, title: 'Report Type', description: 'Select the type of report' },
    { id: 2, title: 'Time Period', description: 'Choose date range' },
    { id: 3, title: 'Accounts', description: 'Select bank accounts' },
    { id: 4, title: 'Options', description: 'Configure report options' },
    { id: 5, title: 'Review', description: 'Confirm and generate' },
];

// ============================================================
// Report Type Icons & Styles
// ============================================================

const reportTypeConfig: Record<ReportType, {
    icon: React.ElementType;
    gradient: string;
    iconBg: string;
    borderHover: string;
}> = {
    financial_overview: {
        icon: FileBarChart,
        gradient: 'from-emerald-500/10 to-teal-500/5',
        iconBg: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
        borderHover: 'hover:border-emerald-500/50',
    },
    collection_report: {
        icon: Receipt,
        gradient: 'from-blue-500/10 to-cyan-500/5',
        iconBg: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
        borderHover: 'hover:border-blue-500/50',
    },
    invoice_aging: {
        icon: Clock,
        gradient: 'from-amber-500/10 to-orange-500/5',
        iconBg: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
        borderHover: 'hover:border-amber-500/50',
    },
    transaction_log: {
        icon: ScrollText,
        gradient: 'from-purple-500/10 to-violet-500/5',
        iconBg: 'bg-purple-500/15 text-purple-600 dark:text-purple-400',
        borderHover: 'hover:border-purple-500/50',
    },
    debtors_report: {
        icon: Users,
        gradient: 'from-red-500/10 to-rose-500/5',
        iconBg: 'bg-red-500/15 text-red-600 dark:text-red-400',
        borderHover: 'hover:border-red-500/50',
    },
    indebtedness_summary: {
        icon: LayoutList,
        gradient: 'from-orange-500/10 to-amber-500/5',
        iconBg: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
        borderHover: 'hover:border-orange-500/50',
    },
    development_levy: {
        icon: Construction,
        gradient: 'from-indigo-500/10 to-blue-500/5',
        iconBg: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400',
        borderHover: 'hover:border-indigo-500/50',
    },
};

// ============================================================
// Period Preset Icons
// ============================================================

const periodIcons: Record<PeriodPreset, React.ElementType> = {
    this_month: Calendar,
    last_month: Calendar,
    this_quarter: CalendarDays,
    last_quarter: CalendarDays,
    this_year: CalendarRange,
    last_year: CalendarRange,
    custom: CalendarRange,
};

// Reports that don't depend on bank accounts
const ACCOUNT_AGNOSTIC_REPORTS: ReportType[] = ['debtors_report', 'indebtedness_summary', 'development_levy', 'invoice_aging'];

// Reports that are always "As of Today" (skip date selection)
const REALTIME_REPORTS: ReportType[] = ['debtors_report', 'indebtedness_summary', 'development_levy', 'invoice_aging'];

// ============================================================
// Stepper Component
// ============================================================

function StepIndicator({ steps, currentStep, reportType }: { steps: Step[]; currentStep: number; reportType: string }) {
    const isAgnostic = ACCOUNT_AGNOSTIC_REPORTS.includes(reportType as any);
    const isRealtime = REALTIME_REPORTS.includes(reportType as any);
    const progressPercent = ((currentStep - 1) / (steps.length - 1)) * 100;

    return (
        <div className="relative mb-10">
            {/* Progress track */}
            <div className="absolute top-5 left-0 right-0 h-0.5 bg-muted mx-10">
                <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500 ease-out"
                    style={{ width: `${progressPercent}%` }}
                />
            </div>

            {/* Steps */}
            <div className="relative flex justify-between">
                {steps.map((step) => {
                    const isSkipped = (step.id === 3 && isAgnostic) || (step.id === 2 && isRealtime);
                    const isActive = currentStep === step.id;
                    const isCompleted = currentStep > step.id;

                    return (
                        <div key={step.id} className="relative flex flex-col items-center flex-1">
                            {/* Step circle */}
                            <div
                                className={cn(
                                    "w-10 h-10 rounded-full border-2 flex items-center justify-center bg-background z-10 transition-all duration-300",
                                    isActive ? "border-primary ring-4 ring-primary/10" :
                                        isCompleted ? "border-primary bg-primary text-primary-foreground" :
                                            isSkipped ? "border-muted text-muted-foreground opacity-50 italic" : "border-muted"
                                )}
                            >
                                {isCompleted ? (
                                    <Check className="h-5 w-5" />
                                ) : (
                                    <span className={cn("text-sm font-medium", isSkipped && "text-[9px]")}>
                                        {isSkipped ? "N/A" : step.id}
                                    </span>
                                )}
                            </div>

                            {/* Label */}
                            <div className="mt-3 text-center">
                                <p className={cn(
                                    "text-xs font-medium transition-colors",
                                    isActive ? "text-primary" : "text-muted-foreground",
                                    isSkipped && "italic opacity-50"
                                )}>
                                    {isSkipped ? `${step.title} (Skipped)` : step.title}
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ============================================================
// Step Components
// ============================================================

function ReportTypeStep({
    value,
    onChange,
}: {
    value: ReportType | '';
    onChange: (type: ReportType) => void;
}) {
    return (
        <div className="space-y-6">
            <div className="text-center mb-8">
                <h2 className="text-2xl font-bold tracking-tight">Select Report Type</h2>
                <p className="text-muted-foreground mt-1">
                    Choose the type of financial report you want to generate
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {reportTypes.map((type) => {
                    const config = reportTypeConfig[type.value];
                    const Icon = config.icon;
                    const isSelected = value === type.value;

                    return (
                        <button
                            key={type.value}
                            type="button"
                            onClick={() => onChange(type.value)}
                            className={cn(
                                'group relative p-6 rounded-xl border-2 text-left transition-all duration-200',
                                'bg-gradient-to-br',
                                config.gradient,
                                config.borderHover,
                                isSelected
                                    ? 'border-emerald-500 ring-2 ring-emerald-500/20 shadow-lg'
                                    : 'border-border hover:shadow-md'
                            )}
                        >
                            {/* Selection indicator */}
                            {isSelected && (
                                <div className="absolute top-3 right-3">
                                    <div className="h-6 w-6 rounded-full bg-emerald-500 flex items-center justify-center">
                                        <Check className="h-4 w-4 text-white" />
                                    </div>
                                </div>
                            )}

                            <div className={cn('inline-flex p-3 rounded-xl mb-4', config.iconBg)}>
                                <Icon className="h-6 w-6" />
                            </div>

                            <h3 className="font-semibold text-lg mb-1">{type.label}</h3>
                            <p className="text-sm text-muted-foreground">{type.description}</p>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function PeriodSelectionStep({
    preset,
    startDate,
    endDate,
    onPresetChange,
    onStartDateChange,
    onEndDateChange,
}: {
    preset: PeriodPreset;
    startDate: string;
    endDate: string;
    onPresetChange: (preset: PeriodPreset) => void;
    onStartDateChange: (date: string) => void;
    onEndDateChange: (date: string) => void;
}) {
    const isCustom = preset === 'custom';

    return (
        <div className="space-y-6">
            <div className="text-center mb-8">
                <h2 className="text-2xl font-bold tracking-tight">Select Time Period</h2>
                <p className="text-muted-foreground mt-1">
                    Choose a preset period or define a custom date range
                </p>
            </div>

            {/* Period Presets */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {periodPresets.map((period) => {
                    const Icon = periodIcons[period.value];
                    const isSelected = preset === period.value;

                    return (
                        <button
                            key={period.value}
                            type="button"
                            onClick={() => onPresetChange(period.value)}
                            className={cn(
                                'flex flex-col items-center p-4 rounded-xl border-2 transition-all duration-200',
                                'hover:bg-muted/50 hover:border-primary/30',
                                isSelected
                                    ? 'border-emerald-500 bg-emerald-500/5 shadow-sm'
                                    : 'border-border'
                            )}
                        >
                            <Icon
                                className={cn(
                                    'h-5 w-5 mb-2',
                                    isSelected ? 'text-emerald-600' : 'text-muted-foreground'
                                )}
                            />
                            <span
                                className={cn(
                                    'text-sm font-medium',
                                    isSelected ? 'text-emerald-700 dark:text-emerald-400' : ''
                                )}
                            >
                                {period.label}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Custom Date Range */}
            <div
                className={cn(
                    'overflow-hidden transition-all duration-300',
                    isCustom ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0'
                )}
            >
                <Card className="mt-4">
                    <CardContent className="pt-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="startDate">Start Date</Label>
                                <Input
                                    id="startDate"
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => onStartDateChange(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="endDate">End Date</Label>
                                <Input
                                    id="endDate"
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => onEndDateChange(e.target.value)}
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Date Preview */}
            {!isCustom && preset && (
                <div className="flex justify-center">
                    <Badge variant="secondary" className="text-sm px-4 py-1.5">
                        {(() => {
                            const range = getDateRangeFromPreset(preset);
                            return `${new Date(range.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} - ${new Date(range.endDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
                        })()}
                    </Badge>
                </div>
            )}
        </div>
    );
}

// Memoized to prevent unnecessary re-renders when parent form values change
const AccountSelectionStep = memo(function AccountSelectionStep({
    selectedAccounts,
    onAccountToggle,
    onSelectAll,
}: {
    selectedAccounts: string[];
    onAccountToggle: (accountId: string) => void;
    onSelectAll: (accountIds: string[]) => void;
}) {
    const { data: bankAccounts, isLoading } = useQuery({
        queryKey: ['bank-accounts-filter'],
        queryFn: () => getBankAccountsForFilter(),
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const allSelected =
        bankAccounts && bankAccounts.length > 0 && selectedAccounts.length === bankAccounts.length;

    // Handle select all - creates new array once
    const handleSelectAll = () => {
        if (!bankAccounts) return;
        if (allSelected) {
            onSelectAll([]);
        } else {
            onSelectAll(bankAccounts.map((a) => a.id));
        }
    };

    return (
        <div className="space-y-6">
            <div className="text-center mb-8">
                <h2 className="text-2xl font-bold tracking-tight">Select Bank Accounts</h2>
                <p className="text-muted-foreground mt-1">
                    Choose which accounts to include in the report
                </p>
            </div>

            {/* Select All Toggle - using simple div and check icon */}
            <div
                role="button"
                tabIndex={0}
                onClick={handleSelectAll}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSelectAll();
                    }
                }}
                className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border cursor-pointer hover:bg-muted/70 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <Building2 className="h-5 w-5 text-muted-foreground" />
                    <span className="font-medium">All Accounts</span>
                    <Badge variant="secondary">{bankAccounts?.length || 0}</Badge>
                </div>
                {/* Simple visual checkbox indicator */}
                <div className={cn(
                    'h-4 w-4 rounded-sm border flex items-center justify-center transition-colors',
                    allSelected
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'border-muted-foreground'
                )}>
                    {allSelected && <Check className="h-3 w-3" />}
                </div>
            </div>

            {/* Account List */}
            <div className="space-y-2">
                {bankAccounts?.map((account) => {
                    const isSelected = selectedAccounts.includes(account.id);

                    return (
                        <div
                            key={account.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => onAccountToggle(account.id)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    onAccountToggle(account.id);
                                }
                            }}
                            className={cn(
                                'w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer',
                                'hover:bg-muted/30',
                                isSelected
                                    ? 'border-emerald-500 bg-emerald-500/5'
                                    : 'border-border'
                            )}
                        >
                            <div className="flex items-center gap-4">
                                <div
                                    className={cn(
                                        'p-2.5 rounded-lg',
                                        isSelected
                                            ? 'bg-emerald-500/15 text-emerald-600'
                                            : 'bg-muted text-muted-foreground'
                                    )}
                                >
                                    <Building2 className="h-5 w-5" />
                                </div>
                                <div className="text-left">
                                    <p className="font-medium">{account.account_name}</p>
                                    <p className="text-sm text-muted-foreground">
                                        {account.bank_name} &bull; {account.account_number}
                                    </p>
                                </div>
                            </div>
                            {/* Simple visual checkbox indicator */}
                            <div className={cn(
                                'h-4 w-4 rounded-sm border flex items-center justify-center transition-colors',
                                isSelected
                                    ? 'bg-primary border-primary text-primary-foreground'
                                    : 'border-muted-foreground'
                            )}>
                                {isSelected && <Check className="h-3 w-3" />}
                            </div>
                        </div>
                    );
                })}

                {(!bankAccounts || bankAccounts.length === 0) && (
                    <div className="text-center py-8 text-muted-foreground">
                        <Building2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p>No bank accounts configured</p>
                    </div>
                )}
            </div>
        </div>
    );
});

function OptionsStep({
    includeCharts,
    includeUnoccupied,
    includeAmount,
    paymentStatus,
    aggregation,
    transactionType,
    reportType,
    onIncludeChartsChange,
    onIncludeUnoccupiedChange,
    onIncludeAmountChange,
    onPaymentStatusChange,
    onAggregationChange,
    onTransactionTypeChange,
}: {
    includeCharts: boolean;
    includeUnoccupied: boolean;
    includeAmount: boolean;
    paymentStatus: 'all' | 'paid' | 'unpaid';
    aggregation: AggregationType;
    transactionType: 'all' | 'credit' | 'debit';
    reportType: ReportType;
    onIncludeChartsChange: (value: boolean) => void;
    onIncludeUnoccupiedChange: (value: boolean) => void;
    onIncludeAmountChange: (value: boolean) => void;
    onPaymentStatusChange: (value: 'all' | 'paid' | 'unpaid') => void;
    onAggregationChange: (value: AggregationType) => void;
    onTransactionTypeChange: (value: 'all' | 'credit' | 'debit') => void;
}) {
    const isIndebtednessReport = reportType === 'indebtedness_summary';
    const isDevelopmentLevyReport = reportType === 'development_levy';
    const isDebtReport = isIndebtednessReport || isDevelopmentLevyReport;
    // Real-time reports don't use aggregation or transaction type filtering
    const isRealtimeReport = ['debtors_report', 'indebtedness_summary', 'development_levy', 'invoice_aging'].includes(reportType);
    return (
        <div className="space-y-6">
            <div className="text-center mb-8">
                <h2 className="text-2xl font-bold tracking-tight">Report Options</h2>
                <p className="text-muted-foreground mt-1">
                    Customize how your report is generated
                </p>
            </div>

            {/* Visual Options */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                        <BarChart3 className="h-5 w-5 text-blue-500" />
                        Visual Elements
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                        <div className="space-y-0.5">
                            <Label className="font-medium">Include Charts</Label>
                            <p className="text-sm text-muted-foreground">
                                Add visual graphs and pie charts
                            </p>
                        </div>
                        <Switch checked={includeCharts} onCheckedChange={onIncludeChartsChange} />
                    </div>



                    {isDebtReport && (
                        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-emerald-500/10">
                            <div className="space-y-0.5">
                                <Label className="font-medium">Unoccupied Properties</Label>
                                <p className="text-sm text-muted-foreground">
                                    Include properties with no active residents
                                </p>
                            </div>
                            <Switch
                                checked={includeUnoccupied}
                                onCheckedChange={onIncludeUnoccupiedChange}
                            />
                        </div>
                    )}

                    {isIndebtednessReport && (
                        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-amber-500/10">
                            <div className="space-y-0.5">
                                <Label className="font-medium">Include Amounts</Label>
                                <p className="text-sm text-muted-foreground">
                                    Show outstanding indebtedness amounts per house
                                </p>
                            </div>
                            <Switch
                                checked={includeAmount}
                                onCheckedChange={onIncludeAmountChange}
                            />
                        </div>
                    )}

                    {isDevelopmentLevyReport && (
                        <div className="space-y-2">
                            <Label className="font-medium">Payment Status</Label>
                            <Select value={paymentStatus} onValueChange={onPaymentStatusChange}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Properties</SelectItem>
                                    <SelectItem value="paid">Paid Only</SelectItem>
                                    <SelectItem value="unpaid">Unpaid Only</SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                Filter properties by payment status
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Data Grouping - Only for time-based reports */}
            {!isRealtimeReport && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <TableProperties className="h-5 w-5 text-purple-500" />
                            Data Grouping
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label>Aggregation Period</Label>
                            <Select value={aggregation} onValueChange={onAggregationChange}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {aggregationOptions.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Transaction Type</Label>
                            <Select value={transactionType} onValueChange={onTransactionTypeChange}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Transactions</SelectItem>
                                    <SelectItem value="credit">Income Only (Credits)</SelectItem>
                                    <SelectItem value="debit">Expenses Only (Debits)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}


function ReviewStep({
    formData,
    scheduleEnabled,
    onScheduleEnabledChange,
    scheduleData,
    onScheduleDataChange,
}: {
    formData: Partial<ReportRequestFormData>;
    scheduleEnabled: boolean;
    onScheduleEnabledChange: (value: boolean) => void;
    scheduleData: {
        name: string;
        frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
        day_of_month?: number;
        day_of_week?: number;
        recipients?: string;
    };
    onScheduleDataChange: (data: typeof scheduleData) => void;
}) {
    const reportType = reportTypes.find((r) => r.value === formData.reportType);
    const period = periodPresets.find((p) => p.value === formData.periodPreset);
    const config = reportTypeConfig[formData.reportType || 'financial_overview'];
    const Icon = config.icon;

    // Calculate date range for display
    const dateRange =
        formData.periodPreset === 'custom'
            ? { startDate: formData.startDate || '', endDate: formData.endDate || '' }
            : getDateRangeFromPreset(formData.periodPreset || 'this_month');

    const REALTIME_REPORTS_REVIEW = ['debtors_report', 'indebtedness_summary', 'development_levy', 'invoice_aging'];
    const ACCOUNT_AGNOSTIC_REPORTS_REVIEW = ['debtors_report', 'indebtedness_summary', 'development_levy', 'invoice_aging'];

    return (
        <div className="space-y-6">
            <div className="text-center mb-8">
                <div className="inline-flex p-4 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-teal-500/5 mb-4">
                    <Sparkles className="h-8 w-8 text-emerald-600" />
                </div>
                <h2 className="text-2xl font-bold tracking-tight">Review & Generate</h2>
                <p className="text-muted-foreground mt-1">
                    Confirm your report settings before generating
                </p>
            </div>

            <Card className="overflow-hidden">
                <div className={cn('h-2 bg-gradient-to-r', config.gradient.replace('/10', '').replace('/5', ''))} />
                <CardContent className="pt-6 space-y-6">
                    {/* Report Type */}
                    <div className="flex items-start gap-4">
                        <div className={cn('p-3 rounded-xl', config.iconBg)}>
                            <Icon className="h-6 w-6" />
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Report Type</p>
                            <p className="font-semibold text-lg">{reportType?.label}</p>
                            <p className="text-sm text-muted-foreground mt-0.5">
                                {reportType?.description}
                            </p>
                        </div>
                    </div>

                    <hr className="border-dashed" />

                    {/* Period */}
                    <div className="flex items-start gap-4">
                        <div className="p-3 rounded-xl bg-blue-500/15 text-blue-600">
                            <Calendar className="h-6 w-6" />
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Time Period</p>
                            {REALTIME_REPORTS_REVIEW.includes(formData.reportType as any) ? (
                                <>
                                    <p className="font-semibold">Current (As of Today)</p>
                                    <p className="text-sm text-muted-foreground mt-0.5">
                                        {new Date().toLocaleDateString('en-GB', {
                                            day: 'numeric',
                                            month: 'long',
                                            year: 'numeric',
                                        })}
                                    </p>
                                </>
                            ) : (
                                <>
                                    <p className="font-semibold">{period?.label}</p>
                                    <p className="text-sm text-muted-foreground mt-0.5">
                                        {new Date(dateRange.startDate).toLocaleDateString('en-GB', {
                                            day: 'numeric',
                                            month: 'long',
                                            year: 'numeric',
                                        })}{' '}
                                        -{' '}
                                        {new Date(dateRange.endDate).toLocaleDateString('en-GB', {
                                            day: 'numeric',
                                            month: 'long',
                                            year: 'numeric',
                                        })}
                                    </p>
                                </>
                            )}
                        </div>
                    </div>

                    <hr className="border-dashed" />

                    {/* Accounts */}
                    {!ACCOUNT_AGNOSTIC_REPORTS_REVIEW.includes(formData.reportType as any) && (
                        <>
                            <div className="flex items-start gap-4">
                                <div className="p-3 rounded-xl bg-amber-500/15 text-amber-600">
                                    <Building2 className="h-6 w-6" />
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Bank Accounts</p>
                                    <p className="font-semibold">
                                        {(formData.bankAccountIds?.length ?? 0) === 0
                                            ? 'All Accounts'
                                            : `${formData.bankAccountIds?.length ?? 0} account(s) selected`}
                                    </p>
                                </div>
                            </div>
                            <hr className="border-dashed" />
                        </>
                    )}

                    {/* Schedule Section */}
                    <div className="flex items-start gap-4">
                        <div className="p-3 rounded-xl bg-purple-500/15 text-purple-600">
                            <CalendarClock className="h-6 w-6" />
                        </div>
                        <div className="flex-1 space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">Automated Schedule</p>
                                    <p className="font-semibold">{scheduleEnabled ? 'Enabled' : 'Disabled'}</p>
                                </div>
                                <Switch
                                    checked={scheduleEnabled}
                                    onCheckedChange={onScheduleEnabledChange}
                                />
                            </div>

                            {scheduleEnabled && (
                                <div className="mt-4 space-y-4 p-4 rounded-lg bg-muted/50 border animate-in fade-in slide-in-from-top-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="scheduleName">Schedule Name</Label>
                                        <Input
                                            id="scheduleName"
                                            value={scheduleData.name}
                                            onChange={(e) => onScheduleDataChange({ ...scheduleData, name: e.target.value })}
                                            placeholder="e.g. Monthly Financial Overview"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Frequency</Label>
                                            <Select
                                                value={scheduleData.frequency}
                                                onValueChange={(v) => onScheduleDataChange({ ...scheduleData, frequency: v as any })}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="daily">Daily</SelectItem>
                                                    <SelectItem value="weekly">Weekly</SelectItem>
                                                    <SelectItem value="monthly">Monthly</SelectItem>
                                                    <SelectItem value="quarterly">Quarterly</SelectItem>
                                                    <SelectItem value="yearly">Yearly</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        {(scheduleData.frequency === 'monthly' || scheduleData.frequency === 'quarterly') && (
                                            <div className="space-y-2">
                                                <Label>Day of Month</Label>
                                                <Input
                                                    type="number"
                                                    min={1}
                                                    max={28}
                                                    value={scheduleData.day_of_month || 1}
                                                    onChange={(e) => onScheduleDataChange({ ...scheduleData, day_of_month: parseInt(e.target.value) || 1 })}
                                                />
                                            </div>
                                        )}
                                        {scheduleData.frequency === 'weekly' && (
                                            <div className="space-y-2">
                                                <Label>Day of Week</Label>
                                                <Select
                                                    value={String(scheduleData.day_of_week || 1)}
                                                    onValueChange={(v) => onScheduleDataChange({ ...scheduleData, day_of_week: parseInt(v) })}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="1">Monday</SelectItem>
                                                        <SelectItem value="2">Tuesday</SelectItem>
                                                        <SelectItem value="3">Wednesday</SelectItem>
                                                        <SelectItem value="4">Thursday</SelectItem>
                                                        <SelectItem value="5">Friday</SelectItem>
                                                        <SelectItem value="6">Saturday</SelectItem>
                                                        <SelectItem value="0">Sunday</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Recipients (Comma separated emails)</Label>
                                        <div className="relative">
                                            <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                className="pl-9"
                                                placeholder="admin@example.com, stakeholder@example.com"
                                                value={scheduleData.recipients || ''}
                                                onChange={(e) => onScheduleDataChange({ ...scheduleData, recipients: e.target.value })}
                                            />
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            You will always receive a copy.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    {/* Options Summary */}
                    <div className="flex flex-wrap gap-2">
                        {formData.includeCharts && (
                            <Badge variant="secondary" className="gap-1.5">
                                <LineChart className="h-3.5 w-3.5" />
                                Charts
                            </Badge>
                        )}
                        {formData.includeDetails && (
                            <Badge variant="secondary" className="gap-1.5">
                                <TableProperties className="h-3.5 w-3.5" />
                                Details
                            </Badge>
                        )}
                        <Badge variant="secondary" className="gap-1.5">
                            <ArrowUpDown className="h-3.5 w-3.5" />
                            {aggregationOptions.find((a) => a.value === formData.aggregation)?.label}
                        </Badge>
                        {formData.transactionType !== 'all' && (
                            <Badge variant="secondary" className="gap-1.5">
                                {formData.transactionType === 'credit' ? 'Income Only' : 'Expenses Only'}
                            </Badge>
                        )}
                        {formData.includeUnoccupied && (
                            <Badge variant="secondary" className="gap-1.5 bg-blue-500/10 text-blue-600 border-blue-500/20">
                                Unoccupied Included
                            </Badge>
                        )}
                        {formData.includeAmount && (
                            <Badge variant="secondary" className="gap-1.5 bg-amber-500/10 text-amber-600 border-amber-500/20">
                                Amounts Included
                            </Badge>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

// ============================================================
// Main Wizard Component
// ============================================================

export function ReportRequestWizard({
    onGenerate,
    isGenerating = false,
}: ReportRequestWizardProps) {
    const [step, setStep] = useState(1);
    const [scheduleEnabled, setScheduleEnabled] = useState(false);
    const [scheduleData, setScheduleData] = useState<{
        name: string;
        frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
        day_of_month?: number;
        day_of_week?: number;
        recipients?: string;
    }>({
        name: '',
        frequency: 'monthly',
        day_of_month: 1,
        recipients: '',
    });

    const createSchedule = useCreateReportSchedule();

    const { control, watch, handleSubmit, setValue } = useForm<ReportRequestFormData>({
        resolver: zodResolver(reportRequestSchema),
        defaultValues: {
            reportType: 'financial_overview' as const,
            periodPreset: 'this_month' as const,
            startDate: '',
            endDate: '',
            bankAccountIds: [] as string[],
            categoryIds: [] as string[],
            transactionType: 'all' as const,
            aggregation: 'monthly' as const,
            includeCharts: true,
            includeDetails: true,
            includeUnoccupied: false,
            includeAmount: false,
            paymentStatus: 'all' as const,
        },
    });

    const formData = watch();

    // Watch periodPreset specifically to avoid unnecessary re-renders
    const periodPreset = watch('periodPreset');

    // Watch bankAccountIds for rendering the selected state
    const selectedAccountIds = watch('bankAccountIds') || [];

    // Update dates when preset changes
    useEffect(() => {
        if (periodPreset !== 'custom') {
            const range = getDateRangeFromPreset(periodPreset);
            setValue('startDate', range.startDate, { shouldDirty: false });
            setValue('endDate', range.endDate, { shouldDirty: false });
        }
    }, [periodPreset, setValue]);

    // Auto-update schedule name when report settings change
    useEffect(() => {
        if (!scheduleEnabled || scheduleData.name) return; // Don't overwrite if user typed something
        const typeLabel = reportTypes.find(t => t.value === formData.reportType)?.label;
        const periodLabel = periodPresets.find(p => p.value === formData.periodPreset)?.label;
        if (typeLabel && periodLabel) {
            setScheduleData(prev => ({ ...prev, name: `${typeLabel} (${periodLabel})` }));
        }
    }, [formData.reportType, formData.periodPreset, scheduleEnabled, scheduleData.name]);

    const handleNext = () => {
        let nextStep = step + 1;
        const isAgnostic = ACCOUNT_AGNOSTIC_REPORTS.includes(formData.reportType as any);
        const isRealtime = REALTIME_REPORTS.includes(formData.reportType as any);

        // Skip Step 2 (Period) if Realtime
        if (nextStep === 2 && isRealtime) {
            nextStep = 3;
        }

        // Skip Step 3 (Accounts) if Agnostic
        if (nextStep === 3 && isAgnostic) {
            nextStep = 4;
        }

        setStep(Math.min(nextStep, 5));
    };

    const handleBack = () => {
        let prevStep = step - 1;
        const isAgnostic = ACCOUNT_AGNOSTIC_REPORTS.includes(formData.reportType as any);
        const isRealtime = REALTIME_REPORTS.includes(formData.reportType as any);

        // Skip Step 3 (Accounts) if Agnostic
        if (prevStep === 3 && isAgnostic) {
            prevStep = 2;
        }

        // Skip Step 2 (Period) if Realtime
        if (prevStep === 2 && isRealtime) {
            prevStep = 1;
        }

        setStep(Math.max(prevStep, 1));
    };

    // Memoized handler that uses getValues() to avoid stale closure issues
    const handleAccountToggle = useCallback((accountId: string) => {
        const current = formData.bankAccountIds || [];
        if (current.includes(accountId)) {
            setValue(
                'bankAccountIds',
                current.filter((id) => id !== accountId)
            );
        } else {
            setValue('bankAccountIds', [...current, accountId]);
        }
    }, [formData.bankAccountIds, setValue]);

    // Memoized select all handler
    const handleSelectAll = useCallback((accountIds: string[]) => {
        setValue('bankAccountIds', accountIds);
    }, [setValue]);

    const onSubmit = async (data: ReportRequestFormData) => {
        // Safety check: ensure we are on the final step
        if (step !== 5) return;

        if (scheduleEnabled) {
            if (!scheduleData.name) {
                toast.error('Please enter a schedule name');
                return;
            }

            try {
                // Parse recipients
                const recipientsList = scheduleData.recipients
                    ? scheduleData.recipients.split(',').map(e => e.trim()).filter(Boolean)
                    : [];

                // Create schedule
                // Map formData to config (exclude base fields handled by schedule columns)
                const {
                    reportType, periodPreset, bankAccountIds, includeCharts, includeDetails,
                    ...configParams
                } = data;

                await createSchedule.mutateAsync({
                    name: scheduleData.name,
                    report_type: data.reportType,
                    frequency: scheduleData.frequency,
                    period_preset: data.periodPreset === 'custom' ? 'this_month' : data.periodPreset, // Fallback for custom
                    day_of_month: scheduleData.day_of_month,
                    day_of_week: scheduleData.day_of_week,
                    bank_account_ids: data.bankAccountIds.length > 0 ? data.bankAccountIds : undefined,
                    include_charts: data.includeCharts,
                    include_summary: data.includeDetails,
                    recipients: recipientsList,
                    configuration: {
                        ...configParams,
                        // Store custom dates if preset is custom (though schedules usually run on dynamic periods)
                        customStartDate: data.periodPreset === 'custom' ? data.startDate : undefined,
                        customEndDate: data.periodPreset === 'custom' ? data.endDate : undefined,
                    },
                    template_style: 'modern',
                });

                // After scheduling, do we also generate?
                // The prompt says "allows user select if they want to schedule, and then takes them through scheduling... by default... sent to email".
                // We should probably allow them to generate NOW as well.
                // Let's assume the button generates AND schedules if enabled.
            } catch (error) {
                // Create schedule error handled by hook toast
                return; // Stop if schedule fails
            }
        }

        // Proceed to generate report immediately
        await onGenerate(data);
    };

    // Validation for each step
    const canProceed = () => {
        switch (step) {
            case 1:
                return !!formData.reportType;
            case 2:
                if (REALTIME_REPORTS.includes(formData.reportType)) return true; // Period is skipped for realtime
                if (formData.periodPreset === 'custom') {
                    return !!formData.startDate && !!formData.endDate;
                }
                return !!formData.periodPreset;
            case 3:
                if (ACCOUNT_AGNOSTIC_REPORTS.includes(formData.reportType)) return true; // Accounts are skipped for agnostic
                return true; // Accounts are optional (all = empty array)
            case 4:
                return true;
            case 5:
                return true;
            default:
                return true;
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="max-w-3xl mx-auto">
            <Card className="overflow-hidden shadow-xl border-0 bg-gradient-to-b from-background to-muted/20">
                <CardContent className="p-8">
                    {/* Step Indicator */}
                    <StepIndicator steps={STEPS} currentStep={step} reportType={formData.reportType || ''} />

                    {/* Step Content */}
                    <div className="min-h-[400px]">
                        {step === 1 && (
                            <ReportTypeStep
                                value={formData.reportType}
                                onChange={(type) => setValue('reportType', type)}
                            />
                        )}

                        {step === 2 && !REALTIME_REPORTS.includes(formData.reportType) && (
                            <PeriodSelectionStep
                                preset={formData.periodPreset}
                                startDate={formData.startDate || ''}
                                endDate={formData.endDate || ''}
                                onPresetChange={(preset) => setValue('periodPreset', preset)}
                                onStartDateChange={(date) => setValue('startDate', date)}
                                onEndDateChange={(date) => setValue('endDate', date)}
                            />
                        )}

                        {step === 3 && !ACCOUNT_AGNOSTIC_REPORTS.includes(formData.reportType) && (
                            <AccountSelectionStep
                                selectedAccounts={selectedAccountIds}
                                onAccountToggle={handleAccountToggle}
                                onSelectAll={handleSelectAll}
                            />
                        )}

                        {step === 4 && (
                            <OptionsStep
                                includeCharts={formData.includeCharts ?? true}
                                includeUnoccupied={formData.includeUnoccupied ?? false}
                                includeAmount={formData.includeAmount ?? false}
                                paymentStatus={formData.paymentStatus ?? 'all'}
                                aggregation={formData.aggregation ?? 'monthly'}
                                transactionType={formData.transactionType ?? 'all'}
                                reportType={formData.reportType || 'financial_overview'}
                                onIncludeChartsChange={(v) => setValue('includeCharts', v)}
                                onIncludeUnoccupiedChange={(v) => setValue('includeUnoccupied', v)}
                                onIncludeAmountChange={(v) => setValue('includeAmount', v)}
                                onPaymentStatusChange={(v) => setValue('paymentStatus', v)}
                                onAggregationChange={(v) => setValue('aggregation', v)}
                                onTransactionTypeChange={(v) => setValue('transactionType', v)}
                            />
                        )}

                        {step === 5 && (
                            <ReviewStep
                                formData={formData}
                                scheduleEnabled={scheduleEnabled}
                                onScheduleEnabledChange={setScheduleEnabled}
                                scheduleData={scheduleData}
                                onScheduleDataChange={setScheduleData}
                            />
                        )}
                    </div>

                    {/* Navigation */}
                    <div className="flex justify-between pt-4">
                        <Button
                            variant="outline"
                            type="button"
                            onClick={handleBack}
                            disabled={step === 1 || isGenerating || createSchedule.isPending}
                        >
                            <ChevronLeft className="mr-2 h-4 w-4" />
                            Back
                        </Button>

                        {step < 5 ? (
                            <Button type="button" onClick={handleNext} disabled={!canProceed()}>
                                Next
                                <ChevronRight className="ml-2 h-4 w-4" />
                            </Button>
                        ) : (
                            <Button
                                type="button"
                                onClick={handleSubmit(onSubmit)}
                                disabled={isGenerating || createSchedule.isPending}
                                className={cn(
                                    "min-w-[140px]",
                                    scheduleEnabled ? "bg-purple-600 hover:bg-purple-700" : ""
                                )}
                            >
                                {isGenerating || createSchedule.isPending ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        {createSchedule.isPending ? 'Scheduling...' : 'Generating...'}
                                    </>
                                ) : (
                                    <>
                                        {scheduleEnabled ? (
                                            <>
                                                <CalendarClock className="mr-2 h-4 w-4" />
                                                Schedule & Generate
                                            </>
                                        ) : (
                                            <>
                                                <Sparkles className="mr-2 h-4 w-4" />
                                                Generate Report
                                            </>
                                        )}
                                    </>
                                )}
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>
        </form>
    );
}
