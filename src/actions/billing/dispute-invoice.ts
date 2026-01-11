'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/logger';

export async function disputeInvoice(invoiceId: string, reason: string) {
    const supabase = await createServerSupabaseClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return { success: false, error: 'Not authenticated' };
    }

    // Verify ownership
    const { data: profile } = await supabase
        .from('profiles')
        .select('resident_id')
        .eq('id', user.id)
        .single();

    if (!profile?.resident_id) {
        return { success: false, error: 'Resident profile not found' };
    }

    const { data: invoice } = await supabase
        .from('invoices')
        .select('id, invoice_number, resident_id')
        .eq('id', invoiceId)
        .single();

    if (!invoice) {
        return { success: false, error: 'Invoice not found' };
    }

    if (invoice.resident_id !== profile.resident_id) {
        return { success: false, error: 'Unauthorized' };
    }

    // Since we don't have a 'disputed' status or disputes table yet,
    // we will log this as an audit event which admins can review.
    // In a future update, this should insert into an `invoice_disputes` table.

    try {
        await logAudit({
            action: 'UPDATE', // Using UPDATE to signify invoice state "change" request
            entityType: 'invoices',
            entityId: invoiceId,
            entityDisplay: `Dispute filed for ${invoice.invoice_number}`,
            oldValues: undefined,
            newValues: { dispute_reason: reason },
            description: `Resident filed a dispute: ${reason}`,
        });

        // TODO: Send email to admin
        // await sendAdminNotification('invoice_dispute', { invoiceId, reason, residentId: profile.resident_id });

        return { success: true };
    } catch (error) {
        console.error('Dispute error:', error);
        return { success: false, error: 'Failed to record dispute' };
    }
}
