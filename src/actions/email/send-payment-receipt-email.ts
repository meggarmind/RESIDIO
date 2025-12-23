'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { sendEmail, getEstateEmailSettings } from '@/lib/email';
import { PaymentReceiptEmail } from '@/emails';
import { format } from 'date-fns';

interface SendPaymentReceiptEmailResult {
  success: boolean;
  error?: string;
  sentTo?: string[];
}

interface Recipient {
  email: string;
  name: string;
  residentId: string;
}

/**
 * Get potential recipients for a payment receipt (main resident + co-residents)
 * Uses a two-step query approach to avoid nested relation issues
 */
export async function getPaymentRecipients(paymentId: string): Promise<{
  mainResident: Recipient | null;
  coResidents: Recipient[];
  error?: string;
}> {
  const supabase = await createServerSupabaseClient();

  // Step 1: Get payment to find the resident_id
  const { data: payment, error: paymentError } = await supabase
    .from('payment_records')
    .select('id, resident_id')
    .eq('id', paymentId)
    .single();

  if (paymentError) {
    console.error('[getPaymentRecipients] Payment query error:', paymentError);
    return { mainResident: null, coResidents: [], error: `Database error: ${paymentError.message}` };
  }

  if (!payment) {
    return { mainResident: null, coResidents: [], error: 'Payment not found' };
  }

  // Step 2: Get the resident details
  const { data: resident, error: residentError } = await supabase
    .from('residents')
    .select('id, first_name, last_name, email')
    .eq('id', payment.resident_id)
    .single();

  if (residentError) {
    console.error('[getPaymentRecipients] Resident query error:', residentError);
    return { mainResident: null, coResidents: [], error: `Resident lookup error: ${residentError.message}` };
  }

  if (!resident) {
    return { mainResident: null, coResidents: [], error: 'Resident not found' };
  }

  // Main recipient (the payment owner)
  const mainResident: Recipient | null = resident.email
    ? {
        email: resident.email,
        name: `${resident.first_name} ${resident.last_name}`,
        residentId: resident.id,
      }
    : null;

  // Step 3: Get active houses for this resident
  const { data: residentHouses } = await supabase
    .from('resident_houses')
    .select('house_id')
    .eq('resident_id', resident.id)
    .eq('is_active', true);

  const activeHouseIds = (residentHouses || []).map((rh) => rh.house_id);

  if (activeHouseIds.length === 0) {
    return { mainResident, coResidents: [] };
  }

  // Step 4: Get all active co-residents in the same houses (excluding main resident)
  const { data: housemates } = await supabase
    .from('resident_houses')
    .select(`
      resident:residents(
        id,
        first_name,
        last_name,
        email
      )
    `)
    .in('house_id', activeHouseIds)
    .eq('is_active', true)
    .neq('resident_id', resident.id);

  const coResidents: Recipient[] = [];
  const seenIds = new Set<string>();

  (housemates || []).forEach((rh: any) => {
    const r = rh.resident;
    if (r && r.email && !seenIds.has(r.id)) {
      seenIds.add(r.id);
      coResidents.push({
        email: r.email,
        name: `${r.first_name} ${r.last_name}`,
        residentId: r.id,
      });
    }
  });

  return { mainResident, coResidents };
}

/**
 * Send a payment receipt email
 */
export async function sendPaymentReceiptEmail(
  paymentId: string,
  recipientEmails: string[]
): Promise<SendPaymentReceiptEmailResult> {
  if (recipientEmails.length === 0) {
    return { success: false, error: 'No recipients specified' };
  }

  const supabase = await createServerSupabaseClient();

  // Get payment with all related data
  const { data: payment, error } = await supabase
    .from('payment_records')
    .select(`
      id,
      amount,
      payment_date,
      method,
      status,
      reference_number,
      notes,
      period_start,
      period_end,
      resident:residents(
        id,
        first_name,
        last_name,
        email,
        resident_code
      ),
      house:houses(
        house_number,
        street:streets(name)
      )
    `)
    .eq('id', paymentId)
    .single();

  if (error) {
    console.error('[sendPaymentReceiptEmail] Supabase error:', error);
    return { success: false, error: `Database error: ${error.message}` };
  }

  if (!payment) {
    return { success: false, error: 'Payment not found' };
  }

  const resident = payment.resident as any;
  if (!resident) {
    return { success: false, error: 'Resident not found' };
  }

  // Get all recipients details
  const { data: recipientDetails } = await supabase
    .from('residents')
    .select('id, first_name, last_name, email')
    .in('email', recipientEmails);

  const recipients = (recipientDetails || [])
    .filter((r) => r.email)
    .map((r) => ({
      email: r.email!,
      name: `${r.first_name} ${r.last_name}`,
      residentId: r.id,
    }));

  if (recipients.length === 0) {
    return { success: false, error: 'No valid recipients found' };
  }

  // Get estate settings
  const estateSettings = await getEstateEmailSettings();

  const house = payment.house as any;
  const receiptNumber = payment.reference_number || `RCP-${payment.id.slice(0, 8).toUpperCase()}`;

  // Format dates
  const formatDate = (date: string) => format(new Date(date), 'MMMM d, yyyy');

  const result = await sendEmail({
    to: recipients,
    subject: `Payment Receipt: ${receiptNumber}`,
    react: PaymentReceiptEmail({
      residentName: `${resident.first_name} ${resident.last_name}`,
      receiptNumber,
      amount: payment.amount,
      paymentDate: formatDate(payment.payment_date),
      paymentMethod: payment.method || undefined,
      houseNumber: house?.house_number,
      streetName: house?.street?.name,
      residentCode: resident.resident_code,
      periodStart: payment.period_start ? formatDate(payment.period_start) : undefined,
      periodEnd: payment.period_end ? formatDate(payment.period_end) : undefined,
      notes: payment.notes || undefined,
      ...estateSettings,
    }),
    emailType: 'payment_receipt',
    metadata: {
      paymentId: payment.id,
      receiptNumber,
      amount: payment.amount,
    },
  });

  if (!result.success) {
    return { success: false, error: result.error };
  }

  return {
    success: true,
    sentTo: recipients.map((r) => r.email),
  };
}
