'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { paymentFormSchema } from '@/lib/validators/payment'
import { z } from 'zod'
import { allocateWalletToInvoices } from '@/actions/billing/wallet'
import { logAudit } from '@/lib/audit/logger'
import { authorizePermission } from '@/lib/auth/authorize'
import { PERMISSIONS } from '@/lib/auth/action-roles'
import type { PaymentRecord } from '@/types/database'
import { shouldSendToResident } from '@/lib/notifications/preferences'
import { whatsappTemplate, WHATSAPP_TEMPLATE_NAMES } from '@/lib/whatsapp'
import { addToQueue, PRIORITY } from '@/lib/notifications/queue'

// Extended schema to include import tracking fields, house association, and verification
const extendedPaymentSchema = paymentFormSchema.extend({
    import_id: z.string().uuid().optional(),
    import_row_id: z.string().uuid().optional(),
    split_payment_group_id: z.string().uuid().optional().nullable(),
    // Email import tracking (Phase 17)
    email_import_id: z.string().uuid().optional(),
    email_transaction_id: z.string().uuid().optional(),
    // Unified Expenditure Engine: Verification fields
    is_verified: z.boolean().optional(),
    bank_row_id: z.string().uuid().optional(),
})

type CreatePaymentInput = z.infer<typeof extendedPaymentSchema>

type CreatePaymentResult = {
    success?: boolean
    error?: string
    details?: z.ZodFlattenedError<CreatePaymentInput>
    data?: PaymentRecord
}

export async function createPayment(data: CreatePaymentInput): Promise<CreatePaymentResult> {
    // Permission check
    const auth = await authorizePermission(PERMISSIONS.PAYMENTS_CREATE)
    if (!auth.authorized) {
        return { error: auth.error || 'Unauthorized' }
    }

    const supabase = await createServerSupabaseClient()

    const result = extendedPaymentSchema.safeParse(data)

    if (!result.success) {
        return { error: 'Invalid data', details: result.error.flatten() }
    }

    // Determine verification status
    const isVerified = result.data.is_verified ?? false

    // Check for duplicates
    const { checkDuplicateGuardrail } = await import('@/lib/matching/duplicate-matcher');
    const dupResult = await checkDuplicateGuardrail({
        amount: result.data.amount,
        date: result.data.payment_date,
        residentId: result.data.resident_id,
        reference: result.data.reference_number || undefined,
        description: result.data.notes || undefined
    }, 'payment');

    if (dupResult.isDuplicate) {
        return { error: `Duplicate Payment Detected: ${dupResult.reason}` };
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
        email_import_id: result.data.email_import_id,
        email_transaction_id: result.data.email_transaction_id,
        // Unified Expenditure Engine: Verification fields
        is_verified: isVerified,
        verified_at: isVerified ? new Date().toISOString() : null,
        bank_row_id: result.data.bank_row_id,
    }).select().single()

    if (error) {
        console.error('Create payment error:', error)
        return { error: 'Failed to create payment: ' + error.message }
    }

    // Credit and eligible invoice allocation share the atomic settlement RPC.
    const allocateResult = await allocateWalletToInvoices(
        result.data.resident_id,
        result.data.house_id,
        result.data.payment_date.toISOString().slice(0, 10),
        {
            sourcePaymentId: paymentRecord?.id,
            batchAmount: result.data.amount,
            batchType: 'payment_received',
            creditAmount: result.data.amount,
        },
    )
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

    const whatsappPreference = await shouldSendToResident({
        residentId: result.data.resident_id,
        category: 'payment',
        channel: 'whatsapp',
    })
    if (whatsappPreference.shouldSend) {
        const { data: paymentRecipient } = await supabase
            .from('residents')
            .select('first_name, last_name, phone_primary')
            .eq('id', result.data.resident_id)
            .single()

        if (paymentRecipient?.phone_primary) {
            await addToQueue({
                recipient_id: result.data.resident_id,
                recipient_phone: paymentRecipient.phone_primary,
                channel: 'whatsapp',
                body: `Payment received: NGN ${result.data.amount.toLocaleString('en-NG')}.`,
                priority: PRIORITY.NORMAL,
                deduplication_key: `payment_received:${paymentRecord.id}`,
                metadata: {
                    paymentId: paymentRecord.id,
                    whatsapp_template: whatsappTemplate(WHATSAPP_TEMPLATE_NAMES.paymentReceived, [
                        `${paymentRecipient.first_name} ${paymentRecipient.last_name}`,
                        `NGN ${result.data.amount.toLocaleString('en-NG')}`,
                        result.data.payment_date.toLocaleDateString('en-NG'),
                        result.data.reference_number || 'Not provided',
                    ]),
                },
            })
        }
    }

    return { success: true, data: paymentRecord as PaymentRecord }
}
