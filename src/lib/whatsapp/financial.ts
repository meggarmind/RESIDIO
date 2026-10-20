import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/server';
import { sendWhatsAppMessage } from '@/lib/whatsapp/provider';
import { normalizePhoneNumber } from '@/lib/sms/termii';
import { getSettingResultAsService } from '@/lib/settings/service';
import { isWhatsAppMasterSwitchOn } from '@/lib/whatsapp/master-switch';
import { isWhatsAppRecipientAllowed } from '@/lib/whatsapp/rollout';
import type { WhatsAppInboundMessage, WhatsAppTextMessage } from '@/lib/whatsapp/types';
import type { WhatsAppResidentIdentity } from '@/lib/whatsapp/identity';
import type { AccountStatementData } from '@/lib/billing/account-statement-data';
import {
  STATEMENT_CHAT_ROW_LIMIT,
  createStatementRequest,
  loadWhatsAppStatementForPeriod,
  queueStatementEmail,
  storeStatementPdf,
  type StatementRequestInput,
} from '@/lib/whatsapp/statement-delivery';
import {
  DEFAULT_KEYWORDS,
  answerFooter,
  contactLine,
  formatDay,
  formatNaira,
  lagosMidnight,
  lagosParts,
  maskEmail,
  maskReference,
  normalizeInput,
  parseKeywordSynonyms,
  parseOfficeHours,
  PERIOD_LABELS,
  PERIODS,
  statementRange,
  type AssistantIntent,
  type OfficeHours,
  type StatementPeriod,
} from '@/lib/whatsapp/assistant-format';

export { statementRange, type StatementPeriod };

const SESSION_MINUTES = 15;
// #891: 3 wrong in a row locks for 15 minutes; 6 wrong within 24 hours locks until the estate office resets it.
const PIN_TRIES_IN_A_ROW = 3;
const PIN_LOCK_MINUTES = 15;
const PIN_TRIES_PER_WINDOW = 6;
const PIN_WINDOW_HOURS = 24;
const PIN_HARD_LOCKED_REPLY = 'Your PIN is locked after several wrong tries. The estate office needs to reset it.';
const SET_PIN_HINT = 'reply PIN followed by 4–6 digits of your choice';
/** Per-resident daily cap on financial answers (#804 decision 26). */
export const RESIDENT_DAILY_LOOKUP_CAP = 20;
/** Estate-wide cap when the setting is absent (#804 decision 26 raised it from 50). */
export const DEFAULT_ESTATE_DAILY_LOOKUP_CAP = 500;
const RECENT_PAYMENT_COUNT = 5;
const NOTICE_COUNT = 3;
const STATEMENT_ROW_CAP = 12;

const UNRECOGNISED = "I didn't catch that. Reply with a number from the menu, or MENU to see it again.";
const LOOKUP_FAILED = "I can't load your records right now, so nothing was shown or changed. Please try again in a few minutes.";
const RESIDENT_CAP_REPLY = `You've reached today's limit of ${RESIDENT_DAILY_LOOKUP_CAP} financial lookups. It resets at midnight.`;
const ESTATE_CAP_REPLY = 'Financial lookups are paused for everyone until midnight. Nothing is wrong with your account.';
const TEXT_ONLY_REPLY = 'I can only read text messages here. Please type your request.';
const UNSUBSCRIBED_REPLY = "You've been unsubscribed from estate WhatsApp alerts. Reply START any time to re-subscribe.";

/** Values written to whatsapp_disclosure_logs.menu_item (shown as-is in the operations console). */
export type FinancialMenuItem = 'what_i_owe' | 'recent_payments' | 'statement' | 'wallet';
export type LookupAllowance = 'ok' | 'resident_cap' | 'estate_cap';
/** How a disclosure left the estate (#804 decision 25). */
export type DisclosureChannel = 'chat' | 'pdf' | 'email';

export interface FinancialHouse {
  id: string;
  label: string;
}

export interface WhatsAppFinancialSession {
  phoneNumber: string;
  residentId: string;
  currentNode: string;
  selectedHouseId: string | null;
  pinAuthenticated: boolean;
  expiresAt: string;
}

/** A PIN try counted before the PIN is checked (claim_whatsapp_pin_try, #891). */
export type PinAttemptClaim =
  | { status: 'counted'; triesInARow: number; triesInWindow: number; lockedUntil: string | null; hardLocked: boolean; claimedAt: string }
  | { status: 'locked'; lockedUntil: string }
  | { status: 'hard_locked' };

export interface FinancialAnswer {
  body: string;
  metadata?: Record<string, unknown>;
}

export interface AssistantSettings {
  estatePhone: string | null;
  estateEmail: string | null;
  officeHours: OfficeHours | null;
  paymentInstructions: string | null;
  keywordSynonyms: Record<string, AssistantIntent>;
}

export interface AssistantAnnouncement {
  title: string;
  summary: string | null;
  content: string;
  publishedAt: string | null;
}

/** Allocation-based figures for one resident and house (#804 decision 20). */
export interface OwedFigures {
  invoiceCount: number;
  outstanding: number;
  overdue: { total: number; count: number; oldestDue: string } | null;
  next: { amount: number; dueDate: string; invoiceNumber: string } | null;
  awaitingVerification: number;
}

export interface PaymentRow {
  amount: number | null;
  payment_date: string;
  method: string | null;
  reference_number: string | null;
  is_verified: boolean | null;
}

export interface StatementRows {
  invoices: Array<{ invoice_number: string; amount_due: number | null; created_at: string }>;
  payments: Array<{ amount: number | null; payment_date: string; reference_number: string | null }>;
}

export interface StatementCompositionInput extends StatementRows {
  period: StatementPeriod;
  houseId: string;
  houseLabel: string;
  now: Date;
  hasContact: boolean;
}

export interface WhatsAppFinancialRepository {
  /** The stored session for this number, expired or not, so the handler can announce an expiry. */
  getSession(phoneNumber: string): Promise<WhatsAppFinancialSession | null>;
  saveSession(session: WhatsAppFinancialSession): Promise<void>;
  getForcePin(): Promise<boolean>;
  getPinHash(residentId: string): Promise<string | null>;
  setPinHash(residentId: string, hash: string): Promise<void>;
  /** Counts a PIN try as wrong before it is checked; refused while the resident is locked. */
  claimPinAttempt(residentId: string): Promise<PinAttemptClaim>;
  /** After a correct PIN: resets the in-a-row count and takes the claimed try back out of the window. */
  clearPinAttempts(residentId: string, claimedAt: string): Promise<void>;
  getBillableHouses(residentId: string): Promise<FinancialHouse[]>;
  getAssistantSettings(): Promise<AssistantSettings>;
  getLatestAnnouncements(limit: number): Promise<AssistantAnnouncement[]>;
  getOwed(residentId: string, houseId: string): Promise<OwedFigures>;
  getRecentPayments(residentId: string, houseId: string, limit: number): Promise<PaymentRow[]>;
  getWalletBalance(residentId: string): Promise<number>;
  getStatementRows(residentId: string, houseId: string, from: string | null, to: string): Promise<StatementRows>;
  setAlertsOn(residentId: string, phoneNumber: string, on: boolean): Promise<void>;
  /** The statement PDF for a period: the admin account statement, with its Lagos dates. */
  loadStatement(residentId: string, houseId: string, period: StatementPeriod, now: Date): Promise<{ fromDate: string; toDate: string; statement: AccountStatementData }>;
  /** Stores the PDF privately and returns a 1-hour signed URL for the reply. */
  storeStatementPdf(input: StatementRequestInput & { replyText: string }, statement: AccountStatementData): Promise<string>;
  getResidentEmail(residentId: string): Promise<string | null>;
  createStatementRequest(input: StatementRequestInput & { status: 'awaiting_email' | 'queued' }): Promise<string>;
  queueStatementEmail(requestId: string, residentId: string, email: string): Promise<void>;
  logDisclosure(input: {
    residentId: string;
    phoneNumber: string;
    houseId: string | null;
    menuItem: FinancialMenuItem;
    pinAuthenticated: boolean;
    channel?: DisclosureChannel;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

const SALTED_PREFIX = 'scrypt:';

export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  return `${SALTED_PREFIX}${salt.toString('hex')}:${scryptSync(pin, salt, 32).toString('hex')}`;
}

/** Salted scrypt hashes, plus the unsalted SHA-256 hashes written before #850 (rehashed on next use). */
export function verifyPin(pin: string, stored: string): boolean {
  let expected: Buffer;
  let actual: Buffer;
  if (stored.startsWith(SALTED_PREFIX)) {
    const [saltHex, hashHex] = stored.slice(SALTED_PREFIX.length).split(':');
    expected = Buffer.from(hashHex || '', 'hex');
    actual = scryptSync(pin, Buffer.from(saltHex || '', 'hex'), 32);
  } else {
    expected = Buffer.from(stored, 'hex');
    actual = createHash('sha256').update(pin).digest();
  }
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function expiry(): string {
  return new Date(Date.now() + SESSION_MINUTES * 60 * 1000).toISOString();
}

function lockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Lagos' });
}

function pinRefusalText(claim: PinAttemptClaim): string {
  if (claim.status === 'hard_locked' || (claim.status === 'counted' && claim.hardLocked)) return PIN_HARD_LOCKED_REPLY;
  if (claim.status === 'locked' || claim.lockedUntil) {
    return `For security, your PIN is locked until ${lockTime(claim.lockedUntil!)}. Nothing was shown.`;
  }
  // The 24-hour limit can arrive before (or with) the in-a-row one; then the next lock is the hard one.
  const rowLeft = PIN_TRIES_IN_A_ROW - claim.triesInARow;
  const windowLeft = PIN_TRIES_PER_WINDOW - claim.triesInWindow;
  const left = Math.min(rowLeft, windowLeft);
  const lock = windowLeft <= rowLeft ? 'until the estate office resets it' : `for ${PIN_LOCK_MINUTES} minutes`;
  return `That PIN isn't correct. You have ${left} ${left === 1 ? 'try' : 'tries'} left before it locks ${lock}.`;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

// ---------------------------------------------------------------------------
// Answer composition (pure, exported for tests)

export function composeOweAnswer(figures: OwedFigures, houseLabel: string, showPay: boolean, hasContact: boolean): string {
  const lines = [`*What you owe, ${houseLabel}*`];
  if (figures.invoiceCount === 0) {
    lines.push(`No bills on record for ${houseLabel}.`);
  } else if (figures.outstanding <= 0) {
    lines.push(`You're fully paid up for ${houseLabel}.`);
  } else {
    lines.push(`Outstanding: ${formatNaira(figures.outstanding)}`);
    if (figures.overdue) {
      lines.push(`Overdue: ${formatNaira(figures.overdue.total)} across ${plural(figures.overdue.count, 'invoice')} (oldest due ${formatDay(figures.overdue.oldestDue)})`);
    }
    if (figures.next) {
      lines.push(`Next due: ${formatNaira(figures.next.amount)} on ${formatDay(figures.next.dueDate)} (invoice ${figures.next.invoiceNumber})`);
    }
  }
  if (figures.awaitingVerification > 0) lines.push(`Awaiting verification: ${formatNaira(figures.awaitingVerification)}`);
  if (showPay && figures.outstanding > 0) lines.push('Reply PAY for how to pay');
  lines.push(answerFooter(hasContact));
  return lines.join('\n');
}

export function composeRecentPaymentsAnswer(rows: PaymentRow[], houseLabel: string, hasContact: boolean): string {
  const lines = [`*Recent payments, ${houseLabel}*`];
  if (rows.length === 0) lines.push(`No payments recorded for ${houseLabel}.`);
  for (const row of rows) {
    const parts = [formatDay(row.payment_date), formatNaira(Number(row.amount || 0)), row.method ? row.method.replaceAll('_', ' ') : 'payment'];
    const reference = maskReference(row.reference_number);
    if (reference) parts.push(reference);
    if (row.is_verified !== true) parts.push('(awaiting verification)');
    lines.push(parts.join('  '));
  }
  lines.push(answerFooter(hasContact));
  return lines.join('\n');
}

export function composeWalletAnswer(balance: number, hasContact: boolean): string {
  return ['*Wallet*', `Balance: ${formatNaira(balance)}`, answerFooter(hasContact)].join('\n');
}



export function composeStatementAnswer(input: StatementCompositionInput): FinancialAnswer {
  const { from, to } = statementRange(input.period, input.now);
  const charges = input.invoices.reduce((sum, invoice) => sum + Number(invoice.amount_due || 0), 0);
  const payments = input.payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const rows = [
    ...input.invoices.map((invoice) => ({
      date: invoice.created_at,
      text: `${formatDay(invoice.created_at)}  Invoice ${invoice.invoice_number}  +${formatNaira(Number(invoice.amount_due || 0))}`,
    })),
    ...input.payments.map((payment) => {
      const reference = maskReference(payment.reference_number);
      return {
        date: payment.payment_date,
        text: `${formatDay(payment.payment_date)}  Payment${reference ? ` ${reference}` : ''}  −${formatNaira(Number(payment.amount || 0))}`,
      };
    }),
  ].sort((left, right) => right.date.localeCompare(left.date));
  const omitted = Math.max(0, rows.length - STATEMENT_ROW_CAP);

  return {
    body: [
      `*Statement, ${PERIOD_LABELS[input.period]}, ${input.houseLabel}*`,
      from ? `${formatDay(from)} to ${formatDay(to)}` : `Up to ${formatDay(to)}`,
      `Charges: ${formatNaira(charges)}`,
      `Payments: ${formatNaira(payments)}`,
      ...(rows.length ? rows.slice(0, STATEMENT_ROW_CAP).map((row) => row.text) : [`No activity for ${input.houseLabel} in this period.`]),
      ...(omitted ? [`+ ${omitted} earlier entries`] : []),
      'Reply PDF to download the full statement.',
      answerFooter(input.hasContact),
    ].join('\n'),
    metadata: { period: input.period, house_id: input.houseId, row_count: rows.length, omitted },
  };
}

interface PinTryRow {
  status: 'counted' | 'locked' | 'hard_locked';
  tries_in_a_row: number;
  tries_in_window: number;
  locked_until: string | null;
  hard_locked: boolean;
  claimed_at: string | null;
}

/**
 * The generated types do not know the #891 lock functions until that migration is applied and
 * `npm run db:types` is re-run; remove these casts after that.
 */
interface PinAttemptRpcClient {
  rpc(
    name: 'claim_whatsapp_pin_try',
    args: { p_resident_id: string; p_soft_limit: number; p_soft_lock_minutes: number; p_hard_limit: number; p_window_hours: number }
  ): PromiseLike<{ data: PinTryRow[] | null; error: unknown }>;
  rpc(
    name: 'clear_whatsapp_pin_try',
    args: { p_resident_id: string; p_claimed_at: string }
  ): PromiseLike<{ data: null; error: unknown }>;
}

const ASSISTANT_SETTING_KEYS = ['estate_phone', 'estate_email', 'estate_office_hours', 'whatsapp_payment_instructions', 'whatsapp_keyword_synonyms'];

function settingText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function createSupabaseRepository(): WhatsAppFinancialRepository {
  return {
    async getSession(phoneNumber) {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from('whatsapp_sessions')
        .select('phone_number, resident_id, current_node, selected_house_id, pin_authenticated, expires_at')
        .eq('phone_number', phoneNumber)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        phoneNumber: data.phone_number,
        residentId: data.resident_id,
        currentNode: data.current_node,
        selectedHouseId: data.selected_house_id,
        pinAuthenticated: data.pin_authenticated,
        expiresAt: data.expires_at,
      };
    },

    async saveSession(session) {
      const supabase = createAdminClient();
      const { error } = await supabase.from('whatsapp_sessions').upsert(
        {
          phone_number: session.phoneNumber,
          resident_id: session.residentId,
          current_node: session.currentNode,
          selected_house_id: session.selectedHouseId,
          pin_authenticated: session.pinAuthenticated,
          expires_at: session.expiresAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'phone_number' }
      );
      if (error) throw error;
    },

    async getForcePin() {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'whatsapp_force_pin')
        .maybeSingle();
      if (error) throw error;
      // Absent row means the default, which is on (#850).
      return !data || data.value === true || data.value === 'true';
    },

    async getPinHash(residentId) {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from('residents')
        .select('whatsapp_pin_hash')
        .eq('id', residentId)
        .single();
      if (error) throw error;
      return data?.whatsapp_pin_hash || null;
    },

    async setPinHash(residentId, pinHash) {
      const supabase = createAdminClient();
      const { error } = await supabase
        .from('residents')
        .update({ whatsapp_pin_hash: pinHash, whatsapp_pin_set_at: new Date().toISOString() })
        .eq('id', residentId);
      if (error) throw error;
    },

    async claimPinAttempt(residentId) {
      const { data, error } = await (createAdminClient() as unknown as PinAttemptRpcClient).rpc('claim_whatsapp_pin_try', {
        p_resident_id: residentId,
        p_soft_limit: PIN_TRIES_IN_A_ROW,
        p_soft_lock_minutes: PIN_LOCK_MINUTES,
        p_hard_limit: PIN_TRIES_PER_WINDOW,
        p_window_hours: PIN_WINDOW_HOURS,
      });
      if (error) throw error;
      const row = data?.[0];
      if (!row) throw new Error('WhatsApp PIN try was not counted: resident not found');
      if (row.status === 'hard_locked') return { status: 'hard_locked' };
      if (row.status === 'locked' && row.locked_until) return { status: 'locked', lockedUntil: row.locked_until };
      if (row.status !== 'counted' || !row.claimed_at) throw new Error(`Unexpected WhatsApp PIN try status: ${row.status}`);
      return {
        status: 'counted',
        triesInARow: row.tries_in_a_row,
        triesInWindow: row.tries_in_window,
        lockedUntil: row.locked_until,
        hardLocked: row.hard_locked,
        claimedAt: row.claimed_at,
      };
    },

    async clearPinAttempts(residentId, claimedAt) {
      const { error } = await (createAdminClient() as unknown as PinAttemptRpcClient).rpc('clear_whatsapp_pin_try', {
        p_resident_id: residentId,
        p_claimed_at: claimedAt,
      });
      if (error) throw error;
    },

    async getBillableHouses(residentId) {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from('resident_houses')
        .select('house_id, resident_role, house:houses(house_number, short_name, street:streets(name))')
        .eq('resident_id', residentId)
        .eq('is_active', true)
        .in('resident_role', ['resident_landlord', 'non_resident_landlord', 'tenant', 'developer']);
      if (error) throw error;
      return (data || []).map((row) => {
        const houseData = row.house as unknown as { house_number: string; short_name: string | null; street: { name: string } | { name: string }[] | null } | { house_number: string; short_name: string | null; street: { name: string } | { name: string }[] | null }[];
        const house = Array.isArray(houseData) ? houseData[0] : houseData;
        const street = Array.isArray(house.street) ? house.street[0]?.name : house.street?.name;
        return { id: row.house_id, label: house.short_name || `${house.house_number}, ${street || 'Estate'}` };
      });
    },

    async getAssistantSettings() {
      const { data, error } = await createAdminClient()
        .from('system_settings')
        .select('key, value')
        .in('key', ASSISTANT_SETTING_KEYS);
      if (error) throw error;
      const values = new Map((data || []).map((row) => [row.key, row.value as unknown]));
      return {
        estatePhone: settingText(values.get('estate_phone')),
        estateEmail: settingText(values.get('estate_email')),
        officeHours: parseOfficeHours(values.get('estate_office_hours')),
        paymentInstructions: settingText(values.get('whatsapp_payment_instructions')),
        keywordSynonyms: parseKeywordSynonyms(values.get('whatsapp_keyword_synonyms')),
      };
    },

    async getLatestAnnouncements(limit) {
      const now = new Date().toISOString();
      // Estate-wide only: an announcement aimed at particular houses is not shown to everyone.
      const { data, error } = await createAdminClient()
        .from('announcements')
        .select('title, summary, content, published_at, target_houses')
        .eq('status', 'published')
        .in('target_audience', ['all', 'residents'])
        .or(`expires_at.is.null,expires_at.gt.${now}`)
        .order('published_at', { ascending: false })
        .limit(limit * 4);
      if (error) throw error;
      return (data || []).filter((row) => !row.target_houses?.length).slice(0, limit).map((row) => ({ title: row.title, summary: row.summary, content: row.content, publishedAt: row.published_at }));
    },

    async getOwed(residentId, houseId) {
      const supabase = createAdminClient();
      // Unpaid invoices only, filtered in the database: a page of all invoices hides newer unpaid ones (#811).
      const [unpaidResult, countResult, unverifiedResult] = await Promise.all([
        supabase
          .from('invoices')
          .select('invoice_number, amount_due, amount_paid, due_date')
          .eq('resident_id', residentId)
          .eq('house_id', houseId)
          .in('status', ['unpaid', 'partially_paid'])
          .order('due_date', { ascending: true }),
        supabase
          .from('invoices')
          .select('id', { count: 'exact', head: true })
          .eq('resident_id', residentId)
          .eq('house_id', houseId)
          .neq('status', 'void'),
        supabase
          .from('payment_records')
          .select('amount')
          .eq('resident_id', residentId)
          .eq('house_id', houseId)
          .eq('status', 'paid')
          .eq('is_verified', false),
      ]);
      if (unpaidResult.error) throw unpaidResult.error;
      if (countResult.error) throw countResult.error;
      if (unverifiedResult.error) throw unverifiedResult.error;

      const remaining = (invoice: { amount_due: number; amount_paid: number }) => Number(invoice.amount_due) - Number(invoice.amount_paid);
      const unpaid = (unpaidResult.data || []).filter((invoice) => remaining(invoice) > 0);
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
      const overdue = unpaid.filter((invoice) => invoice.due_date.slice(0, 10) < today);
      const next = unpaid.find((invoice) => invoice.due_date.slice(0, 10) >= today);
      return {
        invoiceCount: countResult.count || 0,
        // shortcut: allocation-based (Σ amount_due − amount_paid); #863 replaces it with the shared
        // verified-only roll-forward balance (#804 decisions 18-19) before residents are switched on.
        outstanding: unpaid.reduce((sum, invoice) => sum + remaining(invoice), 0),
        overdue: overdue.length
          ? { total: overdue.reduce((sum, invoice) => sum + remaining(invoice), 0), count: overdue.length, oldestDue: overdue[0].due_date.slice(0, 10) }
          : null,
        next: next ? { amount: remaining(next), dueDate: next.due_date.slice(0, 10), invoiceNumber: next.invoice_number } : null,
        awaitingVerification: (unverifiedResult.data || []).reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
      };
    },

    async getRecentPayments(residentId, houseId, limit) {
      const { data, error } = await createAdminClient()
        .from('payment_records')
        .select('amount, payment_date, method, reference_number, is_verified')
        .eq('resident_id', residentId)
        .eq('house_id', houseId)
        .eq('status', 'paid')
        .order('payment_date', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data || [];
    },

    async getWalletBalance(residentId) {
      const { data, error } = await createAdminClient()
        .from('resident_wallets')
        .select('balance')
        .eq('resident_id', residentId)
        .maybeSingle();
      if (error) throw error;
      return Number(data?.balance || 0);
    },

    async getStatementRows(residentId, houseId, from, to) {
      const supabase = createAdminClient();
      let invoiceQuery = supabase
        .from('invoices')
        .select('invoice_number, amount_due, created_at')
        .eq('resident_id', residentId)
        .eq('house_id', houseId)
        .neq('status', 'void')
        .lte('created_at', to)
        .order('created_at', { ascending: true });
      let paymentQuery = supabase
        .from('payment_records')
        .select('amount, payment_date, reference_number')
        .eq('resident_id', residentId)
        .eq('house_id', houseId)
        .eq('status', 'paid')
        .lte('payment_date', to)
        .order('payment_date', { ascending: true });
      if (from) {
        invoiceQuery = invoiceQuery.gte('created_at', from);
        paymentQuery = paymentQuery.gte('payment_date', from);
      }

      const [{ data: invoices, error: invoiceError }, { data: payments, error: paymentError }] = await Promise.all([
        invoiceQuery,
        paymentQuery,
      ]);
      if (invoiceError) throw invoiceError;
      if (paymentError) throw paymentError;
      return { invoices: invoices || [], payments: payments || [] };
    },

    async setAlertsOn(residentId, phoneNumber, on) {
      const now = new Date().toISOString();
      // Same effect as STOP / START (#804 harmonised: Alert settings item 1).
      const { error } = await createAdminClient()
        .from('whatsapp_optins')
        .update({ opted_in: on, opted_in_at: on ? now : null, opted_out_at: on ? null : now, updated_at: now })
        .eq('resident_id', residentId)
        .eq('phone_number', phoneNumber)
        .is('deactivated_at', null);
      if (error) throw error;
    },

    loadStatement: loadWhatsAppStatementForPeriod,
    storeStatementPdf,
    createStatementRequest,
    queueStatementEmail,

    async getResidentEmail(residentId) {
      const { data, error } = await createAdminClient().from('residents').select('email').eq('id', residentId).single();
      if (error) throw error;
      return data?.email?.trim() || null;
    },

    async logDisclosure(input) {
      const supabase = createAdminClient();
      const { error } = await supabase.from('whatsapp_disclosure_logs').insert({
        resident_id: input.residentId,
        phone_number: input.phoneNumber,
        house_id: input.houseId,
        menu_item: input.menuItem,
        pin_authenticated: input.pinAuthenticated,
        // channel is not in the generated types until the 20261021150000 migration is applied.
        channel: input.channel ?? 'chat',
        metadata: input.metadata ?? null,
      } as never);
      if (error) throw error;
    },
  };
}

export interface WhatsAppFinancialHandlerOptions {
  repository: WhatsAppFinancialRepository;
  optedIn: boolean;
  send?: (message: WhatsAppTextMessage) => Promise<{ success: boolean; error?: string }>;
  /** Throws when the caps cannot be read, so the handler fails closed with the lookup-failure reply. */
  canLookup?: (residentId: string) => Promise<LookupAllowance>;
}

export async function canPerformWhatsAppFinancialLookup(residentId: string): Promise<LookupAllowance> {
  // Runs from the inbound WhatsApp webhook -- unauthenticated -- so this
  // must read via the service-role client (see #136), or the cap always
  // reads null under the webhook regardless of what's configured.
  //
  // Fails CLOSED (#139): this setting gates how many financial disclosures
  // may happen per day, so a query error must be treated as "not
  // permitted" rather than silently falling back to the compiled-in
  // default -- an unreadable cap is not evidence the estate's configured
  // cap is the default, and financial data shouldn't be handed out on
  // that assumption. `absent` (no row -- nobody has configured a cap)
  // keeps the default; that is a genuine unconfigured state, not a
  // transient failure.
  const capResult = await getSettingResultAsService('whatsapp_daily_financial_lookup_cap');
  if (capResult.status === 'error') throw new Error(`WhatsApp lookup cap unreadable: ${capResult.message}`);
  const configuredCap = capResult.status === 'ok' ? capResult.value : undefined;
  const dailyCap = typeof configuredCap === 'number' && Number.isInteger(configuredCap)
    ? configuredCap
    : DEFAULT_ESTATE_DAILY_LOOKUP_CAP;
  if (dailyCap <= 0) return 'estate_cap';

  // Both caps reset at midnight Africa/Lagos.
  const { year, month, day } = lagosParts(new Date());
  const startOfDay = lagosMidnight(year, month, day).toISOString();
  const client = createAdminClient();
  const [estate, resident] = await Promise.all([
    client.from('whatsapp_disclosure_logs').select('id', { count: 'exact', head: true }).gte('created_at', startOfDay),
    client.from('whatsapp_disclosure_logs').select('id', { count: 'exact', head: true }).eq('resident_id', residentId).gte('created_at', startOfDay),
  ]);
  if (estate.error) throw estate.error;
  if (resident.error) throw resident.error;
  if ((estate.count || 0) >= dailyCap) return 'estate_cap';
  if ((resident.count || 0) >= RESIDENT_DAILY_LOOKUP_CAP) return 'resident_cap';
  return 'ok';
}

/** A failed send must reach the webhook (it releases the claim so the provider retries), not the failure reply. */
class ReplySendError extends Error {}

async function sendFinancialReply(
  message: WhatsAppInboundMessage,
  body: string,
  send: WhatsAppFinancialHandlerOptions['send'],
  residentId: string,
  mediaUrls?: string[]
): Promise<void> {
  const result = await (send || ((outbound) =>
    // Reply to the person who just messaged us: exempt from the comms override (decision 8, #715).
    sendWhatsAppMessage(outbound, undefined, { purpose: 'inbound_reply' }, {
      residentId,
      inboundMessageId: message.id,
    })))({ to: message.from, body, idempotencySeed: message.id, ...(mediaUrls ? { mediaUrls } : {}) });
  if (!result.success) throw new ReplySendError(result.error || 'WhatsApp financial reply failed');
}

// ---------------------------------------------------------------------------
// Conversation (#804 harmonised): two menu levels, numbers and fixed keywords only.
//
// The session's current_node is `<node>` or `<node>~<misses>`, misses being the
// unrecognised replies in a row. Nodes: main, financial, answer (after a financial
// answer), more, alerts, notices, disambiguate, statement_period,
// property:<target> and pin:<target>, where target is menu, switch or an item.

type Target = 'menu' | 'switch' | FinancialMenuItem;

const GREETINGS = new Set(['menu', 'hi', 'hello', 'yes', 'start']);
const CONTACT_WORDS = new Set(['9', 'help', 'agent', 'contact']);
const ITEM_FOR_INTENT: Partial<Record<AssistantIntent, FinancialMenuItem>> = {
  owe: 'what_i_owe',
  payments: 'recent_payments',
  statement: 'statement',
  wallet: 'wallet',
};
const FINANCIAL_ITEM_NUMBERS: Record<string, FinancialMenuItem> = { '1': 'what_i_owe', '2': 'recent_payments', '3': 'statement', '4': 'wallet' };

interface Turn {
  message: WhatsAppInboundMessage;
  identity: WhatsAppResidentIdentity;
  options: WhatsAppFinancialHandlerOptions;
  phoneNumber: string;
  text: string;
  session: WhatsAppFinancialSession;
  misses: number;
  settings: AssistantSettings | null;
  contact: string | null;
  pinHash?: string | null;
  pinGate?: boolean;
  houses?: FinancialHouse[];
  notices?: AssistantAnnouncement[];
}

function readNode(raw: string): { node: string; misses: number } {
  const match = raw.match(/^(.*)~(\d+)$/);
  const node = match ? match[1] : raw;
  // Sessions written before #804 used 'menu' and the old property/statement nodes.
  return { node: node === 'menu' || node.startsWith('property_selection:') || node.startsWith('statement_period:') ? 'main' : node, misses: match ? Number(match[2]) : 0 };
}

async function respond(turn: Turn, body: string, node: string, misses = 0, mediaUrls?: string[]): Promise<void> {
  await sendFinancialReply(turn.message, body, turn.options.send, turn.identity.id, mediaUrls);
  turn.session.currentNode = misses ? `${node}~${misses}` : node;
  turn.session.expiresAt = expiry();
  await turn.options.repository.saveSession(turn.session);
}

async function loadPinGate(turn: Turn): Promise<boolean> {
  if (turn.pinGate === undefined) {
    turn.pinHash = await turn.options.repository.getPinHash(turn.identity.id);
    turn.pinGate = !!turn.pinHash || (await turn.options.repository.getForcePin());
  }
  return turn.pinGate;
}

async function loadNotices(turn: Turn): Promise<AssistantAnnouncement[]> {
  turn.notices ??= await turn.options.repository.getLatestAnnouncements(NOTICE_COUNT);
  return turn.notices;
}

async function loadHouses(turn: Turn): Promise<FinancialHouse[]> {
  turn.houses ??= await turn.options.repository.getBillableHouses(turn.identity.id);
  return turn.houses;
}

function footer(turn: Turn): string {
  return answerFooter(!!turn.contact);
}

async function mainMenu(turn: Turn): Promise<string> {
  const lines = [`Hi ${turn.identity.firstName}, what would you like to do?`];
  if (turn.identity.financialEligible) {
    const label = !(await loadPinGate(turn)) ? 'Financial standing' : turn.session.pinAuthenticated ? 'Financial standing (unlocked)' : 'Financial standing (PIN protected)';
    lines.push(`1. ${label}`);
  }
  if ((await loadNotices(turn)).length > 0) lines.push('2. Latest estate notices');
  if (turn.settings?.paymentInstructions) lines.push('3. How to pay');
  lines.push('4. Alert settings');
  if (turn.contact) lines.push('9. Contact the estate office');
  lines.push('Reply with a number.');
  return lines.join('\n');
}

async function showMain(turn: Turn, prefix?: string): Promise<void> {
  const menu = await mainMenu(turn);
  await respond(turn, prefix ? `${prefix}\n\n${menu}` : menu, 'main');
}

function selectedHouse(turn: Turn): FinancialHouse | null {
  return turn.houses?.find((house) => house.id === turn.session.selectedHouseId) ?? null;
}

function financialMenu(turn: Turn): string {
  const houses = turn.houses || [];
  const multiple = houses.length > 1;
  const house = selectedHouse(turn);
  const choices = [turn.contact ? '9 to contact the estate office' : null, turn.session.pinAuthenticated ? 'LOCK to lock now' : null].filter(Boolean) as string[];
  const lastLine = choices.length === 0
    ? 'Reply 0 for menu.'
    : choices.length === 1
      ? `Reply 0 for menu or ${choices[0]}.`
      : `Reply 0 for menu, ${choices[0]}, or ${choices[1]}.`;
  return [
    multiple && house ? `Financial standing: ${house.label}` : 'Financial standing',
    '1. What I owe',
    '2. Recent payments',
    '3. Statement',
    '4. Wallet',
    ...(multiple ? ['8. More'] : []),
    lastLine,
  ].join('\n');
}

function propertyPrompt(houses: FinancialHouse[]): string {
  return ['Which property?', ...houses.map((house, index) => `${index + 1}. ${house.label}`), 'Reply with the property number.'].join('\n');
}

function statementPeriodPrompt(): string {
  return ['Which period?', '1. This month', '2. This year', '3. Last 6 months', '4. Last 12 months', '5. All time', 'Reply with the period number.'].join('\n');
}

async function miss(turn: Turn, node: string): Promise<void> {
  const misses = turn.misses + 1;
  // From the 2nd unrecognised reply in a row, add the estate office line (#804 harmonised).
  await respond(turn, misses >= 2 && turn.contact ? `${UNRECOGNISED}\n${turn.contact}` : UNRECOGNISED, node, misses);
}

function withContact(turn: Turn, body: string): string {
  return turn.contact ? `${body}\n${turn.contact}` : body;
}

/** Enter Financial standing (or one of its items), passing the PIN gate and property choice first. */
async function enterFinancial(turn: Turn, target: Target, prefix?: string): Promise<void> {
  const houses = turn.identity.financialEligible ? await loadHouses(turn) : [];
  if (houses.length === 0) {
    await showMain(turn, 'Financial standing is only available to residents billed for a property.');
    return;
  }

  if ((await loadPinGate(turn)) && !turn.session.pinAuthenticated) {
    const prompt = turn.pinHash
      ? 'Please reply PIN followed by your 4–6 digit PIN before viewing financial standing.'
      : `A security PIN is required before viewing financial standing. To set one, ${SET_PIN_HINT}.`;
    await respond(turn, `${prompt}\n${footer(turn)}`, `pin:${target}`);
    return;
  }

  const lead = prefix ? `${prefix}\n\n` : '';
  if (target === 'switch' || (!selectedHouse(turn) && houses.length > 1)) {
    await respond(turn, `${lead}${propertyPrompt(houses)}`, `property:${target}`);
    return;
  }
  if (!selectedHouse(turn)) turn.session.selectedHouseId = houses[0].id;

  if (target === 'menu') {
    await respond(turn, `${lead}${financialMenu(turn)}`, 'financial');
    return;
  }
  if (target === 'statement') {
    await respond(turn, `${lead}${statementPeriodPrompt()}`, 'statement_period');
    return;
  }
  await answerItem(turn, target);
}

async function capReply(turn: Turn): Promise<string | null> {
  if (!turn.options.canLookup) return null;
  const allowance = await turn.options.canLookup(turn.identity.id);
  if (allowance === 'resident_cap') return withContact(turn, RESIDENT_CAP_REPLY);
  if (allowance === 'estate_cap') return withContact(turn, ESTATE_CAP_REPLY);
  return null;
}

async function answerItem(turn: Turn, item: FinancialMenuItem, period: StatementPeriod = 'this_month'): Promise<void> {
  const house = selectedHouse(turn);
  if (!house) return;
  const capped = await capReply(turn);
  if (capped) {
    await respond(turn, capped, 'financial');
    return;
  }

  const repository = turn.options.repository;
  const hasContact = !!turn.contact;
  let body: string;
  let metadata: Record<string, unknown> | undefined;
  if (item === 'what_i_owe') {
    body = composeOweAnswer(await repository.getOwed(turn.identity.id, house.id), house.label, !!turn.settings?.paymentInstructions, hasContact);
  } else if (item === 'recent_payments') {
    body = composeRecentPaymentsAnswer(await repository.getRecentPayments(turn.identity.id, house.id, RECENT_PAYMENT_COUNT), house.label, hasContact);
  } else if (item === 'wallet') {
    body = composeWalletAnswer(await repository.getWalletBalance(turn.identity.id), hasContact);
  } else {
    const now = new Date();
    const { from, to } = statementRange(period, now);
    const rows = await repository.getStatementRows(turn.identity.id, house.id, from?.toISOString() ?? null, to.toISOString());
    const answer = composeStatementAnswer({ ...rows, period, houseId: house.id, houseLabel: house.label, now, hasContact });
    body = answer.body;
    metadata = answer.metadata;
  }

  // Log before sending (#795): a failed log then discloses nothing, and a provider retry cannot repeat an answer.
  await repository.logDisclosure({
    residentId: turn.identity.id,
    phoneNumber: turn.phoneNumber,
    houseId: house.id,
    menuItem: item,
    pinAuthenticated: turn.session.pinAuthenticated,
    metadata,
  });
  await respond(turn, body, item === 'statement' ? `statement:${period}` : 'answer');
}

function requestInput(turn: Turn, house: FinancialHouse, period: StatementPeriod, fromDate: string, toDate: string, rowCount: number): StatementRequestInput {
  return { residentId: turn.identity.id, phoneNumber: turn.phoneNumber, houseId: house.id, period, fromDate, toDate, rowCount, inboundMessageId: turn.message.id };
}

/** `PDF` after a statement (#804 decision 24 as amended by #863): chat up to 40 rows, email beyond. */
async function deliverStatementPdf(turn: Turn, period: StatementPeriod): Promise<void> {
  const house = selectedHouse(turn);
  // The node outlives a LOCK only in theory; check the gate again before any document leaves.
  if (!house || ((await loadPinGate(turn)) && !turn.session.pinAuthenticated)) return enterFinancial(turn, 'statement');
  const capped = await capReply(turn);
  if (capped) return respond(turn, capped, 'financial');

  const repository = turn.options.repository;
  const { fromDate, toDate, statement } = await repository.loadStatement(turn.identity.id, house.id, period, new Date());
  const rowCount = statement.transactions.length;
  const input = requestInput(turn, house, period, fromDate, toDate, rowCount);

  if (rowCount <= STATEMENT_CHAT_ROW_LIMIT) {
    const body = [
      `*Statement, ${PERIOD_LABELS[period]}, ${house.label}*`,
      `Opening balance: ${formatNaira(statement.openingBalance)}`,
      `Closing balance: ${formatNaira(statement.closingBalance)}`,
      'Your PDF is attached.',
      footer(turn),
    ].join('\n');
    // Log before the file exists (#795): a failed log then discloses nothing.
    await repository.logDisclosure({
      residentId: turn.identity.id,
      phoneNumber: turn.phoneNumber,
      houseId: house.id,
      menuItem: 'statement',
      pinAuthenticated: turn.session.pinAuthenticated,
      channel: 'pdf',
      metadata: { period, row_count: rowCount },
    });
    const url = await repository.storeStatementPdf({ ...input, replyText: body }, statement);
    return respond(turn, body, 'answer', 0, [url]);
  }

  const email = await repository.getResidentEmail(turn.identity.id);
  if (!email) {
    await repository.createStatementRequest({ ...input, status: 'awaiting_email' });
    return respond(turn, `${withContact(turn, "We don't have an email for you. Reply EMAIL to add one now.")}\n${footer(turn)}`, 'answer');
  }
  return respond(turn, `This statement is too long for chat. Send it to ${maskEmail(email)}? Reply 1 Yes, 2 No.`, `statement_email:${period}`);
}

async function confirmStatementEmail(turn: Turn, period: StatementPeriod): Promise<void> {
  const house = selectedHouse(turn);
  // The node outlives a LOCK only in theory; check the gate again before any document leaves.
  if (!house || ((await loadPinGate(turn)) && !turn.session.pinAuthenticated)) return enterFinancial(turn, 'statement');
  const capped = await capReply(turn);
  if (capped) return respond(turn, capped, 'financial');

  const repository = turn.options.repository;
  const email = await repository.getResidentEmail(turn.identity.id);
  if (!email) return deliverStatementPdf(turn, period);
  const { fromDate, toDate, statement } = await repository.loadStatement(turn.identity.id, house.id, period, new Date());
  await repository.logDisclosure({
    residentId: turn.identity.id,
    phoneNumber: turn.phoneNumber,
    houseId: house.id,
    menuItem: 'statement',
    pinAuthenticated: turn.session.pinAuthenticated,
    channel: 'email',
    metadata: { period, row_count: statement.transactions.length },
  });
  const requestId = await repository.createStatementRequest({ ...requestInput(turn, house, period, fromDate, toDate, statement.transactions.length), status: 'queued' });
  await repository.queueStatementEmail(requestId, turn.identity.id, email);
  return respond(turn, `Queued. It will arrive within 15 minutes.\n${footer(turn)}`, 'answer');
}

async function showNotices(turn: Turn): Promise<void> {
  const notices = await loadNotices(turn);
  if (notices.length === 0) {
    await respond(turn, `There are no estate notices right now.\n${footer(turn)}`, 'main');
    return;
  }
  const lines = ['*Latest estate notices*'];
  notices.forEach((notice, index) => {
    const oneLine = (notice.summary || notice.content).split('\n')[0].trim();
    lines.push(`${index + 1}. ${notice.title}${notice.publishedAt ? `, ${formatDay(notice.publishedAt)}` : ''}`);
    lines.push(oneLine.length > 100 ? `${oneLine.slice(0, 99)}…` : oneLine);
  });
  lines.push(notices.length === 1 ? 'Reply 1 to read it in full.' : `Reply 1–${notices.length} to read one in full.`);
  lines.push(footer(turn));
  await respond(turn, lines.join('\n'), 'notices');
}

async function showHowToPay(turn: Turn): Promise<void> {
  const instructions = turn.settings?.paymentInstructions;
  const body = instructions
    ? `*How to pay*\n${instructions}\n${footer(turn)}`
    : `${withContact(turn, 'Payment instructions are not set up yet.')}\n${footer(turn)}`;
  await respond(turn, body, 'main');
}

async function showContact(turn: Turn): Promise<void> {
  if (!turn.contact) {
    await showMain(turn);
    return;
  }
  await respond(turn, `${turn.contact}\nReply 0 for menu.`, 'main');
}

async function runIntent(turn: Turn, intent: AssistantIntent): Promise<void> {
  const item = ITEM_FOR_INTENT[intent];
  if (item) return enterFinancial(turn, item);
  if (intent === 'pay') return showHowToPay(turn);
  if (intent === 'notices') return showNotices(turn);
  return showContact(turn);
}

async function handlePin(turn: Turn, pin: string, node: string): Promise<void> {
  const repository = turn.options.repository;
  const existingHash = await repository.getPinHash(turn.identity.id);
  if (existingHash) {
    // Count the attempt before checking it (#850), so concurrent guesses cannot outrun the lock.
    const attempt = await repository.claimPinAttempt(turn.identity.id);
    if (attempt.status !== 'counted' || !verifyPin(pin, existingHash)) {
      // Every PIN refusal carries the estate office line (#891, #804 amendment 2).
      await respond(turn, withContact(turn, pinRefusalText(attempt)), node);
      return;
    }
    await repository.clearPinAttempts(turn.identity.id, attempt.claimedAt);
    if (!existingHash.startsWith(SALTED_PREFIX)) await repository.setPinHash(turn.identity.id, hashPin(pin));
  } else {
    await repository.setPinHash(turn.identity.id, hashPin(pin));
  }
  turn.session.pinAuthenticated = true;
  turn.pinHash = existingHash;
  turn.pinGate = true;
  const target = node.startsWith('pin:') ? (node.slice(4) as Target) : 'menu';
  await enterFinancial(turn, target, existingHash ? 'PIN verified.' : 'PIN set and verified for this session.');
}

async function chooseProperty(turn: Turn, target: Target): Promise<void> {
  const houses = await loadHouses(turn);
  const house = /^\d+$/.test(turn.text) ? houses[Number(turn.text) - 1] : undefined;
  if (!house) return miss(turn, `property:${target}`);
  turn.session.selectedHouseId = house.id;
  return enterFinancial(turn, target === 'switch' ? 'menu' : target);
}

async function converse(turn: Turn, expired: boolean): Promise<void> {
  const { text } = turn;
  const input = normalizeInput(text);
  const { node } = readNode(turn.session.currentNode);

  const pinCommand = text.match(/^PIN\s+([0-9]{4,6})$/i);
  if (pinCommand && turn.identity.financialEligible) return handlePin(turn, pinCommand[1], node);

  if (expired) {
    const pinClause = turn.identity.financialEligible && (await loadPinGate(turn)) ? ', so your PIN is needed again' : '';
    return showMain(turn, `Your session ended after ${SESSION_MINUTES} minutes without activity${pinClause}. Nothing was changed.`);
  }

  if (turn.message.type !== 'text' || !text) return respond(turn, TEXT_ONLY_REPLY, node, turn.misses);

  if (GREETINGS.has(input)) return showMain(turn);
  if (input === 'cancel') return showMain(turn, 'Cancelled. Nothing was changed.');
  if (input === 'lock') {
    const wasUnlocked = turn.session.pinAuthenticated;
    turn.session.pinAuthenticated = false;
    return showMain(turn, wasUnlocked ? 'Locked. Your PIN is needed again for financial standing.' : undefined);
  }
  if (CONTACT_WORDS.has(input)) return showContact(turn);
  if (input === '0') {
    const backToFinancial = node === 'answer' || node === 'more' || node === 'statement_period' || node.startsWith('property:') || node.startsWith('statement:') || node.startsWith('statement_email:');
    return backToFinancial && turn.identity.financialEligible ? enterFinancial(turn, 'menu') : showMain(turn);
  }

  const intent = turn.settings?.keywordSynonyms[input] ?? DEFAULT_KEYWORDS[input];
  if (intent) return runIntent(turn, intent);
  if (input === 'invoice' || input === 'bill' || input === 'invoices' || input === 'bills') {
    return respond(turn, 'Did you mean 1. What I owe / 2. Statement?', 'disambiguate');
  }

  if (node.startsWith('property:')) return chooseProperty(turn, node.slice('property:'.length) as Target);

  const statementNode = node.match(/^statement(_email)?:(.+)$/);
  const statementPeriod = statementNode && PERIODS.includes(statementNode[2] as StatementPeriod) ? (statementNode[2] as StatementPeriod) : null;
  if (statementPeriod && !statementNode?.[1] && input === 'pdf') {
    await loadHouses(turn);
    return deliverStatementPdf(turn, statementPeriod);
  }
  if (statementPeriod && statementNode?.[1]) {
    await loadHouses(turn);
    if (input === '1') return confirmStatementEmail(turn, statementPeriod);
    if (input === '2') return respond(turn, `Nothing was sent.\n${footer(turn)}`, 'answer');
    return miss(turn, node);
  }

  if (node === 'statement_period') {
    const period = /^[1-5]$/.test(input) ? PERIODS[Number(input) - 1] : null;
    if (!period) return miss(turn, node);
    await loadHouses(turn);
    if (!selectedHouse(turn)) return enterFinancial(turn, 'statement');
    return answerItem(turn, 'statement', period);
  }

  if (node === 'disambiguate') {
    if (input === '1') return enterFinancial(turn, 'what_i_owe');
    if (input === '2') return enterFinancial(turn, 'statement');
    return miss(turn, node);
  }

  if (node === 'notices') {
    const notices = await loadNotices(turn);
    const notice = /^\d+$/.test(input) ? notices[Number(input) - 1] : undefined;
    if (!notice) return miss(turn, node);
    const content = notice.content.length > 3000 ? `${notice.content.slice(0, 2999)}…` : notice.content;
    return respond(turn, [`*${notice.title}*`, ...(notice.publishedAt ? [formatDay(notice.publishedAt)] : []), content, footer(turn)].join('\n'), 'main');
  }

  if (node === 'alerts') {
    if (input !== '1') return miss(turn, node);
    await turn.options.repository.setAlertsOn(turn.identity.id, turn.phoneNumber, false);
    return respond(turn, UNSUBSCRIBED_REPLY, 'main');
  }

  if (node === 'more') {
    if (input === '1' && (await loadHouses(turn)).length > 1) return enterFinancial(turn, 'switch');
    return miss(turn, node);
  }

  if (node === 'financial' || node === 'answer' || node.startsWith('statement:')) {
    const item = FINANCIAL_ITEM_NUMBERS[input];
    if (item) return enterFinancial(turn, item);
    if (input === '8' && (await loadHouses(turn)).length > 1) {
      const house = selectedHouse(turn);
      return respond(turn, ['More', `1. Switch property${house ? ` (now: ${house.label})` : ''}`, footer(turn)].join('\n'), 'more');
    }
    return miss(turn, node);
  }

  // Main menu numbers. A hidden item reads as unrecognised.
  if (input === '1' && turn.identity.financialEligible) return enterFinancial(turn, 'menu');
  if (input === '2' && (await loadNotices(turn)).length > 0) return showNotices(turn);
  if (input === '3' && turn.settings?.paymentInstructions) return showHowToPay(turn);
  if (input === '4') {
    return respond(turn, ['Alert settings', '1. All estate WhatsApp messages: ON', 'Reply 1 to turn them off.', footer(turn)].join('\n'), 'alerts');
  }
  return miss(turn, 'main');
}

/**
 * The resident Assistant (#804): the main menu for every opted-in resident,
 * and Financial standing for the financial tier.
 */
export async function handleFinancialMessage(
  message: WhatsAppInboundMessage,
  identity: WhatsAppResidentIdentity,
  options: WhatsAppFinancialHandlerOptions
): Promise<void> {
  // Master switch (#547), defence in depth: handleResidentMessage already
  // checks, but this is exported. Off means no reply, no session or PIN
  // change, and no disclosure log.
  const masterSwitch = await isWhatsAppMasterSwitchOn();
  if (!masterSwitch.on) {
    console.warn(`WhatsApp financial handler skipped: master switch off (${masterSwitch.reason})`);
    return;
  }

  if (!options.optedIn) {
    await sendFinancialReply(message, 'Please reply YES first to enable WhatsApp access to financial standing.', options.send, identity.id);
    return;
  }

  if (!(await isWhatsAppRecipientAllowed(identity.id))) {
    await sendFinancialReply(message, 'WhatsApp access is not currently enabled for your pilot audience.', options.send, identity.id);
    return;
  }

  const phoneNumber = normalizePhoneNumber(message.from);
  const turn: Turn = {
    message,
    identity,
    options,
    phoneNumber,
    text: message.text?.trim() || '',
    session: { phoneNumber, residentId: identity.id, currentNode: 'main', selectedHouseId: null, pinAuthenticated: false, expiresAt: expiry() },
    misses: 0,
    settings: null,
    contact: null,
  };

  try {
    const stored = await options.repository.getSession(phoneNumber);
    const sameResident = stored?.residentId === identity.id;
    // On expiry the property and PIN unlock are forgotten (#804 decision 13).
    const expired = !!stored && sameResident && Date.parse(stored.expiresAt) <= Date.now();
    if (stored && sameResident && !expired) {
      turn.session = { ...stored };
      turn.misses = readNode(stored.currentNode).misses;
    }
    turn.settings = await options.repository.getAssistantSettings();
    turn.contact = contactLine({ phone: turn.settings.estatePhone, email: turn.settings.estateEmail, hours: turn.settings.officeHours }, new Date());
    await converse(turn, expired);
  } catch (error) {
    if (error instanceof ReplySendError) throw error;
    console.error('WhatsApp Assistant lookup failed:', error);
    await sendFinancialReply(message, turn.contact ? `${LOOKUP_FAILED}\n${turn.contact}` : LOOKUP_FAILED, options.send, identity.id);
  }
}

export function createSupabaseWhatsAppFinancialRepository(): WhatsAppFinancialRepository {
  return createSupabaseRepository();
}
