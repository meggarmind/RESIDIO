'use client';

import { memo, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, Loader2, RotateCcw, Target } from 'lucide-react';
import { EnhancedPageHeader } from '@/components/dashboard/enhanced-stat-card';
import { ModernEmptyState } from '@/components/dashboard/modern-empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCan } from '@/components/auth/can';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { cn } from '@/lib/utils';
import { saveBudgetYear, type BudgetYear } from '@/actions/expenses/budgets';
import {
    MONTH_NAMES,
    evenSplit,
    monthSplitStatus,
    monthsDifference,
    percentUsed,
    sumAmounts,
    toCents,
    type MonthSplitStatus,
} from '@/lib/budgets/budget-months';

const naira = (amount: number) =>
    `₦${amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const SPLIT_BADGE: Record<MonthSplitStatus, { variant: 'secondary' | 'info' | 'warning'; label: string }> = {
    even: { variant: 'secondary', label: 'Even split' },
    custom: { variant: 'info', label: 'Custom months' },
    mismatch: { variant: 'warning', label: 'Months do not add up' },
};

/** The month split of one category, as a labelled badge (never colour alone). */
const BudgetSplitBadge = memo(function BudgetSplitBadge({ status }: { status: MonthSplitStatus }) {
    const { variant, label } = SPLIT_BADGE[status];
    return (
        <Badge variant={variant} data-testid="budget-split-status">
            {status === 'mismatch' && <AlertTriangle aria-hidden="true" />}
            {label}
        </Badge>
    );
});

interface Draft {
    yearly: number;
    months: number[];
}

function draftsFrom(budget: BudgetYear | null): Record<string, Draft> {
    return Object.fromEntries(
        (budget?.categories ?? []).map((c) => [c.categoryId, { yearly: c.yearly, months: [...c.months] }])
    );
}

const sameDraft = (a: Draft, b: Draft) =>
    toCents(a.yearly) === toCents(b.yearly) && a.months.every((m, i) => toCents(m) === toCents(b.months[i]));

export interface BudgetsClientProps {
    year: number;
    currentYear: number;
    budget: BudgetYear | null;
    error: string | null;
}

export function BudgetsClient({ year, currentYear, budget, error }: BudgetsClientProps) {
    const router = useRouter();
    // Presentation only: saveBudgetYear enforces EXPENDITURE_MANAGE itself.
    const canManage = useCan(PERMISSIONS.EXPENDITURE_MANAGE);
    const saved = useMemo(() => draftsFrom(budget), [budget]);
    const [drafts, setDrafts] = useState<Record<string, Draft>>(saved);
    const [open, setOpen] = useState<Record<string, boolean>>({});
    const [isSaving, setIsSaving] = useState(false);

    // A fresh server load (router.refresh after a save, or a new year) replaces the drafts.
    useEffect(() => {
        setDrafts(saved);
    }, [saved]);

    const categories = budget?.categories ?? [];
    const dirtyIds = categories
        .filter((c) => drafts[c.categoryId] && saved[c.categoryId] && !sameDraft(drafts[c.categoryId], saved[c.categoryId]))
        .map((c) => c.categoryId);
    const isDirty = dirtyIds.length > 0;
    const mismatchCount = categories.filter((c) => {
        const d = drafts[c.categoryId];
        return d && monthsDifference(d.months, d.yearly) !== 0;
    }).length;
    const totalBudget = sumAmounts(categories.map((c) => drafts[c.categoryId]?.yearly ?? 0));

    // Warn before the page is left with unsaved budgets.
    useEffect(() => {
        if (!isDirty) return;
        const onBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [isDirty]);

    const update = (categoryId: string, change: (draft: Draft) => Draft) =>
        setDrafts((current) => ({ ...current, [categoryId]: change(current[categoryId]) }));

    const setYearly = (categoryId: string, yearly: number) =>
        update(categoryId, (d) => ({
            yearly,
            // Months that were an even split follow the year; custom months stay as they are.
            months: monthSplitStatus(d.months, d.yearly) === 'even' ? evenSplit(yearly) : d.months,
        }));

    const setMonth = (categoryId: string, monthIndex: number, amount: number) =>
        update(categoryId, (d) => ({ ...d, months: d.months.map((m, i) => (i === monthIndex ? amount : m)) }));

    const resetToEven = (categoryId: string) => update(categoryId, (d) => ({ ...d, months: evenSplit(d.yearly) }));

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const result = await saveBudgetYear({
                year,
                categories: dirtyIds.map((id) => ({ categoryId: id, yearly: drafts[id].yearly, months: drafts[id].months })),
            });
            if (result.error) {
                toast.error(result.error);
                return;
            }
            toast.success(`Budgets for ${year} saved`);
            router.refresh();
        } catch (saveError) {
            console.error('Failed to save budgets:', saveError);
            toast.error('Could not save budgets. Try again.');
        } finally {
            setIsSaving(false);
        }
    };

    const years = Array.from(new Set([currentYear - 2, currentYear - 1, currentYear, currentYear + 1, currentYear + 2, year])).sort();

    const statusText =
        mismatchCount > 0
            ? `${mismatchCount} ${mismatchCount === 1 ? 'category has' : 'categories have'} months that do not add up. Fix them to save.`
            : isDirty
              ? 'Unsaved changes'
              : '';

    return (
        <div className="space-y-6">
            <EnhancedPageHeader
                title="Budgets"
                description="A yearly budget for each expense category, with an optional amount for each month."
                icon={Target}
                backHref="/expenditure"
                backLabel="Back to expenditure"
            />

            {error ? (
                <Card role="alert">
                    <CardContent className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" aria-hidden="true" />
                            <div>
                                <p className="font-medium">Budgets could not be loaded</p>
                                <p className="text-sm text-muted-foreground">{error}</p>
                            </div>
                        </div>
                        <Button variant="outline" className="h-11 md:h-9" onClick={() => router.refresh()}>
                            Try again
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2">
                            <Label htmlFor="budget-year" className="text-muted-foreground">
                                Year
                            </Label>
                            <Select
                                value={String(year)}
                                onValueChange={(value) => router.push(`/expenditure/budgets?year=${value}`)}
                                disabled={isDirty}
                            >
                                <SelectTrigger id="budget-year" className="h-11 w-28 md:h-9">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {years.map((y) => (
                                        <SelectItem key={y} value={String(y)}>
                                            {y}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {canManage && (
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                <span className="text-sm text-muted-foreground" aria-live="polite" data-testid="budget-save-status">
                                    {statusText}
                                </span>
                                {isDirty && (
                                    <Button variant="outline" className="h-11 md:h-9" onClick={() => setDrafts(saved)} disabled={isSaving}>
                                        Discard changes
                                    </Button>
                                )}
                                <Button
                                    className="h-11 md:h-9"
                                    onClick={handleSave}
                                    disabled={!isDirty || mismatchCount > 0 || isSaving}
                                >
                                    {isSaving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                                    {isSaving ? 'Saving...' : 'Save budgets'}
                                </Button>
                            </div>
                        )}
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {categories.length === 0 ? (
                            <ModernEmptyState
                                icon={Target}
                                title="No expense categories"
                                description="Budgets are set per expense category. Add a category first."
                                animate={false}
                            />
                        ) : (
                            <div className="grid gap-3 md:grid-cols-2">
                                {categories.map((category) => {
                                    const draft = drafts[category.categoryId] ?? { yearly: category.yearly, months: category.months };
                                    const status = monthSplitStatus(draft.months, draft.yearly);
                                    const difference = monthsDifference(draft.months, draft.yearly);
                                    const used = percentUsed(category.actual, draft.yearly);
                                    const isOpen = open[category.categoryId] ?? false;
                                    const editable = canManage && !category.hasIrregularRows;
                                    const panelId = `budget-months-${category.categoryId}`;
                                    return (
                                        <section
                                            key={category.categoryId}
                                            aria-label={category.name}
                                            className="space-y-3 rounded-xl border bg-card p-4"
                                            data-testid="budget-category"
                                        >
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <h3 className="font-semibold">{category.name}</h3>
                                                <div className="flex flex-wrap gap-1">
                                                    {!category.isActive && <Badge variant="outline">Inactive</Badge>}
                                                    <BudgetSplitBadge status={status} />
                                                </div>
                                            </div>

                                            <div className="space-y-1">
                                                <Label htmlFor={`budget-yearly-${category.categoryId}`} className="text-xs text-muted-foreground">
                                                    Yearly amount
                                                </Label>
                                                {editable ? (
                                                    <CurrencyInput
                                                        id={`budget-yearly-${category.categoryId}`}
                                                        value={draft.yearly}
                                                        onValueChange={(value) => setYearly(category.categoryId, value)}
                                                        aria-label={`Yearly budget for ${category.name}`}
                                                        className="tabular-nums"
                                                    />
                                                ) : (
                                                    <p id={`budget-yearly-${category.categoryId}`} className="text-lg font-bold tabular-nums whitespace-nowrap">
                                                        {category.hasBudget ? naira(draft.yearly) : 'No budget set'}
                                                    </p>
                                                )}
                                            </div>

                                            <div className="space-y-1">
                                                <Progress
                                                    value={Math.min(used, 100)}
                                                    aria-label={`Percent of ${category.name} budget used`}
                                                    className={cn(
                                                        used > 100 && '[&>[data-slot=progress-indicator]]:bg-destructive',
                                                        used >= 85 && used <= 100 && '[&>[data-slot=progress-indicator]]:bg-warning'
                                                    )}
                                                />
                                                <p className="text-xs text-muted-foreground tabular-nums">
                                                    {draft.yearly > 0
                                                        ? `${used.toFixed(1)}% used (${naira(category.actual)} paid)`
                                                        : `No budget set (${naira(category.actual)} paid)`}
                                                </p>
                                            </div>

                                            {category.hasIrregularRows && (
                                                <p className="rounded-md border border-warning bg-warning/10 p-2 text-xs" role="note">
                                                    This category has budget rows for {year} that are not single months, so it cannot be changed here.
                                                </p>
                                            )}

                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-11 md:h-8"
                                                aria-expanded={isOpen}
                                                aria-controls={panelId}
                                                onClick={() => setOpen((o) => ({ ...o, [category.categoryId]: !isOpen }))}
                                            >
                                                {isOpen ? 'Hide months' : editable ? 'Adjust months' : 'Show months'}
                                            </Button>

                                            <div id={panelId} hidden={!isOpen} className="space-y-3">
                                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                                    {MONTH_NAMES.map((month, i) => (
                                                        <div key={month} className="space-y-1">
                                                            <Label htmlFor={`${panelId}-${i}`} className="text-xs text-muted-foreground">
                                                                {month}
                                                            </Label>
                                                            {editable ? (
                                                                <CurrencyInput
                                                                    id={`${panelId}-${i}`}
                                                                    value={draft.months[i]}
                                                                    onValueChange={(value) => setMonth(category.categoryId, i, value)}
                                                                    aria-label={`${category.name} ${month}`}
                                                                    className="tabular-nums"
                                                                />
                                                            ) : (
                                                                <p id={`${panelId}-${i}`} className="text-sm tabular-nums whitespace-nowrap">
                                                                    {naira(draft.months[i])}
                                                                </p>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                                <p className="text-xs text-muted-foreground tabular-nums">
                                                    Months total: {naira(sumAmounts(draft.months))}
                                                </p>
                                                {difference !== 0 && (
                                                    <p className="rounded-md border border-warning bg-warning/10 p-2 text-sm" role="alert" data-testid="budget-mismatch">
                                                        Months add up to {naira(sumAmounts(draft.months))}. The year is {naira(draft.yearly)}.{' '}
                                                        {difference > 0 ? 'Remove' : 'Add'} {naira(Math.abs(difference))} to match.
                                                    </p>
                                                )}
                                                {editable && (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-11 md:h-8"
                                                        onClick={() => resetToEven(category.categoryId)}
                                                        disabled={status === 'even'}
                                                    >
                                                        <RotateCcw className="h-4 w-4" aria-hidden="true" />
                                                        Reset to even split
                                                    </Button>
                                                )}
                                            </div>
                                        </section>
                                    );
                                })}
                            </div>
                        )}

                        {categories.length > 0 && (
                            <div className="flex items-center justify-between border-t pt-3 font-semibold">
                                <span>Total budget</span>
                                <span className="tabular-nums whitespace-nowrap" data-testid="budget-total">
                                    {naira(totalBudget)}
                                </span>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
