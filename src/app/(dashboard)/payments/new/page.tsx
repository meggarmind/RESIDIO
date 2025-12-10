import { PaymentForm } from '@/components/payments/payment-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function NewPaymentPage({
    searchParams,
}: {
    searchParams: Promise<{ residentId?: string }>;
}) {
    const params = await searchParams;
    const residentId = params.residentId;

    return (
        <div className="space-y-6 max-w-2xl mx-auto">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Record Payment</h1>
                <p className="text-muted-foreground">
                    Enter payment details for a resident.
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Payment Details</CardTitle>
                </CardHeader>
                <CardContent>
                    <PaymentForm residentId={residentId} />
                </CardContent>
            </Card>
        </div>
    );
}
