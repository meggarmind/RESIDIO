import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/server';
import { sendWhatsAppMessage } from '@/lib/whatsapp/provider';
import { normalizePhoneNumber } from '@/lib/sms/termii';
import { getSettingResultAsService } from '@/lib/settings/service';
import { isWhatsAppMasterSwitchOn } from '@/lib/whatsapp/master-switch';
import { isWhatsAppRecipientAllowed } from '@/lib/whatsapp/rollout';
import type { WhatsAppInboundMessage, WhatsAppTextMessage } from '@/lib/whatsapp/types';
import { hashWhatsAppLinkCode, type WhatsAppResidentIdentity } from '@/lib/whatsapp/identity';
import { sendWhatsAppPinAlert } from '@/lib/whatsapp/pin-alert';
import type { AccountStatementData } from '@/lib/billing/account-statement-data';
import {
  STATEMENT_CHAT_ROW_LIMIT,
  createStatementRequest,
  loadWhatsAppStatementForPeriod,
  queueStatementEmail,
  storeStatementPdf,
  type StatementRequestInput,
} from '@/lib/whatsapp/statement-delivery';
import { getReceiptPayments, loadReceipt, storeReceiptPdf, type ReceiptPayment } from '@/lib/whatsapp/receipts';
import { requestClearanceCertificate, type ClearanceRequestResult } from '@/lib/whatsapp/clearance-request';
import type { PaymentReceiptData } from '@/lib/pdf/payment-receipt';
import {
  REPORTS_PER_DAY,
  REPORT_WINDOW_DAYS,
  MAX_REPORT_AMOUNT,
  cleanReference,
  checkReportDate,
  createPaymentReport,
  parseReportAmount,
  parseReportDate,
  type PaymentReportInput,
  type PaymentReportResult,
} from '@/lib/whatsapp/payment-reports';
import {
  confirmEmailChange,
  getRemindersOn,
  setRemindersOn,
  startEmailChange,
  type EmailChangeConfirm,
  type EmailChangeStart,
} from '@/lib/whatsapp/account-actions';
import {
  SURVEY_COMMENT_PROMPT,
  SURVEY_PROMPT,
  SURVEY_REASON_PROMPT,
  SURVEY_RECORDED_REPLY,
  SURVEY_THANKS_REPLY,
  cleanSurveyComment,
  isThanks,
  parseSurveyReason,
  parseSurveyScore,
  type SurveyTrigger,
} from '@/lib/whatsapp/survey';
import { answerSurvey, askSurvey } from '@/lib/whatsapp/survey-db';
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
// #892: a setup code from the estate office allows 3 wrong tries, then pauses for an hour.
const SETUP_CODE_TRIES = 3;
const SETUP_CODE_PAUSE_MINUTES = 60;
// #892: 3 mismatched confirmations cancel setting or changing a PIN.
const PIN_CONFIRM_TRIES = 3;
const SET_PIN_HINT = 'reply PIN';
const PIN_DIGITS = /^\d{4,6}$/;
const VERIFY_PIN_PROMPT = 'Enter your 4–6 digit PIN to view your financial standing (e.g. 4821).';
const SETUP_CODE_PROMPT = 'Enter the 6-digit setup code from the estate office.';
const CHOOSE_PIN_PROMPT = 'Choose a 4–6 digit PIN.';
const CHOOSE_NEW_PIN_PROMPT = 'Choose a new 4–6 digit PIN.';
const CURRENT_PIN_PROMPT = 'Enter your current PIN.';
const CONFIRM_PIN_PROMPT = 'Enter the same PIN again to confirm.';
const PIN_MISMATCH_REPLY = "That PIN doesn't match. Enter the same PIN again to confirm.";
const WEAK_PIN_REPLY = 'That PIN is too easy to guess. Please choose another 4–6 digit PIN.';
const NOTHING_CHANGED_REPLY = 'Nothing was changed.';
const PIN_VERIFIED_REPLY = 'PIN verified. Your financial standing is unlocked for 15 minutes.';
const PIN_SET_REPLY = 'Your PIN is set ✅ Your financial standing is unlocked for 15 minutes. For privacy, you can delete the messages with your PIN from this chat.';
/** Easy PINs refused at setup besides one-digit, run and repeated-block PINs (#805 decision 3). */
const WEAK_PIN_DENYLIST = new Set(['2580', '0852', '1004', '2000', '2001', '1122', '6969', '112233', '147258', '159753']);
/** Per-resident daily cap on financial answers (#804 decision 26). */
export const RESIDENT_DAILY_LOOKUP_CAP = 20;
/** Estate-wide cap when the setting is absent (#804 decision 26 raised it from 50). */
export const DEFAULT_ESTATE_DAILY_LOOKUP_CAP = 500;
const RECENT_PAYMENT_COUNT = 5;
const RECEIPT_COUNT = 5;
const NOTICE_COUNT = 3;

const UNRECOGNISED = "I didn't catch that. Reply with a number from the menu, or MENU to see it again.";
const LOOKUP_FAILED = "I can't load your records right now, so nothing was shown or changed. Please try again in a few minutes.";
const RESIDENT_CAP_REPLY = `You've reached today's limit of ${RESIDENT_DAILY_LOOKUP_CAP} financial lookups. It resets at midnight.`;
const ESTATE_CAP_REPLY = 'Financial lookups are paused for everyone until midnight. Nothing is wrong with your account.';
const TEXT_ONLY_REPLY = 'I can only read text messages here. Please type your request.';
const UNSUBSCRIBED_REPLY = "You've been unsubscribed from estate WhatsApp alerts. Reply START any time to re-subscribe.";

/** Values written to whatsapp_disclosure_logs.menu_item (shown as-is in the operations console). */
export type FinancialMenuItem = 'what_i_owe' | 'recent_payments' | 'statement' | 'wallet' | 'receipt' | 'clearance';
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
  /** Answers collected so far in a multi-step flow (a payment report); dropped when the flow ends. */
  draft?: Record<string, unknown> | null;
  /** Salted hash of a chosen PIN awaiting confirmation (#892); never the PIN itself. */
  pendingPinHash?: string | null;
}

/** A setup code checked against the resident's one live code, its try counted first (#892). */
export type SetupCodeClaim =
  | { status: 'accepted' }
  | { status: 'wrong'; triesLeft: number }
  | { status: 'paused'; pausedUntil: string }
  | { status: 'none' };

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

export interface WhatsAppFinancialRepository {
  /** The stored session for this number, expired or not, so the handler can announce an expiry. */
  getSession(phoneNumber: string): Promise<WhatsAppFinancialSession | null>;
  saveSession(session: WhatsAppFinancialSession): Promise<void>;
  getForcePin(): Promise<boolean>;
  getPinHash(residentId: string): Promise<string | null>;
  /** Stores the hash only while the stored one is still `expected` (null: no PIN yet); false when it was not. */
  setPinHash(residentId: string, hash: string, expected: string | null): Promise<boolean>;
  /** Checks a setup code against the resident's live `pin_setup` code, counting the try before the check. */
  claimSetupCode(residentId: string, code: string): Promise<SetupCodeClaim>;
  /** Emails the resident, when an email is on file, that their PIN was set or changed from this number. */
  sendPinAlert(residentId: string, event: 'set' | 'change', phoneNumber: string): Promise<void>;
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
  setAlertsOn(residentId: string, phoneNumber: string, on: boolean): Promise<void>;
  /** WhatsApp payment and invoice reminders (#816 decisions 2-4). */
  getRemindersOn(residentId: string): Promise<boolean>;
  setRemindersOn(residentId: string, on: boolean): Promise<void>;
  /** Sends the verification code to the new address; nothing is saved until confirmEmailChange (#816 decision 5). */
  startEmailChange(residentId: string, email: string): Promise<EmailChangeStart>;
  confirmEmailChange(residentId: string, code: string): Promise<EmailChangeConfirm>;
  /** Files a pending, unverified payment and its approval request (#816 decisions 10-12). */
  createPaymentReport(input: PaymentReportInput): Promise<PaymentReportResult>;
  /** The latest payments to pick a receipt from (#816 decision 14). */
  getReceiptPayments(residentId: string, houseId: string, limit: number): Promise<ReceiptPayment[]>;
  /** The receipt of a verified payment of this resident and property; null when there is none. */
  loadReceipt(residentId: string, houseId: string, paymentId: string): Promise<PaymentReceiptData | null>;
  /** Stores the receipt PDF privately and returns a 1-hour signed URL for the reply. */
  storeReceiptPdf(input: Parameters<typeof storeReceiptPdf>[0], receipt: PaymentReceiptData): Promise<string>;
  /** Files an approval request for a clearance certificate on this property (#816 decision 15). */
  requestClearance(input: Parameters<typeof requestClearanceCertificate>[0]): Promise<ClearanceRequestResult>;
  /** The statement PDF for a period: the admin account statement, with its Lagos dates. */
  loadStatement(residentId: string, houseId: string, period: StatementPeriod, now: Date): Promise<{ fromDate: string; toDate: string; statement: AccountStatementData }>;
  /** Stores the PDF privately and returns a 1-hour signed URL for the reply. */
  storeStatementPdf(input: StatementRequestInput & { replyText: string }, statement: AccountStatementData): Promise<string>;
  /** Records that the resident is being asked for feedback (#872); null when they must not be: opted out, or asked in the last 30 days. */
  askSurvey(input: { residentId: string; phoneNumber: string; trigger: SurveyTrigger }): Promise<string | null>;
  answerSurvey(residentId: string, surveyId: string, answer: Parameters<typeof answerSurvey>[2]): Promise<void>;
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

/** One digit repeated, a run up or down, a short block repeated (1212, 123123), or a denylisted PIN. */
export function isWeakPin(pin: string): boolean {
  return /^(\d)\1+$/.test(pin)
    || '01234567890'.includes(pin)
    || '09876543210'.includes(pin)
    || /^(\d{2})\1+$/.test(pin)
    || /^(\d{3})\1$/.test(pin)
    || WEAK_PIN_DENYLIST.has(pin);
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

/**
 * The generated types do not know whatsapp_sessions.pending_pin_hash (#892) or the
 * whatsapp_link_tokens purpose/failed_attempts/paused_until columns (#890) until those migrations
 * are applied and `npm run db:types` is re-run; remove this after that.
 */
function untypedAdminClient(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

function createSupabaseRepository(): WhatsAppFinancialRepository {
  return {
    async getSession(phoneNumber) {
      // whatsapp_sessions.draft (#816) is not in the generated types until its migration is applied.
      const { data, error } = await untypedAdminClient()
        .from('whatsapp_sessions')
        .select('phone_number, resident_id, current_node, selected_house_id, pin_authenticated, expires_at, pending_pin_hash, draft')
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
        draft: data.draft ?? null,
        pendingPinHash: data.pending_pin_hash,
      };
    },

    async saveSession(session) {
      const { error } = await untypedAdminClient().from('whatsapp_sessions').upsert(
        {
          phone_number: session.phoneNumber,
          resident_id: session.residentId,
          current_node: session.currentNode,
          selected_house_id: session.selectedHouseId,
          pin_authenticated: session.pinAuthenticated,
          pending_pin_hash: session.pendingPinHash ?? null,
          expires_at: session.expiresAt,
          draft: session.draft ?? null,
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

    async setPinHash(residentId, pinHash, expected) {
      const supabase = createAdminClient();
      const update = supabase
        .from('residents')
        .update({ whatsapp_pin_hash: pinHash, whatsapp_pin_set_at: new Date().toISOString() })
        .eq('id', residentId);
      const { data, error } = await (expected === null
        ? update.is('whatsapp_pin_hash', null)
        : update.eq('whatsapp_pin_hash', expected)
      ).select('id');
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },

    async claimSetupCode(residentId, code) {
      const supabase = untypedAdminClient();
      const now = new Date();
      // One live setup code per resident (#890): a wrong code counts against it, whatever was typed.
      const { data: token, error } = await supabase
        .from('whatsapp_link_tokens')
        .select('id, token_hash, failed_attempts, paused_until')
        .eq('resident_id', residentId)
        .eq('purpose', 'pin_setup')
        .is('used_at', null)
        .gt('expires_at', now.toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!token) return { status: 'none' };
      const pausedUntil = token.paused_until ? Date.parse(token.paused_until) : null;
      if (pausedUntil && pausedUntil > now.getTime()) return { status: 'paused', pausedUntil: token.paused_until };

      // Count the try before checking it, as a compare-and-set on the count, so concurrent guesses
      // cannot all be checked before the pause lands; a try that loses the race is refused.
      const tries = pausedUntil ? 1 : token.failed_attempts + 1;
      const pause = tries >= SETUP_CODE_TRIES ? new Date(now.getTime() + SETUP_CODE_PAUSE_MINUTES * 60 * 1000).toISOString() : null;
      const { data: counted, error: countError } = await supabase
        .from('whatsapp_link_tokens')
        .update({ failed_attempts: tries, paused_until: pause })
        .eq('id', token.id)
        .eq('failed_attempts', token.failed_attempts)
        .is('used_at', null)
        .select('id');
      if (countError) throw countError;
      if (!counted?.length) return { status: 'none' };

      const expected = Buffer.from(token.token_hash, 'hex');
      const actual = Buffer.from(hashWhatsAppLinkCode(code), 'hex');
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
        return pause ? { status: 'paused', pausedUntil: pause } : { status: 'wrong', triesLeft: SETUP_CODE_TRIES - tries };
      }

      // Single use: of two requests carrying the right code, only the one that marks it used goes on.
      const { data: used, error: useError } = await supabase
        .from('whatsapp_link_tokens')
        .update({ used_at: now.toISOString() })
        .eq('id', token.id)
        .is('used_at', null)
        .select('id');
      if (useError) throw useError;
      return used?.length ? { status: 'accepted' } : { status: 'none' };
    },

    async sendPinAlert(residentId, event, phoneNumber) {
      await sendWhatsAppPinAlert(residentId, event, [phoneNumber]);
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
          // A payment a resident reported over WhatsApp is pending until an admin verifies it (#816 decision 11).
          .in('status', ['paid', 'pending'])
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

    getRemindersOn,
    setRemindersOn,
    startEmailChange,
    confirmEmailChange,
    createPaymentReport,
    getReceiptPayments,
    loadReceipt,
    storeReceiptPdf,
    requestClearance: requestClearanceCertificate,
    loadStatement: loadWhatsAppStatementForPeriod,
    storeStatementPdf,
    askSurvey,
    answerSurvey,
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

type Target = 'menu' | 'switch' | 'report' | FinancialMenuItem;

const GREETINGS = new Set(['menu', 'hi', 'hello', 'yes', 'start']);
const CONTACT_WORDS = new Set(['9', 'help', 'agent', 'contact']);
const ITEM_FOR_INTENT: Partial<Record<AssistantIntent, Target>> = {
  owe: 'what_i_owe',
  payments: 'recent_payments',
  statement: 'statement',
  wallet: 'wallet',
  receipt: 'receipt',
  report: 'report',
  clearance: 'clearance',
};
const FINANCIAL_ITEM_NUMBERS: Record<string, Target> = { '1': 'what_i_owe', '2': 'recent_payments', '3': 'statement', '4': 'wallet', '5': 'receipt', '6': 'report', '7': 'clearance' };

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
  /** Set by a reply that delivered a financial answer, so a thank-you right after can open the survey (#872). */
  answered?: boolean;
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
  if (!/^(report|receipt|survey)_/.test(node)) turn.session.draft = turn.answered ? { answered: true } : null;
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
  lines.push('5. Update email');
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
    '5. Receipt',
    '6. Report a payment',
    '7. Clearance certificate',
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

/** The PIN request shown before changing an email; a resident with no PIN yet is told how to set one. */
function emailPinPrompt(turn: Turn): string {
  return turn.pinHash
    ? 'Enter your 4–6 digit PIN before changing your email (e.g. 4821).'
    : `A security PIN is required before changing your email. To set one, ${SET_PIN_HINT}.`;
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
      ? VERIFY_PIN_PROMPT
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
  if (target === 'report') return startReport(turn, lead);
  if (target === 'receipt') return showReceipts(turn, lead);
  if (target === 'clearance') return askForClearance(turn, lead);
  await answerItem(turn, target, prefix);
}

async function capReply(turn: Turn): Promise<string | null> {
  if (!turn.options.canLookup) return null;
  const allowance = await turn.options.canLookup(turn.identity.id);
  if (allowance === 'resident_cap') return withContact(turn, RESIDENT_CAP_REPLY);
  if (allowance === 'estate_cap') return withContact(turn, ESTATE_CAP_REPLY);
  return null;
}

async function answerItem(turn: Turn, item: Exclude<FinancialMenuItem, 'statement'>, prefix?: string): Promise<void> {
  const house = selectedHouse(turn);
  if (!house) return;
  const lead = prefix ? `${prefix}\n\n` : '';
  const capped = await capReply(turn);
  if (capped) {
    await respond(turn, `${lead}${capped}`, 'financial');
    return;
  }

  const repository = turn.options.repository;
  const hasContact = !!turn.contact;
  let body: string;
  if (item === 'what_i_owe') {
    body = composeOweAnswer(await repository.getOwed(turn.identity.id, house.id), house.label, !!turn.settings?.paymentInstructions, hasContact);
  } else if (item === 'recent_payments') {
    body = composeRecentPaymentsAnswer(await repository.getRecentPayments(turn.identity.id, house.id, RECENT_PAYMENT_COUNT), house.label, hasContact);
  } else {
    body = composeWalletAnswer(await repository.getWalletBalance(turn.identity.id), hasContact);
  }

  // Log before sending (#795): a failed log then discloses nothing, and a provider retry cannot repeat an answer.
  await repository.logDisclosure({
    residentId: turn.identity.id,
    phoneNumber: turn.phoneNumber,
    houseId: house.id,
    menuItem: item,
    pinAuthenticated: turn.session.pinAuthenticated,
  });
  turn.answered = true;
  await respond(turn, `${lead}${body}`, 'answer');
}

function requestInput(turn: Turn, house: FinancialHouse, period: StatementPeriod, fromDate: string, toDate: string, rowCount: number): StatementRequestInput {
  return { residentId: turn.identity.id, phoneNumber: turn.phoneNumber, houseId: house.id, period, fromDate, toDate, rowCount, inboundMessageId: turn.message.id };
}

/** The period and property line that opens every statement reply; carries no statement rows (#917). */
function statementHeading(period: StatementPeriod, house: FinancialHouse, fromDate: string, toDate: string): string {
  return `*Statement, ${PERIOD_LABELS[period]}, ${house.label}*\n${formatDay(fromDate)} to ${formatDay(toDate)}`;
}

/**
 * Every statement is a PDF, never chat text (#917, amending #804 decisions 22-24 and #863): in
 * chat up to 40 rows, by email beyond. The reply only says where the PDF is going.
 */
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
    const body = [statementHeading(period, house, fromDate, toDate), 'Your PDF is attached.', footer(turn)].join('\n');
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
    turn.answered = true;
    return respond(turn, body, 'answer', 0, [url]);
  }

  const email = await repository.getResidentEmail(turn.identity.id);
  if (!email) {
    await repository.createStatementRequest({ ...input, status: 'awaiting_email' });
    return respond(turn, `${withContact(turn, "We don't have an email for you. Reply EMAIL to add one now.")}\n${footer(turn)}`, 'answer');
  }
  return respond(turn, `${statementHeading(period, house, fromDate, toDate)}\nThis statement is too long for chat. Send the PDF to ${maskEmail(email)}? Reply 1 Yes, 2 No.`, `statement_email:${period}`);
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
  turn.answered = true;
  return respond(turn, `${statementHeading(period, house, fromDate, toDate)}\nYour PDF is queued for ${maskEmail(email)}. It will arrive within 15 minutes.\n${footer(turn)}`, 'answer');
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

// ---------------------------------------------------------------------------
// Receipt (#816 decision 14): pick one of the latest payments, get a PDF of a verified one.

interface ReceiptDraft {
  payments: Array<{ id: string; verified: boolean }>;
}

async function showReceipts(turn: Turn, lead: string): Promise<void> {
  const house = selectedHouse(turn);
  if (!house) return;
  const capped = await capReply(turn);
  if (capped) return respond(turn, capped, 'financial');

  const repository = turn.options.repository;
  const payments = await repository.getReceiptPayments(turn.identity.id, house.id, RECEIPT_COUNT);
  // The list shows amounts and dates, so it is a disclosure like Recent payments (#795).
  await repository.logDisclosure({
    residentId: turn.identity.id,
    phoneNumber: turn.phoneNumber,
    houseId: house.id,
    menuItem: 'receipt',
    pinAuthenticated: turn.session.pinAuthenticated,
    metadata: { step: 'list', row_count: payments.length },
  });
  if (payments.length === 0) return respond(turn, `${lead}*Receipts, ${house.label}*\nNo payments recorded for ${house.label}.\n${footer(turn)}`, 'answer');

  turn.session.draft = { payments: payments.map((payment) => ({ id: payment.id, verified: payment.is_verified })) } satisfies ReceiptDraft;
  const lines = payments.map((payment, index) =>
    [`${index + 1}.`, formatDay(payment.payment_date), formatNaira(payment.amount), payment.method ? payment.method.replaceAll('_', ' ') : 'payment', ...(payment.is_verified ? [] : ['(awaiting verification)'])].join('  ')
  );
  await respond(turn, [`${lead}*Receipts, ${house.label}*`, ...lines, payments.length === 1 ? 'Reply 1 to get a receipt.' : `Reply 1–${payments.length} to get a receipt.`, footer(turn)].join('\n'), 'receipt_pick');
}

async function pickReceipt(turn: Turn, input: string): Promise<void> {
  const draft = turn.session.draft as Partial<ReceiptDraft> | null | undefined;
  const payment = /^\d+$/.test(input) ? draft?.payments?.[Number(input) - 1] : undefined;
  if (!payment) return miss(turn, 'receipt_pick');

  await loadHouses(turn);
  const house = selectedHouse(turn);
  // The node outlives a LOCK only in theory; check the gate again before any document leaves.
  if (!house || ((await loadPinGate(turn)) && !turn.session.pinAuthenticated)) return enterFinancial(turn, 'receipt');
  const capped = await capReply(turn);
  if (capped) return respond(turn, capped, 'financial');

  const repository = turn.options.repository;
  const receipt = payment.verified ? await repository.loadReceipt(turn.identity.id, house.id, payment.id) : null;
  if (!receipt) return respond(turn, `A receipt is available once this payment is verified.\n${footer(turn)}`, 'answer');

  const body = [`*Receipt, ${house.label}*`, `${formatNaira(receipt.amount)} on ${formatDay(receipt.paymentDate)}. Your PDF is attached.`, footer(turn)].join('\n');
  // Log before the file exists (#795): a failed log then discloses nothing.
  await repository.logDisclosure({
    residentId: turn.identity.id,
    phoneNumber: turn.phoneNumber,
    houseId: house.id,
    menuItem: 'receipt',
    pinAuthenticated: turn.session.pinAuthenticated,
    channel: 'pdf',
    metadata: { step: 'pdf', payment_id: payment.id },
  });
  const url = await repository.storeReceiptPdf({ residentId: turn.identity.id, phoneNumber: turn.phoneNumber, houseId: house.id, inboundMessageId: turn.message.id, replyText: body }, receipt);
  turn.answered = true;
  await respond(turn, body, 'answer', 0, [url]);
}

// ---------------------------------------------------------------------------
// Clearance certificate (#816 decision 15): owing anything means the amount owed; owing nothing files a
// request for an admin to approve, and the certificate then arrives here.

async function askForClearance(turn: Turn, lead: string): Promise<void> {
  const house = selectedHouse(turn);
  if (!house) return;
  const capped = await capReply(turn);
  if (capped) return respond(turn, capped, 'financial');

  const repository = turn.options.repository;
  const owed = await repository.getOwed(turn.identity.id, house.id);
  // Log before any figure or request leaves (#795).
  await repository.logDisclosure({
    residentId: turn.identity.id,
    phoneNumber: turn.phoneNumber,
    houseId: house.id,
    menuItem: 'clearance',
    pinAuthenticated: turn.session.pinAuthenticated,
    metadata: { owes: owed.outstanding > 0 },
  });

  const title = `${lead}*Clearance certificate, ${house.label}*`;
  if (owed.outstanding > 0) {
    const pay = turn.settings?.paymentInstructions ? '\nReply PAY for how to pay' : '';
    return respond(turn, `${title}\nYou owe ${formatNaira(owed.outstanding)} on ${house.label}, so a certificate cannot be requested yet.${pay}\n${footer(turn)}`, 'answer');
  }

  const result = await repository.requestClearance({ residentId: turn.identity.id, residentName: `${turn.identity.firstName} ${turn.identity.lastName}`, houseId: house.id, houseLabel: house.label });
  const reply = result.status === 'requested'
    ? `Your clearance certificate request for ${house.label} was sent to the estate office. The certificate will be sent here once it is approved.`
    : withContact(turn, `A clearance certificate request for ${house.label} is already waiting for approval. Nothing new was sent.`);
  const text = `${title}\n${reply}\n${footer(turn)}`;
  const ask = result.status === 'requested' ? await surveyPrompt(turn, 'clearance_request') : null;
  await respond(turn, ask ? `${text}\n\n${ask}` : text, ask ? 'survey_score' : 'answer');
}

// ---------------------------------------------------------------------------
// Report a payment (#816 decisions 10-12): property, amount, date, reference, then a confirm screen.
// The answers so far live in session.draft; every report_* node keeps them.

interface ReportDraft {
  houseId: string;
  amount?: number;
  paymentDate?: string;
  reference?: string;
  screenshotAt?: string;
}

function reportDraft(turn: Turn): ReportDraft | null {
  const draft = turn.session.draft as Partial<ReportDraft> | null | undefined;
  return draft?.houseId ? (draft as ReportDraft) : null;
}

async function startReport(turn: Turn, lead: string): Promise<void> {
  const house = selectedHouse(turn);
  if (!house) return;
  turn.session.draft = { houseId: house.id } satisfies ReportDraft;
  await respond(turn, `${lead}*Report a payment, ${house.label}*\nHow much did you pay? Reply with the amount in naira, for example 50000, or CANCEL.`, 'report_amount');
}

/** Reports are for a property the resident is billed for; a draft that lost its property starts over. */
async function reportContext(turn: Turn): Promise<{ draft: ReportDraft; house: FinancialHouse } | null> {
  const draft = reportDraft(turn);
  const house = draft ? (await loadHouses(turn)).find((candidate) => candidate.id === draft.houseId) : undefined;
  if (!draft || !house || ((await loadPinGate(turn)) && !turn.session.pinAuthenticated)) {
    await showMain(turn, 'That report could not be continued. Nothing was sent.');
    return null;
  }
  return { draft, house };
}

async function reportStep(turn: Turn, node: string): Promise<void> {
  const context = await reportContext(turn);
  if (!context) return;
  const { draft, house } = context;
  const again = (reply: string) => respond(turn, reply, node, turn.misses + 1);
  const now = new Date();

  if (node === 'report_amount') {
    const amount = parseReportAmount(turn.text);
    if (amount === null) return again("That doesn't look like an amount. Reply with the amount in naira, for example 50000, or CANCEL.");
    if (amount <= 0) return again('The amount must be more than ₦0. Reply with the amount in naira, or CANCEL.');
    if (amount > MAX_REPORT_AMOUNT) return again('That amount is too large. Check it and reply with the amount in naira, or CANCEL.');
    turn.session.draft = { ...draft, amount };
    return respond(turn, `${formatNaira(amount)}. When did you pay? Reply with the date, for example 12 Oct 2026, or TODAY or YESTERDAY.`, 'report_date');
  }

  if (node === 'report_date') {
    const paymentDate = parseReportDate(turn.text, now);
    if (!paymentDate) return again("That doesn't look like a date. Reply with it like 12 Oct 2026, or TODAY or YESTERDAY, or CANCEL.");
    const check = checkReportDate(paymentDate, now);
    if (check === 'future') return again('That date is in the future. Reply with the date you paid, or CANCEL.');
    if (check === 'too_old') {
      return again(withContact(turn, `Payments from more than ${REPORT_WINDOW_DAYS} days ago cannot be reported here. Reply with a later date, or CANCEL.`));
    }
    turn.session.draft = { ...draft, paymentDate };
    return respond(turn, `${formatDay(paymentDate)}. Reply with the bank narration or reference shown on your transfer. You can also send a screenshot; the estate office will see it on the estate phone.`, 'report_reference');
  }

  if (node === 'report_reference') {
    const reference = cleanReference(turn.text);
    if (!reference) return again('Reply with the narration or reference in under 100 characters, or CANCEL.');
    if (draft.amount === undefined || !draft.paymentDate) return showMain(turn, 'That report could not be continued. Nothing was sent.');
    turn.session.draft = { ...draft, reference };
    return respond(
      turn,
      ['*Report a payment*', `Property: ${house.label}`, `Amount: ${formatNaira(draft.amount)}`, `Date: ${formatDay(draft.paymentDate)}`, `Reference: ${reference}`, 'Reply 1 to send it to the estate office, 2 to cancel.'].join('\n'),
      'report_confirm'
    );
  }

  // report_confirm
  if (turn.text !== '1' && turn.text !== '2') return miss(turn, node);
  if (turn.text === '2') return showMain(turn, 'Cancelled. Nothing was changed.');
  if (draft.amount === undefined || !draft.paymentDate || !draft.reference) return showMain(turn, 'That report could not be continued. Nothing was sent.');

  const result = await turn.options.repository.createPaymentReport({
    residentId: turn.identity.id,
    houseId: house.id,
    houseLabel: house.label,
    amount: draft.amount,
    paymentDate: draft.paymentDate,
    reference: draft.reference,
    screenshotAt: draft.screenshotAt ?? null,
  });
  const reply = result.status === 'created'
    ? 'Reported. The estate office will check it against the bank statement. It shows as awaiting verification until then.'
    : result.status === 'duplicate'
      ? `A payment of ${formatNaira(draft.amount)} on ${formatDay(draft.paymentDate)} for ${house.label} has already been reported. Nothing was sent.`
      : result.status === 'limit'
        ? withContact(turn, `You've reported ${REPORTS_PER_DAY} payments today, which is the limit. Please try again tomorrow.`)
        : withContact(turn, 'That payment could not be reported. Nothing was sent.');
  const text = `${reply}\n${footer(turn)}`;
  const ask = result.status === 'created' ? await surveyPrompt(turn, 'payment_report') : null;
  await respond(turn, ask ? `${text}\n\n${ask}` : text, ask ? 'survey_score' : 'main');
}

/** An image inside a report: Chatmaid does not pass the file on, so say where it went and note when it came (decision 10). */
async function acknowledgeScreenshot(turn: Turn, node: string): Promise<void> {
  const draft = reportDraft(turn);
  if (draft) {
    const sentAt = new Date(Number(turn.message.timestamp) * 1000);
    if (!Number.isNaN(sentAt.getTime())) turn.session.draft = { ...draft, screenshotAt: `${lockTime(sentAt.toISOString())} on ${formatDay(sentAt)}` };
  }
  await respond(turn, 'Screenshot received. The estate office will see it on the estate phone.\nContinue with your report, or reply CANCEL.', node);
}

// ---------------------------------------------------------------------------
// Account actions (#816): reminders and verified email

async function showAlertSettings(turn: Turn): Promise<void> {
  const lines = ['Alert settings', '1. All estate WhatsApp messages: ON'];
  if (turn.identity.financialEligible) {
    const on = await turn.options.repository.getRemindersOn(turn.identity.id);
    lines.push(`2. Payment reminders: ${on ? 'ON' : 'OFF'}`, 'Reply 1 or 2 to change one.');
  } else {
    lines.push('Reply 1 to turn them off.');
  }
  lines.push(footer(turn));
  await respond(turn, lines.join('\n'), 'alerts');
}

/** Payment reminders on WhatsApp: off asks first (decision 4), on is immediate. */
async function toggleReminders(turn: Turn): Promise<void> {
  if (!turn.identity.financialEligible) return showAlertSettings(turn);
  if (await turn.options.repository.getRemindersOn(turn.identity.id)) {
    return respond(turn, 'Turn off payment reminders on WhatsApp? Reply 1 Yes, 2 No.', 'reminders_confirm');
  }
  await turn.options.repository.setRemindersOn(turn.identity.id, true);
  await respond(turn, `Reminders on. You will get payment reminders on WhatsApp again.\n${footer(turn)}`, 'main');
}

async function confirmReminders(turn: Turn, input: string): Promise<void> {
  if (input === '2') return respond(turn, `Nothing was changed.\n${footer(turn)}`, 'main');
  if (input !== '1') return miss(turn, 'reminders_confirm');
  await turn.options.repository.setRemindersOn(turn.identity.id, false);
  await respond(turn, `Reminders off. Your bills still apply. Reply 4 then 2 to turn them back on.\n${footer(turn)}`, 'main');
}

/** Update email (both tiers). A PIN-verified session is required when a PIN is set or forced (decision 6). */
async function startEmail(turn: Turn, prefix?: string): Promise<void> {
  // Only a financial-tier resident can set a PIN, so the community tier is asked only if they already have one.
  const gated = (await loadPinGate(turn)) && (turn.identity.financialEligible || !!turn.pinHash);
  if (gated && !turn.session.pinAuthenticated) {
    return respond(turn, `${emailPinPrompt(turn)}\n${footer(turn)}`, 'pin:email');
  }
  const lead = prefix ? `${prefix}\n\n` : '';
  await respond(turn, `${lead}What email address should we use? Reply with the address, or CANCEL.`, 'email_address');
}

const EMAIL_FAILED = "I couldn't do that right now. Nothing was changed. Please try again in a few minutes.";

async function submitEmailAddress(turn: Turn): Promise<void> {
  const result = await turn.options.repository.startEmailChange(turn.identity.id, turn.text);
  if (result.status === 'sent') {
    return respond(turn, `We sent a 6-digit code to ${maskEmail(result.email)}. It expires in 30 minutes. Reply with the code, or CANCEL.`, 'email_code');
  }
  if (result.status === 'invalid') {
    return respond(turn, "That doesn't look like an email address. Reply with it again, for example name@example.com, or CANCEL.", 'email_address', turn.misses + 1);
  }
  const reply = result.status === 'same'
    ? 'That is already your verified email. Nothing was changed.'
    : result.status === 'rate_limited'
      ? 'Too many codes were sent. Please try again in an hour. Nothing was changed.'
      : EMAIL_FAILED;
  await respond(turn, `${reply}\n${footer(turn)}`, 'main');
}

async function submitEmailCode(turn: Turn): Promise<void> {
  if (!/^\d{6}$/.test(turn.text)) {
    return respond(turn, 'Reply with the 6-digit code from the email, or CANCEL.', 'email_code', turn.misses + 1);
  }
  const result = await turn.options.repository.confirmEmailChange(turn.identity.id, turn.text);
  if (result.status === 'saved') {
    const queued = result.statementsQueued > 0 ? ' Your statement will arrive within 15 minutes.' : '';
    return respond(turn, `Your email is now ${maskEmail(result.email)}.${queued}\n${footer(turn)}`, 'main');
  }
  if (result.status === 'wrong') return respond(turn, "That code isn't correct. Check the email and reply with the code again, or CANCEL.", 'email_code');
  const reply = result.status === 'locked'
    ? 'Too many wrong codes. Reply EMAIL to start again.'
    : result.status === 'expired'
      ? 'That code has expired. Reply EMAIL to start again.'
      : EMAIL_FAILED;
  await respond(turn, `${reply}\n${footer(turn)}`, 'main');
}

// ---------------------------------------------------------------------------
// Satisfaction survey (#872): asked after a success only, never inside a PIN step. The row id rides in
// session.draft through the survey_score, survey_reason and survey_comment nodes.

/** The survey question when this resident is due one, its row recorded; null when not due or it cannot be recorded. */
async function surveyPrompt(turn: Turn, trigger: SurveyTrigger): Promise<string | null> {
  try {
    const surveyId = await turn.options.repository.askSurvey({ residentId: turn.identity.id, phoneNumber: turn.phoneNumber, trigger });
    if (!surveyId) return null;
    turn.session.draft = { surveyId };
    return SURVEY_PROMPT;
  } catch (error) {
    console.error('WhatsApp survey could not be started:', error);
    return null;
  }
}

/** Handles a reply inside the survey; false when it is not an answer, so it is read as an ordinary message. */
async function surveyStep(turn: Turn, node: string, input: string): Promise<boolean> {
  const surveyId = (turn.session.draft as { surveyId?: unknown } | null | undefined)?.surveyId;
  if (typeof surveyId !== 'string') return false;
  const repository = turn.options.repository;
  const residentId = turn.identity.id;

  if (node === 'survey_score') {
    const score = parseSurveyScore(input);
    if (!score) return false;
    await repository.answerSurvey(residentId, surveyId, { score });
    if (score === 'poor') await respond(turn, SURVEY_REASON_PROMPT, 'survey_reason');
    else await respond(turn, `${SURVEY_THANKS_REPLY}\n${footer(turn)}`, 'main');
    return true;
  }

  if (node === 'survey_reason') {
    const reason = parseSurveyReason(input);
    if (!reason) return false;
    await repository.answerSurvey(residentId, surveyId, { reason });
    await respond(turn, SURVEY_COMMENT_PROMPT, 'survey_comment');
    return true;
  }

  // survey_comment: one optional line, then the estate office contact line.
  if (input === 'lock') return false;
  const comment = cleanSurveyComment(turn.text, input);
  if (comment) await repository.answerSurvey(residentId, surveyId, { comment });
  await respond(turn, `${withContact(turn, SURVEY_RECORDED_REPLY)}\n${answerFooter(false)}`, 'main');
  return true;
}

async function runIntent(turn: Turn, intent: AssistantIntent): Promise<void> {
  const item = ITEM_FOR_INTENT[intent];
  if (item) return enterFinancial(turn, item);
  if (intent === 'pay') return showHowToPay(turn);
  if (intent === 'notices') return showNotices(turn);
  if (intent === 'email') return startEmail(turn);
  if (intent === 'reminders') return toggleReminders(turn);
  return showContact(turn);
}

type PinCheck = { ok: true } | { ok: false; refusal: string; locked: boolean };

/** Counts and checks a PIN try; on a wrong or locked try, the refusal with the estate office line. */
async function checkPin(turn: Turn, pin: string, pinHash: string): Promise<PinCheck> {
  const repository = turn.options.repository;
  // Count the attempt before checking it (#850), so concurrent guesses cannot outrun the lock.
  const attempt = await repository.claimPinAttempt(turn.identity.id);
  if (attempt.status !== 'counted' || !verifyPin(pin, pinHash)) {
    // Every PIN refusal carries the estate office line (#891, #804 amendment 2).
    return {
      ok: false,
      refusal: withContact(turn, pinRefusalText(attempt)),
      locked: attempt.status !== 'counted' || !!attempt.lockedUntil || attempt.hardLocked,
    };
  }
  await repository.clearPinAttempts(turn.identity.id, attempt.claimedAt);
  if (!pinHash.startsWith(SALTED_PREFIX)) await repository.setPinHash(turn.identity.id, hashPin(pin), pinHash);
  return { ok: true };
}

/** A first PIN needs a setup code from the estate office (#805); holding the phone is not enough. */
async function startPinSetup(turn: Turn): Promise<void> {
  await respond(turn, SETUP_CODE_PROMPT, 'pin_setup_code');
}

async function handlePin(turn: Turn, pin: string, node: string): Promise<void> {
  const pinHash = await turn.options.repository.getPinHash(turn.identity.id);
  if (!pinHash) return startPinSetup(turn);
  const check = await checkPin(turn, pin, pinHash);
  if (!check.ok) return respond(turn, check.refusal, node);
  turn.session.pinAuthenticated = true;
  turn.pinHash = pinHash;
  turn.pinGate = true;
  const target = node.startsWith('pin:') ? node.slice(4) : 'menu';
  if (target === 'email') return startEmail(turn, 'PIN verified.');
  const account = target === 'report' || target === 'receipt' || target === 'clearance';
  await enterFinancial(turn, target as Target, account ? 'PIN verified.' : PIN_VERIFIED_REPLY);
}
/** `PIN`, `Set a security PIN` or `Change PIN` (#892). */
async function handlePinCommand(turn: Turn, input: string): Promise<void> {
  const pinHash = await turn.options.repository.getPinHash(turn.identity.id);
  if (!pinHash) return startPinSetup(turn);
  if (input === 'pin') return respond(turn, `${VERIFY_PIN_PROMPT}\n${footer(turn)}`, 'pin:menu');
  return respond(turn, CURRENT_PIN_PROMPT, 'pin_change_current');
}

/** The setup-code, choose, confirm and current-PIN steps of setting or changing a PIN (#892). */
async function handlePinStep(turn: Turn, step: string, arg: string | undefined, digits: string): Promise<void> {
  const repository = turn.options.repository;
  const residentId = turn.identity.id;

  if (step === 'setup_code') {
    if (!/^\d{6}$/.test(digits)) return respond(turn, SETUP_CODE_PROMPT, 'pin_setup_code');
    const claim = await repository.claimSetupCode(residentId, digits);
    if (claim.status === 'accepted') return respond(turn, CHOOSE_PIN_PROMPT, 'pin_setup_new');
    if (claim.status === 'wrong') {
      return respond(turn, `That setup code isn't correct. You have ${claim.triesLeft} ${claim.triesLeft === 1 ? 'try' : 'tries'} left.`, 'pin_setup_code');
    }
    const refusal = claim.status === 'paused'
      ? `Too many wrong setup codes. Nothing was changed. Try again after ${lockTime(claim.pausedUntil)}, or ask the estate office for a new code.`
      : 'That setup code is invalid or expired. Nothing was changed. Ask the estate office for a new code.';
    return respond(turn, `${withContact(turn, refusal)}\n${footer(turn)}`, 'main');
  }

  const pinHash = await repository.getPinHash(residentId);
  if (step === 'change_current') {
    if (!pinHash) return showMain(turn, NOTHING_CHANGED_REPLY);
    if (!PIN_DIGITS.test(digits)) return respond(turn, CURRENT_PIN_PROMPT, 'pin_change_current');
    // Wrong current PINs count toward the lock (#891).
    const check = await checkPin(turn, digits, pinHash);
    if (!check.ok) return respond(turn, check.refusal, check.locked ? 'main' : 'pin_change_current');
    turn.session.pinAuthenticated = true;
    return respond(turn, CHOOSE_NEW_PIN_PROMPT, 'pin_change_new');
  }

  const mode = step.startsWith('setup') ? 'setup' : 'change';
  if (step === 'setup_new' || step === 'change_new') {
    if (!PIN_DIGITS.test(digits)) return respond(turn, mode === 'setup' ? CHOOSE_PIN_PROMPT : CHOOSE_NEW_PIN_PROMPT, `pin_${step}`);
    if (isWeakPin(digits)) return respond(turn, WEAK_PIN_REPLY, `pin_${step}`);
    turn.session.pendingPinHash = hashPin(digits);
    return respond(turn, CONFIRM_PIN_PROMPT, `pin_${mode}_confirm:0`);
  }

  // setup_confirm / change_confirm
  const pending = turn.session.pendingPinHash;
  turn.session.pendingPinHash = null;
  if (!pending || (mode === 'change' && !pinHash)) return showMain(turn, NOTHING_CHANGED_REPLY);
  if (!PIN_DIGITS.test(digits) || !verifyPin(digits, pending)) {
    const mismatches = (Number.parseInt(arg ?? '0', 10) || 0) + 1;
    if (mismatches >= PIN_CONFIRM_TRIES) return showMain(turn, NOTHING_CHANGED_REPLY);
    turn.session.pendingPinHash = pending;
    return respond(turn, PIN_MISMATCH_REPLY, `pin_${mode}_confirm:${mismatches}`);
  }
  // Compare-and-set: a first PIN lands only where none exists, a change only over the current PIN.
  if (!(await repository.setPinHash(residentId, pending, mode === 'setup' ? null : pinHash))) {
    return showMain(turn, NOTHING_CHANGED_REPLY);
  }
  turn.session.pinAuthenticated = true;
  turn.pinHash = pending;
  turn.pinGate = true;
  try {
    await repository.sendPinAlert(residentId, mode === 'setup' ? 'set' : 'change', turn.phoneNumber);
  } catch (error) {
    // The PIN is already stored; a failed alert email must not undo or repeat that.
    console.error('[whatsapp-financial] PIN alert email failed:', error instanceof Error ? error.message : 'unknown error');
  }
  return enterFinancial(turn, 'menu', PIN_SET_REPLY);
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
  let { node } = readNode(turn.session.currentNode);

  // #892: in the PIN and setup-code steps the inbound text is a secret. It is never logged, stored
  // or echoed; a chosen PIN is held only as a salted hash until it is confirmed. One digit stays a
  // menu choice (0, 9), and anything else leaves the step and is handled as usual.
  const stepDigits = text.replace(/\s+/g, '').match(/^(?:PIN)?(\d{2,})$/i)?.[1] ?? null;
  const pinStep = node.match(/^pin_(setup_code|setup_new|setup_confirm|change_current|change_new|change_confirm)(?::(\d+))?$/);
  if (pinStep && stepDigits !== null && turn.identity.financialEligible) return handlePinStep(turn, pinStep[1], pinStep[2], stepDigits);
  turn.session.pendingPinHash = null;
  // Bare digits are the PIN only when the bot has just asked for it.
  // Update email asks for the PIN of every resident, so the community tier can answer it too (#816 decision 6).
  if (node.startsWith('pin:') && stepDigits !== null && PIN_DIGITS.test(stepDigits) && (turn.identity.financialEligible || node === 'pin:email')) {
    return handlePin(turn, stepDigits, node);
  }

  const pinCommand = text.match(/^PIN\s+([0-9]{4,6})$/i);
  // Update email asks for the PIN of every resident, so the community tier can answer it too (#816 decision 6).
  if (pinCommand && (turn.identity.financialEligible || node === 'pin:email')) return handlePin(turn, pinCommand[1], node);

  if (expired) {
    const pinClause = turn.identity.financialEligible && (await loadPinGate(turn)) ? ', so your PIN is needed again' : '';
    return showMain(turn, `Your session ended after ${SESSION_MINUTES} minutes without activity${pinClause}. Nothing was changed.`);
  }

  if (turn.message.type === 'image' && node.startsWith('report_')) return acknowledgeScreenshot(turn, node);
  if (turn.message.type !== 'text' || !text) return respond(turn, TEXT_ONLY_REPLY, node, turn.misses);

  if (node.startsWith('survey_')) {
    if (await surveyStep(turn, node, input)) return;
    node = 'main';
  }
  // A thank-you right after a financial answer opens the survey, when this resident is due one (#872).
  if (isThanks(input) && (node === 'answer' || node.startsWith('statement:')) && (turn.session.draft as { answered?: boolean } | null | undefined)?.answered) {
    const ask = await surveyPrompt(turn, 'answer');
    if (ask) return respond(turn, ask, 'survey_score');
  }

  // A narration or reference is free text, so it cannot be read as a keyword.
  if (node === 'report_reference' && input !== 'cancel' && input !== 'lock') return reportStep(turn, node);

  // The prompt reads "Reply 1 Yes, 2 No", so YES and NO answer it rather than opening the menu.
  if (node === 'reminders_confirm' && (input === 'yes' || input === 'no')) return confirmReminders(turn, input === 'yes' ? '1' : '2');

  if ((input === 'pin' || input === 'set a security pin' || input === 'change pin') && turn.identity.financialEligible) {
    return handlePinCommand(turn, input);
  }
  if (GREETINGS.has(input)) return showMain(turn);
  if (input === 'cancel') return showMain(turn, 'Cancelled. Nothing was changed.');
  if (input === 'lock') {
    const wasUnlocked = turn.session.pinAuthenticated;
    turn.session.pinAuthenticated = false;
    return showMain(turn, wasUnlocked ? 'Locked. Your PIN is needed again for financial standing.' : undefined);
  }
  if (CONTACT_WORDS.has(input)) return showContact(turn);
  if (input === '0') {
    const backToFinancial = node === 'answer' || node === 'more' || node === 'statement_period' || node.startsWith('report_') || node.startsWith('receipt_') || node.startsWith('property:') || node.startsWith('statement_email:');
    return backToFinancial && turn.identity.financialEligible ? enterFinancial(turn, 'menu') : showMain(turn);
  }

  // Free-text answers come before the keywords, which would otherwise read an address as a keyword.
  if (node === 'report_amount' || node === 'report_date' || node === 'report_confirm') return reportStep(turn, node);
  if (node === 'receipt_pick') return pickReceipt(turn, input);
  if (node === 'email_address') return submitEmailAddress(turn);
  if (node === 'email_code') return submitEmailCode(turn);

  const intent = turn.settings?.keywordSynonyms[input] ?? DEFAULT_KEYWORDS[input];
  if (intent) return runIntent(turn, intent);
  if (input === 'invoice' || input === 'bill' || input === 'invoices' || input === 'bills') {
    return respond(turn, 'Did you mean 1. What I owe / 2. Statement?', 'disambiguate');
  }

  if (node.startsWith('property:')) return chooseProperty(turn, node.slice('property:'.length) as Target);

  const statementNode = node.match(/^statement_email:(.+)$/);
  const statementPeriod = statementNode && PERIODS.includes(statementNode[1] as StatementPeriod) ? (statementNode[1] as StatementPeriod) : null;
  if (statementPeriod) {
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
    return deliverStatementPdf(turn, period);
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

  if (node === 'reminders_confirm') return confirmReminders(turn, input);

  if (node === 'alerts') {
    if (input === '2' && turn.identity.financialEligible) return toggleReminders(turn);
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
  if (input === '4') return showAlertSettings(turn);
  if (input === '5') return startEmail(turn);
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
