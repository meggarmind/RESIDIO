'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getInvoiceById } from '@/actions/billing/get-invoices';
import { getParentInvoice } from '@/actions/billing/get-invoice-corrections';
import type { InvoiceWithDetails } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InvoiceCorrectionDialog } from '@/components/billing/invoice-correction-dialog';
import { InvoiceCorrectionTimeline } from '@/components/billing/invoice-correction-timeline';
import { formatCurrency } from '@/lib/utils';
import { ArrowLeft, Printer, Loader2, FileEdit, AlertCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-provider';
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
    const { user, hasPermission } = useAuth();
    const [invoice, setInvoice] = useState<InvoiceWithDetails | null>(null);
    const [parentInvoice, setParentInvoice] = useState<InvoiceWithDetails | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [correctionDialogOpen, setCorrectionDialogOpen] = useState(false);

    const canCreateCorrections = hasPermission('billing.create_invoice');

    useEffect(() => {
        async function fetchInvoice() {
            if (!params.id) return;

            setIsLoading(true);
            const result = await getInvoiceById(params.id as string);

            if (result.error) {
                setError(result.error);
                setIsLoading(false);
                return;
            }

            setInvoice(result.data);

            // If this is a correction, fetch parent invoice
            if (result.data?.is_correction && result.data?.parent_invoice_id) {
                const parentResult = await getParentInvoice(params.id as string);
                if (parentResult.data) {
                    setParentInvoice(parentResult.data);
                }
            }

            setIsLoading(false);
        }

        fetchInvoice();
    }, [params.id]);

    const refetchInvoice = async () => {
        if (!params.id) return;
        const result = await getInvoiceById(params.id as string);
        if (result.data) {
            setInvoice(result.data);
        }
    };

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
        <div className="p-6 max-w-6xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <Button variant="ghost" asChild>
                    <Link href="/billing">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Invoices
                    </Link>
                </Button>
                <div className="flex gap-2">
                    {canCreateCorrections && invoice.status !== 'void' && (
                        <Button variant="outline" onClick={() => setCorrectionDialogOpen(true)}>
                            <FileEdit className="mr-2 h-4 w-4" />
                            Create Correction
                        </Button>
                    )}
                    <Button variant="outline" onClick={() => window.print()}>
                        <Printer className="mr-2 h-4 w-4" />
                        Print
                    </Button>
                </div>
            </div>

            {/* Correction Badge (if this is a correction invoice) */}
            {invoice.is_correction && (
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
                    <div className="flex items-start">
                        <AlertCircle className="h-5 w-5 text-yellow-400 mr-2 mt-0.5" />
                        <div>
                            <h4 className="font-semibold text-yellow-800">
                                {invoice.correction_type === 'credit_note' ? 'Credit Note' : 'Debit Note'}
                            </h4>
                            <p className="text-sm text-yellow-700 mt-1">
                                This is a correction invoice.
                                {parentInvoice && (
                                    <>
                                        {' '}Original invoice:{' '}
                                        <Link
                                            href={`/billing/${parentInvoice.id}`}
                                            className="underline font-medium"
                                        >
                                            {parentInvoice.invoice_number}
                                        </Link>
                                    </>
                                )}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            <Tabs defaultValue="details" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="details">Invoice Details</TabsTrigger>
                    <TabsTrigger value="corrections">Correction History</TabsTrigger>
                </TabsList>

                <TabsContent value="details" className="mt-6">
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
                </TabsContent>

                <TabsContent value="corrections" className="mt-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Correction History</CardTitle>
                            <CardDescription>
                                View all corrections (credit/debit notes) made to this invoice
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <InvoiceCorrectionTimeline
                                invoiceId={invoice.id}
                                originalInvoiceNumber={invoice.invoice_number}
                                originalAmount={invoice.amount_due}
                                originalCreatedAt={invoice.created_at}
                            />
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Correction Dialog */}
            {canCreateCorrections && (
                <InvoiceCorrectionDialog
                    invoice={invoice}
                    open={correctionDialogOpen}
                    onOpenChange={setCorrectionDialogOpen}
                    onSuccess={refetchInvoice}
                />
            )}
        </div>
    );
}
