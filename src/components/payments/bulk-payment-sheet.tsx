'use client';

import { useState } from 'react';
import {
    ResponsiveSheet,
    ResponsiveSheetHeader,
    ResponsiveSheetTitle,
    ResponsiveSheetDescription,
    ResponsiveSheetBody,
} from '@/components/ui/responsive-sheet';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    CreditCard,
    Wallet,
    Loader2,
    FileStack,
    CheckCircle2,
    AlertCircle
} from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import { toast } from 'sonner';
import { payMultipleInvoicesWithWallet } from '@/actions/billing/pay-multiple-invoices-with-wallet';
import { PaymentResult } from './payment-result';
import type { InvoiceWithDetails } from '@/types/database';

interface BulkPaymentSheetProps {
    invoices: InvoiceWithDetails[];
    open: boolean;
    onOpenChange: (open: boolean) => void;
    walletBalance: number;
    onSuccess: () => void;
}

export function BulkPaymentSheet({
    invoices,
    open,
    onOpenChange,
    walletBalance,
    onSuccess,
}: BulkPaymentSheetProps) {
    const [isPaying, setIsPaying] = useState(false);
    const [paymentResult, setPaymentResult] = useState<{
        status: 'success' | 'failed';
        amount: number;
        count: number;
        error?: string;
    } | null>(null);

    const totalAmount = invoices.reduce((sum, inv) => sum + ((inv.amount_due || 0) - (inv.amount_paid || 0)), 0);
    const canPayWithWallet = walletBalance >= totalAmount;

    const handleWalletPayment = async () => {
        setIsPaying(true);
        try {
            const result = await payMultipleInvoicesWithWallet(invoices.map(i => i.id));

            if (result.success) {
                setPaymentResult({
                    status: 'success',
                    amount: result.totalPaid,
                    count: result.countPaid,
                });
                onSuccess();
            } else {
                setPaymentResult({
                    status: 'failed',
                    amount: totalAmount,
                    count: invoices.length,
                    error: result.error || 'Payment failed',
                });
            }
        } catch (error) {
            toast.error('An unexpected error occurred');
        } finally {
            setIsPaying(false);
        }
    };

    if (paymentResult) {
        return (
            <ResponsiveSheet open={open} onOpenChange={onOpenChange} variant="drawer" drawerWidth="lg">
                <ResponsiveSheetBody className="pt-10">
                    <PaymentResult
                        status={paymentResult.status}
                        title={paymentResult.status === 'success' ? 'Batch Payment Successful!' : 'Payment Failed'}
                        description={
                            paymentResult.status === 'success'
                                ? `You have successfully paid ${paymentResult.count} invoices from your wallet.`
                                : paymentResult.error
                        }
                        amount={paymentResult.amount}
                        paymentMethod="Resident Wallet"
                        primaryAction={{
                            label: 'Done',
                            onClick: () => {
                                onOpenChange(false);
                                setPaymentResult(null);
                            }
                        }}
                    />
                </ResponsiveSheetBody>
            </ResponsiveSheet>
        );
    }

    return (
        <ResponsiveSheet open={open} onOpenChange={onOpenChange} variant="drawer" drawerWidth="lg">
            <ResponsiveSheetHeader>
                <ResponsiveSheetTitle className="flex items-center gap-2">
                    <FileStack className="h-5 w-5" />
                    Pay Multiple Invoices
                </ResponsiveSheetTitle>
                <ResponsiveSheetDescription>
                    Review and pay for {invoices.length} selected invoices
                </ResponsiveSheetDescription>
            </ResponsiveSheetHeader>

            <ResponsiveSheetBody>
                <div className="space-y-6 pb-8">
                    {/* Summary List */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Summary</h3>
                        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                            {invoices.map((inv) => (
                                <div key={inv.id} className="flex justify-between items-center p-3 rounded-lg border bg-muted/30">
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold truncate">{inv.invoice_number}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {inv.billing_profile?.name || 'Invoice'}
                                        </p>
                                    </div>
                                    <p className="font-semibold whitespace-nowrap">
                                        {formatCurrency((inv.amount_due || 0) - (inv.amount_paid || 0))}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Total Card */}
                    <Card className="bg-slate-900 text-white border-none shadow-lg">
                        <CardContent className="p-6">
                            <div className="flex justify-between items-end">
                                <div>
                                    <p className="text-xs text-slate-400 uppercase font-bold tracking-widest mb-1">Total to Pay</p>
                                    <p className="text-3xl font-black">{formatCurrency(totalAmount)}</p>
                                </div>
                                <div className="text-right">
                                    <Badge variant="secondary" className="bg-emerald-500/20 text-emerald-400 border-none mb-1">
                                        {invoices.length} Invoices
                                    </Badge>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Payment Options */}
                    <div className="space-y-4 pt-4 border-t">
                        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Select Payment Method</h3>

                        {/* Wallet Option */}
                        <Button
                            variant="outline"
                            className={cn(
                                "w-full h-auto p-4 flex flex-col items-start gap-1 text-left transition-all",
                                canPayWithWallet
                                    ? "hover:border-emerald-500 hover:bg-emerald-500/5 cursor-pointer"
                                    : "opacity-60 cursor-not-allowed bg-slate-50"
                            )}
                            disabled={!canPayWithWallet || isPaying}
                            onClick={handleWalletPayment}
                        >
                            <div className="flex items-center justify-between w-full mb-1">
                                <div className="flex items-center gap-2">
                                    <Wallet className={cn("h-5 w-5", canPayWithWallet ? "text-emerald-500" : "text-muted-foreground")} />
                                    <span className="font-bold">Pay from Wallet</span>
                                </div>
                                <span className="text-xs font-medium">
                                    Bal: {formatCurrency(walletBalance)}
                                </span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {canPayWithWallet
                                    ? "Instant payment using your available balance"
                                    : "Insufficient funds in your wallet"}
                            </p>
                        </Button>

                        {/* Paystack Option (Placeholder/Note) */}
                        <div className="p-4 border rounded-lg bg-slate-50 border-dashed text-center">
                            <div className="flex items-center justify-center gap-2 text-muted-foreground mb-1">
                                <CreditCard className="h-4 w-4" />
                                <span className="text-sm font-medium">Online Payment</span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Online payment for multiple invoices will be supported soon. Please pay individual invoices or top up your wallet.
                            </p>
                        </div>
                    </div>
                </div>
            </ResponsiveSheetBody>
        </ResponsiveSheet>
    );
}
