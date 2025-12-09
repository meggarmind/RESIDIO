import { PaymentForm } from '@/components/payments/payment-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';

export default async function PaymentDetailPage({ params }: { params: { id: string } }) {
    const supabase = await createServerSupabaseClient();
    const { id } = await params; // Nextjs 15

    const { data: payment } = await supabase
        .from('payment_records')
        .select(`
        *,
        resident:residents(
            id,
            first_name,
            last_name,
            resident_code
        )
    `)
        .eq('id', id)
        .single();

    if (!payment) {
        notFound();
    }

    return (
        <div className="space-y-6 max-w-2xl mx-auto">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Edit Payment</h1>
                <p className="text-muted-foreground">
                    Update payment details for {payment.resident?.first_name} {payment.resident?.last_name}.
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Payment Details</CardTitle>
                </CardHeader>
                <CardContent>
                    <PaymentForm initialData={payment} />
                </CardContent>
            </Card>
        </div>
    );
}
