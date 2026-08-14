'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { FileText, Mail, Pencil, Printer } from 'lucide-react';
import { usePayment } from '@/hooks/use-payments';
import { printReceipt } from '@/lib/print-receipt';
import { PaymentReceipt } from '@/components/payments/payment-receipt';
import { EmailReceiptDialog } from '@/components/payments/email-receipt-dialog';
import { Button } from '@/components/ui/button';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';

interface PaymentQuickViewSheetProps {
    paymentId: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    returnTo?: string;
}

export function PaymentQuickViewSheet({
    paymentId,
    open,
    onOpenChange,
    returnTo,
}: PaymentQuickViewSheetProps) {
    const receiptRef = useRef<HTMLDivElement>(null);
    const { data: payment, isLoading, error } = usePayment(open && paymentId ? paymentId : '');

    const editHref = paymentId
        ? `/payments/${paymentId}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`
        : '/payments';

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-xl">
                <SheetHeader className="border-b bg-background/95 px-6 py-5 backdrop-blur">
                    <div className="flex items-start justify-between gap-4 pr-8">
                        <div>
                            <SheetTitle className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-primary" />
                                Receipt Preview
                            </SheetTitle>
                            <SheetDescription>
                                {payment?.resident
                                    ? `Payment for ${payment.resident.first_name} ${payment.resident.last_name}`
                                    : 'Review the payment receipt and available actions.'}
                            </SheetDescription>
                        </div>
                        {paymentId && (
                            <Button variant="outline" size="sm" asChild>
                                <Link href={editHref} onClick={() => onOpenChange(false)}>
                                    <Pencil className="mr-2 h-3.5 w-3.5" />
                                    Edit
                                </Link>
                            </Button>
                        )}
                    </div>
                </SheetHeader>

                <div className="space-y-4 p-6">
                    {isLoading && (
                        <div className="space-y-4">
                            <Skeleton className="h-12 w-full" />
                            <Skeleton className="h-[520px] w-full" />
                        </div>
                    )}

                    {error && (
                        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                            Payment details could not be loaded.
                        </div>
                    )}

                    {payment && !isLoading && (
                        <>
                            <div className="flex flex-wrap items-center justify-end gap-2">
                                <EmailReceiptDialog
                                    paymentId={payment.id}
                                    trigger={
                                        <Button variant="outline" size="sm">
                                            <Mail className="mr-2 h-3.5 w-3.5" />
                                            Email
                                        </Button>
                                    }
                                />
                                <Button size="sm" onClick={() => printReceipt(receiptRef.current)}>
                                    <Printer className="mr-2 h-3.5 w-3.5" />
                                    Print
                                </Button>
                            </div>

                            <div className="overflow-hidden rounded-xl border bg-muted/20 shadow-sm">
                                <PaymentReceipt ref={receiptRef} payment={payment} />
                            </div>
                        </>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}
