'use client';

import { useMemo, useState } from 'react';
import { CalendarClock, CalendarOff, Check, ChevronDown, ChevronRight, Landmark, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { reportTypes, type ReportType } from '@/lib/validators/reports';
import { ReportTypePreview } from '@/components/reports/report-type-previews';

export interface ReportTypePickerProps {
    value: ReportType | '';
    onChange: (type: ReportType) => void;
    /** Icon and tint for each type (kept with the wizard, which also uses them elsewhere). */
    config: Record<ReportType, { icon: React.ElementType; iconBg: string }>;
    /** Types that are always "as of today", so the wizard skips the time period step. */
    realtimeTypes: readonly ReportType[];
    /** Types that do not use bank accounts, so the wizard skips the accounts step. */
    accountAgnosticTypes: readonly ReportType[];
}

type ReportEntry = (typeof reportTypes)[number];

export function ReportTypePicker({ value, onChange, config, realtimeTypes, accountAgnosticTypes }: ReportTypePickerProps) {
    const [query, setQuery] = useState('');
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

    const needle = query.trim().toLowerCase();
    const groups = useMemo(() => {
        const order: string[] = [];
        const byGroup = new Map<string, ReportEntry[]>();
        for (const type of reportTypes) {
            if (needle && !`${type.label} ${type.description}`.toLowerCase().includes(needle)) continue;
            if (!byGroup.has(type.group)) {
                byGroup.set(type.group, []);
                order.push(type.group);
            }
            byGroup.get(type.group)!.push(type);
        }
        return order.map((name) => ({ name, items: byGroup.get(name)! }));
    }, [needle]);

    const selected = reportTypes.find((t) => t.value === value);
    const isRealtime = selected ? realtimeTypes.includes(selected.value) : false;
    const isAgnostic = selected ? accountAgnosticTypes.includes(selected.value) : false;
    const SelectedIcon = selected ? config[selected.value].icon : null;

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-xl font-bold tracking-tight">Select Report Type</h2>
                <p className="text-sm text-muted-foreground">Choose the type of financial report you want to generate</p>
            </div>

            <div className="grid gap-4 md:grid-cols-[18rem_minmax(0,1fr)]">
                {/* List */}
                <div className="min-w-0 space-y-2">
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                        <Input
                            type="search"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search reports"
                            aria-label="Search report types"
                            className="pl-8"
                        />
                    </div>

                    <div
                        className="max-h-80 space-y-3 overflow-y-auto rounded-lg border bg-card p-2 md:max-h-[26rem]"
                        data-testid="report-type-list"
                    >
                        {groups.length === 0 && (
                            <p className="px-2 py-6 text-center text-sm text-muted-foreground">No report matches your search.</p>
                        )}
                        {groups.map((group) => {
                            // A search opens every group that has a match, so no result hides behind a closed group.
                            const open = needle ? true : !collapsed[group.name];
                            const listId = `report-group-${group.name.replace(/\W+/g, '-').toLowerCase()}`;
                            return (
                                <div key={group.name}>
                                    <button
                                        type="button"
                                        aria-expanded={open}
                                        aria-controls={listId}
                                        onClick={() => setCollapsed((c) => ({ ...c, [group.name]: open }))}
                                        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                        {open ? <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}
                                        <span className="flex-1 text-left">{group.name}</span>
                                        <Badge variant="secondary" className="h-5 min-w-5 justify-center px-1.5 text-[11px]">
                                            {group.items.length}
                                        </Badge>
                                    </button>
                                    {open && (
                                        <ul id={listId} className="mt-1 space-y-1">
                                            {group.items.map((type) => {
                                                const Icon = config[type.value].icon;
                                                const isSelected = value === type.value;
                                                return (
                                                    <li key={type.value}>
                                                        <button
                                                            type="button"
                                                            aria-pressed={isSelected}
                                                            onClick={() => onChange(type.value)}
                                                            className={cn(
                                                                'flex w-full items-center gap-2.5 rounded-md border px-2.5 py-2 text-left text-sm transition-colors',
                                                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                                                isSelected
                                                                    ? 'border-primary bg-primary/5 font-medium'
                                                                    : 'border-transparent hover:bg-muted'
                                                            )}
                                                        >
                                                            <span className={cn('inline-flex shrink-0 rounded-md p-1.5', config[type.value].iconBg)}>
                                                                <Icon className="h-4 w-4" aria-hidden="true" />
                                                            </span>
                                                            <span className="min-w-0 flex-1">{type.label}</span>
                                                            {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
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

                {/* Aim and preview */}
                <div className="min-w-0 space-y-3" aria-live="polite">
                    {selected && SelectedIcon ? (
                        <>
                            <div className="rounded-lg border bg-muted/30 p-3" data-testid="report-type-aim">
                                <div className="flex items-start gap-3">
                                    <span className={cn('inline-flex shrink-0 rounded-lg p-2', config[selected.value].iconBg)}>
                                        <SelectedIcon className="h-5 w-5" aria-hidden="true" />
                                    </span>
                                    <div className="min-w-0">
                                        <p className="font-semibold">{selected.label}</p>
                                        <p className="text-sm text-muted-foreground">{selected.description}</p>
                                    </div>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <Badge variant="outline" className="gap-1.5 font-normal">
                                        {isRealtime ? <CalendarOff className="h-3.5 w-3.5" aria-hidden="true" /> : <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />}
                                        {isRealtime ? 'Always as of today' : 'Asks for a date range'}
                                    </Badge>
                                    <Badge variant="outline" className="gap-1.5 font-normal">
                                        <Landmark className="h-3.5 w-3.5" aria-hidden="true" />
                                        {isAgnostic ? 'No bank account step' : 'Asks for bank accounts'}
                                    </Badge>
                                    <Badge variant="secondary" className="font-normal">
                                        {isRealtime ? 'Next step: Options (step 4)' : 'Next step: Time Period (step 2)'}
                                    </Badge>
                                </div>
                            </div>
                            <ReportTypePreview type={selected.value} title={selected.label} />
                        </>
                    ) : (
                        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                            Select a report to see what it asks for and an example of its layout.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
