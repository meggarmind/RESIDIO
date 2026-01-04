'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { splitPaymentSchema, type SplitPaymentFormData } from '@/lib/validators/payment'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createPayment } from './create-payment'
import { logAudit } from '@/lib/audit/logger'
import { authorizePermission } from '@/lib/auth/authorize'
import { PERMISSIONS } from '@/lib/auth/action-roles'
import type { PaymentRecord } from '@/types/database'

type CreateSplitPaymentResult = {
    success?: boolean
    error?: string
    details?: z.ZodFlattenedError<SplitPaymentFormData>
    data?: PaymentRecord[]
}

export async function createSplitPayment(
    data: SplitPaymentFormData
): Promise<CreateSplitPaymentResult> {
    // Permission check at entry point (createPayment also checks, but defense-in-depth)
    const auth = await authorizePermission(PERMISSIONS.PAYMENTS_CREATE)
    if (!auth.authorized) {
        return { error: auth.error || 'Unauthorized' }
    }

    const supabase = await createServerSupabaseClient()

    const result = splitPaymentSchema.safeParse(data)

    if (!result.success) {
        return { error: 'Invalid data', details: result.error.flatten() }
    }

    // Generate a group ID for linking split payments
    const splitGroupId = crypto.randomUUID()

    const createdPayments: PaymentRecord[] = []

    // Create a payment record for each split
    for (const split of result.data.splits) {
        const paymentResult = await createPayment({
            resident_id: result.data.resident_id,
            house_id: split.house_id,
            split_payment_group_id: splitGroupId,
            amount: split.amount,
            payment_date: result.data.payment_date,
            status: 'paid',
            method: result.data.method,
            reference_number: result.data.reference_number,
            notes: result.data.notes,
        })

        if (paymentResult.error || !paymentResult.data) {
            // Rollback - delete any payments created so far
            for (const payment of createdPayments) {
                await supabase.from('payment_records').delete().eq('id', payment.id)
            }
            return {
                error: `Failed to create split payment for house ${split.house_id}: ${paymentResult.error}`,
            }
        }

        createdPayments.push(paymentResult.data)
    }

    // Audit log for the split payment group
    await logAudit({
        action: 'CREATE',
        entityType: 'payments',
        entityId: splitGroupId,
        entityDisplay: `Split Payment ₦${result.data.total_amount.toLocaleString()} across ${result.data.splits.length} houses`,
        newValues: {
            total_amount: result.data.total_amount,
            split_count: result.data.splits.length,
            house_ids: result.data.splits.map((s) => s.house_id),
            amounts: result.data.splits.map((s) => s.amount),
        },
    })

    revalidatePath('/payments')
    revalidatePath('/billing')
    revalidatePath(`/residents/${result.data.resident_id}`)

    return { success: true, data: createdPayments }
}
