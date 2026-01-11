'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import type {
  LateFeeWaiver,
  LateFeeWaiverWithDetails,
  LateFeeWaiverType,
  LateFeeWaiverStatus,
} from '@/types/database';

// Response types
interface GetWaiversResponse {
  data: LateFeeWaiverWithDetails[] | null;
  total: number;
  error: string | null;
}

interface WaiverActionResponse {
  success: boolean;
  data?: LateFeeWaiver;
  error: string | null;
}

interface PendingWaiverCountResponse {
  count: number;
  error: string | null;
}

// Get late fee waivers with filtering and pagination
export async function getLateFeeWaivers(params: {
  status?: LateFeeWaiverStatus | 'all';
  residentId?: string;
  invoiceId?: string;
  page?: number;
  limit?: number;
}): Promise<GetWaiversResponse> {
  const { status = 'all', residentId, invoiceId, page = 1, limit = 20 } = params;

  const auth = await authorizePermission(PERMISSIONS.BILLING_VIEW);
  if (!auth.authorized) {
    return { data: null, total: 0, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from('late_fee_waivers')
    .select(
      `
      *,
      invoice:invoices!invoice_id(id, invoice_number, amount_due, due_date, status),
      resident:residents!resident_id(id, first_name, last_name, resident_code),
      requester:profiles!requested_by(id, full_name, email),
      reviewer:profiles!reviewed_by(id, full_name, email)
    `,
      { count: 'exact' }
    );

  // Apply filters
  if (status !== 'all') {
    query = query.eq('status', status);
  }
  if (residentId) {
    query = query.eq('resident_id', residentId);
  }
  if (invoiceId) {
    query = query.eq('invoice_id', invoiceId);
  }

  // Apply pagination
  const offset = (page - 1) * limit;
  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data, count, error } = await query;

  if (error) {
    console.error('Get late fee waivers error:', error);
    return { data: null, total: 0, error: error.message };
  }

  return {
    data: (data as unknown as LateFeeWaiverWithDetails[]) || [],
    total: count || 0,
    error: null,
  };
}

// Get pending waiver count (for badge display)
export async function getPendingWaiverCount(): Promise<PendingWaiverCountResponse> {
  const auth = await authorizePermission(PERMISSIONS.BILLING_VIEW);
  if (!auth.authorized) {
    return { count: 0, error: null };
  }

  const supabase = await createServerSupabaseClient();

  const { count, error } = await supabase
    .from('late_fee_waivers')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');

  if (error) {
    return { count: 0, error: error.message };
  }

  return { count: count || 0, error: null };
}

// Request a late fee waiver
export async function requestLateFeeWaiver(params: {
  invoiceId: string;
  reason: string;
  waiverType: LateFeeWaiverType;
  waiverAmount?: number;
}): Promise<WaiverActionResponse> {
  const { invoiceId, reason, waiverType, waiverAmount } = params;

  const auth = await authorizePermission(PERMISSIONS.BILLING_REQUEST_LATE_FEE_WAIVER);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  // Get the invoice to check if it has a late fee applied
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('id, invoice_number, resident_id, metadata, status, amount_due')
    .eq('id', invoiceId)
    .single();

  if (invoiceError || !invoice) {
    return { success: false, error: 'Invoice not found' };
  }

  // Check if late fee has been applied
  const metadata = invoice.metadata as Record<string, unknown> | null;
  if (!metadata?.late_fee_applied) {
    return { success: false, error: 'This invoice does not have a late fee applied' };
  }

  const lateFeeAmount = (metadata.late_fee_amount as number) || 0;
  if (lateFeeAmount <= 0) {
    return { success: false, error: 'No late fee to waive' };
  }

  // Check for existing pending waiver
  const { data: existingWaiver } = await supabase
    .from('late_fee_waivers')
    .select('id')
    .eq('invoice_id', invoiceId)
    .eq('status', 'pending')
    .single();

  if (existingWaiver) {
    return { success: false, error: 'A pending waiver request already exists for this invoice' };
  }

  // Validate partial waiver amount
  if (waiverType === 'partial') {
    if (!waiverAmount || waiverAmount <= 0) {
      return { success: false, error: 'Partial waiver amount must be greater than 0' };
    }
    if (waiverAmount >= lateFeeAmount) {
      return { success: false, error: 'Partial waiver amount must be less than the total late fee' };
    }
  }

  // Create the waiver request
  const { data: waiver, error: insertError } = await supabase
    .from('late_fee_waivers')
    .insert({
      invoice_id: invoiceId,
      resident_id: invoice.resident_id,
      requested_by: auth.userId,
      reason,
      waiver_type: waiverType,
      waiver_amount: waiverType === 'partial' ? waiverAmount : null,
      original_late_fee: lateFeeAmount,
      status: 'pending',
    })
    .select()
    .single();

  if (insertError) {
    console.error('Create waiver request error:', insertError);
    return { success: false, error: 'Failed to create waiver request' };
  }

  // Log audit
  await logAudit({
    action: 'CREATE',
    entityType: 'late_fee_waivers',
    entityId: waiver.id,
    entityDisplay: `Waiver for ${invoice.invoice_number}`,
    newValues: {
      invoice_id: invoiceId,
      waiver_type: waiverType,
      waiver_amount: waiverType === 'partial' ? waiverAmount : lateFeeAmount,
      reason,
    },
  });

  return { success: true, data: waiver as LateFeeWaiver, error: null };
}

// Approve a late fee waiver
export async function approveLateFeeWaiver(
  waiverId: string,
  notes?: string
): Promise<WaiverActionResponse> {
  const auth = await authorizePermission(PERMISSIONS.BILLING_APPROVE_LATE_FEE_WAIVER);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  // Get the waiver request
  const { data: waiver, error: fetchError } = await supabase
    .from('late_fee_waivers')
    .select('*, invoice:invoices!invoice_id(*)')
    .eq('id', waiverId)
    .single();

  if (fetchError || !waiver) {
    return { success: false, error: 'Waiver request not found' };
  }

  if (waiver.status !== 'pending') {
    return { success: false, error: 'Waiver request has already been processed' };
  }

  const invoice = waiver.invoice as any;
  const metadata = (invoice.metadata as Record<string, unknown>) || {};

  // Calculate the amount to waive
  const waiverAmount =
    waiver.waiver_type === 'full' ? waiver.original_late_fee : waiver.waiver_amount;

  // Update the invoice - reduce total and update metadata
  const newTotal = Math.max(0, invoice.amount_due - waiverAmount);
  const newMetadata = {
    ...metadata,
    late_fee_waived: true,
    late_fee_waiver_amount: waiverAmount,
    late_fee_waiver_date: new Date().toISOString(),
    late_fee_waiver_type: waiver.waiver_type,
    late_fee_remaining: waiver.waiver_type === 'full' ? 0 : waiver.original_late_fee - waiverAmount,
  };

  const { error: invoiceUpdateError } = await supabase
    .from('invoices')
    .update({
      amount_due: newTotal,
      metadata: newMetadata,
      updated_at: new Date().toISOString(),
    })
    .eq('id', waiver.invoice_id);

  if (invoiceUpdateError) {
    console.error('Invoice update error:', invoiceUpdateError);
    return { success: false, error: 'Failed to update invoice' };
  }

  // Update the waiver status
  const { data: updatedWaiver, error: updateError } = await supabase
    .from('late_fee_waivers')
    .update({
      status: 'approved',
      reviewed_by: auth.userId,
      reviewed_at: new Date().toISOString(),
      review_notes: notes || null,
    })
    .eq('id', waiverId)
    .select()
    .single();

  if (updateError) {
    console.error('Waiver update error:', updateError);
    return { success: false, error: 'Failed to update waiver status' };
  }

  // Log audit
  await logAudit({
    action: 'APPROVE',
    entityType: 'late_fee_waivers',
    entityId: waiverId,
    entityDisplay: `Waiver for Invoice ${invoice.invoice_number}`,
    oldValues: { status: 'pending' },
    newValues: {
      status: 'approved',
      waiver_amount: waiverAmount,
      notes,
    },
  });

  return { success: true, data: updatedWaiver as LateFeeWaiver, error: null };
}

// Reject a late fee waiver
export async function rejectLateFeeWaiver(
  waiverId: string,
  notes?: string
): Promise<WaiverActionResponse> {
  const auth = await authorizePermission(PERMISSIONS.BILLING_APPROVE_LATE_FEE_WAIVER);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  // Get the waiver request
  const { data: waiver, error: fetchError } = await supabase
    .from('late_fee_waivers')
    .select('*, invoice:invoices!invoice_id(invoice_number)')
    .eq('id', waiverId)
    .single();

  if (fetchError || !waiver) {
    return { success: false, error: 'Waiver request not found' };
  }

  if (waiver.status !== 'pending') {
    return { success: false, error: 'Waiver request has already been processed' };
  }

  // Update the waiver status
  const { data: updatedWaiver, error: updateError } = await supabase
    .from('late_fee_waivers')
    .update({
      status: 'rejected',
      reviewed_by: auth.userId,
      reviewed_at: new Date().toISOString(),
      review_notes: notes || null,
    })
    .eq('id', waiverId)
    .select()
    .single();

  if (updateError) {
    console.error('Waiver update error:', updateError);
    return { success: false, error: 'Failed to update waiver status' };
  }

  const invoice = waiver.invoice as any;

  // Log audit
  await logAudit({
    action: 'REJECT',
    entityType: 'late_fee_waivers',
    entityId: waiverId,
    entityDisplay: `Waiver for Invoice ${invoice?.invoice_number}`,
    oldValues: { status: 'pending' },
    newValues: { status: 'rejected', notes },
  });

  return { success: true, data: updatedWaiver as LateFeeWaiver, error: null };
}

// Check if an invoice has a pending waiver request
export async function hasActivatedWaiver(invoiceId: string): Promise<boolean> {
  const supabase = await createServerSupabaseClient();

  const { data } = await supabase
    .from('late_fee_waivers')
    .select('id, status')
    .eq('invoice_id', invoiceId)
    .in('status', ['pending', 'approved'])
    .single();

  return !!data;
}
