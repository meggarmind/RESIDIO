'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { sendImmediate } from '@/lib/notifications';
import { logAudit } from '@/lib/audit/logger';
import type { Invoice } from '@/types/database';

interface CorrectionNotificationInput {
  originalInvoice: Invoice;
  creditNotes: Invoice[];
  debitNotes: Invoice[];
  reason: string;
}

interface NotificationResult {
  success: boolean;
  error?: string;
}

/**
 * Send email notification to resident about invoice correction
 *
 * Notifies the resident that their invoice has been corrected with:
 * - Original invoice details
 * - Correction summary (credit/debit notes)
 * - Reason for correction
 * - Link to view updated invoice
 *
 * @param input - Correction details
 * @returns Success status and any errors
 */
export async function sendCorrectionNotification(
  input: CorrectionNotificationInput
): Promise<NotificationResult> {
  const { originalInvoice, creditNotes, debitNotes, reason } = input;

  const supabase = createAdminClient();

  // 1. Get resident details
  const { data: resident, error: residentError } = await supabase
    .from('residents')
    .select('id, email, first_name, last_name')
    .eq('id', originalInvoice.resident_id)
    .single();

  if (residentError || !resident) {
    return {
      success: false,
      error: 'Resident not found',
    };
  }

  if (!resident.email) {
    return {
      success: false,
      error: 'Resident has no email address',
    };
  }

  // 2. Get house details
  const { data: house } = await supabase
    .from('houses')
    .select('house_number, short_name, street:streets(name)')
    .eq('id', originalInvoice.house_id)
    .single();

  const houseDisplay = house
    ? house.short_name || `House ${house.house_number}`
    : '';
  // Supabase returns street as array due to foreign key
  const streetData = house?.street ? (Array.isArray(house.street) ? house.street[0] : house.street) : null;
  const streetDisplay = (streetData as { name: string } | null)?.name || '';

  // 3. Format correction summary
  const creditSummary = creditNotes
    .map(
      (note) => `  • Credit Note ${note.invoice_number}: -₦${Math.abs(note.amount_due || 0).toLocaleString()}`
    )
    .join('\n');

  const debitSummary = debitNotes
    .map(
      (note) => `  • Debit Note ${note.invoice_number}: ₦${(note.amount_due || 0).toLocaleString()}`
    )
    .join('\n');

  const totalCreditAmount = creditNotes.reduce(
    (sum, note) => sum + Math.abs(note.amount_due || 0),
    0
  );
  const totalDebitAmount = debitNotes.reduce(
    (sum, note) => sum + (note.amount_due || 0),
    0
  );

  // 4. Compose email
  const subject = `Invoice Correction Notice - ${originalInvoice.invoice_number}`;

  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
        .section { margin-bottom: 20px; }
        .correction-box { background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 15px 0; }
        .credit-note { color: #dc3545; }
        .debit-note { color: #28a745; }
        .reason-box { background-color: #f8f9fa; padding: 15px; border-left: 4px solid #6c757d; margin: 15px 0; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6; font-size: 0.9em; color: #6c757d; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #dee2e6; }
        th { background-color: #f8f9fa; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>Invoice Correction Notice</h2>
          <p>Dear ${resident.first_name} ${resident.last_name},</p>
        </div>

        <div class="section">
          <p>This is to inform you that a correction has been made to your invoice.</p>
        </div>

        <div class="correction-box">
          <h3>Original Invoice</h3>
          <table>
            <tr>
              <th>Invoice Number</th>
              <td>${originalInvoice.invoice_number}</td>
            </tr>
            <tr>
              <th>Property</th>
              <td>${houseDisplay}${streetDisplay ? `, ${streetDisplay}` : ''}</td>
            </tr>
            <tr>
              <th>Original Amount</th>
              <td>₦${(originalInvoice.amount_due || 0).toLocaleString()}</td>
            </tr>
          </table>
        </div>

        <div class="section">
          <h3>Correction Applied</h3>

          ${creditNotes.length > 0 ? `
            <h4 class="credit-note">Credit Notes (Reductions)</h4>
            <pre>${creditSummary}</pre>
            <p><strong>Total Credit: -₦${totalCreditAmount.toLocaleString()}</strong></p>
          ` : ''}

          ${debitNotes.length > 0 ? `
            <h4 class="debit-note">Debit Notes (New Charges)</h4>
            <pre>${debitSummary}</pre>
            <p><strong>Total Debit: ₦${totalDebitAmount.toLocaleString()}</strong></p>
          ` : ''}
        </div>

        <div class="reason-box">
          <h4>Reason for Correction</h4>
          <p>${reason}</p>
        </div>

        <div class="section">
          <h3>What This Means</h3>
          <p>
            The original invoice has been adjusted to correct an error. The amounts shown above reflect the changes made.
            ${totalCreditAmount === totalDebitAmount
              ? 'The total amount remains the same, but the allocation has been corrected.'
              : `Your total balance has been adjusted by ₦${Math.abs(totalDebitAmount - totalCreditAmount).toLocaleString()}.`
            }
          </p>
          <p>
            ${debitNotes.some(note => note.status === 'paid')
              ? 'The corrected amounts have been automatically allocated from your wallet balance.'
              : 'You may need to review your payment status for any outstanding amounts.'
            }
          </p>
        </div>

        <div class="section">
          <p>
            If you have any questions about this correction, please contact the estate management office.
          </p>
        </div>

        <div class="footer">
          <p>This is an automated notification from Residio Estate Management System.</p>
          <p>Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const textBody = `
Invoice Correction Notice

Dear ${resident.first_name} ${resident.last_name},

This is to inform you that a correction has been made to your invoice.

ORIGINAL INVOICE
Invoice Number: ${originalInvoice.invoice_number}
Property: ${houseDisplay}${streetDisplay ? `, ${streetDisplay}` : ''}
Original Amount: ₦${(originalInvoice.amount_due || 0).toLocaleString()}

CORRECTION APPLIED
${creditNotes.length > 0 ? `
Credit Notes (Reductions):
${creditSummary}
Total Credit: -₦${totalCreditAmount.toLocaleString()}
` : ''}
${debitNotes.length > 0 ? `
Debit Notes (New Charges):
${debitSummary}
Total Debit: ₦${totalDebitAmount.toLocaleString()}
` : ''}

REASON FOR CORRECTION
${reason}

WHAT THIS MEANS
The original invoice has been adjusted to correct an error. The amounts shown above reflect the changes made.
${totalCreditAmount === totalDebitAmount
  ? 'The total amount remains the same, but the allocation has been corrected.'
  : `Your total balance has been adjusted by ₦${Math.abs(totalDebitAmount - totalCreditAmount).toLocaleString()}.`
}

${debitNotes.some(note => note.status === 'paid')
  ? 'The corrected amounts have been automatically allocated from your wallet balance.'
  : 'You may need to review your payment status for any outstanding amounts.'
}

If you have any questions about this correction, please contact the estate management office.

---
This is an automated notification from Residio Estate Management System.
Please do not reply to this email.
  `.trim();

  // 5. Send notification
  const result = await sendImmediate({
    channel: 'email',
    recipientId: resident.id,
    recipientEmail: resident.email,
    subject,
    body: textBody,
    htmlBody: htmlBody,
    metadata: {
      category: 'billing',
      original_invoice_id: originalInvoice.id,
      original_invoice_number: originalInvoice.invoice_number,
      credit_notes: creditNotes.map(n => n.id),
      debit_notes: debitNotes.map(n => n.id),
      correction_reason: reason,
    },
  });

  // 6. Audit log
  if (result.success) {
    await logAudit({
      action: 'CREATE',
      entityType: 'invoices',
      entityId: originalInvoice.id,
      entityDisplay: `Correction notification sent to ${resident.first_name} ${resident.last_name}`,
      metadata: {
        notification_type: 'invoice_correction',
        recipient_email: resident.email,
        credit_notes_count: creditNotes.length,
        debit_notes_count: debitNotes.length,
      },
    });
  }

  return {
    success: result.success,
    error: result.error,
  };
}
