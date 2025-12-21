'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { paymentFormSchema } from '@/lib/validators/payment'
import { z } from 'zod'
import { creditWallet, allocateWalletToInvoices } from '@/actions/billing/wallet'
import { logAudit } from '@/lib/audit/logger'
import type { PaymentRecord } from '@/types/database'

// Extended schema to include import tracking fields and house association
const extendedPaymentSchema = paymentFormSchema.extend({
    import_id: z.string().uuid().optional(),
    import_row_id: z.string().uuid().optional(),
    split_payment_group_id: z.string().uuid().optional().nullable(),
})

type CreatePaymentInput = z.infer<typeof extendedPaymentSchema>

type CreatePaymentResult = {
    success?: boolean
    error?: string
    details?: z.ZodFlattenedError<CreatePaymentInput>
    data?: PaymentRecord
}

export async function createPayment(data: CreatePaymentInput): Promise<CreatePaymentResult> {
    const supabase = await createServerSupabaseClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        return { error: 'Unauthorized' }
    }

    const result = extendedPaymentSchema.safeParse(data)

    if (!result.success) {
        return { error: 'Invalid data', details: result.error.flatten() }
    }

    // Create payment record
    const { data: paymentRecord, error } = await supabase.from('payment_records').insert({
        resident_id: result.data.resident_id,
        house_id: result.data.house_id,
        split_payment_group_id: result.data.split_payment_group_id,
        amount: result.data.amount,
        payment_date: result.data.payment_date.toISOString(),
        status: 'paid', // Payments are always "paid" - they represent received funds
        method: result.data.method,
        reference_number: result.data.reference_number,
        notes: result.data.notes,
        period_start: result.data.period_start?.toISOString(),
        period_end: result.data.period_end?.toISOString(),
        import_id: result.data.import_id,
        import_row_id: result.data.import_row_id,
    }).select().single()

    if (error) {
        console.error('Create payment error:', error)
        return { error: 'Failed to create payment: ' + error.message }
    }

    // Credit the resident's wallet
    const creditResult = await creditWallet(
        result.data.resident_id,
        result.data.amount,
        'payment',
        paymentRecord?.id,
        `Payment via ${result.data.method || 'unknown'}`
    )

    if (!creditResult.success) {
        console.error('Failed to credit wallet:', creditResult.error)
    }

    // Auto-allocate wallet to unpaid invoices (prioritize house if specified)
    const allocateResult = await allocateWalletToInvoices(result.data.resident_id, result.data.house_id)
    if (allocateResult.success && allocateResult.invoicesPaid > 0) {
        console.log(`[Payment] Auto-allocated ₦${allocateResult.totalAllocated} to ${allocateResult.invoicesPaid} invoices`)
    }

    // Get resident info for audit log
    const { data: resident } = await supabase
        .from('residents')
        .select('first_name, last_name, resident_code')
        .eq('id', result.data.resident_id)
        .single()

    // Get house info if provided
    let houseInfo = ''
    if (result.data.house_id) {
        const { data: house } = await supabase
            .from('houses')
            .select('house_number, street:streets(name)')
            .eq('id', result.data.house_id)
            .single()
        if (house) {
            houseInfo = ` for ${house.house_number}`
        }
    }

    // Audit log
    await logAudit({
        action: 'CREATE',
        entityType: 'payments',
        entityId: paymentRecord.id,
        entityDisplay: `Payment ₦${result.data.amount.toLocaleString()}${houseInfo} for ${resident?.first_name} ${resident?.last_name}`,
        newValues: {
            amount: result.data.amount,
            house_id: result.data.house_id,
            method: result.data.method,
            reference_number: result.data.reference_number,
            from_import: !!result.data.import_id,
            is_split_payment: !!result.data.split_payment_group_id,
        },
    })

    return { success: true, data: paymentRecord as PaymentRecord }
}

