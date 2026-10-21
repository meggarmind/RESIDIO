'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { allocateWalletToInvoices } from './wallet';
import { sendCorrectionNotification } from '../notifications/send-correction-notification';
import type { Invoice, InvoiceStatus } from '@/types/database';
import { validateMoneyAmount } from '@/lib/validators/money';

/** Upper bound on correction entries in one request. */
const MAX_CORRECTION_ENTRIES = 50;

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
 * 1. Credit note (negative amount) offsets incorrect invoice; the credit is applied to the
 *    original invoice's amount_paid so it is no longer owed
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

  if (input.corrections.length > MAX_CORRECTION_ENTRIES) {
    return {
      success: false,
      creditNotes: [],
      debitNotes: [],
      error: `A correction can have at most ${MAX_CORRECTION_ENTRIES} entries`,
    };
  }

  for (const [index, entry] of input.corrections.entries()) {
    const label = `Correction ${index + 1}`;
    let entryError: string | null = null;
    if (!entry || (entry.type !== 'credit' && entry.type !== 'debit')) {
      entryError = `${label}: type must be "credit" or "debit"`;
    } else {
      entryError = validateMoneyAmount(entry.amount, { label: `${label} amount` });
    }
    if (entryError) {
      return { success: false, creditNotes: [], debitNotes: [], error: entryError };
    }
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

  if (totalCredits > Number(originalInvoice.amount_due) + 0.005) {
    return {
      success: false,
      creditNotes: [],
      debitNotes: [],
      error: `Credits (₦${totalCredits.toLocaleString()}) cannot exceed the invoice amount (₦${Number(originalInvoice.amount_due).toLocaleString()})`,
    };
  }

  // 6. Apply the credit to the original invoice, so it stops counting as owed and stops
  //    drawing late fees and reminders (#995). It is applied as amount_paid, not by voiding the
  //    invoice or cutting amount_due: the credit note's own -X amount_due already offsets it in
  //    resident_account_balance, so either of those would take the credit off twice. The
  //    amount_paid = 0 condition stops two corrections of one invoice running at once.
  const creditStatus = (credited: number): InvoiceStatus =>
    credited <= 0
      ? (originalInvoice.status as InvoiceStatus)
      : credited >= Number(originalInvoice.amount_due) - 0.005
        ? 'paid'
        : 'partially_paid';

  const { data: claimed, error: claimError } = await supabase
    .from('invoices')
    .update({ amount_paid: totalCredits, status: creditStatus(totalCredits) })
    .eq('id', originalInvoice.id)
    .eq('amount_paid', 0)
    .select('id');

  if (claimError || !claimed?.length) {
    return {
      success: false,
      creditNotes: [],
      debitNotes: [],
      error: `Failed to apply the credit to the original invoice: ${claimError?.message || 'it changed while the correction was running'}`,
    };
  }

  const creditNotes: Invoice[] = [];
  const debitNotes: Invoice[] = [];

  // 7. Create credit notes (negative adjustments to offset original invoice)
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
      // Keep only the credit that has a credit note behind it.
      const recorded = creditNotes.reduce((sum, note) => sum - Number(note.amount_due), 0);
      const { error: rollbackError } = await supabase
        .from('invoices')
        .update({ amount_paid: recorded, status: creditStatus(recorded) })
        .eq('id', originalInvoice.id);
      return {
        success: false,
        creditNotes,
        debitNotes: [],
        error: `Failed to create credit note: ${creditError.message}${rollbackError ? `. The credit applied to original invoice ${originalInvoice.invoice_number} could not be reversed (${rollbackError.message}); check its paid amount.` : ''}`,
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

  // 8. Create debit notes (positive adjustments for correct invoices)
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
        error: `Failed to create debit note: ${debitError.message}. The credit is already applied to original invoice ${originalInvoice.invoice_number}; debit notes still missing: ${input.corrections
          .filter((c) => c.type === 'debit')
          .slice(debitNotes.length)
          .map((c) => c.description)
          .join(', ')}.`,
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

  // 9. Wallet reallocation (unless skipped)
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

  // 10. Send email notification (unless skipped)
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

  // 11. Generate warning if wallet insufficient
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
