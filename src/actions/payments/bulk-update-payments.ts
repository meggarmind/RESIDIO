'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { paymentStatusEnum } from '@/lib/validators/payment';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const bulkUpdateSchema = z.object({
    ids: z.array(z.string().uuid()).min(1, 'At least one payment ID is required'),
    status: paymentStatusEnum,
});

export type BulkUpdatePaymentsInput = z.infer<typeof bulkUpdateSchema>;

export async function bulkUpdatePayments(input: BulkUpdatePaymentsInput) {
    const validation = bulkUpdateSchema.safeParse(input);
    if (!validation.success) {
        return { error: validation.error.issues[0].message };
    }

    const { ids, status } = validation.data;
    const supabase = await createServerSupabaseClient();

    // Verify user has permission (handled by RLS, but we check explicitly)
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { error: 'Unauthorized' };
    }

    // Bulk update all payments
    const { data, error } = await supabase
        .from('payment_records')
        .update({
            status,
            updated_at: new Date().toISOString(),
        })
        .in('id', ids)
        .select('id');

    if (error) {
        return { error: error.message };
    }

    const updatedCount = data?.length ?? 0;

    revalidatePath('/payments');
    return {
        success: true,
        updatedCount,
        message: `Successfully updated ${updatedCount} payment(s) to ${status}`,
    };
}
