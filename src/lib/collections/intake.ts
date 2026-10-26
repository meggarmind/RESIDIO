import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { logAudit } from '@/lib/audit/logger';
import { queueCollectionPaymentNotices } from '@/lib/collections/notify';
import { findOrCreatePayer, type PayerInput } from '@/lib/collections/payers';
import {
  collectionClosedReason,
  priceCollectionPayment,
  type Collection,
  type CollectionPaymentMethod,
} from '@/lib/collections/ledger';

/**
 * Collections intake (#1195): collection parts of a bank line or of a payment split between billing and
 * collections. Not a server action: the callers check the permissions first. A collection part never
 * credits a wallet.
 */

/** A part as the admin enters it. An item purchase takes a quantity, a contribution an amount. */
export const collectionPartInputSchema = z.object({
  collection_id: z.guid(),
  quantity: z.coerce.number().int().positive().optional().nullable(),
  amount: z.coerce.number().positive().optional().nullable(),
  house_id: z.guid().optional().nullable().or(z.literal('')).transform((value) => value || null),
});

export type CollectionPartInput = z.input<typeof collectionPartInputSchema>;

/** A priced part, as stored in bank_statement_rows.collection_parts. */
export interface CollectionPart {
  collection_id: string;
  payer_id: string;
  house_id: string | null;
  quantity: number | null;
  unit_price: number | null;
  amount: number;
}

const COLLECTION_COLUMNS = 'id, name, collection_type, opens_on, closes_on, item_price, non_resident_price, is_active';

/** Checks each collection is open on paymentDate, records the payer and prices each part. */
export async function resolveCollectionParts(
  client: SupabaseClient,
  inputs: CollectionPartInput[],
  options: { payer: PayerInput; paymentDate: string; userId: string }
): Promise<{ parts: CollectionPart[] } | { error: string }> {
  if (inputs.length === 0) return { error: 'Add at least one collection part' };
  const parsed = z.array(collectionPartInputSchema).safeParse(inputs);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the collection parts' };

  const ids = [...new Set(parsed.data.map((part) => part.collection_id))];
  const { data: collections, error } = await client.from('collections').select(COLLECTION_COLUMNS).in('id', ids);
  if (error) return { error: error.message };
  const byId = new Map(((collections ?? []) as Collection[]).map((collection) => [collection.id, collection]));

  const payer = await findOrCreatePayer(client, options.payer, options.userId);
  if ('error' in payer) return { error: payer.error };

  const parts: CollectionPart[] = [];
  for (const input of parsed.data) {
    const collection = byId.get(input.collection_id);
    if (!collection) return { error: 'Collection not found' };
    const closed = collectionClosedReason(collection, options.paymentDate);
    if (closed) return { error: `${collection.name}: ${closed}` };
    const priced = priceCollectionPayment(collection, { isResident: payer.isResident, quantity: input.quantity, amount: input.amount });
    if ('error' in priced) return { error: `${collection.name}: ${priced.error}` };
    parts.push({
      collection_id: collection.id,
      payer_id: payer.id,
      house_id: input.house_id,
      quantity: priced.quantity,
      unit_price: priced.unitPrice,
      amount: priced.amount,
    });
  }
  return { parts };
}

export interface PostedCollectionPart {
  id: string;
  receipt_number: string;
  amount: number;
}

/**
 * Records one collection payment per part, in order. When one fails, the parts already recorded are
 * reversed, so a failed post leaves no live collection payment.
 */
export async function postCollectionParts(
  client: SupabaseClient,
  parts: CollectionPart[],
  context: {
    paymentDate: string;
    method: CollectionPaymentMethod;
    reference: string | null;
    notes: string | null;
    bankRowId?: string | null;
    splitPaymentGroupId?: string | null;
    userId: string | null;
  }
): Promise<{ posted: PostedCollectionPart[] } | { error: string }> {
  const ids = [...new Set(parts.map((part) => part.collection_id))];
  const { data: collections, error: readError } = await client.from('collections').select(COLLECTION_COLUMNS).in('id', ids);
  if (readError) return { error: readError.message };
  const byId = new Map(((collections ?? []) as Collection[]).map((collection) => [collection.id, collection]));
  for (const part of parts) {
    const collection = byId.get(part.collection_id);
    if (!collection) return { error: 'Collection not found' };
    const closed = collectionClosedReason(collection, context.paymentDate);
    if (closed) return { error: `${collection.name}: ${closed}` };
  }

  const posted: PostedCollectionPart[] = [];
  for (const part of parts) {
    const { data, error } = await client
      .from('collection_payments')
      .insert({
        collection_id: part.collection_id,
        payer_id: part.payer_id,
        house_id: part.house_id,
        quantity: part.quantity,
        unit_price: part.unit_price,
        amount: part.amount,
        payment_date: context.paymentDate,
        method: context.method,
        reference: context.reference,
        bank_row_id: context.bankRowId ?? null,
        split_payment_group_id: context.splitPaymentGroupId ?? null,
        notes: context.notes,
        recorded_by: context.userId,
      })
      .select('id, receipt_number, amount')
      .single();
    if (error || !data) {
      const reason = error?.message ?? 'Could not record the collection payment';
      await reverseCollectionParts(client, posted, `Not recorded: ${reason}`, context.userId);
      return { error: reason };
    }
    const row = { id: data.id as string, receipt_number: data.receipt_number as string, amount: Number(data.amount) };
    posted.push(row);
    await logAudit({
      action: 'CREATE',
      entityType: 'collection_payments',
      entityId: row.id,
      entityDisplay: `${row.receipt_number} ${byId.get(part.collection_id)?.name ?? ''}`.trim(),
      newValues: {
        ...part,
        payment_date: context.paymentDate,
        method: context.method,
        reference: context.reference,
        bank_row_id: context.bankRowId ?? null,
        split_payment_group_id: context.splitPaymentGroupId ?? null,
        receipt_number: row.receipt_number,
      },
    });
  }
  return { posted };
}

/** Takes back collection payments recorded for a bank line or a split payment whose other part failed. */
export async function reverseCollectionParts(
  client: SupabaseClient,
  posted: PostedCollectionPart[],
  reason: string,
  userId: string | null
): Promise<void> {
  for (const part of posted) {
    const changes = { reversed_at: new Date().toISOString(), reversed_by: userId, reversal_reason: reason };
    const { error } = await client.from('collection_payments').update(changes).eq('id', part.id).is('reversed_at', null);
    if (error) {
      console.error('[collections intake] could not reverse collection payment', part.id, error);
      continue;
    }
    await logAudit({
      action: 'UPDATE',
      entityType: 'collection_payments',
      entityId: part.id,
      entityDisplay: `${part.receipt_number} reversed`,
      oldValues: { reversed_at: null, amount: part.amount },
      newValues: changes,
      description: `Reversed collection payment ${part.receipt_number}: ${reason}`,
    });
  }
}

/** Payer receipts and notified-party messages for each posted part. Failures are logged, never thrown. */
export async function noticePostedParts(posted: PostedCollectionPart[]): Promise<void> {
  for (const part of posted) {
    try {
      await queueCollectionPaymentNotices(part.id);
    } catch (error) {
      console.error('[collections intake] could not queue notices for', part.receipt_number, error);
    }
  }
}
