<<<<<<< HEAD
'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { paymentFormSchema } from '@/lib/validators/payment'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { creditWallet, allocateWalletToInvoices } from '@/actions/billing/wallet'

export async function createPayment(data: z.infer<typeof paymentFormSchema>) {
    const supabase = await createServerSupabaseClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        return { error: 'Unauthorized' }
    }

    const result = paymentFormSchema.safeParse(data)

    if (!result.success) {
        return { error: 'Invalid data', details: result.error.flatten() }
    }

    // Create payment record
    const { data: paymentRecord, error } = await supabase.from('payment_records').insert({
        resident_id: result.data.resident_id,
        amount: result.data.amount,
        payment_date: result.data.payment_date.toISOString(),
        status: 'paid', // Payments are always "paid" - they represent received funds
        method: result.data.method,
        reference_number: result.data.reference_number,
        notes: result.data.notes,
        period_start: result.data.period_start?.toISOString(),
        period_end: result.data.period_end?.toISOString(),
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

    // Auto-allocate wallet to unpaid invoices
    const allocateResult = await allocateWalletToInvoices(result.data.resident_id)
    if (allocateResult.success && allocateResult.invoicesPaid > 0) {
        console.log(`[Payment] Auto-allocated ₦${allocateResult.totalAllocated} to ${allocateResult.invoicesPaid} invoices`)
    }

    revalidatePath('/payments')
    revalidatePath('/billing')
    revalidatePath(`/residents/${result.data.resident_id}`)
    return { success: true }
}

=======
'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { paymentFormSchema } from '@/lib/validators/payment'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { creditWallet, allocateWalletToInvoices } from '@/actions/billing/wallet'

export async function createPayment(data: z.infer<typeof paymentFormSchema>) {
    const supabase = await createServerSupabaseClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        return { error: 'Unauthorized' }
    }

    const result = paymentFormSchema.safeParse(data)

    if (!result.success) {
        return { error: 'Invalid data', details: result.error.flatten() }
    }

    // Create payment record
    const { data: paymentRecord, error } = await supabase.from('payment_records').insert({
        resident_id: result.data.resident_id,
        amount: result.data.amount,
        payment_date: result.data.payment_date.toISOString(),
        status: 'paid', // Payments are always "paid" - they represent received funds
        method: result.data.method,
        reference_number: result.data.reference_number,
        notes: result.data.notes,
        period_start: result.data.period_start?.toISOString(),
        period_end: result.data.period_end?.toISOString(),
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

    // Auto-allocate wallet to unpaid invoices
    const allocateResult = await allocateWalletToInvoices(result.data.resident_id)
    if (allocateResult.success && allocateResult.invoicesPaid > 0) {
        console.log(`[Payment] Auto-allocated ₦${allocateResult.totalAllocated} to ${allocateResult.invoicesPaid} invoices`)
    }

    revalidatePath('/payments')
    revalidatePath('/billing')
    revalidatePath(`/residents/${result.data.resident_id}`)
    return { success: true }
}

>>>>>>> 6e226d0165174a5da4cc17bd5b203b6a46c531a4
