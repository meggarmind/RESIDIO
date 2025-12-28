'use client';

import { use, useRef } from 'react';
import { PaymentForm } from '@/components/payments/payment-form';
import { PaymentReceipt } from '@/components/payments/payment-receipt';
import { EmailReceiptDialog } from '@/components/payments/email-receipt-dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePayment } from '@/hooks/use-payments';
import { Printer, ArrowLeft, FileText, Pencil, Mail } from 'lucide-react';
import Link from 'next/link';

interface PaymentDetailPageProps {
    params: Promise<{ id: string }>;
}

export default function PaymentDetailPage({ params }: PaymentDetailPageProps) {
    const { id } = use(params);
    const receiptRef = useRef<HTMLDivElement>(null);
    const { data: payment, isLoading, error } = usePayment(id);

    const handlePrint = () => {
        const printContent = receiptRef.current;
        if (!printContent) return;

        // Security: Use iframe with sandbox to prevent XSS
        // The sandbox attribute blocks script execution in the cloned content
        const iframe = document.createElement('iframe');
        iframe.style.position = 'absolute';
        iframe.style.top = '-10000px';
        iframe.style.left = '-10000px';
        iframe.setAttribute('sandbox', 'allow-same-origin'); // Blocks scripts but allows styling
        document.body.appendChild(iframe);

        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!iframeDoc) {
            document.body.removeChild(iframe);
            return;
        }

        // Clone the content safely into the sandboxed iframe
        iframeDoc.open();
        iframeDoc.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Payment Receipt</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: system-ui, -apple-system, sans-serif; padding: 20px; }
                    @media print {
                        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    }
                </style>
            </head>
            <body></body>
            </html>
        `);
        iframeDoc.close();

        // Clone nodes instead of using innerHTML to preserve security
        const clonedContent = printContent.cloneNode(true) as HTMLElement;
        iframeDoc.body.appendChild(clonedContent);

        // Print after content is loaded
        setTimeout(() => {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            document.body.removeChild(iframe);
        }, 250);
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <p className="text-muted-foreground">Loading payment details...</p>
            </div>
        );
    }

    if (error || !payment) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
                <p className="text-destructive">Payment not found</p>
                <Button variant="outline" asChild>
                    <Link href="/payments">Back to Payments</Link>
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" asChild>
                        <Link href="/payments">
                            <ArrowLeft className="h-4 w-4" />
                        </Link>
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Payment Details</h1>
                        <p className="text-muted-foreground">
                            Payment for {payment.resident?.first_name} {payment.resident?.last_name}
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <EmailReceiptDialog
                        paymentId={id}
                        trigger={
                            <Button variant="outline">
                                <Mail className="h-4 w-4 mr-2" />
                                Email Receipt
                            </Button>
                        }
                    />
                    <Button onClick={handlePrint} variant="outline">
                        <Printer className="h-4 w-4 mr-2" />
                        Print Receipt
                    </Button>
                </div>
            </div>

            <Tabs defaultValue="details" className="w-full">
                <TabsList>
                    <TabsTrigger value="details">
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit Details
                    </TabsTrigger>
                    <TabsTrigger value="receipt">
                        <FileText className="h-4 w-4 mr-2" />
                        Receipt Preview
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="details" className="mt-6">
                    <Card className="max-w-2xl">
                        <CardHeader>
                            <CardTitle>Payment Details</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <PaymentForm initialData={payment} />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="receipt" className="mt-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center justify-between">
                                <span>Receipt Preview</span>
                                <div className="flex gap-2">
                                    <EmailReceiptDialog
                                        paymentId={id}
                                        trigger={
                                            <Button variant="outline" size="sm">
                                                <Mail className="h-4 w-4 mr-2" />
                                                Email
                                            </Button>
                                        }
                                    />
                                    <Button onClick={handlePrint} size="sm">
                                        <Printer className="h-4 w-4 mr-2" />
                                        Print
                                    </Button>
                                </div>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="border rounded-lg overflow-hidden">
                                <PaymentReceipt ref={receiptRef} payment={payment} />
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
