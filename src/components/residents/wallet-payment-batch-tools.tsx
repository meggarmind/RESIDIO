'use client';

import { useCallback, useEffect, useMemo, useState, type ComponentProps } from 'react';
import { CalendarRange, CheckSquare, Loader2, Receipt, WalletCards } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { formatCurrency } from '@/lib/utils';
import { getResidentPayableInvoices, getResidentWalletBalance, settleWalletInvoices } from '@/actions/billing/settle-wallet-invoices';
import { prepayFutureInvoices } from '@/actions/billing/prepay-future-invoices';
import { getWalletPaymentBatch, getWalletPaymentBatches } from '@/actions/billing/get-wallet-payment-batch';
import { PaymentReceipt } from '@/components/payments/payment-receipt';

type PayableInvoice = {
    id: string;
    invoice_number: string;
    house_id: string;
    amount_due: number;
    amount_paid: number;
    status: string;
    period_start: string;
    period_end: string;
};

type HouseOption = { id: string; label: string };

export function WalletPaymentBatchTools({
    residentId,
    houses,
}: {
    residentId: string;
    houses: HouseOption[];
}) {
    const [invoices, setInvoices] = useState<PayableInvoice[]>([]);
    const [walletBalance, setWalletBalance] = useState<number | null>(null);
    const [selected, setSelected] = useState<string[]>([]);
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
    const [houseId, setHouseId] = useState(houses[0]?.id || '');
    const [startMonth, setStartMonth] = useState('');
    const [endMonth, setEndMonth] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSettling, setIsSettling] = useState(false);
    const [isPrepaying, setIsPrepaying] = useState(false);
    const [receipt, setReceipt] = useState<ComponentProps<typeof PaymentReceipt>['payment'] | null>(null);
    const [batches, setBatches] = useState<Array<{
        id: string;
        receipt_number: string;
        batch_type: string;
        amount: number;
        payment_date: string;
        period_start: string | null;
        period_end: string | null;
        status: string;
        allocation_snapshot_available?: boolean;
        partial_allocation_count?: number | null;
        wallet_payment_batch_items?: Array<{ count: number }>;
    }>>([]);

    const loadInvoices = useCallback(async () => {
        setIsLoading(true);
        const [result, batchResult, walletResult] = await Promise.all([
            getResidentPayableInvoices(residentId),
            getWalletPaymentBatches(residentId),
            getResidentWalletBalance(residentId),
        ]);
        setInvoices((result.data || []) as PayableInvoice[]);
        setBatches((batchResult.data || []) as typeof batches);
        setWalletBalance(walletResult.balance);
        setSelected([]);
        setIsLoading(false);
    }, [residentId]);

    useEffect(() => {
        const timer = window.setTimeout(() => { void loadInvoices(); }, 0);
        return () => window.clearTimeout(timer);
    }, [loadInvoices]);

    const selectedTotal = useMemo(() => invoices
        .filter((invoice) => selected.includes(invoice.id))
        .reduce((sum, invoice) => sum + Number(invoice.amount_due) - Number(invoice.amount_paid), 0), [invoices, selected]);

    const toggleInvoice = (id: string) => {
        setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    };

    const handleSettle = async () => {
        if (selected.length === 0) {
            toast.error('Select at least one pending invoice');
            return;
        }
        setIsSettling(true);
        const result = await settleWalletInvoices({ residentId, invoiceIds: selected, paymentDate });
        setIsSettling(false);
        if (!result.success) {
            toast.error(result.error || 'Wallet settlement failed');
            return;
        }
        const fullyPaidCount = result.fullyPaidCount || 0;
        const partialCount = result.partialCount || 0;
        const allocationSummary = `${fullyPaidCount} paid in full${partialCount > 0 ? `, ${partialCount} partial` : ''}`;
        toast.success(`Receipt ${result.receiptNumber} created: ${allocationSummary}; ${formatCurrency(result.totalAllocated || 0)} allocated`);
        if (result.batchId) {
            const receiptResult = await getWalletPaymentBatch(result.batchId);
            setReceipt(receiptResult.data);
        }
        await loadInvoices();
    };

    const handlePrepay = async () => {
        if (!houseId || !startMonth || !endMonth) {
            toast.error('Select a house and future month range');
            return;
        }
        setIsPrepaying(true);
        const result = await prepayFutureInvoices({
            residentId,
            houseId,
            startMonth: `${startMonth}-01`,
            endMonth: `${endMonth}-01`,
            paymentDate,
            method: 'bank_transfer',
        });
        setIsPrepaying(false);
        if (!result.success) {
            toast.error(result.error || 'Future prepayment failed');
            return;
        }
        toast.success(`Receipt ${result.receiptNumber} created for ${result.invoicesPaid} future invoice(s)`);
        if (result.batchId) {
            const receiptResult = await getWalletPaymentBatch(result.batchId);
            setReceipt(receiptResult.data);
        }
        await loadInvoices();
    };

    return (
        <Card className="mt-4">
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                    <WalletCards className="h-4 w-4" />
                    Wallet payment batches
                </CardTitle>
                <CardDescription className="text-xs">
                    Settle several invoices with one receipt, or prepay future months.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                    <div className="space-y-1.5">
                        <Label htmlFor="wallet-payment-date">Payment date</Label>
                        <Input id="wallet-payment-date" type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
                    </div>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button disabled={isSettling || selected.length === 0}>
                                {isSettling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Receipt className="mr-2 h-4 w-4" />}
                                Settle selected ({formatCurrency(selectedTotal)})
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Settle selected invoices?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This will apply the resident&apos;s existing wallet balance to {selected.length} selected invoice(s), oldest period first, and create one receipt.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
                                <div className="flex justify-between gap-4"><span>Selected outstanding</span><span className="font-medium">{formatCurrency(selectedTotal)}</span></div>
                                <div className="flex justify-between gap-4"><span>Available wallet balance</span><span className="font-medium">{walletBalance === null ? 'Unavailable' : formatCurrency(walletBalance)}</span></div>
                                {walletBalance !== null && walletBalance < selectedTotal && (
                                    <p className="pt-2 text-amber-700">The wallet cannot cover the full selection. The final invoice may be partially paid and any remaining balance will stay due.</p>
                                )}
                                {walletBalance === 0 && <p className="pt-2 text-destructive">The wallet balance is zero. No settlement will be possible.</p>}
                            </div>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => { void handleSettle(); }} disabled={isSettling || walletBalance === 0}>
                                    {isSettling ? 'Settling…' : 'Confirm settlement'}
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>

                <div className="rounded-lg border divide-y max-h-64 overflow-y-auto">
                    {isLoading && <p className="p-4 text-sm text-muted-foreground">Loading pending invoices…</p>}
                    {!isLoading && invoices.length === 0 && <p className="p-4 text-sm text-muted-foreground">No pending invoices.</p>}
                    {invoices.map((invoice) => {
                        const remaining = Number(invoice.amount_due) - Number(invoice.amount_paid);
                        return (
                            <label key={invoice.id} className="flex cursor-pointer items-center gap-3 p-3 text-sm hover:bg-muted/40">
                                <input type="checkbox" checked={selected.includes(invoice.id)} onChange={() => toggleInvoice(invoice.id)} />
                                <span className="min-w-0 flex-1">
                                    <span className="font-medium">{invoice.invoice_number}</span>
                                    <span className="ml-2 text-muted-foreground">{invoice.period_start.slice(0, 7)}</span>
                                </span>
                                <span className="font-medium">{formatCurrency(remaining)}</span>
                            </label>
                        );
                    })}
                </div>

                <div className="border-t pt-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium"><CalendarRange className="h-4 w-4" /> Future prepayment</div>
                    <div className="grid gap-3 sm:grid-cols-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="prepay-house">House</Label>
                            <select id="prepay-house" className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={houseId} onChange={(event) => setHouseId(event.target.value)}>
                                <option value="">Select house</option>
                                {houses.map((house) => <option key={house.id} value={house.id}>{house.label}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5"><Label htmlFor="prepay-start">From</Label><Input id="prepay-start" type="month" value={startMonth} onChange={(event) => setStartMonth(event.target.value)} /></div>
                        <div className="space-y-1.5"><Label htmlFor="prepay-end">Through</Label><Input id="prepay-end" type="month" value={endMonth} onChange={(event) => setEndMonth(event.target.value)} /></div>
                    </div>
                    <Button variant="outline" onClick={handlePrepay} disabled={isPrepaying}>
                        {isPrepaying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckSquare className="mr-2 h-4 w-4" />}
                        Create and pay future invoices
                    </Button>
                </div>

                {receipt && (
                    <div className="border-t pt-4">
                        <p className="mb-2 text-sm font-medium">Latest batch receipt</p>
                        <div className="overflow-hidden rounded-lg border bg-muted/20">
                            <PaymentReceipt payment={receipt} />
                        </div>
                    </div>
                )}

                {batches.length > 0 && (
                    <div className="border-t pt-4 space-y-2">
                        <p className="text-sm font-medium">Recent batch receipts</p>
                        <div className="space-y-2">
                            {batches.map((batch) => {
                                const displayedPeriod = batch.allocation_snapshot_available === false
                                    ? `Allocated periods: ${batch.period_start?.slice(0, 7) || 'Unavailable'}${batch.period_end && batch.period_end.slice(0, 7) !== batch.period_start?.slice(0, 7) ? ` – ${batch.period_end.slice(0, 7)}` : ''}`
                                    : batch.period_start
                                        ? `${batch.period_start.slice(0, 7)}${batch.period_end && batch.period_end.slice(0, 7) !== batch.period_start.slice(0, 7) ? ` – ${batch.period_end.slice(0, 7)}` : ''}`
                                        : 'Partial allocation only';
                                return (
                                <div key={batch.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border p-2 text-xs">
                                    <span className="font-mono font-medium">{batch.receipt_number}</span>
                                    <span className="capitalize text-muted-foreground">{batch.batch_type.replaceAll('_', ' ')}</span>
                                    <span>{formatCurrency(Number(batch.amount))}</span>
                                    <span className="text-muted-foreground">{displayedPeriod}</span>
                                    {batch.partial_allocation_count ? <span className="text-amber-700">{batch.partial_allocation_count} partial</span> : null}
                                    <span className="ml-auto text-muted-foreground">{batch.status}</span>
                                </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
