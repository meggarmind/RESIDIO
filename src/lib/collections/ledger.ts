import { formatCurrency } from '@/lib/utils';
import { formatDay } from '@/lib/whatsapp/assistant-format';

/**
 * Collections ledger (#1194): money the estate collects outside billing. A collection payment never
 * touches a wallet or an invoice. Pure helpers only; the server actions and the notifier use them.
 */

export type CollectionType = 'contribution' | 'item_purchase';
export type NotifiedChannel = 'email' | 'sms' | 'whatsapp';
export type CollectionPaymentMethod = 'cash' | 'bank_transfer' | 'pos' | 'cheque' | 'online';

export const COLLECTION_TYPE_LABELS: Record<CollectionType, string> = {
  contribution: 'Contribution',
  item_purchase: 'Item purchase',
};

export const COLLECTION_PAYMENT_METHOD_LABELS: Record<CollectionPaymentMethod, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank transfer',
  pos: 'POS',
  cheque: 'Cheque',
  online: 'Online',
};

export interface Collection {
  id: string;
  name: string;
  description: string | null;
  collection_type: CollectionType;
  opens_on: string;
  closes_on: string | null;
  target_amount: number | null;
  item_price: number | null;
  non_resident_price: number | null;
  is_active: boolean;
  created_at: string;
}

export interface CollectionPayer {
  id: string;
  resident_id: string | null;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  resident: { first_name: string | null; last_name: string | null; resident_code: string | null } | null;
}

export interface CollectionPayment {
  id: string;
  collection_id: string;
  payer_id: string;
  house_id: string | null;
  quantity: number | null;
  unit_price: number | null;
  amount: number;
  payment_date: string;
  method: CollectionPaymentMethod;
  reference: string | null;
  receipt_number: string;
  item_reference: string | null;
  notes: string | null;
  given_at: string | null;
  reversed_at: string | null;
  reversal_reason: string | null;
  created_at: string;
  payer: CollectionPayer | null;
  house: { house_number: string | null; short_name: string | null; street: { name: string | null } | null } | null;
}

export interface NotifiedParty {
  id: string;
  collection_id: string | null;
  collection_payment_id: string | null;
  name: string;
  email: string | null;
  sms_phone: string | null;
  whatsapp_phone: string | null;
  channels: NotifiedChannel[];
}

/** Money is held in kobo for arithmetic, so 3 x 0.10 is 0.30 and not 0.30000000000000004. */
const toKobo = (naira: number) => Math.round(naira * 100);

/** The price per item for this payer: the non-resident price when set and the payer is not a resident. */
export function unitPriceFor(
  collection: Pick<Collection, 'collection_type' | 'item_price' | 'non_resident_price'>,
  isResident: boolean
): number | null {
  if (collection.collection_type !== 'item_purchase') return null;
  if (!isResident && collection.non_resident_price != null) return Number(collection.non_resident_price);
  return collection.item_price == null ? null : Number(collection.item_price);
}

/**
 * Quantity, price and amount of a new payment. An item purchase is quantity x price, and any amount the
 * caller sent is ignored; a contribution takes the amount the payer chose.
 */
export function priceCollectionPayment(
  collection: Pick<Collection, 'collection_type' | 'item_price' | 'non_resident_price'>,
  input: { isResident: boolean; quantity?: number | null; amount?: number | null }
): { quantity: number | null; unitPrice: number | null; amount: number } | { error: string } {
  if (collection.collection_type === 'item_purchase') {
    const quantity = Number(input.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) return { error: 'Enter a quantity of 1 or more' };
    const unitPrice = unitPriceFor(collection, input.isResident);
    if (unitPrice == null || unitPrice <= 0) return { error: 'This collection has no price per item' };
    return { quantity, unitPrice, amount: (toKobo(unitPrice) * quantity) / 100 };
  }
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { error: 'Enter an amount greater than zero' };
  return { quantity: null, unitPrice: null, amount: toKobo(amount) / 100 };
}

export interface CollectionSummary {
  total: number;
  paymentCount: number;
  payerCount: number;
  /** Contribution with a target only: percent of the target received, rounded down to one decimal. */
  targetPercent: number | null;
  /** Item purchase only. */
  itemsSold: number | null;
  itemsNotGiven: number | null;
}

/** The collection report. A reversed payment counts for nothing. */
export function summarizeCollection(
  collection: Pick<Collection, 'collection_type' | 'target_amount'>,
  payments: Array<Pick<CollectionPayment, 'payer_id' | 'amount' | 'quantity' | 'given_at' | 'reversed_at'>>
): CollectionSummary {
  const live = payments.filter((payment) => !payment.reversed_at);
  const totalKobo = live.reduce((sum, payment) => sum + toKobo(Number(payment.amount)), 0);
  const isItem = collection.collection_type === 'item_purchase';
  const target = collection.target_amount == null ? null : Number(collection.target_amount);
  return {
    total: totalKobo / 100,
    paymentCount: live.length,
    payerCount: new Set(live.map((payment) => payment.payer_id)).size,
    targetPercent: !isItem && target ? Math.floor((totalKobo * 1000) / toKobo(target)) / 10 : null,
    itemsSold: isItem ? live.reduce((sum, payment) => sum + (payment.quantity ?? 0), 0) : null,
    itemsNotGiven: isItem
      ? live.filter((payment) => !payment.given_at).reduce((sum, payment) => sum + (payment.quantity ?? 0), 0)
      : null,
  };
}

export function payerName(payer: Pick<CollectionPayer, 'full_name' | 'resident'> | null | undefined): string {
  if (!payer) return 'Unknown payer';
  const residentName = [payer.resident?.first_name, payer.resident?.last_name].filter(Boolean).join(' ');
  return residentName || payer.full_name?.trim() || 'Unknown payer';
}

export function houseLabel(house: CollectionPayment['house']): string {
  if (!house) return '';
  return house.short_name || [house.house_number, house.street?.name].filter(Boolean).join(' ');
}

/** What a notice about one payment says. Built from the payer's name only: never their phone or email. */
export interface CollectionNoticeFacts {
  payerName: string;
  collectionName: string;
  collectionType: CollectionType;
  quantity: number | null;
  amount: number;
  paymentDate: string;
  receiptNumber: string;
  reference: string | null;
}

/** The message a notified party gets (owner decision 9). */
export function buildNotifiedPartyMessage(facts: CollectionNoticeFacts): { subject: string; body: string } {
  const lines = [
    `Payment recorded for ${facts.collectionName}.`,
    `Payer: ${facts.payerName}`,
    `Item: ${facts.collectionName}`,
    ...(facts.quantity != null ? [`Quantity: ${facts.quantity}`] : []),
    `Amount: ${formatCurrency(facts.amount)}`,
    `Date: ${formatDay(facts.paymentDate)}`,
    `Receipt number: ${facts.receiptNumber}`,
    ...(facts.reference ? [`Reference: ${facts.reference}`] : []),
  ];
  return { subject: `Payment recorded: ${facts.collectionName} (${facts.receiptNumber})`, body: lines.join('\n') };
}

/** The receipt the payer gets. */
export function buildPayerReceiptMessage(facts: CollectionNoticeFacts): { subject: string; body: string } {
  const what = facts.quantity != null ? `${facts.quantity} x ${facts.collectionName}` : facts.collectionName;
  const lines = [
    `Receipt ${facts.receiptNumber}`,
    `Thank you, ${facts.payerName}. We received ${formatCurrency(facts.amount)} for ${what} on ${formatDay(facts.paymentDate)}.`,
    ...(facts.reference ? [`Reference: ${facts.reference}`] : []),
  ];
  return { subject: `Receipt ${facts.receiptNumber}: ${facts.collectionName}`, body: lines.join('\n') };
}

/** One message to send, or one channel left out and why. */
export type PlannedNotice =
  | { kind: 'send'; partyId: string; channel: 'email'; email: string }
  | { kind: 'send'; partyId: string; channel: 'whatsapp'; phone: string; residentId: string }
  | { kind: 'skip'; partyId: string; partyName: string; channel: NotifiedChannel; reason: string };

/**
 * Who gets a message about one payment: every party on the collection, then every party on the payment.
 * SMS is not available (no provider is connected), and WhatsApp goes only to a number an opted-in
 * resident holds (the same opt-in rule as every other WhatsApp message); both are reported as skipped.
 * `optedInResidentFor` returns the resident who opted in with that number, or null.
 */
export async function planNotifiedPartyNotices(
  parties: NotifiedParty[],
  optedInResidentFor: (phone: string) => Promise<string | null>,
  smsAvailable: boolean
): Promise<PlannedNotice[]> {
  const planned: PlannedNotice[] = [];
  for (const party of parties) {
    for (const channel of party.channels) {
      if (channel === 'email' && party.email) {
        planned.push({ kind: 'send', partyId: party.id, channel: 'email', email: party.email });
      } else if (channel === 'whatsapp' && party.whatsapp_phone) {
        const residentId = await optedInResidentFor(party.whatsapp_phone);
        planned.push(
          residentId
            ? { kind: 'send', partyId: party.id, channel: 'whatsapp', phone: party.whatsapp_phone, residentId }
            : { kind: 'skip', partyId: party.id, partyName: party.name, channel, reason: 'the WhatsApp number has not opted in' }
        );
      } else if (channel === 'sms') {
        planned.push({
          kind: 'skip',
          partyId: party.id,
          partyName: party.name,
          channel,
          reason: smsAvailable ? 'no SMS number' : 'SMS is not available',
        });
      } else {
        planned.push({ kind: 'skip', partyId: party.id, partyName: party.name, channel, reason: `no ${channel} contact` });
      }
    }
  }
  return planned;
}

const csvCell = (value: string | number | null | undefined) => {
  const text = value == null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** The payment list export: one row per payment, the columns the payment list shows. */
export function buildCollectionPaymentsCsv(payments: CollectionPayment[]): string {
  const header = ['Receipt number', 'Date', 'Payer', 'Payer type', 'House', 'Quantity', 'Price per item', 'Amount', 'Method', 'Reference', 'Item reference', 'Given', 'Status'];
  const rows = payments.map((payment) => [
    payment.receipt_number,
    formatDay(payment.payment_date),
    payerName(payment.payer),
    payment.payer?.resident_id ? 'Resident' : 'Non-resident',
    houseLabel(payment.house),
    payment.quantity,
    payment.unit_price,
    Number(payment.amount).toFixed(2),
    COLLECTION_PAYMENT_METHOD_LABELS[payment.method] ?? payment.method,
    payment.reference,
    payment.item_reference,
    payment.given_at ? formatDay(payment.given_at) : '',
    payment.reversed_at ? 'Reversed' : 'Received',
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}
