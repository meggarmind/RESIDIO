'use server';

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { getChangedValues, logAudit } from '@/lib/audit/logger';
import { createAdminClient } from '@/lib/supabase/server';
import { fetchResidentOptions, type ResidentOption } from '@/lib/residents/resident-options';
import { normalizePhoneNumber } from '@/lib/sms/termii';
import { queueCollectionPaymentNotices, type CollectionNoticeResult } from '@/lib/collections/notify';
import {
  payerName,
  priceCollectionPayment,
  summarizeCollection,
  type Collection,
  type CollectionPayment,
  type CollectionSummary,
  type NotifiedParty,
} from '@/lib/collections/ledger';

/**
 * Collections ledger (#1194): contributions and item purchases, outside billing. Nothing here reads or
 * writes a wallet, an invoice or a payment record. Reads need collections.view, writes collections.manage.
 * The server uses the service role after the permission check, like recipient groups (#819).
 */

type Result<T> = { data: T | null; error: string | null };

const PATH = '/collections';

/** The collection tables are not in the generated types until the #1194 migration is applied and db:types re-run. */
const db = () => createAdminClient() as unknown as SupabaseClient;

const PAGE_SIZE = 1000;

/** PostgREST caps one response at max_rows, so read in ranges until a short page. */
async function readAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ data: T[]; error: string | null }> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) return { data: [], error: error.message };
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE_SIZE) return { data: rows, error: null };
  }
}

const COLLECTION_COLUMNS = 'id, name, description, collection_type, opens_on, closes_on, target_amount, item_price, non_resident_price, is_active, created_at';
const PAYMENT_COLUMNS = 'id, collection_id, payer_id, house_id, quantity, unit_price, amount, payment_date, method, reference, receipt_number, item_reference, notes, given_at, reversed_at, reversal_reason, created_at, payer:collection_payers(id, resident_id, full_name, phone, email, resident:residents(first_name, last_name, resident_code)), house:houses(house_number, short_name, street:streets(name))';
const PARTY_COLUMNS = 'id, collection_id, collection_payment_id, name, email, sms_phone, whatsapp_phone, channels';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a date');
const optionalText = z.string().trim().max(500).optional().nullable().transform((value) => value || null);
const money = z.coerce.number().positive();

const collectionSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter a name').max(120),
    description: optionalText,
    collection_type: z.enum(['contribution', 'item_purchase']),
    opens_on: isoDate,
    closes_on: isoDate.optional().nullable().or(z.literal('')).transform((value) => value || null),
    target_amount: money.optional().nullable(),
    item_price: money.optional().nullable(),
    non_resident_price: money.optional().nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.closes_on && value.closes_on < value.opens_on) {
      ctx.addIssue({ code: 'custom', path: ['closes_on'], message: 'The close date is before the open date' });
    }
    if (value.collection_type === 'item_purchase' && !value.item_price) {
      ctx.addIssue({ code: 'custom', path: ['item_price'], message: 'Enter the price per item' });
    }
  })
  .transform((value) =>
    value.collection_type === 'item_purchase'
      ? { ...value, target_amount: null, item_price: value.item_price ?? null, non_resident_price: value.non_resident_price ?? null }
      : { ...value, target_amount: value.target_amount ?? null, item_price: null, non_resident_price: null }
  );

export type CollectionInput = z.input<typeof collectionSchema>;

const partySchema = z
  .object({
    name: z.string().trim().min(1, 'Enter a name').max(120),
    email: z.email('Enter a valid email').optional().nullable().or(z.literal('')).transform((value) => value || null),
    sms_phone: optionalText,
    whatsapp_phone: optionalText,
    channels: z.array(z.enum(['email', 'sms', 'whatsapp'])).min(1, 'Choose at least one channel'),
  })
  .superRefine((value, ctx) => {
    if (value.channels.includes('email') && !value.email) ctx.addIssue({ code: 'custom', path: ['email'], message: 'Enter an email for the email channel' });
    if (value.channels.includes('sms') && !value.sms_phone) ctx.addIssue({ code: 'custom', path: ['sms_phone'], message: 'Enter a phone number for SMS' });
    if (value.channels.includes('whatsapp') && !value.whatsapp_phone) ctx.addIssue({ code: 'custom', path: ['whatsapp_phone'], message: 'Enter a phone number for WhatsApp' });
  });

export type NotifiedPartyInput = z.input<typeof partySchema>;

const paymentSchema = z.object({
  collection_id: z.guid(),
  payer: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('resident'), resident_id: z.guid() }),
    z.object({
      kind: z.literal('non_resident'),
      full_name: z.string().trim().min(1, 'Enter the payer name').max(120),
      phone: optionalText,
      email: z.email('Enter a valid email').optional().nullable().or(z.literal('')).transform((value) => value || null),
    }),
  ]),
  house_id: z.guid().optional().nullable().or(z.literal('')).transform((value) => value || null),
  quantity: z.coerce.number().int().positive().optional().nullable(),
  amount: z.coerce.number().positive().optional().nullable(),
  payment_date: isoDate,
  method: z.enum(['cash', 'bank_transfer', 'pos', 'cheque', 'online']),
  reference: optionalText,
  item_reference: optionalText,
  notes: optionalText,
  notified_party: partySchema.optional().nullable(),
});

export type CollectionPaymentInput = z.input<typeof paymentSchema>;

const firstIssue = (error: z.ZodError) => error.issues[0]?.message ?? 'Check the form';
const writeError = (error: { code?: string; message: string }) =>
  error.code === '23505' ? 'A collection with that name already exists' : error.message;

export type CollectionListItem = Collection & { summary: CollectionSummary };

export async function getCollections(): Promise<Result<CollectionListItem[]>> {
  const auth = await authorizePermission(PERMISSIONS.COLLECTIONS_VIEW);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };

  const client = db();
  const [collections, payments] = await Promise.all([
    client.from('collections').select(COLLECTION_COLUMNS).order('opens_on', { ascending: false }),
    readAll((from, to) =>
      client.from('collection_payments').select('id, collection_id, payer_id, amount, quantity, given_at, reversed_at').order('id').range(from, to),
    ),
  ]);
  if (collections.error) return { data: null, error: collections.error.message };
  if (payments.error) return { data: null, error: payments.error };

  const byCollection = new Map<string, Array<Pick<CollectionPayment, 'payer_id' | 'amount' | 'quantity' | 'given_at' | 'reversed_at'>>>();
  for (const payment of payments.data as unknown as Array<CollectionPayment>) {
    byCollection.set(payment.collection_id, [...(byCollection.get(payment.collection_id) ?? []), payment]);
  }
  return {
    data: ((collections.data ?? []) as Collection[]).map((collection) => ({
      ...collection,
      summary: summarizeCollection(collection, byCollection.get(collection.id) ?? []),
    })),
    error: null,
  };
}

export interface CollectionDetail {
  collection: Collection;
  summary: CollectionSummary;
  payments: CollectionPayment[];
  /** Parties on the collection (every payment). */
  notifiedParties: NotifiedParty[];
  /** Parties on one payment, by payment id. */
  paymentParties: Record<string, NotifiedParty[]>;
}

export async function getCollection(id: string): Promise<Result<CollectionDetail>> {
  const auth = await authorizePermission(PERMISSIONS.COLLECTIONS_VIEW);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };

  const client = db();
  const { data: collection, error } = await client.from('collections').select(COLLECTION_COLUMNS).eq('id', id).maybeSingle();
  if (error) return { data: null, error: error.message };
  if (!collection) return { data: null, error: 'Collection not found' };

  const payments = await readAll((from, to) =>
    client.from('collection_payments').select(PAYMENT_COLUMNS).eq('collection_id', id).order('payment_date', { ascending: false }).order('created_at', { ascending: false }).order('id').range(from, to),
  );
  if (payments.error) return { data: null, error: payments.error };

  const paymentRows = payments.data as unknown as CollectionPayment[];
  const partyReads = [
    readAll((from, to) => client.from('collection_notified_parties').select(PARTY_COLUMNS).eq('collection_id', id).order('created_at').order('id').range(from, to)),
  ];
  for (let i = 0; i < paymentRows.length; i += 100) {
    const ids = paymentRows.slice(i, i + 100).map((payment) => payment.id);
    partyReads.push(
      readAll((from, to) => client.from('collection_notified_parties').select(PARTY_COLUMNS).in('collection_payment_id', ids).order('created_at').order('id').range(from, to)),
    );
  }
  const parties = { data: [] as NotifiedParty[], error: null as string | null };
  for (const read of await Promise.all(partyReads)) {
    if (read.error) return { data: null, error: read.error };
    parties.data.push(...(read.data as unknown as NotifiedParty[]));
  }
  const paymentIds = new Set(paymentRows.map((payment) => payment.id));
  const paymentParties: Record<string, NotifiedParty[]> = {};
  const notifiedParties: NotifiedParty[] = [];
  for (const party of parties.data) {
    if (party.collection_id === id) notifiedParties.push(party);
    else if (party.collection_payment_id && paymentIds.has(party.collection_payment_id)) {
      (paymentParties[party.collection_payment_id] ??= []).push(party);
    }
  }
  return {
    data: {
      collection: collection as Collection,
      summary: summarizeCollection(collection as Collection, paymentRows),
      payments: paymentRows,
      notifiedParties,
      paymentParties,
    },
    error: null,
  };
}

export interface PayerOptions {
  residents: ResidentOption[];
  houses: Array<{ id: string; label: string }>;
  /** Earlier non-resident payers, so the next payment from the same person reuses the record. */
  nonResidents: Array<{ id: string; full_name: string; phone: string | null; email: string | null }>;
}

/** Picker sources for the record payment form. Needs collections.manage: it lists non-resident contacts. */
export async function getCollectionPayerOptions(): Promise<Result<PayerOptions>> {
  const auth = await authorizePermission(PERMISSIONS.COLLECTIONS_MANAGE);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };

  const client = createAdminClient();
  const [residents, houses, payers] = await Promise.all([
    fetchResidentOptions(client),
    client.from('houses').select('id, house_number, short_name, street:streets(name)').eq('is_active', true).order('house_number'),
    db().from('collection_payers').select('id, full_name, phone, email').is('resident_id', null).order('full_name'),
  ]);
  if (residents.error) return { data: null, error: residents.error };
  if (houses.error) return { data: null, error: houses.error.message };
  if (payers.error) return { data: null, error: payers.error.message };
  return {
    data: {
      residents: residents.data,
      houses: ((houses.data ?? []) as unknown as Array<{ id: string; house_number: string; short_name: string | null; street: { name: string } | null }>).map((house) => ({
        id: house.id,
        label: house.short_name || [house.house_number, house.street?.name].filter(Boolean).join(' '),
      })),
      nonResidents: (payers.data ?? []) as PayerOptions['nonResidents'],
    },
    error: null,
  };
}

export async function createCollection(input: CollectionInput): Promise<Result<{ id: string }>> {
  const auth = await authorizePermission(PERMISSIONS.COLLECTIONS_MANAGE);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };
  const parsed = collectionSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: firstIssue(parsed.error) };

  const { data, error } = await db()
    .from('collections')
    .insert({ ...parsed.data, created_by: auth.userId, updated_by: auth.userId })
    .select(COLLECTION_COLUMNS)
    .single();
  if (error || !data) return { data: null, error: error ? writeError(error) : 'Could not create the collection' };

  await logAudit({
    action: 'CREATE',
    entityType: 'collections',
    entityId: data.id,
    entityDisplay: data.name,
    newValues: parsed.data,
  });
  revalidatePath(PATH);
  return { data: { id: data.id }, error: null };
}

/** Changes a collection's details. The type is fixed once made, so it is not part of the update. */
export async function updateCollection(id: string, input: CollectionInput & { is_active?: boolean }): Promise<Result<{ id: string }>> {
  const auth = await authorizePermission(PERMISSIONS.COLLECTIONS_MANAGE);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };

  const client = db();
  const { data: old, error: readError } = await client.from('collections').select(COLLECTION_COLUMNS).eq('id', id).maybeSingle();
  if (readError) return { data: null, error: readError.message };
  if (!old) return { data: null, error: 'Collection not found' };

  const parsed = collectionSchema.safeParse({ ...input, collection_type: old.collection_type });
  if (!parsed.success) return { data: null, error: firstIssue(parsed.error) };
  const { name, description, opens_on, closes_on, target_amount, item_price, non_resident_price } = parsed.data;
  const changes = {
    name, description, opens_on, closes_on, target_amount, item_price, non_resident_price,
    ...(typeof input.is_active === 'boolean' ? { is_active: input.is_active } : {}),
  };

  const { data, error } = await client
    .from('collections')
    .update({ ...changes, updated_by: auth.userId })
    .eq('id', id)
    .select(COLLECTION_COLUMNS)
    .single();
  if (error || !data) return { data: null, error: error ? writeError(error) : 'Could not update the collection' };

  const changed = getChangedValues(old, data);
  await logAudit({
    action: 'UPDATE',
    entityType: 'collections',
    entityId: id,
    entityDisplay: data.name,
    oldValues: changed.old,
    newValues: changed.new,
  });
  revalidatePath(PATH);
  revalidatePath(`${PATH}/${id}`);
  return { data: { id }, error: null };
}

/** A resident's payer row, or a non-resident's: reused when the phone or email matches an earlier payer. */
async function findOrCreatePayer(
  client: SupabaseClient,
  payer: z.output<typeof paymentSchema>['payer'],
  userId: string
): Promise<{ id: string; isResident: boolean } | { error: string }> {
  if (payer.kind === 'resident') {
    const { data: resident, error: residentError } = await client.from('residents').select('id').eq('id', payer.resident_id).maybeSingle();
    if (residentError) return { error: residentError.message };
    if (!resident) return { error: 'Resident not found' };
    const { data: existing, error: existingError } = await client.from('collection_payers').select('id').eq('resident_id', payer.resident_id).maybeSingle();
    if (existingError) return { error: existingError.message };
    if (existing) return { id: existing.id, isResident: true };
    const { data, error } = await client
      .from('collection_payers')
      .insert({ resident_id: payer.resident_id, created_by: userId })
      .select('id')
      .single();
    return error || !data ? { error: error?.message ?? 'Could not record the payer' } : { id: data.id, isResident: true };
  }

  const phone = payer.phone ? normalizePhoneNumber(payer.phone) : null;
  const email = payer.email?.toLowerCase() ?? null;
  if (phone || email) {
    const filters = [phone && `phone.eq.${phone}`, email && `email.eq.${email}`].filter(Boolean).join(',');
    const { data: existing, error } = await client.from('collection_payers').select('id').is('resident_id', null).or(filters).limit(1);
    if (error) return { error: error.message };
    if (existing?.[0]) return { id: existing[0].id, isResident: false };
  }
  const { data, error } = await client
    .from('collection_payers')
    .insert({ full_name: payer.full_name, phone, email, created_by: userId })
    .select('id')
    .single();
  return error || !data ? { error: error?.message ?? 'Could not record the payer' } : { id: data.id, isResident: false };
}

export interface RecordedCollectionPayment {
  id: string;
  receipt_number: string;
  notices: CollectionNoticeResult;
}

export async function recordCollectionPayment(input: CollectionPaymentInput): Promise<Result<RecordedCollectionPayment>> {
  const auth = await authorizePermission(PERMISSIONS.COLLECTIONS_MANAGE);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: firstIssue(parsed.error) };
  const values = parsed.data;

  const client = db();
  const { data: collection, error: collectionError } = await client.from('collections').select(COLLECTION_COLUMNS).eq('id', values.collection_id).maybeSingle();
  if (collectionError) return { data: null, error: collectionError.message };
  if (!collection) return { data: null, error: 'Collection not found' };
  if (!collection.is_active) return { data: null, error: 'This collection is closed to new payments' };
  if (values.payment_date < collection.opens_on) return { data: null, error: 'The payment date is before the collection opens' };
  if (collection.closes_on && values.payment_date > collection.closes_on) return { data: null, error: 'The payment date is after the collection closes' };
  if (values.notified_party && collection.collection_type !== 'item_purchase') {
    return { data: null, error: 'A notified party can be added to an item purchase only' };
  }

  const payer = await findOrCreatePayer(client, values.payer, auth.userId as string);
  if ('error' in payer) return { data: null, error: payer.error };

  const priced = priceCollectionPayment(collection as Collection, { isResident: payer.isResident, quantity: values.quantity, amount: values.amount });
  if ('error' in priced) return { data: null, error: priced.error };

  const { data: payment, error } = await client
    .from('collection_payments')
    .insert({
      collection_id: collection.id,
      payer_id: payer.id,
      house_id: values.house_id,
      quantity: priced.quantity,
      unit_price: priced.unitPrice,
      amount: priced.amount,
      payment_date: values.payment_date,
      method: values.method,
      reference: values.reference,
      item_reference: collection.collection_type === 'item_purchase' ? values.item_reference : null,
      notes: values.notes,
      recorded_by: auth.userId,
    })
    .select(PAYMENT_COLUMNS)
    .single();
  if (error || !payment) return { data: null, error: error?.message ?? 'Could not record the payment' };
  const row = payment as unknown as CollectionPayment;

  await logAudit({
    action: 'CREATE',
    entityType: 'collection_payments',
    entityId: row.id,
    entityDisplay: `${row.receipt_number} ${collection.name} from ${payerName(row.payer)}`,
    newValues: {
      collection_id: row.collection_id,
      payer_id: row.payer_id,
      house_id: row.house_id,
      quantity: row.quantity,
      unit_price: row.unit_price,
      amount: row.amount,
      payment_date: row.payment_date,
      method: row.method,
      reference: row.reference,
      receipt_number: row.receipt_number,
    },
  });

  if (values.notified_party) {
    const party = partySchema.parse(values.notified_party);
    const { data: partyRow, error: partyError } = await client
      .from('collection_notified_parties')
      .insert({ ...party, collection_payment_id: row.id, created_by: auth.userId })
      .select('id')
      .single();
    if (partyError || !partyRow) {
      // The payment stands; the admin is told the party was not saved.
      return {
        data: { id: row.id, receipt_number: row.receipt_number, notices: { queued: 0, skipped: [`Notified party not saved: ${partyError?.message ?? 'unknown error'}`] } },
        error: null,
      };
    }
    await logAudit({
      action: 'CREATE',
      entityType: 'collection_notified_parties',
      entityId: partyRow.id,
      entityDisplay: `${party.name} for ${row.receipt_number}`,
      newValues: { ...party, collection_payment_id: row.id },
    });
  }

  const notices = await queueCollectionPaymentNotices(row.id);
  revalidatePath(PATH);
  revalidatePath(`${PATH}/${collection.id}`);
  return { data: { id: row.id, receipt_number: row.receipt_number, notices }, error: null };
}

/** Marks the items of one item purchase payment as given to the payer, or takes the mark back. */
export async function setCollectionItemGiven(paymentId: string, given: boolean): Promise<Result<{ id: string }>> {
  const auth = await authorizePermission(PERMISSIONS.COLLECTIONS_MANAGE);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };

  const client = db();
  const { data: old, error: readError } = await client
    .from('collection_payments')
    .select('id, collection_id, receipt_number, quantity, given_at, given_by, reversed_at')
    .eq('id', paymentId)
    .maybeSingle();
  if (readError) return { data: null, error: readError.message };
  if (!old) return { data: null, error: 'Payment not found' };
  if (old.quantity == null) return { data: null, error: 'Only an item purchase has items to give' };
  if (old.reversed_at) return { data: null, error: 'This payment was reversed' };

  const changes = given ? { given_at: new Date().toISOString(), given_by: auth.userId } : { given_at: null, given_by: null };
  const { error } = await client.from('collection_payments').update(changes).eq('id', paymentId);
  if (error) return { data: null, error: error.message };

  await logAudit({
    action: 'UPDATE',
    entityType: 'collection_payments',
    entityId: paymentId,
    entityDisplay: `${old.receipt_number} items ${given ? 'given' : 'not given'}`,
    oldValues: { given_at: old.given_at, given_by: old.given_by },
    newValues: changes,
  });
  revalidatePath(`${PATH}/${old.collection_id}`);
  return { data: { id: paymentId }, error: null };
}

/** Reverses a payment recorded wrongly. The row stays, out of every total, with who reversed it and why. */
export async function reverseCollectionPayment(paymentId: string, reason: string): Promise<Result<{ id: string }>> {
  const auth = await authorizePermission(PERMISSIONS.COLLECTIONS_MANAGE);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };
  const why = reason?.trim();
  if (!why) return { data: null, error: 'Enter the reason for the reversal' };

  const client = db();
  const { data: old, error: readError } = await client
    .from('collection_payments')
    .select('id, collection_id, receipt_number, amount, reversed_at')
    .eq('id', paymentId)
    .maybeSingle();
  if (readError) return { data: null, error: readError.message };
  if (!old) return { data: null, error: 'Payment not found' };
  if (old.reversed_at) return { data: null, error: 'This payment is already reversed' };

  const changes = { reversed_at: new Date().toISOString(), reversed_by: auth.userId, reversal_reason: why };
  const { error } = await client.from('collection_payments').update(changes).eq('id', paymentId).is('reversed_at', null);
  if (error) return { data: null, error: error.message };

  await logAudit({
    action: 'UPDATE',
    entityType: 'collection_payments',
    entityId: paymentId,
    entityDisplay: `${old.receipt_number} reversed`,
    oldValues: { reversed_at: null, amount: old.amount },
    newValues: changes,
    description: `Reversed collection payment ${old.receipt_number}: ${why}`,
  });
  revalidatePath(PATH);
  revalidatePath(`${PATH}/${old.collection_id}`);
  return { data: { id: paymentId }, error: null };
}

/** Adds a party told about every payment into an item purchase collection. */
export async function addCollectionNotifiedParty(collectionId: string, input: NotifiedPartyInput): Promise<Result<{ id: string }>> {
  const auth = await authorizePermission(PERMISSIONS.COLLECTIONS_MANAGE);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };
  const parsed = partySchema.safeParse(input);
  if (!parsed.success) return { data: null, error: firstIssue(parsed.error) };

  const client = db();
  const { data: collection, error: readError } = await client.from('collections').select('id, name, collection_type').eq('id', collectionId).maybeSingle();
  if (readError) return { data: null, error: readError.message };
  if (!collection) return { data: null, error: 'Collection not found' };
  if (collection.collection_type !== 'item_purchase') return { data: null, error: 'A notified party can be added to an item purchase collection only' };

  const { data, error } = await client
    .from('collection_notified_parties')
    .insert({ ...parsed.data, collection_id: collectionId, created_by: auth.userId })
    .select('id')
    .single();
  if (error || !data) return { data: null, error: error?.message ?? 'Could not add the notified party' };

  await logAudit({
    action: 'CREATE',
    entityType: 'collection_notified_parties',
    entityId: data.id,
    entityDisplay: `${parsed.data.name} for ${collection.name}`,
    newValues: { ...parsed.data, collection_id: collectionId },
  });
  revalidatePath(`${PATH}/${collectionId}`);
  return { data: { id: data.id }, error: null };
}

export async function removeCollectionNotifiedParty(partyId: string): Promise<Result<{ id: string }>> {
  const auth = await authorizePermission(PERMISSIONS.COLLECTIONS_MANAGE);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };

  const client = db();
  const { data: old, error: readError } = await client.from('collection_notified_parties').select(PARTY_COLUMNS).eq('id', partyId).maybeSingle();
  if (readError) return { data: null, error: readError.message };
  if (!old) return { data: null, error: 'Notified party not found' };

  const { error } = await client.from('collection_notified_parties').delete().eq('id', partyId);
  if (error) return { data: null, error: error.message };

  await logAudit({
    action: 'DELETE',
    entityType: 'collection_notified_parties',
    entityId: partyId,
    entityDisplay: old.name,
    oldValues: old,
  });
  if (old.collection_id) revalidatePath(`${PATH}/${old.collection_id}`);
  return { data: { id: partyId }, error: null };
}
