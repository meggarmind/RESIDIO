'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSettingValue } from '@/actions/settings/get-settings';
import { logAudit } from '@/lib/audit/logger';

type ApplyLateFeesResult = {
    success: boolean;
    processed: number;
    applied: number;
    totalLateFees: number;
    errors: string[];
}

export async function applyLateFees(): Promise<ApplyLateFeesResult> {
    const supabase = await createServerSupabaseClient();

    // Check authorization
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { success: false, processed: 0, applied: 0, totalLateFees: 0, errors: ['Not authenticated'] };
    }

    // Get user role
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (!profile || !['admin', 'chairman', 'financial_secretary'].includes(profile.role)) {
        return { success: false, processed: 0, applied: 0, totalLateFees: 0, errors: ['Unauthorized'] };
    }

    // Get late fee settings
    const lateFeeEnabled = await getSettingValue('late_fee_enabled');
    if (!lateFeeEnabled) {
        return { success: false, processed: 0, applied: 0, totalLateFees: 0, errors: ['Late fees are not enabled'] };
    }

    const lateFeeType = (await getSettingValue('late_fee_type')) as string || 'percentage';
    const lateFeeAmount = Number(await getSettingValue('late_fee_amount')) || 5;
    const gracePeriodDays = Number(await getSettingValue('grace_period_days')) || 7;

    // Calculate the cutoff date (invoices due before this date are eligible for late fees)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - gracePeriodDays);
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

    // Find overdue invoices that haven't had late fees applied yet
    // We'll use a metadata field to track if late fee was already applied
    const { data: overdueInvoices, error: fetchError } = await supabase
        .from('invoices')
        .select('id, invoice_number, total_amount, due_date, status, metadata')
        .eq('status', 'overdue')
        .lt('due_date', cutoffDateStr)
        .order('due_date', { ascending: true });

    if (fetchError) {
        return { success: false, processed: 0, applied: 0, totalLateFees: 0, errors: [fetchError.message] };
    }

    if (!overdueInvoices || overdueInvoices.length === 0) {
        return { success: true, processed: 0, applied: 0, totalLateFees: 0, errors: [] };
    }

    const errors: string[] = [];
    let applied = 0;
    let totalLateFees = 0;

    for (const invoice of overdueInvoices) {
        // Skip if late fee already applied
        const metadata = invoice.metadata as Record<string, unknown> || {};
        if (metadata.late_fee_applied) {
            continue;
        }

        // Calculate late fee
        let lateFee: number;
        if (lateFeeType === 'percentage') {
            lateFee = Math.round((invoice.total_amount * lateFeeAmount / 100) * 100) / 100;
        } else {
            lateFee = lateFeeAmount;
        }

        // Update invoice with late fee
        const newTotal = invoice.total_amount + lateFee;
        const newMetadata = {
            ...metadata,
            late_fee_applied: true,
            late_fee_amount: lateFee,
            late_fee_applied_at: new Date().toISOString(),
            late_fee_type: lateFeeType,
            late_fee_rate: lateFeeAmount,
            original_total: invoice.total_amount,
        };

        const { error: updateError } = await supabase
            .from('invoices')
            .update({
                total_amount: newTotal,
                metadata: newMetadata,
            })
            .eq('id', invoice.id);

        if (updateError) {
            errors.push(`Failed to apply late fee to invoice ${invoice.invoice_number}: ${updateError.message}`);
            continue;
        }

        // Add late fee as an invoice item
        const { error: itemError } = await supabase
            .from('invoice_items')
            .insert({
                invoice_id: invoice.id,
                name: `Late Fee (${lateFeeType === 'percentage' ? `${lateFeeAmount}%` : 'Fixed'})`,
                description: `Late payment penalty applied on ${new Date().toLocaleDateString()}`,
                amount: lateFee,
                quantity: 1,
            });

        if (itemError) {
            errors.push(`Failed to add late fee item to invoice ${invoice.invoice_number}: ${itemError.message}`);
        }

        applied++;
        totalLateFees += lateFee;

        // Log audit
        await logAudit({
            action: 'UPDATE',
            entityType: 'invoices',
            entityId: invoice.id,
            entityDisplay: invoice.invoice_number,
            oldValues: { total_amount: invoice.total_amount, late_fee_applied: false },
            newValues: { total_amount: newTotal, late_fee_applied: true, late_fee_amount: lateFee },
        });
    }

    return {
        success: true,
        processed: overdueInvoices.length,
        applied,
        totalLateFees,
        errors,
    };
}
