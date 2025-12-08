'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { paymentFormSchema } from '@/lib/validators/payment'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

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

    const { error } = await supabase.from('payment_records').insert({
        resident_id: result.data.resident_id,
        amount: result.data.amount,
        payment_date: result.data.payment_date.toISOString(),
        status: result.data.status,
        method: result.data.method,
        reference_number: result.data.reference_number,
        notes: result.data.notes,
        period_start: result.data.period_start?.toISOString(),
        period_end: result.data.period_end?.toISOString(),
    })

    if (error) {
        console.error('Create payment error:', error)
        return { error: 'Failed to create payment: ' + error.message }
    }

    revalidatePath('/payments')
    revalidatePath(`/residents/${result.data.resident_id}`)
    return { success: true }
}
