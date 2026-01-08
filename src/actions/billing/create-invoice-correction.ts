'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { allocateWalletToInvoices } from './wallet';
import { sendCorrectionNotification } from '../notifications/send-correction-notification';
import type { Invoice, InvoiceStatus } from '@/types/database';

interface CorrectionEntry {
  type: 'credit' | 'debit';
  amount: number;
  description: string;
  billingProfileId?: string; // For debit notes - optional override
  houseId?: string; // For debit notes - optional override
}

interface CorrectionInput {
  originalInvoiceId: string;
  corrections: CorrectionEntry[];
  reason: string; // Business justification (min 10 chars)
  skipWalletReallocation?: boolean; // Optional - for special cases
  skipEmailNotification?: boolean; // Optional - for bulk operations
}

interface CorrectionResult {
  success: boolean;
  creditNotes: Invoice[];
  debitNotes: Invoice[];
  walletReallocationResult?: {
    invoicesPaid: number;
    totalAllocated: number;
  };
  emailSent?: boolean;
  warning?: string;
  error?: string;
}

/**
 * Create invoice correction using debit/credit notes
 *
 * This implements accounting-standard correction workflow:
 * 1. Credit note (negative amount) offsets incorrect invoice
 * 2. Debit note(s) (positive amount) create correct invoice(s)
 * 3. Wallet auto-allocation pays new invoices
 *
 * @example
 * // Split 25k security dues into 20k security + 5k access card
 * await createInvoiceCorrection({
 *   originalInvoiceId: 'invoice-uuid',
 *   corrections: [
 *     { type: 'credit', amount: 25000, description: 'Reverse incorrect allocation' },
 *     { type: 'debit', amount: 20000, description: 'Security dues (corrected)' },
 *     { type: 'debit', amount: 5000, description: 'Access card charges' }
 *   ],
 *   reason: 'Payment misallocated per receipt verification'
 * })
 */
export async function createInvoiceCorrection(
  input: CorrectionInput
): Promise<CorrectionResult> {
  // 1. Authorization check
  const auth = await authorizePermission(PERMISSIONS.BILLING_CREATE_INVOICE);
  if (!auth.authorized) {
    return {
      success: false,
      creditNotes: [],
      debitNotes: [],
      error: auth.error || 'Unauthorized to create invoice corrections',
    };
  }

  // 2. Validate input
  if (!input.reason || input.reason.length < 10) {
    return {
      success: false,
      creditNotes: [],
      debitNotes: [],
      error: 'Correction reason must be at least 10 characters',
    };
  }

  if (!input.corrections || input.corrections.length === 0) {
    return {
      success: false,
      creditNotes: [],
      debitNotes: [],
      error: 'At least one correction entry is required',
    };
  }

  const supabase = await createServerSupabaseClient();

  // 3. Fetch and validate original invoice
  const { data: originalInvoice, error: fetchError } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', input.originalInvoiceId)
    .single();

  if (fetchError || !originalInvoice) {
    return {
      success: false,
      creditNotes: [],
      debitNotes: [],
      error: 'Original invoice not found',
    };
  }

  if (originalInvoice.status === 'void') {
    return {
      success: false,
      creditNotes: [],
      debitNotes: [],
      error: 'Cannot correct a void invoice',
    };
  }

  // 4. Validate corrections balance (credits must equal debits)
  const totalCredits = input.corrections
    .filter((c) => c.type === 'credit')
    .reduce((sum, c) => sum + c.amount, 0);

  const totalDebits = input.corrections
    .filter((c) => c.type === 'debit')
    .reduce((sum, c) => sum + c.amount, 0);

  if (Math.abs(totalCredits - totalDebits) > 0.01) {
    return {
      success: false,
      creditNotes: [],
      debitNotes: [],
      error: `Correction must balance: Credits (₦${totalCredits.toLocaleString()}) must equal Debits (₦${totalDebits.toLocaleString()})`,
    };
  }

  // 5. Check for partial payment (requires manual reversal first)
  if (originalInvoice.amount_paid > 0) {
    return {
      success: false,
      creditNotes: [],
      debitNotes: [],
      error: `Invoice has been partially paid (₦${originalInvoice.amount_paid.toLocaleString()}). Please reverse payment allocation before creating corrections.`,
    };
  }

  const creditNotes: Invoice[] = [];
  const debitNotes: Invoice[] = [];

  // 6. Create credit notes (negative adjustments to offset original invoice)
  for (const correction of input.corrections.filter((c) => c.type === 'credit')) {
    const invoiceNumber = `ADJ-CR-${Date.now()}-${originalInvoice.invoice_number}`;

    const { data: creditNote, error: creditError } = await supabase
      .from('invoices')
      .insert({
        invoice_number: invoiceNumber,
        resident_id: originalInvoice.resident_id,
        house_id: originalInvoice.house_id,
        billing_profile_id: originalInvoice.billing_profile_id,
        amount_due: -correction.amount, // Negative amount!
        amount_paid: -correction.amount, // Auto-applied (credit notes are immediately applied)
        status: 'paid' as InvoiceStatus, // Credit notes start as paid
        invoice_type: 'ADJUSTMENT',
        parent_invoice_id: input.originalInvoiceId,
        correction_type: 'credit_note',
        correction_reason: input.reason,
        is_correction: true,
        due_date: new Date().toISOString().split('T')[0],
        period_start: originalInvoice.period_start,
        period_end: originalInvoice.period_end,
        notes: `Credit Note: ${correction.description}\n\nReason: ${input.reason}`,
      })
      .select()
      .single();

    if (creditError) {
      return {
        success: false,
        creditNotes,
        debitNotes: [],
        error: `Failed to create credit note: ${creditError.message}`,
      };
    }

    // Create invoice item for line item detail
    await supabase.from('invoice_items').insert({
      invoice_id: creditNote.id,
      description: correction.description,
      amount: -correction.amount,
    });

    creditNotes.push(creditNote as Invoice);

    // Audit log
    await logAudit({
      action: 'CREATE',
      entityType: 'invoices',
      entityId: creditNote.id,
      entityDisplay: `Credit Note: ${invoiceNumber}`,
      newValues: {
        invoice_number: invoiceNumber,
        amount: -correction.amount,
        parent_invoice: originalInvoice.invoice_number,
      },
      metadata: {
        correction_type: 'credit_note',
        parent_invoice_id: originalInvoice.id,
        original_invoice_number: originalInvoice.invoice_number,
        correction_reason: input.reason,
        amount: -correction.amount,
      },
    });
  }

  // 7. Create debit notes (positive adjustments for correct invoices)
  for (const correction of input.corrections.filter((c) => c.type === 'debit')) {
    const invoiceNumber = `ADJ-DB-${Date.now()}-${originalInvoice.invoice_number}`;

    const { data: debitNote, error: debitError } = await supabase
      .from('invoices')
      .insert({
        invoice_number: invoiceNumber,
        resident_id: originalInvoice.resident_id,
        house_id: correction.houseId || originalInvoice.house_id,
        billing_profile_id: correction.billingProfileId || originalInvoice.billing_profile_id,
        amount_due: correction.amount,
        amount_paid: 0, // Unpaid - will be allocated from wallet
        status: 'unpaid' as InvoiceStatus,
        invoice_type: 'ADJUSTMENT',
        parent_invoice_id: input.originalInvoiceId,
        correction_type: 'debit_note',
        correction_reason: input.reason,
        is_correction: true,
        due_date: new Date().toISOString().split('T')[0],
        period_start: originalInvoice.period_start,
        period_end: originalInvoice.period_end,
        notes: `Debit Note: ${correction.description}\n\nReason: ${input.reason}`,
      })
      .select()
      .single();

    if (debitError) {
      return {
        success: false,
        creditNotes,
        debitNotes,
        error: `Failed to create debit note: ${debitError.message}`,
      };
    }

    // Create invoice item
    await supabase.from('invoice_items').insert({
      invoice_id: debitNote.id,
      description: correction.description,
      amount: correction.amount,
    });

    debitNotes.push(debitNote as Invoice);

    // Audit log
    await logAudit({
      action: 'CREATE',
      entityType: 'invoices',
      entityId: debitNote.id,
      entityDisplay: `Debit Note: ${invoiceNumber}`,
      newValues: {
        invoice_number: invoiceNumber,
        amount: correction.amount,
        parent_invoice: originalInvoice.invoice_number,
      },
      metadata: {
        correction_type: 'debit_note',
        parent_invoice_id: originalInvoice.id,
        original_invoice_number: originalInvoice.invoice_number,
        correction_reason: input.reason,
        amount: correction.amount,
      },
    });
  }

  // 8. Wallet reallocation (unless skipped)
  let walletResult;
  if (!input.skipWalletReallocation) {
    walletResult = await allocateWalletToInvoices(
      originalInvoice.resident_id,
      originalInvoice.house_id
    );

    // Log wallet reallocation
    await logAudit({
      action: 'ALLOCATE',
      entityType: 'wallets',
      entityId: originalInvoice.resident_id,
      entityDisplay: `Wallet reallocation after correction`,
      metadata: {
        invoices_paid: walletResult.invoicesPaid,
        total_allocated: walletResult.totalAllocated,
        trigger: 'invoice_correction',
        parent_invoice: originalInvoice.invoice_number,
      },
    });
  }

  // 9. Send email notification (unless skipped)
  let emailSent = false;
  if (!input.skipEmailNotification) {
    const emailResult = await sendCorrectionNotification({
      originalInvoice,
      creditNotes,
      debitNotes,
      reason: input.reason,
    });
    emailSent = emailResult.success;
  }

  // 10. Generate warning if wallet insufficient
  const warning =
    walletResult && walletResult.totalAllocated < totalDebits
      ? `Only ₦${walletResult.totalAllocated.toLocaleString()} was allocated from wallet. Remaining ₦${(totalDebits - walletResult.totalAllocated).toLocaleString()} is unpaid. Resident may need to make additional payment.`
      : undefined;

  return {
    success: true,
    creditNotes,
    debitNotes,
    walletReallocationResult: walletResult,
    emailSent,
    warning,
  };
}
