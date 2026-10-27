'use server';

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { createAdminClient, createServerSupabaseClient } from '@/lib/supabase/server';
import { payerSchema, findOrCreatePayer } from '@/lib/collections/payers';
import {
  collectionPartInputSchema,
  noticePostedParts,
  postCollectionParts,
  resolveCollectionParts,
  reverseCollectionParts,
  type CollectionPartInput,
  type PostedCollectionPart,
} from '@/lib/collections/intake';
import { billingRemainder, collectionClosedReason, priceCollectionPayment, type Collection, type CollectionPaymentMethod } from '@/lib/collections/ledger';
import { createPaymentCore, type CreatePaymentInput, type CreatePaymentResult } from '@/lib/payments/create-payment';
import { residentHasHouse } from '@/lib/payments/house-membership';
import { eligibleSettlementInvoiceIds } from '@/lib/billing/eligible-invoices';
import { DEFAULT_CHARGE_CATEGORY } from '@/lib/billing/charge-categories';
import { isImportRowEditable, rowsLockedMessage } from '@/lib/imports/row-edit-guard';
import { lagosDateString } from '@/lib/whatsapp/assistant-format';

/**
 * Collections intake (#1195): a bank line marked "Collection" (whole or split with billing), a payment
 * split between billing and collections on the payment form, and moving a payment between billing and
 * collections. A collection part never credits a wallet.
 */

type Result<T> = { data: T | null; error: string | null };

/** The collection tables and the #1195 columns are not in the generated types until db:types is re-run. */
const db = () => createAdminClient() as unknown as SupabaseClient;

const firstIssue = (error: z.ZodError) => error.issues[0]?.message ?? 'Check the form';
const reasonSchema = z.string().trim().min(1, 'Enter the reason for the move').max(500);
const today = () => lagosDateString(new Date());

async function activeChargeCategory(client: SupabaseClient, code: string): Promise<string | null> {
  const { data } = await client.from('charge_categories').select('code').eq('code', code).eq('is_active', true).maybeSingle();
  return data ? null : `Unknown charge category ${code}`;
}

const assignSchema = z.object({
  row_id: z.guid(),
  payer: payerSchema,
  parts: z.array(collectionPartInputSchema).min(1, 'Add at least one collection part'),
  /** The rest of the bank amount goes to the payer's wallet of this category. Needs a resident payer. */
  billing: z.object({ charge_category: z.string().trim().min(1) }).optional().nullable(),
});

export type AssignBankRowInput = z.input<typeof assignSchema>;

/**
 * Import review: marks a credit line "Collection". The parts must sum to the bank amount, or, with a
 * billing part, leave a remainder that the import posts as a payment for the resident payer.
 */
export async function assignBankRowToCollections(input: AssignBankRowInput): Promise<Result<{ billing_amount: number }>> {
  const auth = await authorizePermission(PERMISSIONS.IMPORTS_REVIEW);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };
  const collectionsAuth = await authorizePermission(PERMISSIONS.COLLECTIONS_MANAGE);
  if (!collectionsAuth.authorized) return { data: null, error: collectionsAuth.error || 'Unauthorized' };
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: firstIssue(parsed.error) };
  const { row_id, payer, parts, billing } = parsed.data;
  if (billing && payer.kind !== 'resident') return { data: null, error: 'Only a resident payer can have a billing part' };

  const supabase = await createServerSupabaseClient();
  const { data: row, error: rowError } = await supabase
    .from('bank_statement_rows')
    .select('id, import_id, amount, transaction_type, transaction_date')
    .eq('id', row_id)
    .single();
  if (rowError || !row) return { data: null, error: 'Row not found' };
  const { data: importRow, error: importError } = await supabase.from('bank_statement_imports').select('status').eq('id', row.import_id).single();
  if (importError || !importRow) return { data: null, error: 'Import not found' };
  if (!isImportRowEditable(importRow.status)) return { data: null, error: rowsLockedMessage(importRow.status) };
  if (row.transaction_type !== 'credit') return { data: null, error: 'Only money received can go to a collection' };
  if (!row.amount || row.amount <= 0) return { data: null, error: 'This line has no amount' };

  const client = db();
  if (billing) {
    const unknown = await activeChargeCategory(client, billing.charge_category);
    if (unknown) return { data: null, error: unknown };
  }
  const resolved = await resolveCollectionParts(client, parts as CollectionPartInput[], {
    payer,
    paymentDate: row.transaction_date || today(),
    userId: auth.userId as string,
  });
  if ('error' in resolved) return { data: null, error: resolved.error };

  const remainder = billingRemainder(row.amount, resolved.parts.map((part) => part.amount));
  if (remainder < 0) return { data: null, error: 'The collection parts are more than the bank amount' };
  if (billing && remainder === 0) return { data: null, error: 'The collection parts take the whole amount, so there is no billing part' };
  if (!billing && remainder !== 0) return { data: null, error: 'The collection parts must add up to the bank amount, or add a billing part for the rest' };

  const changes = {
    status: 'matched',
    match_confidence: 'manual',
    match_method: 'manual',
    matched_resident_id: billing && payer.kind === 'resident' ? payer.resident_id : null,
    matched_project_id: null,
    matched_petty_cash_account_id: null,
    matched_expense_category_id: null,
    matched_charge_category: billing ? billing.charge_category : null,
    collection_parts: resolved.parts,
  };
  const { error } = await (supabase as unknown as SupabaseClient).from('bank_statement_rows').update(changes).eq('id', row_id);
  if (error) return { data: null, error: error.message };

  await logAudit({
    action: 'ASSIGN',
    entityType: 'bank_statement_imports',
    entityId: row_id,
    entityDisplay: 'Statement row marked as a collection',
    newValues: changes,
    metadata: { row_id, billing_amount: remainder },
  });
  return { data: { billing_amount: remainder }, error: null };
}

export interface SplitPaymentResult extends CreatePaymentResult {
  collectionReceipts?: string[];
}

/**
 * Payment form: one payment from a resident, split into a billing part (the category on the form) and
 * one or more collection parts. The collection parts are recorded first; if the billing payment then
 * fails, they are reversed.
 */
export async function recordSplitPayment(payment: CreatePaymentInput, parts: CollectionPartInput[]): Promise<SplitPaymentResult> {
  const auth = await authorizePermission(PERMISSIONS.PAYMENTS_CREATE);
  if (!auth.authorized) return { error: auth.error || 'Unauthorized' };
  const collectionsAuth = await authorizePermission(PERMISSIONS.COLLECTIONS_MANAGE);
  if (!collectionsAuth.authorized) return { error: collectionsAuth.error || 'Unauthorized' };
  if (!payment?.resident_id || !payment.payment_date) return { error: 'Choose the resident and the payment date' };

  const client = db();
  const paymentDate = lagosDateString(payment.payment_date);
  const resolved = await resolveCollectionParts(client, parts, {
    payer: { kind: 'resident', resident_id: payment.resident_id },
    paymentDate,
    userId: auth.userId as string,
  });
  if ('error' in resolved) return { error: resolved.error };
  const billingAmount = billingRemainder(payment.amount, resolved.parts.map((part) => part.amount));
  if (billingAmount <= 0) return { error: 'The collection parts leave nothing for billing. Record the payment in Collections instead' };

  const groupId = crypto.randomUUID();
  const posted = await postCollectionParts(client, resolved.parts, {
    paymentDate,
    method: (payment.method || 'cash') as CollectionPaymentMethod,
    reference: payment.reference_number || null,
    notes: payment.notes || null,
    splitPaymentGroupId: groupId,
    userId: auth.userId,
  });
  if ('error' in posted) return { error: posted.error };

  // Client-supplied verification fields are dropped, as in createPayment.
  const { is_verified: _isVerified, bank_row_id: _bankRowId, ...rest } = payment;
  void _isVerified;
  void _bankRowId;
  const result = await createPaymentCore({ ...rest, amount: billingAmount, split_payment_group_id: groupId } as CreatePaymentInput);
  if (result.error || !result.data) {
    await reverseCollectionParts(client, posted.posted, `Billing part not recorded: ${result.error ?? 'unknown error'}`, auth.userId);
    return result;
  }
  await noticePostedParts(posted.posted);
  revalidatePath('/payments');
  revalidatePath('/collections');
  return { ...result, collectionReceipts: posted.posted.map((part: PostedCollectionPart) => part.receipt_number) };
}

const toCollectionSchema = z.object({
  collection_id: z.guid(),
  /** Defaults to the resident whose wallet the payment credited. */
  payer: payerSchema.optional().nullable(),
  quantity: z.coerce.number().int().positive().optional().nullable(),
  reason: reasonSchema,
});

export type MoveToCollectionInput = z.input<typeof toCollectionSchema>;

/**
 * Moves a payment recorded as billing to a collection, in one transaction: the payment's settlement (or
 * wallet credit) is reversed, the money is recorded as a collection payment and the payment record is
 * removed. Refused when the credit has been spent. Move it back with moveCollectionPaymentToBilling.
 */
export async function movePaymentToCollection(paymentId: string, input: MoveToCollectionInput): Promise<Result<{ collection_payment_id: string; receipt_number: string }>> {
  const auth = await authorizePermission(PERMISSIONS.PAYMENTS_DELETE);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };
  const collectionsAuth = await authorizePermission(PERMISSIONS.COLLECTIONS_MANAGE);
  if (!collectionsAuth.authorized) return { data: null, error: collectionsAuth.error || 'Unauthorized' };
  const parsed = toCollectionSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: firstIssue(parsed.error) };
  const values = parsed.data;

  const client = db();
  const { data: payment, error: paymentError } = await client
    .from('payment_records')
    .select('id, resident_id, house_id, amount, payment_date, status')
    .eq('id', paymentId)
    .maybeSingle();
  if (paymentError) return { data: null, error: paymentError.message };
  if (!payment) return { data: null, error: 'Payment not found' };
  const { data: collection, error: collectionError } = await client
    .from('collections')
    .select('id, name, collection_type, opens_on, closes_on, item_price, non_resident_price, is_active')
    .eq('id', values.collection_id)
    .maybeSingle();
  if (collectionError) return { data: null, error: collectionError.message };
  if (!collection) return { data: null, error: 'Collection not found' };
  const closed = collectionClosedReason(collection as Collection, payment.payment_date);
  if (closed) return { data: null, error: closed };

  const payerInput = values.payer ?? (payment.resident_id ? { kind: 'resident' as const, resident_id: payment.resident_id } : null);
  if (!payerInput) return { data: null, error: 'Choose the payer' };
  const payer = await findOrCreatePayer(client, payerInput, auth.userId as string);
  if ('error' in payer) return { data: null, error: payer.error };
  const priced = priceCollectionPayment(collection as Collection, { isResident: payer.isResident, quantity: values.quantity, amount: Number(payment.amount) });
  if ('error' in priced) return { data: null, error: priced.error };
  if (priced.amount !== Number(payment.amount)) {
    return { data: null, error: `${priced.quantity} items come to ${priced.amount}, not the payment amount ${Number(payment.amount)}` };
  }

  const { data, error } = await client.rpc('move_payment_to_collection', {
    p_payment_id: paymentId,
    p_collection_id: collection.id,
    p_payer_id: payer.id,
    p_house_id: payment.house_id,
    p_quantity: priced.quantity,
    p_unit_price: priced.unitPrice,
    p_reason: values.reason,
    p_actor: auth.userId,
  });
  if (error) return { data: null, error: error.message };
  const result = data as { collection_payment_id: string; receipt_number: string; payment: Record<string, unknown> };

  await logAudit({
    action: 'DELETE',
    entityType: 'payments',
    entityId: paymentId,
    entityDisplay: `Payment ₦${Number(payment.amount).toLocaleString()} moved to ${collection.name}`,
    oldValues: result.payment,
    description: `Moved to collection receipt ${result.receipt_number}: ${values.reason}`,
  });
  await logAudit({
    action: 'CREATE',
    entityType: 'collection_payments',
    entityId: result.collection_payment_id,
    entityDisplay: `${result.receipt_number} ${collection.name}, moved from a billing payment`,
    newValues: { collection_id: collection.id, payer_id: payer.id, amount: payment.amount, moved_from_payment_id: paymentId },
    description: values.reason,
  });
  revalidatePath('/payments');
  revalidatePath(`/collections/${collection.id}`);
  return { data: { collection_payment_id: result.collection_payment_id, receipt_number: result.receipt_number }, error: null };
}

const toBillingSchema = z.object({
  resident_id: z.guid('Choose the resident'),
  house_id: z.guid().optional().nullable().or(z.literal('')).transform((value) => value || null),
  charge_category: z.string().trim().min(1).default(DEFAULT_CHARGE_CATEGORY),
  reason: reasonSchema,
});

export type MoveToBillingInput = z.input<typeof toBillingSchema>;

/**
 * Moves a collection payment to billing, in one transaction: the collection payment is reversed, a
 * payment is recorded for the resident and it credits the wallet of the category, settling the
 * resident's eligible invoices like any new payment.
 */
export async function moveCollectionPaymentToBilling(collectionPaymentId: string, input: MoveToBillingInput): Promise<Result<{ payment_id: string }>> {
  const auth = await authorizePermission(PERMISSIONS.PAYMENTS_CREATE);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };
  const collectionsAuth = await authorizePermission(PERMISSIONS.COLLECTIONS_MANAGE);
  if (!collectionsAuth.authorized) return { data: null, error: collectionsAuth.error || 'Unauthorized' };
  const parsed = toBillingSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: firstIssue(parsed.error) };
  const values = parsed.data;

  const client = db();
  const { data: old, error: readError } = await client
    .from('collection_payments')
    .select('id, collection_id, receipt_number, amount, payment_date, reversed_at')
    .eq('id', collectionPaymentId)
    .maybeSingle();
  if (readError) return { data: null, error: readError.message };
  if (!old) return { data: null, error: 'Collection payment not found' };
  if (old.reversed_at) return { data: null, error: 'This collection payment was reversed' };
  const unknown = await activeChargeCategory(client, values.charge_category);
  if (unknown) return { data: null, error: unknown };
  if (values.house_id) {
    const membership = await residentHasHouse(client as never, values.resident_id, values.house_id);
    if (!membership.ok) return { data: null, error: membership.error || 'Invalid house for this resident' };
  }
  const eligible = await eligibleSettlementInvoiceIds(client, {
    residentId: values.resident_id,
    houseId: values.house_id,
    chargeCategory: values.charge_category,
    settlementDate: old.payment_date,
  });
  if (eligible.error) return { data: null, error: eligible.error };

  const { data, error } = await client.rpc('move_collection_payment_to_billing', {
    p_collection_payment_id: collectionPaymentId,
    p_resident_id: values.resident_id,
    p_house_id: values.house_id,
    p_charge_category: values.charge_category,
    p_invoice_ids: eligible.ids,
    p_reason: values.reason,
    p_actor: auth.userId,
  });
  if (error) return { data: null, error: error.message };
  const result = data as { payment_id: string };

  await logAudit({
    action: 'UPDATE',
    entityType: 'collection_payments',
    entityId: collectionPaymentId,
    entityDisplay: `${old.receipt_number} moved to billing`,
    oldValues: { reversed_at: null, amount: old.amount },
    newValues: { reversed_at: new Date().toISOString(), moved_to_payment_id: result.payment_id },
    description: `Moved to billing: ${values.reason}`,
  });
  await logAudit({
    action: 'CREATE',
    entityType: 'payments',
    entityId: result.payment_id,
    entityDisplay: `Payment ₦${Number(old.amount).toLocaleString()} moved from collection receipt ${old.receipt_number}`,
    newValues: {
      resident_id: values.resident_id,
      house_id: values.house_id,
      amount: old.amount,
      charge_category: values.charge_category,
      moved_from_collection_payment_id: collectionPaymentId,
    },
  });
  revalidatePath('/payments');
  revalidatePath(`/collections/${old.collection_id}`);
  return { data: { payment_id: result.payment_id }, error: null };
}
