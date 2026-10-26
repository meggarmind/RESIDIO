import { createElement } from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { createAdminClient } from '@/lib/supabase/server';
import { getRawSettingsAsService } from '@/lib/settings/service';
import { PaymentReceiptPDF, type PaymentReceiptData } from '@/lib/pdf/payment-receipt';
import { lagosDateString } from '@/lib/whatsapp/assistant-format';
import { storeChatPdf, type ChatPdfInput } from '@/lib/whatsapp/statement-delivery';

/**
 * Receipts for the WhatsApp Assistant (#816 decision 14): the resident's recent payments, and the PDF
 * of one verified payment. Reads with the service-role client, scoped to the resident and property
 * that the conversation already identified.
 */

export interface ReceiptPayment {
  id: string;
  amount: number;
  payment_date: string;
  method: string | null;
  is_verified: boolean;
}

export async function getReceiptPayments(residentId: string, houseId: string, limit: number): Promise<ReceiptPayment[]> {
  const { data, error } = await createAdminClient()
    .from('payment_records')
    .select('id, amount, payment_date, method, is_verified')
    .eq('resident_id', residentId)
    .eq('house_id', houseId)
    .eq('status', 'paid')
    .order('payment_date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map((row) => ({ id: row.id, amount: Number(row.amount), payment_date: row.payment_date, method: row.method, is_verified: row.is_verified }));
}

/** The receipt for one payment, or null when it is not this resident's, not for this property, or not verified. */
export async function loadReceipt(residentId: string, houseId: string, paymentId: string): Promise<PaymentReceiptData | null> {
  const { data, error } = await createAdminClient()
    .from('payment_records')
    .select('id, amount, payment_date, method, reference_number, is_verified, verified_at, resident:residents!payment_records_resident_id_fkey(first_name, last_name, resident_code), house:houses(house_number, short_name, street:streets(name))')
    .eq('id', paymentId)
    .eq('resident_id', residentId)
    .eq('house_id', houseId)
    .eq('status', 'paid')
    .eq('is_verified', true)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const one = <T,>(value: T | T[] | null): T | null => (Array.isArray(value) ? value[0] ?? null : value);
  const resident = one(data.resident as unknown as { first_name: string; last_name: string; resident_code: string } | null);
  const house = one(data.house as unknown as { house_number: string; short_name: string | null; street: { name: string } | { name: string }[] | null } | null);
  const street = one(house?.street ?? null)?.name;
  return {
    receiptNumber: `RCP-${data.id.slice(0, 8).toUpperCase()}`,
    residentName: resident ? `${resident.first_name} ${resident.last_name}` : '',
    residentCode: resident?.resident_code ?? '',
    propertyLabel: house ? house.short_name || `${house.house_number}, ${street || 'Estate'}` : '',
    amount: Number(data.amount),
    paymentDate: data.payment_date,
    method: data.method,
    reference: data.reference_number,
    verifiedAt: data.verified_at,
  };
}

async function estateName(): Promise<string> {
  const settings = await getRawSettingsAsService(['estate_name']);
  const value = settings.status === 'ok' ? settings.values.get('estate_name') : null;
  return typeof value === 'string' && value.trim() ? value.trim() : 'Residio Estate';
}

async function estateAddress(): Promise<string> {
  const settings = await getRawSettingsAsService(['estate_address']);
  const value = settings.status === 'ok' ? settings.values.get('estate_address') : null;
  return typeof value === 'string' ? value.trim() : '';
}

/** Stores the receipt PDF privately for 12 hours and returns a 1-hour signed URL for the reply. */
export async function storeReceiptPdf(input: Omit<ChatPdfInput, 'label' | 'fromDate' | 'toDate' | 'rowCount'>, receipt: PaymentReceiptData): Promise<string> {
  const day = lagosDateString(new Date(receipt.paymentDate));
  return storeChatPdf('receipts', { ...input, label: 'receipt', fromDate: day, toDate: day, rowCount: 1 }, async () =>
    renderToBuffer(createElement(PaymentReceiptPDF, { receipt, estateName: await estateName(), estateAddress: await estateAddress() }) as Parameters<typeof renderToBuffer>[0])
  );
}
