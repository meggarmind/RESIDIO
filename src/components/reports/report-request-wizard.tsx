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

// ============================================================
// Stepper Component
// ============================================================

function StepIndicator({ steps, currentStep }: { steps: Step[]; currentStep: number }) {
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
                    const isCompleted = currentStep > step.id;
                    const isCurrent = currentStep === step.id;

                    return (
                        <div key={step.id} className="flex flex-col items-center">
                            <div
                                className={cn(
                                    'relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-300',
                                    isCompleted
                                        ? 'border-emerald-500 bg-emerald-500 text-white'
                                        : isCurrent
                                          ? 'border-emerald-500 bg-background text-emerald-600 shadow-lg shadow-emerald-500/20'
                                          : 'border-muted bg-background text-muted-foreground'
                                )}
                            >
                                {isCompleted ? (
                                    <Check className="h-5 w-5" />
                                ) : (
                                    <span className="text-sm font-semibold">{step.id}</span>
                                )}
                            </div>
                            <div className="mt-2 text-center">
                                <p
                                    className={cn(
                                        'text-xs font-medium transition-colors',
                                        isCurrent ? 'text-foreground' : 'text-muted-foreground'
                                    )}
                                >
                                    {step.title}
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
    includeDetails,
    aggregation,
    transactionType,
    onIncludeChartsChange,
    onIncludeDetailsChange,
    onAggregationChange,
    onTransactionTypeChange,
}: {
    includeCharts: boolean;
    includeDetails: boolean;
    aggregation: AggregationType;
    transactionType: 'all' | 'credit' | 'debit';
    onIncludeChartsChange: (value: boolean) => void;
    onIncludeDetailsChange: (value: boolean) => void;
    onAggregationChange: (value: AggregationType) => void;
    onTransactionTypeChange: (value: 'all' | 'credit' | 'debit') => void;
}) {
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

                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                        <div className="space-y-0.5">
                            <Label className="font-medium">Include Details</Label>
                            <p className="text-sm text-muted-foreground">
                                Show individual transaction rows
                            </p>
                        </div>
                        <Switch
                            checked={includeDetails}
                            onCheckedChange={onIncludeDetailsChange}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Data Options */}
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
        </div>
    );
}

function ReviewStep({ formData }: { formData: Partial<ReportRequestFormData> }) {
    const reportType = reportTypes.find((r) => r.value === formData.reportType);
    const period = periodPresets.find((p) => p.value === formData.periodPreset);
    const config = reportTypeConfig[formData.reportType || 'financial_overview'];
    const Icon = config.icon;

    // Calculate date range for display
    const dateRange =
        formData.periodPreset === 'custom'
            ? { startDate: formData.startDate || '', endDate: formData.endDate || '' }
            : getDateRangeFromPreset(formData.periodPreset || 'this_month');

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
                        </div>
                    </div>

                    <hr className="border-dashed" />

                    {/* Accounts */}
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
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

// ============================================================
// Main Wizard Component
// ============================================================

export function ReportRequestWizard({ onGenerate, isGenerating = false }: ReportRequestWizardProps) {
    const [currentStep, setCurrentStep] = useState(1);

    const form = useForm({
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
        },
    });

    const { watch, setValue, handleSubmit, getValues } = form;
    const formValues = watch();

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

    const handleNext = () => {
        if (currentStep < STEPS.length) {
            setCurrentStep(currentStep + 1);
        }
    };

    const handlePrev = () => {
        if (currentStep > 1) {
            setCurrentStep(currentStep - 1);
        }
    };

    // Memoized handler that uses getValues() to avoid stale closure issues
    const handleAccountToggle = useCallback((accountId: string) => {
        const current = getValues('bankAccountIds') || [];
        if (current.includes(accountId)) {
            setValue(
                'bankAccountIds',
                current.filter((id) => id !== accountId)
            );
        } else {
            setValue('bankAccountIds', [...current, accountId]);
        }
    }, [getValues, setValue]);

    // Memoized select all handler
    const handleSelectAll = useCallback((accountIds: string[]) => {
        setValue('bankAccountIds', accountIds);
    }, [setValue]);

    const onSubmit = async (data: ReportRequestFormData) => {
        await onGenerate(data);
    };

    // Validation for each step
    const canProceed = () => {
        switch (currentStep) {
            case 1:
                return !!formValues.reportType;
            case 2:
                if (formValues.periodPreset === 'custom') {
                    return !!formValues.startDate && !!formValues.endDate;
                }
                return !!formValues.periodPreset;
            case 3:
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
                    <StepIndicator steps={STEPS} currentStep={currentStep} />

                    {/* Step Content */}
                    <div className="min-h-[400px]">
                        {currentStep === 1 && (
                            <ReportTypeStep
                                value={formValues.reportType}
                                onChange={(type) => setValue('reportType', type)}
                            />
                        )}

                        {currentStep === 2 && (
                            <PeriodSelectionStep
                                preset={formValues.periodPreset}
                                startDate={formValues.startDate || ''}
                                endDate={formValues.endDate || ''}
                                onPresetChange={(preset) => setValue('periodPreset', preset)}
                                onStartDateChange={(date) => setValue('startDate', date)}
                                onEndDateChange={(date) => setValue('endDate', date)}
                            />
                        )}

                        {currentStep === 3 && (
                            <AccountSelectionStep
                                selectedAccounts={selectedAccountIds}
                                onAccountToggle={handleAccountToggle}
                                onSelectAll={handleSelectAll}
                            />
                        )}

                        {currentStep === 4 && (
                            <OptionsStep
                                includeCharts={formValues.includeCharts ?? true}
                                includeDetails={formValues.includeDetails ?? true}
                                aggregation={formValues.aggregation ?? 'monthly'}
                                transactionType={formValues.transactionType ?? 'all'}
                                onIncludeChartsChange={(v) => setValue('includeCharts', v)}
                                onIncludeDetailsChange={(v) => setValue('includeDetails', v)}
                                onAggregationChange={(v) => setValue('aggregation', v)}
                                onTransactionTypeChange={(v) => setValue('transactionType', v)}
                            />
                        )}

                        {currentStep === 5 && <ReviewStep formData={formValues} />}
                    </div>

                    {/* Navigation */}
                    <div className="flex justify-between mt-8 pt-6 border-t">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handlePrev}
                            disabled={currentStep === 1 || isGenerating}
                            className="gap-2"
                        >
                            <ChevronLeft className="h-4 w-4" />
                            Previous
                        </Button>

                        {currentStep < STEPS.length ? (
                            <Button
                                type="button"
                                onClick={handleNext}
                                disabled={!canProceed()}
                                className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                            >
                                Next
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        ) : (
                            <Button
                                type="submit"
                                disabled={isGenerating}
                                className="gap-2 bg-emerald-600 hover:bg-emerald-700 min-w-[160px]"
                            >
                                {isGenerating ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Generating...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="h-4 w-4" />
                                        Generate Report
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
