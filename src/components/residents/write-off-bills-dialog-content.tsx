'use client';

import { Fragment, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { formatCurrency } from '@/lib/utils';
import { getWriteOffCandidates, writeOffInvoices, type WriteOffCandidate } from '@/actions/billing/write-off-invoices';
import {
    selectAllButNewestCoveredBy,
    selectOldestUpTo,
    selectYear,
    sortOldestFirst,
    summarize,
    unpaidBalance,
} from '@/lib/billing/write-off-selection';
import { WRITE_OFF_REASONS, WRITE_OFF_REASON_LABELS, type WriteOffReason } from '@/types/database';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `Jul 2020` for a `YYYY-MM-DD` period start (CORE.md section 4: month names, never numbers). */
function billMonth(periodStart: string | null): string {
    if (!periodStart) return 'No period';
    return `${MONTHS[Number(periodStart.slice(5, 7)) - 1]} ${periodStart.slice(0, 4)}`;
}

const yearOf = (bill: WriteOffCandidate) => (bill.period_start ? bill.period_start.slice(0, 4) : 'No period');

/**
 * Resident > Money > "Write off bills" (#1460, owner option B): tick the open bills to write off,
 * or let the smart buttons tick them, then confirm with a reason and a note.
 */
export function WriteOffBillsDialogContent({ residentId, residentName, onDone }: { residentId: string; residentName: string; onDone?: () => void }) {
    const queryClient = useQueryClient();
    const candidates = useQuery({
        queryKey: ['write-off-candidates', residentId],
        queryFn: async () => {
            const result = await getWriteOffCandidates(residentId);
            if (result.error) throw new Error(result.error);
            return result.data ?? [];
        },
    });

    const bills = useMemo(() => sortOldestFirst(candidates.data ?? []), [candidates.data]);
    const years = useMemo(() => [...new Set(bills.map(yearOf))], [bills]);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [target, setTarget] = useState(0);
    const [payment, setPayment] = useState(0);
    const [message, setMessage] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [reason, setReason] = useState<WriteOffReason>('exco_settlement');
    const [note, setNote] = useState('');
    const [running, setRunning] = useState(false);

    const totals = summarize(bills, selected, payment);
    const allSelected = bills.length > 0 && selected.size === bills.length;

    const choose = (ids: Iterable<string>, text: { tone: 'ok' | 'warn'; text: string } | null = null) => {
        setSelected(new Set(ids));
        setMessage(text);
    };
    const toggle = (id: string, on: boolean) => {
        const next = new Set(selected);
        if (on) next.add(id);
        else next.delete(id);
        choose(next);
    };

    const pickOldest = () => {
        const result = selectOldestUpTo(bills, target);
        choose(result.ids, result.exact
            ? { tone: 'ok', text: `Exact match: the ${result.ids.length} oldest bills make ${formatCurrency(result.total)}.` }
            : { tone: 'warn', text: `No exact match. The ${result.ids.length} oldest bills make ${formatCurrency(result.total)}. The difference is ${formatCurrency(result.gap)}.` });
    };
    const keepNewest = () => {
        const ids = selectAllButNewestCoveredBy(bills, payment);
        choose(ids, { tone: 'ok', text: `The payment of ${formatCurrency(payment)} pays the ${bills.length - ids.length} newest bills. The other ${ids.length} bills are selected.` });
    };
    const addYear = (year: string) => {
        const ids = year === 'No period' ? bills.filter((b) => !b.period_start).map((b) => b.id) : selectYear(bills, Number(year));
        choose([...selected, ...ids]);
    };

    const noteValid = note.trim().length >= 5;
    const handleWriteOff = async () => {
        setRunning(true);
        const result = await writeOffInvoices({ residentId, invoiceIds: [...selected], reason, note });
        setRunning(false);
        if (!result.success) {
            toast.error(result.error || 'Write-off failed');
            return;
        }
        toast.success(`Wrote off ${result.count} bills (${formatCurrency(result.total ?? 0)}) for ${residentName}`);
        setConfirmOpen(false);
        setNote('');
        choose([]);
        queryClient.invalidateQueries({ queryKey: ['write-off-candidates', residentId] });
        queryClient.invalidateQueries({ queryKey: ['wallet', residentId] });
        queryClient.invalidateQueries({ queryKey: ['yearly-wallet-transactions', residentId] });
        queryClient.invalidateQueries({ queryKey: ['resident-indebtedness', residentId] });
        queryClient.invalidateQueries({ queryKey: ['resident', residentId] });
        queryClient.invalidateQueries({ queryKey: ['invoices'] });
        onDone?.();
    };

    if (candidates.isLoading) {
        return (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading open bills...
            </div>
        );
    }
    if (candidates.error) {
        return (
            <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>Could not load the open bills: {candidates.error.message}</AlertDescription>
            </Alert>
        );
    }
    if (bills.length === 0) {
        return <p className="py-6 text-sm text-muted-foreground">{residentName} has no open bills to write off.</p>;
    }

    return (
        <div className="space-y-4">
            <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
                <p className="text-sm font-medium">Smart select</p>
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="write-off-target">Agreed write-off ₦</Label>
                        <div className="flex gap-2">
                            <CurrencyInput id="write-off-target" value={target || ''} onValueChange={setTarget} className="min-h-11 md:min-h-0" />
                            <Button type="button" variant="outline" size="sm" className="min-h-11 shrink-0 md:min-h-0" disabled={target <= 0} onClick={pickOldest}>
                                Oldest bills up to this amount
                            </Button>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="write-off-payment">Payment ₦</Label>
                        <div className="flex gap-2">
                            <CurrencyInput id="write-off-payment" value={payment || ''} onValueChange={setPayment} className="min-h-11 md:min-h-0" />
                            <Button type="button" variant="outline" size="sm" className="min-h-11 shrink-0 md:min-h-0" disabled={payment <= 0} onClick={keepNewest}>
                                Keep newest bills for this payment
                            </Button>
                        </div>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-muted-foreground">Year</span>
                    {years.map((year) => (
                        <Button key={year} type="button" variant="outline" size="sm" className="min-h-11 md:min-h-0" onClick={() => addYear(year)}>
                            {year}
                        </Button>
                    ))}
                    <Button type="button" variant="ghost" size="sm" className="min-h-11 md:min-h-0" onClick={() => choose([])}>
                        Clear
                    </Button>
                </div>
                {message && (
                    <p role="status" className={message.tone === 'ok' ? 'text-sm text-emerald-700 dark:text-emerald-400' : 'text-sm text-amber-700 dark:text-amber-400'}>
                        {message.text}
                    </p>
                )}
            </div>

            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-10">
                            <Checkbox
                                aria-label="Select all bills"
                                checked={allSelected ? true : selected.size > 0 ? 'indeterminate' : false}
                                onCheckedChange={(checked) => choose(checked === true ? bills.map((b) => b.id) : [])}
                            />
                        </TableHead>
                        <TableHead>Bill month</TableHead>
                        <TableHead>Bill no.</TableHead>
                        <TableHead className="hidden sm:table-cell">House</TableHead>
                        <TableHead className="text-right">Unpaid</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {years.map((year) => (
                        <Fragment key={year}>
                            <TableRow className="bg-muted/40 hover:bg-muted/40">
                                <TableCell colSpan={5} className="py-1.5 text-xs font-semibold text-muted-foreground">{year}</TableCell>
                            </TableRow>
                            {bills.filter((bill) => yearOf(bill) === year).map((bill) => (
                                <TableRow key={bill.id} data-state={selected.has(bill.id) ? 'selected' : undefined}>
                                    <TableCell>
                                        <Checkbox
                                            aria-label={`Select ${billMonth(bill.period_start)} ${bill.invoice_number}`}
                                            checked={selected.has(bill.id)}
                                            onCheckedChange={(checked) => toggle(bill.id, checked === true)}
                                        />
                                    </TableCell>
                                    <TableCell>{billMonth(bill.period_start)}</TableCell>
                                    <TableCell className="font-mono text-xs">{bill.invoice_number}</TableCell>
                                    <TableCell className="hidden sm:table-cell">{bill.house_label}</TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {formatCurrency(unpaidBalance(bill))}
                                        {bill.amount_paid > 0 && (
                                            <span className="block text-xs text-muted-foreground">part paid, of {formatCurrency(bill.amount_due)}</span>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </Fragment>
                    ))}
                </TableBody>
            </Table>

            <div className="sticky bottom-0 -mx-6 -mb-6 flex flex-col gap-2 border-t bg-background px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm" aria-live="polite">
                    <span className="font-semibold">{totals.count}</span> bills selected · <span className="font-semibold tabular-nums">{formatCurrency(totals.total)}</span>
                    {' '}· owed after: <span className="font-semibold tabular-nums">{formatCurrency(totals.owedAfter)}</span>
                    {payment > 0 && <span className="text-muted-foreground"> (with the {formatCurrency(payment)} payment)</span>}
                </p>
                <Button type="button" className="min-h-11 md:min-h-0" disabled={totals.count === 0} onClick={() => setConfirmOpen(true)}>
                    Write off selected
                </Button>
            </div>

            <AlertDialog open={confirmOpen} onOpenChange={(open) => !running && setConfirmOpen(open)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confirm write-off</AlertDialogTitle>
                        <AlertDialogDescription>
                            Write off {totals.count} bills for {formatCurrency(totals.total)} for {residentName}. Each bill shows as
                            &quot;Written off&quot; with this note. A part-paid bill keeps what was paid. You can undo it from the bill.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="write-off-reason">Reason</Label>
                            <Select value={reason} onValueChange={(value) => setReason(value as WriteOffReason)}>
                                <SelectTrigger id="write-off-reason" className="min-h-11 md:min-h-0">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {WRITE_OFF_REASONS.map((value) => (
                                        <SelectItem key={value} value={value}>{WRITE_OFF_REASON_LABELS[value]}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="write-off-note">Note</Label>
                            <Textarea
                                id="write-off-note"
                                value={note}
                                onChange={(event) => setNote(event.target.value)}
                                placeholder="For example: Exco settlement 4 Nov 2026. Resident paid ₦240,000."
                                rows={3}
                            />
                            {!noteValid && <p className="text-xs text-muted-foreground">A note of at least 5 characters is required.</p>}
                        </div>
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={running}>Cancel</AlertDialogCancel>
                        <Button variant="destructive" onClick={handleWriteOff} disabled={!noteValid || running}>
                            {running && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Write off {totals.count} bills
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
