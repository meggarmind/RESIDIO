'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getInvoiceById } from '@/actions/billing/get-invoices';
import type { InvoiceWithDetails } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { formatCurrency } from '@/lib/utils';
import { ArrowLeft, Printer, Loader2 } from 'lucide-react';
import Link from 'next/link';

const statusColors: Record<string, string> = {
    unpaid: 'bg-yellow-100 text-yellow-800',
    paid: 'bg-green-100 text-green-800',
    partially_paid: 'bg-orange-100 text-orange-800',
    void: 'bg-gray-100 text-gray-800',
};

export default function InvoiceDetailPage() {
    const params = useParams();
    const router = useRouter();
    const [invoice, setInvoice] = useState<InvoiceWithDetails | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchInvoice() {
            if (!params.id) return;

            setIsLoading(true);
            const result = await getInvoiceById(params.id as string);

            if (result.error) {
                setError(result.error);
            } else {
                setInvoice(result.data);
            }
            setIsLoading(false);
        }

        fetchInvoice();
    }, [params.id]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }

    if (error || !invoice) {
        return (
            <div className="p-6">
                <p className="text-red-500">Error: {error || 'Invoice not found'}</p>
                <Button variant="outline" className="mt-4" onClick={() => router.back()}>
                    Go Back
                </Button>
            </div>
        );
    }

    const totalItems = invoice.invoice_items?.reduce((sum, item) => sum + item.amount, 0) || 0;

    return (
        <div className="p-6 max-w-3xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <Button variant="ghost" asChild>
                    <Link href="/billing">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Invoices
                    </Link>
                </Button>
                <Button variant="outline" onClick={() => window.print()}>
                    <Printer className="mr-2 h-4 w-4" />
                    Print
                </Button>
            </div>

            <Card className="print:shadow-none">
                <CardHeader className="flex flex-row items-start justify-between">
                    <div>
                        <CardTitle className="text-2xl">Invoice</CardTitle>
                        <CardDescription className="font-mono text-lg">
                            {invoice.invoice_number}
                        </CardDescription>
                    </div>
                    <Badge className={statusColors[invoice.status] || ''} variant="outline">
                        {invoice.status.toUpperCase()}
                    </Badge>
                </CardHeader>

                <CardContent className="space-y-6">
                    {/* Bill To Section */}
                    <div className="grid grid-cols-2 gap-6">
                        <div>
                            <h3 className="text-sm font-medium text-muted-foreground mb-1">Bill To</h3>
                            <p className="font-semibold">
                                {invoice.resident?.first_name} {invoice.resident?.last_name}
                            </p>
                            <p className="text-sm text-muted-foreground">
                                {invoice.house?.house_number}, {invoice.house?.street?.name}
                            </p>
                            <p className="text-sm text-muted-foreground font-mono">
                                {invoice.resident?.resident_code}
                            </p>
                        </div>
                        <div className="text-right">
                            <div className="mb-2">
                                <span className="text-sm text-muted-foreground">Invoice Date: </span>
                                <span className="font-medium">
                                    {new Date(invoice.created_at).toLocaleDateString('en-GB')}
                                </span>
                            </div>
                            <div className="mb-2">
                                <span className="text-sm text-muted-foreground">Due Date: </span>
                                <span className="font-medium">
                                    {new Date(invoice.due_date).toLocaleDateString('en-GB')}
                                </span>
                            </div>
                            <div>
                                <span className="text-sm text-muted-foreground">Period: </span>
                                <span className="font-medium">
                                    {new Date(invoice.period_start).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
                                </span>
                            </div>
                        </div>
                    </div>

                    <Separator />

                    {/* Line Items */}
                    <div>
                        <h3 className="text-sm font-medium text-muted-foreground mb-3">Charges</h3>
                        <div className="space-y-2">
                            {invoice.invoice_items?.map((item) => (
                                <div key={item.id} className="flex justify-between items-center py-2 border-b last:border-0">
                                    <span>{item.description}</span>
                                    <span className="font-medium">{formatCurrency(item.amount)}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <Separator />

                    {/* Totals */}
                    <div className="flex justify-end">
                        <div className="w-64 space-y-2">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Subtotal</span>
                                <span>{formatCurrency(totalItems)}</span>
                            </div>
                            <div className="flex justify-between font-bold text-lg">
                                <span>Total Due</span>
                                <span>{formatCurrency(invoice.amount_due)}</span>
                            </div>
                            {invoice.amount_paid > 0 && (
                                <>
                                    <div className="flex justify-between text-green-600">
                                        <span>Amount Paid</span>
                                        <span>-{formatCurrency(invoice.amount_paid)}</span>
                                    </div>
                                    <div className="flex justify-between font-bold">
                                        <span>Balance</span>
                                        <span>{formatCurrency(invoice.amount_due - invoice.amount_paid)}</span>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Rate Card Info */}
                    {invoice.billing_profile && (
                        <div className="text-xs text-muted-foreground pt-4">
                            Rate Card: {invoice.billing_profile.name}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
