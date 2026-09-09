'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/logger';
import { revalidatePath } from 'next/cache';

export async function submitPaymentProof(formData: FormData) {
    const supabase = await createServerSupabaseClient();

    // 1. Auth & Resident Check
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { error: 'Not authenticated' };

    // Get the resident profile linked to this user
    const { data: resident, error: residentError } = await supabase
        .from('residents')
        .select('id, first_name, last_name, profile_id')
        .eq('profile_id', user.id)
        .single();

    if (residentError || !resident) {
        return { error: 'Resident profile not found' };
    }

    // 2. Extract Data
    const amountStr = formData.get('amount') as string;
    const amount = parseFloat(amountStr);
    const file = formData.get('proof') as File;
    const house_id = formData.get('house_id') as string | null;
    const notes = formData.get('notes') as string | null;

    if (!amountStr || isNaN(amount) || amount <= 0) {
        return { error: 'Please enter a valid amount' };
    }

    if (!file || file.size === 0) {
        return { error: 'Proof of payment (image/PDF) is required' };
    }

    // 3. Upload File to Supabase Storage
    // Folder structure: payment-proofs/[user_id]/[timestamp]-[safe-name]
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `${user.id}/${timestamp}-${safeName}`;

    const { error: uploadError } = await supabase.storage
        .from('payment-proofs')
        .upload(filePath, file, {
            contentType: file.type,
            cacheControl: '3600',
            upsert: false,
        });

    if (uploadError) {
        console.error('Storage upload error:', uploadError);
        return { error: `File upload failed: ${uploadError.message}` };
    }

    // 4. Create Pending Payment Record
    const { data: payment, error: paymentError } = await supabase
        .from('payment_records')
        .insert({
            resident_id: resident.id,
            house_id: house_id || null,
            amount: amount,
            payment_date: new Date().toISOString(),
            status: 'pending',
            method: 'Manual Transfer',
            proof_url: filePath, // Store original path
            notes: notes || 'Manual payment proof submitted via portal',
        })
        .select()
        .single();

    if (paymentError) {
        // Cleanup the uploaded file if DB insert fails
        await supabase.storage.from('payment-proofs').remove([filePath]);
        console.error('Payment record error:', paymentError);
        return { error: `Failed to record payment: ${paymentError.message}` };
    }

    // 5. Audit the record we did write.
    // The payment row is deliberately retained (see below): it is the estate's
    // only record that the resident uploaded proof of a real transfer, so it is
    // logged even though the submission does not complete.
    await logAudit({
        action: 'CREATE',
        entityType: 'payments',
        entityId: payment.id,
        entityDisplay: `Manual Payment Proof ₦${amount.toLocaleString()} for ${resident.first_name} ${resident.last_name}`,
        newValues: {
            amount,
            proof_url: filePath,
            approval_request_id: null,
        },
    });

    revalidatePath('/portal');

    // 6. Fail closed: the maker-checker step cannot be filed.
    //
    // This used to call createApprovalRequest({ request_type:
    // 'manual_payment_verification', ... }). That value has never existed in the
    // `approval_request_type` Postgres enum, so the insert was rejected on every
    // single submission -- and the handler returned `{ success: true, warning }`,
    // which the portal rendered as a success toast. The resident was told their
    // proof was submitted while no admin was ever notified (#107).
    //
    // The payment row and the uploaded proof are NOT rolled back: they are the
    // only evidence the estate holds that the resident paid, and destroying that
    // is a worse failure than retaining a record nobody has actioned yet. The
    // result, however, is unambiguously not a success, so the caller can no
    // longer report it as one.
    //
    // Restoring verification requires the enum value to exist; that is an owner
    // decision, tracked as #306.
    return {
        success: false,
        payment_id: payment.id,
        error:
            'Your proof was uploaded and recorded, but it could not be submitted for ' +
            'verification: manual payment verification approvals are unavailable. ' +
            'Please contact management with your payment reference. (Issue #306)',
    };
}

/**
 * Retrieves a signed URL for a payment proof file
 * Restricted to admins and the resident who uploaded it
 */
export async function getPaymentProofUrl(filePath: string) {
    const supabase = await createServerSupabaseClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Unauthorized' };

    // Permission check is handled by Supabase Storage RLS policies we created,
    // but we can add a quick check here if we want to be explicit.

    const { data, error } = await supabase.storage
        .from('payment-proofs')
        .createSignedUrl(filePath, 3600); // 1 hour

    if (error) {
        return { error: error.message };
    }

    return { url: data.signedUrl };
}
