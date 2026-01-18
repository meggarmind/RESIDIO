'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { creditWallet, allocateWalletToInvoices } from '@/actions/billing/wallet';
import { logAudit } from '@/lib/audit/logger';
import { revalidatePath } from 'next/cache';

/**
 * Verifies a Paystack payment and credits the resident's wallet.
 * Currently a placeholder that simulates verification.
 */
export async function verifyPaystackPayment(params: {
    reference: string;
    amount: number;
    house_id?: string;
}) {
    const supabase = await createServerSupabaseClient();

    // 1. Auth Check
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { error: 'Not authenticated' };

    // 2. Mock Paystack Verification
    // In a real implementation, we would call Paystack API: 
    // GET https://api.paystack.co/transaction/verify/:reference
    console.log(`[Paystack Placeholder] Verifying reference: ${params.reference}`);

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 3. Get Resident Info
    const { data: resident } = await supabase
        .from('residents')
        .select('id, first_name, last_name')
        .eq('profile_id', user.id)
        .single();

    if (!resident) {
        return { error: 'Resident profile not found' };
    }

    // 4. Create Payment Record (Marked as PAID immediately since it's "instant")
    const { data: payment, error: paymentError } = await supabase
        .from('payment_records')
        .insert({
            resident_id: resident.id,
            house_id: params.house_id || null,
            amount: params.amount,
            payment_date: new Date().toISOString(),
            status: 'paid',
            method: 'Paystack',
            reference_number: params.reference,
            is_verified: true,
            verified_at: new Date().toISOString(),
            notes: `Online payment via Paystack Ref: ${params.reference}`,
        })
        .select()
        .single();

    if (paymentError) {
        console.error('Paystack payment record error:', paymentError);
        return { error: 'Payment verified but failed to save record. Please contact support.' };
    }

    // 5. Credit Wallet
    const creditResult = await creditWallet(
        resident.id,
        params.amount,
        'payment',
        payment.id,
        `Instant deposit via Paystack`
    );

    if (!creditResult.success) {
        console.error('Paystack wallet credit error:', creditResult.error);
    }

    // 6. Allocate to Invoices
    await allocateWalletToInvoices(resident.id, params.house_id);

    // 7. Audit Log
    await logAudit({
        action: 'CREATE',
        entityType: 'payments',
        entityId: payment.id,
        entityDisplay: `Paystack Payment ₦${params.amount.toLocaleString()} for ${resident.first_name} ${resident.last_name}`,
        newValues: {
            amount: params.amount,
            reference: params.reference,
            method: 'Paystack',
        },
    });

    revalidatePath('/portal');
    return { success: true };
}
