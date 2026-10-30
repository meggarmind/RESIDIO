import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/server';
import { addToQueue, PRIORITY } from '@/lib/notifications/queue';
import { isChannelImplemented } from '@/lib/notifications/types';
import { normalizePhoneNumber } from '@/lib/sms/termii';
import { buildNotice } from '@/lib/whatsapp/build-notice';
import { isWhatsAppOptedIn } from '@/lib/whatsapp/opt-in';
import { RESIDENT_SEND_METADATA_KEY, type ResidentSendPayload } from '@/lib/whatsapp/resident-send';
import {
  buildNotifiedPartyMessage,
  buildPayerReceiptMessage,
  payerName,
  planNotifiedPartyNotices,
  type CollectionNoticeFacts,
  type CollectionPayer,
  type CollectionType,
  type NotifiedParty,
} from '@/lib/collections/ledger';

/** The collection tables are not in the generated types until the #1194 migration is applied and db:types re-run. */
const db = () => createAdminClient() as unknown as SupabaseClient;

export interface CollectionNoticeResult {
  queued: number;
  /** One line per channel left out, for the admin: "Fleet manager (WhatsApp): the WhatsApp number has not opted in". */
  skipped: string[];
}

const CHANNEL_LABELS = { email: 'email', sms: 'SMS', whatsapp: 'WhatsApp' } as const;

/** The resident who opted in to WhatsApp with this number, or null. Fails closed. */
async function optedInResidentFor(phone: string): Promise<string | null> {
  const { data, error } = await db()
    .from('whatsapp_optins')
    .select('resident_id')
    .eq('phone_number', normalizePhoneNumber(phone))
    .eq('opted_in', true)
    .is('deactivated_at', null)
    .limit(1);
  if (error) {
    console.error('[collections] WhatsApp opt-in lookup failed; treating as not opted in', { error });
    return null;
  }
  return (data?.[0] as { resident_id: string } | undefined)?.resident_id ?? null;
}

async function queueEmail(seed: string, email: string, message: { subject: string; body: string }, recipientId: string | null) {
  return addToQueue({
    recipient_id: recipientId,
    recipient_email: email,
    channel: 'email',
    subject: message.subject,
    body: message.body,
    priority: PRIORITY.NORMAL,
    deduplication_key: seed,
    metadata: { collection_notice: seed },
  });
}

async function queueWhatsApp(seed: string, residentId: string, phone: string, body: string) {
  // A system message to a resident (#1044): the queue runs the send policy (opt-in included) again at send time.
  return addToQueue({
    recipient_id: residentId,
    recipient_phone: phone,
    channel: 'whatsapp',
    body,
    priority: PRIORITY.NORMAL,
    deduplication_key: seed,
    metadata: { [RESIDENT_SEND_METADATA_KEY]: { seed } satisfies ResidentSendPayload, collection_notice: seed },
  });
}

/**
 * Queues the payer's receipt and the notified parties' messages for one newly recorded payment. Never
 * throws: the payment is already recorded, and a failed message shows in the notification history.
 */
export async function queueCollectionPaymentNotices(paymentId: string): Promise<CollectionNoticeResult> {
  const result: CollectionNoticeResult = { queued: 0, skipped: [] };
  try {
    const client = db();
    const { data: payment, error } = await client
      .from('collection_payments')
      .select('id, collection_id, quantity, amount, payment_date, reference, receipt_number, collection:collections(name, collection_type), payer:collection_payers(id, resident_id, full_name, phone, email, resident:residents(first_name, last_name, resident_code, email, phone_primary))')
      .eq('id', paymentId)
      .single();
    if (error || !payment) {
      console.error('[collections] Payment not found for notices', { paymentId, error });
      return result;
    }
    const row = payment as unknown as {
      id: string; collection_id: string; quantity: number | null; amount: number; payment_date: string;
      reference: string | null; receipt_number: string;
      collection: { name: string; collection_type: CollectionType };
      payer: (CollectionPayer & { resident: (CollectionPayer['resident'] & { email: string | null; phone_primary: string | null }) | null }) | null;
    };
    const facts: CollectionNoticeFacts = {
      payerName: payerName(row.payer),
      collectionName: row.collection.name,
      collectionType: row.collection.collection_type,
      quantity: row.quantity,
      amount: Number(row.amount),
      paymentDate: row.payment_date,
      receiptNumber: row.receipt_number,
      reference: row.reference,
    };

    const count = (queued: { success: boolean; isDuplicate?: boolean; error?: string }, label: string) => {
      if (queued.success) result.queued++;
      else if (!queued.isDuplicate) result.skipped.push(`${label}: ${queued.error ?? 'could not be queued'}`);
    };

    // The payer's receipt, by email and WhatsApp when the system has them.
    const receipt = buildPayerReceiptMessage(facts);
    const payerEmail = row.payer?.resident?.email || row.payer?.email;
    if (payerEmail) {
      count(await queueEmail(`collection-receipt:${row.id}:email`, payerEmail, receipt, row.payer?.resident_id ?? null), 'Receipt (email)');
    }
    const payerPhone = row.payer?.resident?.phone_primary || row.payer?.phone;
    if (payerPhone) {
      const residentId = row.payer?.resident_id
        ? ((await isWhatsAppOptedIn(row.payer.resident_id, payerPhone)) ? row.payer.resident_id : null)
        : await optedInResidentFor(payerPhone);
      if (residentId) {
        const body = await buildNotice('payment_received', receipt.body);
        count(await queueWhatsApp(`collection-receipt:${row.id}:whatsapp`, residentId, payerPhone, body), 'Receipt (WhatsApp)');
      }
    }

    // Notified parties: on the collection (every payment) and on this payment (this payment only).
    if (row.collection.collection_type !== 'item_purchase') return result;
    const { data: parties, error: partiesError } = await client
      .from('collection_notified_parties')
      .select('id, collection_id, collection_payment_id, name, email, sms_phone, whatsapp_phone, channels')
      .or(`collection_id.eq.${row.collection_id},collection_payment_id.eq.${row.id}`)
      .order('created_at');
    if (partiesError) {
      result.skipped.push(`Notified parties: ${partiesError.message}`);
      return result;
    }
    const message = buildNotifiedPartyMessage(facts);
    const plan = await planNotifiedPartyNotices((parties ?? []) as NotifiedParty[], optedInResidentFor, isChannelImplemented('sms'));
    const names = new Map(((parties ?? []) as NotifiedParty[]).map((party) => [party.id, party.name]));
    for (const notice of plan) {
      const label = `${names.get(notice.partyId) ?? 'Notified party'} (${CHANNEL_LABELS[notice.channel]})`;
      if (notice.kind === 'skip') {
        result.skipped.push(`${label}: ${notice.reason}`);
      } else if (notice.channel === 'email') {
        count(await queueEmail(`collection-notice:${row.id}:${notice.partyId}:email`, notice.email, message, null), label);
      } else {
        count(await queueWhatsApp(`collection-notice:${row.id}:${notice.partyId}:whatsapp`, notice.residentId, notice.phone, await buildNotice('estate_notice', message.body)), label);
      }
    }
  } catch (error) {
    console.error('[collections] Notices could not be queued', { paymentId, error });
    result.skipped.push('Messages could not be queued');
  }
  return result;
}
