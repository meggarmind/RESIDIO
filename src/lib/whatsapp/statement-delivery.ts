import { randomUUID } from 'node:crypto';
import { usableEstateLogoUrl } from '@/lib/branding/estate-logo';
import { createElement } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/server';
import { getRawSettingsAsService } from '@/lib/settings/service';
import { loadAccountStatement, type AccountStatementData } from '@/lib/billing/account-statement-data';
import { isResidentRollForwardEnabled } from '@/lib/billing/account-balance';
import { renderStatementPdf, statementEstateName as estateName } from '@/lib/billing/statement-pdf';
import { WhatsAppStatementEmail } from '@/emails/whatsapp-statement';
import { addToQueue, PRIORITY } from '@/lib/notifications/queue';
import { matchProviderMessageId } from '@/lib/whatsapp/outbound-sends';
import { sendWhatsAppMessage } from '@/lib/whatsapp/provider';
import { resolveResidentOverride } from '@/lib/comms-override/resident-flag';
import { getSponsoredHouses } from '@/lib/whatsapp/co-resident';
import { earliestMoveIn, formatDay, formatNaira, maskEmail, offeredPeriods, PERIOD_LABELS, spaceOut, statementDates, type StatementPeriod } from '@/lib/whatsapp/assistant-format';

/**
 * Statement PDF delivery for the WhatsApp Assistant (#804 decision 24, #917): every statement is a
 * PDF, never chat text. Up to 40 rows go to chat through a 1-hour signed URL to private storage (Chatmaid
 * fetches files only from a public HTTPS URL), longer ones are queued as an
 * email with the PDF attached. Files are deleted 12 hours after they are made.
 */

export const STATEMENT_CHAT_ROW_LIMIT = 40;
export const STATEMENT_FILE_HOURS = 12;
/** Shared with the privacy notice (#871); statements live under statements/. */
const MEDIA_BUCKET = 'whatsapp-media';
const SIGNED_URL_SECONDS = 60 * 60;
/** Roles whose tenancy at a house starts a 'since move-in' statement. */
const BILLABLE_ROLES = ['resident_landlord', 'non_resident_landlord', 'developer', 'tenant'] as const;

/**
 * whatsapp_statement_requests and whatsapp_disclosure_logs.channel are not in the generated types
 * until the 20261021150000 migration is applied and `npm run db:types` is re-run; drop this then.
 */
function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

export interface StatementRequestInput {
  residentId: string;
  phoneNumber: string;
  houseId: string;
  period: StatementPeriod;
  fromDate: string;
  toDate: string;
  rowCount: number;
  inboundMessageId: string;
}

export { estateName };

/**
 * The admin account statement for one resident and house, read with the service-role client.
 * Resident-facing, so its balances are the roll-forward ones only once the setting is on (#863).
 * Runs of unpaid monthly invoices are merged into one line (#1234).
 */
export async function loadWhatsAppStatement(residentId: string, houseId: string, fromDate: string, toDate: string): Promise<AccountStatementData> {
  const rollForward = await isResidentRollForwardEnabled();
  const { data, error } = await loadAccountStatement(createAdminClient(), { residentId, houseId, fromDate, toDate }, { rollForward, mode: 'summary' });
  if (error || !data) throw new Error(`Statement could not be built: ${error || 'no data'}`);
  return data;
}

/** The move-in date of this resident's active billable tenancy at the house; with several such rows, the earliest. */
async function activeMoveIn(residentId: string, houseId: string): Promise<string | null> {
  const { data, error } = await createAdminClient()
    .from('resident_houses')
    .select('move_in_date')
    .eq('resident_id', residentId)
    .eq('house_id', houseId)
    .eq('is_active', true)
    .in('resident_role', [...BILLABLE_ROLES]);
  if (error) throw error;
  return earliestMoveIn((data || []).map((row) => row.move_in_date));
}

/** The periods offered for this house: All time only when an invoice or payment predates the move-in (#1069). */
export async function loadStatementPeriods(residentId: string, houseId: string): Promise<StatementPeriod[]> {
  const moveIn = await activeMoveIn(residentId, houseId);
  if (!moveIn) return offeredPeriods(false, false);
  const client = createAdminClient();
  const startOfMoveIn = `${moveIn}T00:00:00+01:00`; // Africa/Lagos
  let paymentQuery = client.from('payment_records').select('id').eq('resident_id', residentId).eq('house_id', houseId).eq('status', 'paid').lt('payment_date', moveIn);
  if (await isResidentRollForwardEnabled()) paymentQuery = paymentQuery.eq('is_verified', true);
  const [invoices, payments] = await Promise.all([
    client.from('invoices').select('id').eq('resident_id', residentId).eq('house_id', houseId).neq('status', 'void')
      .or(`period_start.lt.${moveIn},and(period_start.is.null,created_at.lt.${startOfMoveIn})`).limit(1),
    paymentQuery.limit(1),
  ]);
  if (invoices.error) throw invoices.error;
  if (payments.error) throw payments.error;
  return offeredPeriods(true, (invoices.data?.length ?? 0) + (payments.data?.length ?? 0) > 0);
}

export async function loadWhatsAppStatementForPeriod(residentId: string, houseId: string, period: StatementPeriod, now: Date) {
  const moveIn = period === 'since_move_in' ? await activeMoveIn(residentId, houseId) : null;
  if (period === 'since_move_in' && !moveIn) return null;
  const { fromDate, toDate } = statementDates(period, now, moveIn);
  return { fromDate, toDate, statement: await loadWhatsAppStatement(residentId, houseId, fromDate, toDate) };
}

async function signedUrl(path: string): Promise<string> {
  const signed = await createAdminClient().storage.from(MEDIA_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
  if (!signed.data?.signedUrl) throw new Error(`Statement signed URL failed: ${signed.error?.message || 'no URL'}`);
  return signed.data.signedUrl;
}

/** A PDF sent in chat: what the request row and its 12-hour file purge need to know. */
export interface ChatPdfInput {
  residentId: string;
  phoneNumber: string;
  houseId: string;
  /** Stored in the `period` column: a statement period, or `receipt` / `clearance`. */
  label: string;
  fromDate: string;
  toDate: string;
  rowCount: number;
  inboundMessageId: string;
  /** The reply that carries the file, kept so a failed send can be resent once with a fresh URL. */
  replyText: string;
}

/**
 * Records the request, uploads the PDF to private storage and returns a 1-hour signed URL. The row
 * is written first, so the 12-hour purge always knows about any file that reached storage. Statements,
 * receipts and clearance certificates share it, so they share the one-retry and the purge (#816).
 */
export async function storeChatPdf(folder: string, input: ChatPdfInput, render: () => Promise<Buffer>): Promise<string> {
  const id = randomUUID();
  const path = `${folder}/${id}.pdf`;
  const { error } = await db().from('whatsapp_statement_requests').insert({
    id,
    resident_id: input.residentId,
    phone_number: input.phoneNumber,
    house_id: input.houseId,
    period: input.label,
    from_date: input.fromDate,
    to_date: input.toDate,
    row_count: input.rowCount,
    delivery: 'chat',
    status: 'sent',
    inbound_message_id: input.inboundMessageId,
    reply_text: input.replyText,
    storage_path: path,
  });
  if (error) throw error;

  const pdf = await render();
  const upload = await createAdminClient().storage.from(MEDIA_BUCKET).upload(path, new Uint8Array(pdf), { contentType: 'application/pdf', upsert: true });
  if (upload.error) throw new Error(`Chat PDF upload failed: ${upload.error.message}`);
  return signedUrl(path);
}

export async function storeStatementPdf(
  input: StatementRequestInput & { replyText: string },
  statement: AccountStatementData
): Promise<string> {
  return storeChatPdf('statements', { ...input, label: input.period }, () => renderStatementPdf(statement));
}

/** An email request; `awaiting_email` is the console's "Statement requested, no email" flag. */
export async function createStatementRequest(input: StatementRequestInput & { status: 'awaiting_email' | 'queued' }): Promise<string> {
  const { data, error } = await db()
    .from('whatsapp_statement_requests')
    .insert({
      resident_id: input.residentId,
      phone_number: input.phoneNumber,
      house_id: input.houseId,
      period: input.period,
      from_date: input.fromDate,
      to_date: input.toDate,
      row_count: input.rowCount,
      delivery: 'email',
      status: input.status,
      inbound_message_id: input.inboundMessageId,
    })
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

/** Queues the statement email; the notification cron sends it with the PDF attached (see buildStatementEmail). */
export async function queueStatementEmail(requestId: string, residentId: string, email: string): Promise<void> {
  const queued = await addToQueue({
    recipient_id: residentId,
    recipient_email: email,
    channel: 'email',
    subject: 'Your account statement',
    body: 'Your account statement is attached.',
    priority: PRIORITY.NORMAL,
    metadata: { whatsapp_statement_request_id: requestId },
  });
  if (!queued.success) throw new Error(`Statement email could not be queued: ${queued.error}`);
  const { error } = await db()
    .from('whatsapp_statement_requests')
    .update({ status: 'queued', notification_queue_id: queued.queueId ?? null, updated_at: new Date().toISOString() })
    .eq('id', requestId);
  if (error) throw error;
}

/** Moves a statement request from `queued` to `sent` once its email has left; a cancelled request stays cancelled. True when a row moved. */
export async function markStatementEmailSent(requestId: string): Promise<boolean> {
  return moveQueuedStatementRequest(requestId, 'sent');
}

/** Moves a statement request from `queued` to `failed` once its email has no send attempt left (#1252). True when a row moved. */
export async function markStatementEmailFailed(requestId: string): Promise<boolean> {
  return moveQueuedStatementRequest(requestId, 'failed');
}

async function moveQueuedStatementRequest(requestId: string, status: 'sent' | 'failed'): Promise<boolean> {
  const { data, error } = await db()
    .from('whatsapp_statement_requests')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', requestId)
    .eq('status', 'queued')
    .select('id');
  if (error) throw error;
  return (data ?? []).length > 0;
}

/**
 * Queues every statement a resident asked for before they had an email (#804 decision 24), which
 * clears the console flag. For the verified email capture in #816 to call once the address is saved.
 */
export async function releaseStatementsAwaitingEmail(residentId: string, email: string): Promise<number> {
  const { data, error } = await db()
    .from('whatsapp_statement_requests')
    .select('id')
    .eq('resident_id', residentId)
    .eq('status', 'awaiting_email');
  if (error) throw error;
  for (const row of (data || []) as Array<{ id: string }>) await queueStatementEmail(row.id, residentId, email);
  return (data || []).length;
}

interface RequestRow {
  resident_id: string;
  house_id: string | null;
  period: StatementPeriod;
  from_date: string;
  to_date: string;
}

/** The email body and PDF attachment for a queued statement email, built at send time. */
export async function buildStatementEmail(requestId: string) {
  const { data, error } = await db()
    .from('whatsapp_statement_requests')
    .select('resident_id, house_id, period, from_date, to_date')
    .eq('id', requestId)
    .single();
  if (error || !data) throw new Error(`Statement request ${requestId} not found`);
  const request = data as RequestRow;
  if (!request.house_id) throw new Error(`Statement request ${requestId} has no property`);

  // A co-resident's request shows the sponsor's account, re-checked at send time (#1071).
  const sponsored = (await getSponsoredHouses(request.resident_id)).find((link) => link.houseId === request.house_id);
  if (!sponsored) {
    const { data: rows, error: rowsError } = await createAdminClient()
      .from('resident_houses')
      .select('id')
      .eq('resident_id', request.resident_id)
      .eq('house_id', request.house_id)
      .eq('is_active', true)
      .in('resident_role', [...BILLABLE_ROLES]);
    if (rowsError) throw rowsError;
    if (!rows?.length) throw new Error(`Statement request ${requestId} no longer has access to this property`);
  }
  const statement = await loadWhatsAppStatement(sponsored?.sponsorId ?? request.resident_id, request.house_id, request.from_date, request.to_date);
  const [pdf, name, contact] = await Promise.all([
    renderStatementPdf(statement),
    estateName(),
    getRawSettingsAsService(['estate_email', 'estate_phone', 'estate_address', 'estate_logo_url']),
  ]);
  const value = (key: string) => {
    const raw = contact.status === 'ok' ? contact.values.get(key) : null;
    return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
  };
  const propertyLabel = statement.house?.short_name || statement.house?.address || 'your property';
  const periodLabel = `${PERIOD_LABELS[request.period]}, ${formatDay(request.from_date)} to ${formatDay(request.to_date)}`;

  return {
    react: createElement(WhatsAppStatementEmail, {
      estateName: name,
      estateEmail: value('estate_email'),
      estatePhone: value('estate_phone'),
      estateAddress: value('estate_address'),
      estateLogoUrl: usableEstateLogoUrl(contact.status === 'ok' ? contact.values.get('estate_logo_url') : null),
      residentName: statement.resident.name,
      propertyLabel,
      periodLabel,
      openingBalance: formatNaira(statement.openingBalance),
      closingBalance: formatNaira(statement.closingBalance),
    }),
    attachments: [{ filename: `statement-${request.from_date}-to-${request.to_date}.pdf`, content: pdf }],
  };
}

/**
 * A chat statement whose send ended `failed` is sent once more with a fresh signed URL (#804
 * decision 24). Claims the retry first, so a repeated status event cannot send it twice.
 */
export async function retryFailedStatementSend(provider: string, providerMessageId: string): Promise<boolean> {
  const client = db();
  const { data: send, error: sendError } = await matchProviderMessageId(
    client.from('whatsapp_outbound_sends').select('inbound_message_id'),
    provider,
    providerMessageId
  ).maybeSingle();
  if (sendError) throw sendError;
  const inboundMessageId = (send as { inbound_message_id: string | null } | null)?.inbound_message_id;
  if (!inboundMessageId) return false;

  const { data: claimed, error: claimError } = await client
    .from('whatsapp_statement_requests')
    .update({ retried_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('inbound_message_id', inboundMessageId)
    .eq('delivery', 'chat')
    .is('retried_at', null)
    .is('file_deleted_at', null)
    .select('resident_id, phone_number, reply_text, storage_path');
  if (claimError) throw claimError;
  const request = (claimed || [])[0] as { resident_id: string; phone_number: string; reply_text: string | null; storage_path: string | null } | undefined;
  if (!request?.storage_path || !request.reply_text) return false;

  // Not sent as an inbound reply: the retry is a later, system-initiated send, so it follows the
  // communications override like any notification, using the resident's stored flag (#716).
  const override = await resolveResidentOverride([request.resident_id]);
  if (!override.ok) throw new Error(override.error);
  const result = await sendWhatsAppMessage(
    { to: request.phone_number, body: spaceOut(request.reply_text), idempotencySeed: `${inboundMessageId}:statement-retry`, mediaUrls: [await signedUrl(request.storage_path)] },
    undefined,
    { residentOverride: override.residentOverride },
    { residentId: request.resident_id, inboundMessageId }
  );
  if (!result.success) console.error('[whatsapp-statement] Retry send failed:', { inboundMessageId, error: result.error });
  return result.success;
}

/** Deletes chat statement files older than 12 hours. Returns how many were removed. */
export async function purgeExpiredStatementFiles(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - STATEMENT_FILE_HOURS * 60 * 60 * 1000).toISOString();
  const client = db();
  const { data, error } = await client
    .from('whatsapp_statement_requests')
    .select('id, storage_path')
    .not('storage_path', 'is', null)
    .is('file_deleted_at', null)
    .lt('created_at', cutoff)
    .limit(100);
  if (error) throw error;
  const rows = (data || []) as Array<{ id: string; storage_path: string }>;
  if (rows.length === 0) return 0;

  const removed = await createAdminClient().storage.from(MEDIA_BUCKET).remove(rows.map((row) => row.storage_path));
  if (removed.error) throw new Error(`Statement file purge failed: ${removed.error.message}`);
  const { error: updateError } = await client
    .from('whatsapp_statement_requests')
    .update({ file_deleted_at: now.toISOString(), updated_at: now.toISOString() })
    .in('id', rows.map((row) => row.id));
  if (updateError) throw updateError;
  return rows.length;
}

/**
 * One WhatsApp notice about a statement email (#1252). Sent directly, like retryFailedStatementSend,
 * so the communications override applies (#716). A failed notice is logged and never thrown: the
 * email is already out or already failed, and a retry of the queue row would send the email twice.
 */
async function sendStatementEmailNotice(requestId: string, seedSuffix: string, lines: (estatePhone: string | undefined) => string[]): Promise<boolean> {
  try {
    const client = db();
    const { data, error } = await client
      .from('whatsapp_statement_requests')
      .select('resident_id, phone_number, house_id, period, from_date, to_date')
      .eq('id', requestId)
      .single();
    if (error || !data) throw error ?? new Error('Statement request not found');
    const request = data as RequestRow & { phone_number: string };

    let property = 'your property';
    if (request.house_id) {
      const { data: house } = await client.from('houses').select('short_name, address').eq('id', request.house_id).maybeSingle();
      const row = house as { short_name: string | null; address: string | null } | null;
      property = row?.short_name || row?.address || property;
    }
    const settings = await getRawSettingsAsService(['estate_phone']);
    const rawPhone = settings.status === 'ok' ? settings.values.get('estate_phone') : null;
    const estatePhone = typeof rawPhone === 'string' && rawPhone.trim() ? rawPhone.trim() : undefined;
    const periodLabel = `${PERIOD_LABELS[request.period]}, ${formatDay(request.from_date)} to ${formatDay(request.to_date)}`;

    const override = await resolveResidentOverride([request.resident_id]);
    if (!override.ok) throw new Error(override.error);
    const result = await sendWhatsAppMessage(
      { to: request.phone_number, body: spaceOut([`*Statement, ${periodLabel}, ${property}*`, ...lines(estatePhone), 'Reply 0 for menu'].join('\n')), idempotencySeed: `${requestId}:${seedSuffix}` },
      undefined,
      { residentOverride: override.residentOverride },
      { residentId: request.resident_id }
    );
    if (!result.success) throw new Error(result.error);
    return true;
  } catch (error) {
    console.error('[whatsapp-statement] Email notice not sent:', { requestId, seedSuffix, error });
    return false;
  }
}

/** Tells the resident their statement PDF was emailed, naming the address on file masked. */
export function sendStatementEmailedNotice(requestId: string, email: string): Promise<boolean> {
  return sendStatementEmailNotice(requestId, 'statement-emailed', () => [`Your PDF was emailed to ${maskEmail(email)}.`]);
}

/** Tells the resident their statement email could not be sent, with the estate office number when set. */
export function sendStatementEmailFailedNotice(requestId: string): Promise<boolean> {
  return sendStatementEmailNotice(requestId, 'statement-email-failed', (estatePhone) => [
    'Sorry, we could not email your statement.',
    ...(estatePhone ? [`Please contact the estate office on ${estatePhone}.`] : []),
  ]);
}
