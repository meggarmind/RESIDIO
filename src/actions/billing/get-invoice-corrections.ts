'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { Invoice } from '@/types/database';

interface InvoiceWithDetails extends Invoice {
  resident?: {
    id: string;
    first_name: string;
    last_name: string;
    resident_code: string;
  };
  house?: {
    id: string;
    house_number: string;
    short_name: string | null;
    street?: {
      name: string;
    };
  };
  billing_profile?: {
    id: string;
    name: string;
  };
  invoice_items?: Array<{
    id: string;
    description: string;
    amount: number;
  }>;
}

interface CorrectionHistoryData {
  creditNotes: InvoiceWithDetails[];
  debitNotes: InvoiceWithDetails[];
  netAdjustment: number;
  effectiveBalance: number;
}

interface CorrectionHistoryResult {
  data: CorrectionHistoryData | null;
  error?: string;
}

/**
 * Get correction history for an invoice
 *
 * Fetches all credit and debit notes linked to a parent invoice,
 * calculates net adjustment and effective balance.
 *
 * @param invoiceId - The parent invoice ID
 * @returns Credit notes, debit notes, net adjustment, and effective balance
 *
 * @example
 * const { data } = await getInvoiceCorrections('invoice-uuid')
 * // data.creditNotes - Array of credit notes (negative amounts)
 * // data.debitNotes - Array of debit notes (positive amounts)
 * // data.netAdjustment - Sum of all corrections
 * // data.effectiveBalance - Original amount + net adjustment
 */
export async function getInvoiceCorrections(
  invoiceId: string
): Promise<CorrectionHistoryResult> {
  const supabase = await createServerSupabaseClient();

  // 1. Fetch all corrections for this invoice
  const { data: corrections, error } = await supabase
    .from('invoices')
    .select(
      `
      *,
      resident:residents!invoices_resident_id_fkey(id, first_name, last_name, resident_code),
      house:houses!invoices_house_id_fkey(id, house_number, short_name, street:streets(name)),
      billing_profile:billing_profiles(id, name),
      invoice_items(id, description, amount)
    `
    )
    .eq('parent_invoice_id', invoiceId)
    .eq('is_correction', true)
    .order('created_at', { ascending: true }); // Chronological order for timeline

  if (error) {
    return { data: null, error: error.message };
  }

  // 2. Handle case where no corrections exist
  if (!corrections || corrections.length === 0) {
    return {
      data: {
        creditNotes: [],
        debitNotes: [],
        netAdjustment: 0,
        effectiveBalance: 0,
      },
    };
  }

  // 3. Separate credit and debit notes
  const creditNotes = corrections.filter(
    (c) => c.correction_type === 'credit_note'
  ) as InvoiceWithDetails[];

  const debitNotes = corrections.filter(
    (c) => c.correction_type === 'debit_note'
  ) as InvoiceWithDetails[];

  // 4. Calculate net adjustment (sum of all correction amounts)
  const netAdjustment = corrections.reduce(
    (sum, c) => sum + (c.amount_due || 0),
    0
  );

  // 5. Fetch original invoice to calculate effective balance
  const { data: originalInvoice } = await supabase
    .from('invoices')
    .select('amount_due')
    .eq('id', invoiceId)
    .single();

  const effectiveBalance = (originalInvoice?.amount_due || 0) + netAdjustment;

  return {
    data: {
      creditNotes,
      debitNotes,
      netAdjustment,
      effectiveBalance,
    },
  };
}

/**
 * Get parent invoice for a correction
 *
 * If the given invoice is a correction (credit/debit note),
 * fetch its parent invoice.
 *
 * @param correctionInvoiceId - The correction invoice ID
 * @returns Parent invoice with details, or null if not a correction
 */
export async function getParentInvoice(
  correctionInvoiceId: string
): Promise<{ data: InvoiceWithDetails | null; error?: string }> {
  const supabase = await createServerSupabaseClient();

  // 1. Fetch the correction invoice
  const { data: correction, error: correctionError } = await supabase
    .from('invoices')
    .select('parent_invoice_id, is_correction')
    .eq('id', correctionInvoiceId)
    .single();

  if (correctionError) {
    return { data: null, error: correctionError.message };
  }

  // 2. Check if this is actually a correction
  if (!correction.is_correction || !correction.parent_invoice_id) {
    return { data: null }; // Not a correction, no parent
  }

  // 3. Fetch parent invoice with details
  const { data: parent, error: parentError } = await supabase
    .from('invoices')
    .select(
      `
      *,
      resident:residents!invoices_resident_id_fkey(id, first_name, last_name, resident_code, phone_primary, email),
      house:houses!invoices_house_id_fkey(id, house_number, short_name, street:streets(name)),
      billing_profile:billing_profiles(id, name),
      invoice_items(id, description, amount)
    `
    )
    .eq('id', correction.parent_invoice_id)
    .single();

  if (parentError) {
    return { data: null, error: parentError.message };
  }

  return { data: parent as unknown as InvoiceWithDetails };
}
