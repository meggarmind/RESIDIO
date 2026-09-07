import { PaymentForm } from '@/components/payments/payment-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PaymentPageHeader } from './payment-page-header';

export default async function NewPaymentPage({
    searchParams,
}: {
    searchParams: Promise<{ residentId?: string }>;
}) {
    const params = await searchParams;
    const residentId = params.residentId;

    return (
        <div className="space-y-6 max-w-2xl mx-auto">
            <PaymentPageHeader />

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
