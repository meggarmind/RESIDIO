'use client';

import { useMemo, useState } from 'react';
import {
    FileBarChart,
    Receipt,
    Clock,
    ScrollText,
    Users,
    LayoutList,
    Construction,
    ChevronDown,
    Search,
    Check,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { reportGroups, reportTypes, type ReportType } from '@/lib/validators/reports';

// ============================================================
// Report Type Icons & Styles
// ============================================================

export const reportTypeConfig: Record<ReportType, {
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
    indebtedness_detail: {
        icon: LayoutList,
        gradient: 'from-yellow-500/10 to-orange-500/5',
        iconBg: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400',
        borderHover: 'hover:border-yellow-500/50',
    },
    development_levy: {
        icon: Construction,
        gradient: 'from-indigo-500/10 to-blue-500/5',
        iconBg: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400',
        borderHover: 'hover:border-indigo-500/50',
    },
};


// ============================================================
// Example layouts (static; columns follow src/lib/pdf/reports/*)
// ============================================================

type Preview = { summary: string[]; columns: string[]; rows: string[][] };

const REPORT_PREVIEWS: Record<ReportType, Preview> = {
    financial_overview: {
        summary: ['Total Credits', 'Total Debits', 'Net Balance'],
        columns: ['Category', 'Count', 'Amount', '% of Total'],
        rows: [['Security dues', '42', '1,200,000', '60%'], ['Service charge', '18', '500,000', '25%'], ['Other income', '9', '300,000', '15%']],
    },
    collection_report: {
        summary: ['Collection Rate', 'Invoiced', 'Collected', 'Outstanding'],
        columns: ['Resident', 'House', 'Invoiced', 'Paid', 'Balance'],
        rows: [['A. Resident', '12 Example St', '50,000', '50,000', '0'], ['B. Resident', '4 Example St', '50,000', '20,000', '30,000']],
    },
    invoice_aging: {
        summary: ['Current (0-30d)', '30-60 Days', '60-90 Days', 'Over 90 Days'],
        columns: ['Invoice', 'Resident', 'Due Date', 'Amount', 'Outstanding'],
        rows: [['INV-0001', 'A. Resident', '01 Sep 2026', '50,000', '50,000'], ['INV-0002', 'B. Resident', '15 Aug 2026', '30,000', '10,000']],
    },
    transaction_log: {
        summary: [],
        columns: ['Date', 'Description', 'Category', 'Amount', 'Type'],
        rows: [['01 Oct 2026', 'Transfer from A. Resident', 'Security dues', '50,000', 'credit'], ['03 Oct 2026', 'Gate repair', 'Maintenance', '20,000', 'debit']],
    },
    debtors_report: {
        summary: ['Total Debtors', 'Outstanding', 'Avg Days Overdue'],
        columns: ['Debtor', 'House', 'Outstanding', 'Over 90d', 'Contact'],
        rows: [['A. Resident', '12 Example St', '80,000', '30,000', '0800 000 0000'], ['B. Resident', '4 Example St', '45,000', '0', '0800 000 0001']],
    },
    indebtedness_summary: {
        summary: [],
        columns: ['House', 'Street', 'Resident', 'Status', 'Amount'],
        rows: [['12', 'Example St', 'A. Resident', 'Indebted', '80,000'], ['4', 'Example St', 'B. Resident', 'Not indebted', '0']],
    },
    indebtedness_detail: {
        summary: [],
        columns: ['House', 'Resident', 'Invoice', 'Outstanding'],
        rows: [['12 Example St', 'A. Resident', 'INV-0001', '50,000'], ['12 Example St', 'A. Resident', 'INV-0004', '30,000']],
    },
    development_levy: {
        summary: ['Total Houses', 'Collected', 'Pending'],
        columns: ['House', 'Responsible', 'Amount', 'Status'],
        rows: [['12 Example St', 'A. Resident', '100,000', 'Paid'], ['4 Example St', 'B. Resident', '100,000', 'Pending']],
    },
};

function LayoutPreview({ type }: { type: ReportType }) {
    const { summary, columns, rows } = REPORT_PREVIEWS[type];
    return (
        <div className="flex-1 min-h-0 overflow-auto rounded-lg border bg-muted/20 p-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Example layout</p>
            <div className="rounded-md border bg-background p-4 shadow-sm">
                {summary.length > 0 && (
                    <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {summary.map((label) => (
                            <div key={label} className="rounded border p-2">
                                <p className="text-xs text-muted-foreground">{label}</p>
                                <p className="text-sm font-semibold">0,000</p>
                            </div>
                        ))}
                    </div>
                )}
                <div className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="example-layout-table">
                        <thead>
                            <tr className="border-b text-left text-xs text-muted-foreground">
                                {columns.map((c) => <th key={c} className="px-2 py-1.5 font-medium">{c}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, i) => (
                                <tr key={i} className="border-b last:border-0">
                                    {row.map((cell, j) => <td key={j} className="px-2 py-1.5">{cell}</td>)}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// ============================================================
// Picker
// ============================================================

interface ReportTypePickerProps {
    value: ReportType | '';
    onChange: (type: ReportType) => void;
    /** Report runs as of today, so the wizard skips the date step. */
    isRealtime: (type: ReportType) => boolean;
    /** Report ignores bank accounts, so the wizard skips the accounts step. */
    isAccountAgnostic: (type: ReportType) => boolean;
}

export function ReportTypePicker({ value, onChange, isRealtime, isAccountAgnostic }: ReportTypePickerProps) {
    const [query, setQuery] = useState('');
    const [closed, setClosed] = useState<Set<string>>(new Set());
    // Nothing chosen yet: show the first report so the right panel is never empty.
    const shown = (value || reportTypes[0].value) as ReportType;
    const selected = reportTypes.find((t) => t.value === shown)!;
    const config = reportTypeConfig[shown];
    const Icon = config.icon;

    const needle = query.trim().toLowerCase();
    const matches = useMemo(
        () => reportTypes.filter((t) => !needle || t.label.toLowerCase().includes(needle) || t.description.toLowerCase().includes(needle)),
        [needle],
    );

    const nextStep = !isRealtime(shown) ? 'Time Period' : !isAccountAgnostic(shown) ? 'Accounts' : 'Options';

    const toggle = (group: string) =>
        setClosed((prev) => {
            const next = new Set(prev);
            if (next.has(group)) next.delete(group); else next.add(group);
            return next;
        });

    return (
        <div className="grid gap-4 lg:h-[calc(100dvh-24rem)] lg:min-h-[340px] lg:grid-cols-[320px_minmax(0,1fr)]">
            {/* List */}
            <div className="flex min-h-0 flex-col gap-3 max-lg:max-h-[60dvh]">
                <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search reports"
                        aria-label="Search reports"
                        className="pl-9"
                    />
                </div>
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                    {matches.length === 0 && (
                        <p className="p-3 text-sm text-muted-foreground">No report matches your search.</p>
                    )}
                    {reportGroups.map((group) => {
                        const items = matches.filter((t) => t.group === group.value);
                        if (items.length === 0) return null;
                        // A search always shows its matches, even in a closed group.
                        const open = !!needle || !closed.has(group.value);
                        return (
                            <div key={group.value}>
                                <button
                                    type="button"
                                    onClick={() => toggle(group.value)}
                                    aria-expanded={open}
                                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted"
                                >
                                    <span>{group.label} ({items.length})</span>
                                    <ChevronDown className={cn('h-4 w-4 transition-transform', !open && '-rotate-90')} />
                                </button>
                                {open && (
                                    <ul className="mt-1 space-y-1">
                                        {items.map((type) => {
                                            const c = reportTypeConfig[type.value];
                                            const ItemIcon = c.icon;
                                            const isSelected = value === type.value;
                                            return (
                                                <li key={type.value}>
                                                    <button
                                                        type="button"
                                                        onClick={() => onChange(type.value)}
                                                        aria-pressed={isSelected}
                                                        className={cn(
                                                            'flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors',
                                                            isSelected ? 'border-emerald-500 bg-emerald-500/5' : 'border-transparent hover:bg-muted',
                                                        )}
                                                    >
                                                        <span className={cn('inline-flex rounded-lg p-2', c.iconBg)}><ItemIcon className="h-4 w-4" /></span>
                                                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{type.label}</span>
                                                        {isSelected && <Check className="h-4 w-4 text-emerald-600" />}
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Aim strip and preview */}
            <div className="flex min-h-0 min-w-0 flex-col gap-3">
                <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-gradient-to-br p-3', config.gradient)}>
                    <span className={cn('inline-flex rounded-xl p-2.5', config.iconBg)}><Icon className="h-5 w-5" /></span>
                    <div className="min-w-0 flex-1 basis-48">
                        <h3 className="font-semibold">{selected.label}</h3>
                        <p className="text-sm text-muted-foreground">{selected.description}</p>
                    </div>
                    <ul className="flex flex-wrap gap-1.5 text-xs" aria-label="What this report asks for">
                        <li className="rounded-full border bg-background px-2 py-0.5">{isRealtime(shown) ? 'As of today' : 'Asks for a date range'}</li>
                        <li className="rounded-full border bg-background px-2 py-0.5">{isAccountAgnostic(shown) ? 'No bank account step' : 'Asks for bank accounts'}</li>
                        <li className="rounded-full border bg-background px-2 py-0.5">Next: {nextStep}</li>
                    </ul>
                </div>
                <LayoutPreview type={shown} />
            </div>
        </div>
    );
}
