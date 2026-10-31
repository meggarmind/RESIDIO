import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server'
import { paymentFormSchema } from '@/lib/validators/payment'
import { z } from 'zod'
import { allocateWalletToInvoices } from '@/actions/billing/wallet'
import { logAudit } from '@/lib/audit/logger'
import { recordAudit, type AuditEntry } from '@/lib/audit/recorder'
import { settlePaymentBatch, creditWalletAsService, type SettlementBatch, type SettlementResult } from '@/lib/billing/settle-payment'
import { authorizePermission } from '@/lib/auth/authorize'
import { PERMISSIONS } from '@/lib/auth/action-roles'
import type { PaymentRecord } from '@/types/database'
import { shouldSendToResident } from '@/lib/notifications/preferences'
import { buildPaymentReceivedWhatsApp } from '@/lib/whatsapp/outbound'
import { isWhatsAppOptedIn } from '@/lib/whatsapp/opt-in'
import { addToQueue } from '@/lib/notifications/queue'
import { isEventChannelEnabled } from '@/lib/notifications/event-content'
import { lagosDateString } from '@/lib/whatsapp/assistant-format'
import { residentHasHouse } from '@/lib/payments/house-membership'
import { DEFAULT_CHARGE_CATEGORY } from '@/lib/billing/charge-categories'

// Extended schema to include import tracking fields, house association, and verification
export const extendedPaymentSchema = paymentFormSchema.extend({
    import_id: z.guid().optional(),
    import_row_id: z.guid().optional(),
    split_payment_group_id: z.guid().optional().nullable(),
    // Email import tracking (Phase 17)
    email_import_id: z.guid().optional(),
    email_transaction_id: z.guid().optional(),
    // Unified Expenditure Engine: Verification fields
    is_verified: z.boolean().optional(),
    bank_row_id: z.guid().optional(),
})

export type CreatePaymentInput = z.infer<typeof extendedPaymentSchema>

export type CreatePaymentResult = {
    success?: boolean
    error?: string
    details?: z.ZodFlattenedError<CreatePaymentInput>
    data?: PaymentRecord
}

/**
 * Server-side core of payment creation. NOT a server action (this file has no
 * 'use server'), so the client cannot call it.
 *
 * `trustedVerification` lets the bank-statement importer mark a payment
 * verified and link its bank row. The public `createPayment` action never sets
 * it: a client-supplied is_verified / bank_row_id is dropped, so a holder of
 * PAYMENTS_CREATE cannot self-verify (verification is its own permission).
 */
export async function createPaymentCore(
    data: CreatePaymentInput,
    options: { trustedVerification?: boolean } = {},
): Promise<CreatePaymentResult> {
    // Permission check
    const auth = await authorizePermission(PERMISSIONS.PAYMENTS_CREATE)
    if (!auth.authorized) {
        return { error: auth.error || 'Unauthorized' }
    }

    return recordPayment(data, options, {
        supabase: await createServerSupabaseClient(),
        allocate: allocateWalletToInvoices,
        audit: logAudit,
    })
}

/**
 * Session-free payment creation for a scheduled job (#1340). NOT a server action and has no
 * permission check: only trusted server code that has already authenticated the job (the
 * CRON_SECRET fetch-emails route) may call it. Everything else is the same as `createPaymentCore`
 * with trustedVerification: validation, house check, duplicate guard, wallet allocation and the
 * receipt. The audit entry names the job as a system actor.
 */
export async function createPaymentAsSystem(
    data: CreatePaymentInput,
    source: string,
): Promise<CreatePaymentResult> {
    const supabase = await createAdminClient()
    const actor = { userId: null, system: source }
    return recordPayment(data, { trustedVerification: true }, {
        supabase,
        allocate: (residentId, houseId, paymentDate, { chargeCategory, ...batch }) => settlePaymentBatch(
            supabase,
            { residentId, houseId, paymentDate, chargeCategory },
            batch,
            (amount) => creditWalletAsService(supabase, {
                residentId,
                amount,
                paymentId: batch.sourcePaymentId,
                description: 'Payment retained as wallet credit because no eligible invoice was found',
                chargeCategory,
            }, actor),
        ),
        audit: (entry) => recordAudit({ ...entry, metadata: { ...entry.metadata, source } }, actor).then(() => undefined),
    })
}

type PaymentDeps = {
    supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>
    allocate: (
        residentId: string,
        houseId: string | null | undefined,
        paymentDate: string,
        batch: SettlementBatch & { chargeCategory: string },
    ) => Promise<SettlementResult>
    audit: (entry: AuditEntry) => Promise<void>
}

async function recordPayment(
    data: CreatePaymentInput,
    options: { trustedVerification?: boolean },
    { supabase, allocate, audit }: PaymentDeps,
): Promise<CreatePaymentResult> {
    const result = extendedPaymentSchema.safeParse(data)

    if (!result.success) {
        return { error: 'Invalid data', details: result.error.flatten() }
    }

    // Determine verification status (only trusted internal callers may set it)
    const isVerified = options.trustedVerification ? (result.data.is_verified ?? false) : false
    const bankRowId = options.trustedVerification ? result.data.bank_row_id : undefined

    // The house must belong to the resident
    if (result.data.house_id) {
        const membership = await residentHasHouse(supabase, result.data.resident_id, result.data.house_id)
        if (!membership.ok) {
            return { error: membership.error || 'Invalid house for this resident' }
        }
    }

    // No house given (bank imports, #1363): use the resident's only active house. With none or several, keep none.
    let houseId = result.data.house_id
    if (!houseId) {
        houseId = (await soleActiveHouseId(supabase, result.data.resident_id)) ?? houseId
    }

    const chargeCategory = result.data.charge_category || DEFAULT_CHARGE_CATEGORY

    // Check for duplicates
    const { checkDuplicateGuardrail } = await import('@/lib/matching/duplicate-matcher');
    const dupResult = await checkDuplicateGuardrail({
        amount: result.data.amount,
        date: result.data.payment_date,
        residentId: result.data.resident_id,
        reference: result.data.reference_number || undefined,
        description: result.data.notes || undefined
    }, 'payment', { client: supabase });

    if (dupResult.isDuplicate) {
        return { error: `Duplicate Payment Detected: ${dupResult.reason}` };
    }

    // Create payment record
    const { data: paymentRecord, error } = await supabase.from('payment_records').insert({
        resident_id: result.data.resident_id,
        house_id: houseId,
        split_payment_group_id: result.data.split_payment_group_id,
        amount: result.data.amount,
        payment_date: lagosDateString(result.data.payment_date),
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
        bank_row_id: bankRowId,
        charge_category: chargeCategory,
        paid_by_resident_id: result.data.paid_by_resident_id || null,
        paid_by_name: result.data.paid_by_name?.trim() || null,
    }).select().single()

    if (error) {
        console.error('Create payment error:', error)
        return { error: 'Failed to create payment: ' + error.message }
    }

    // Credit and eligible invoice allocation share the atomic settlement RPC.
    // Settle on the input house, never the derived one: the resident may owe on a past house (#1363).
    const allocateResult = await allocate(
        result.data.resident_id,
        result.data.house_id,
        lagosDateString(result.data.payment_date),
        {
            sourcePaymentId: paymentRecord?.id,
            batchAmount: result.data.amount,
            batchType: 'payment_received',
            creditAmount: result.data.amount,
            chargeCategory,
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
    if (houseId) {
        const { data: house } = await supabase
            .from('houses')
            .select('house_number, street:streets(name)')
            .eq('id', houseId)
            .single()
        if (house) {
            houseInfo = ` for ${house.house_number}`
        }
    }

    // Audit log
    await audit({
        action: 'CREATE',
        entityType: 'payments',
        entityId: paymentRecord.id,
        entityDisplay: `Payment ₦${result.data.amount.toLocaleString()}${houseInfo} for ${resident?.first_name} ${resident?.last_name}`,
        newValues: {
            amount: result.data.amount,
            house_id: houseId,
            method: result.data.method,
            reference_number: result.data.reference_number,
            from_import: !!result.data.import_id,
            is_split_payment: !!result.data.split_payment_group_id,
            charge_category: chargeCategory,
            paid_by_resident_id: result.data.paid_by_resident_id || null,
            paid_by_name: result.data.paid_by_name?.trim() || null,
        },
    })

    // Admin channel switch (#909) first, then the resident's own preference and opt-in.
    const whatsappPreference = (await isEventChannelEnabled('payment_receipt', 'whatsapp'))
        ? await shouldSendToResident({
            residentId: result.data.resident_id,
            category: 'payment',
            channel: 'whatsapp',
        })
        : { shouldSend: false }
    if (whatsappPreference.shouldSend) {
        const { data: paymentRecipient } = await supabase
            .from('residents')
            .select('first_name, last_name, phone_primary')
            .eq('id', result.data.resident_id)
            .single()

        // Opt-in is checked at enqueue time; a non-opted-in resident gets no queue row.
        if (
            paymentRecipient?.phone_primary &&
            (await isWhatsAppOptedIn(result.data.resident_id, paymentRecipient.phone_primary))
        ) {
            await addToQueue(buildPaymentReceivedWhatsApp({
                paymentId: paymentRecord.id,
                residentId: result.data.resident_id,
                residentPhone: paymentRecipient.phone_primary,
                residentName: `${paymentRecipient.first_name} ${paymentRecipient.last_name}`,
                amount: result.data.amount,
                paymentDate: result.data.payment_date,
                referenceNumber: result.data.reference_number || null,
            }))
        }
    }

    return { success: true, data: paymentRecord as PaymentRecord }
}

/**
 * The resident's one active house, or null when there are none or several (#1363). A failed
 * lookup is logged and gives null, so it never fails the payment.
 */
async function soleActiveHouseId(
    supabase: PaymentDeps['supabase'],
    residentId: string,
): Promise<string | null> {
    try {
        const { data, error } = await supabase
            .from('resident_houses')
            .select('house_id')
            .eq('resident_id', residentId)
            .eq('is_active', true)
        if (error) {
            console.error('Payment house lookup failed for resident', residentId, error)
            return null
        }
        const houseIds = new Set((data ?? []).map((row) => row.house_id))
        return houseIds.size === 1 ? [...houseIds][0] : null
    } catch (error) {
        console.error('Payment house lookup failed for resident', residentId, error)
        return null
    }
}
