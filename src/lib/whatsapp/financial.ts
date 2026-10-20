import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/server';
import { sendWhatsAppMessage } from '@/lib/whatsapp/provider';
import { normalizePhoneNumber } from '@/lib/sms/termii';
import { getRawSettingsAsService, getSettingResultAsService } from '@/lib/settings/service';
import { isWhatsAppMasterSwitchOn } from '@/lib/whatsapp/master-switch';
import { isWhatsAppRecipientAllowed } from '@/lib/whatsapp/rollout';
import type { WhatsAppInboundMessage, WhatsAppTextMessage } from '@/lib/whatsapp/types';
import type { WhatsAppResidentIdentity } from '@/lib/whatsapp/identity';
import { formatCalendarDate } from '@/lib/utils/calendar-date';

const SESSION_MINUTES = 15;
// #891: 3 wrong in a row locks for 15 minutes; 6 wrong within 24 hours locks until the estate office resets it.
const PIN_TRIES_IN_A_ROW = 3;
const PIN_LOCK_MINUTES = 15;
const PIN_TRIES_PER_WINDOW = 6;
const PIN_WINDOW_HOURS = 24;
const PIN_HARD_LOCKED_REPLY = 'Your PIN is locked after several wrong tries. The estate office needs to reset it.';
const SET_PIN_HINT = 'reply PIN followed by 4–6 digits of your choice';

export type FinancialMenuItem = 'balance' | 'last_payment' | 'next_due' | 'wallet' | 'statement';
export type StatementPeriod = 'this_month' | 'this_year' | 'last_six_months';

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

export interface StatementCompositionInput {
  period: StatementPeriod;
  houseId: string | null;
  invoices: Array<{ invoice_number: string; amount_due: number | null; amount_paid: number | null; created_at: string }>;
  payments: Array<{ amount: number | null; payment_date: string; reference_number: string | null }>;
}

export interface WhatsAppFinancialRepository {
  getSession(phoneNumber: string): Promise<WhatsAppFinancialSession | null>;
  saveSession(session: WhatsAppFinancialSession): Promise<void>;
  getForcePin(): Promise<boolean>;
  getPinHash(residentId: string): Promise<string | null>;
  setPinHash(residentId: string, hash: string): Promise<void>;
  /** Counts a PIN try as wrong before it is checked; refused while the resident is locked. */
  claimPinAttempt(residentId: string): Promise<PinAttemptClaim>;
  /** After a correct PIN: resets the in-a-row count and takes the claimed try back out of the window. */
  clearPinAttempts(residentId: string, claimedAt: string): Promise<void>;
  /** The estate office contact line, or null when no phone or email is configured. */
  getEstateContactLine(): Promise<string | null>;
  getBillableHouses(residentId: string): Promise<FinancialHouse[]>;
  getBalance(residentId: string, houseId: string): Promise<FinancialAnswer>;
  getLastPayment(residentId: string, houseId: string): Promise<FinancialAnswer>;
  getNextDue(residentId: string, houseId: string): Promise<FinancialAnswer>;
  getWallet(residentId: string): Promise<FinancialAnswer>;
  getStatement(residentId: string, houseId: string | null, period: StatementPeriod, allowedHouseIds: string[]): Promise<FinancialAnswer>;
  logDisclosure(input: {
    residentId: string;
    phoneNumber: string;
    houseId: string | null;
    menuItem: FinancialMenuItem;
    pinAuthenticated: boolean;
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

function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function expiry(): string {
  return new Date(Date.now() + SESSION_MINUTES * 60 * 1000).toISOString();
}

function menuText(): string {
  return [
    'Financial standing',
    'Reply with a number:',
    '1. Balance',
    '2. Last payment',
    '3. Next due',
    '4. Wallet',
    '5. Statement',
    `To set a security PIN, ${SET_PIN_HINT}.`,
  ].join('\n');
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

function parseMenuItem(text: string): FinancialMenuItem | null {
  const normalized = text.trim().toLowerCase();
  if (normalized === '1' || normalized === 'balance') return 'balance';
  if (normalized === '2' || normalized === 'last' || normalized === 'last payment') return 'last_payment';
  if (normalized === '3' || normalized === 'due' || normalized === 'next due') return 'next_due';
  if (normalized === '4' || normalized === 'wallet') return 'wallet';
  if (normalized === '5' || normalized === 'statement') return 'statement';
  return null;
}

function itemLabel(item: FinancialMenuItem): string {
  return item === 'last_payment'
    ? 'last payment'
    : item === 'next_due'
      ? 'next due'
      : item;
}

function propertyText(houses: FinancialHouse[], item: FinancialMenuItem): string {
  const lines = [
    `Which property should I use for your ${itemLabel(item)}?`,
    ...houses.map((house, index) => `${index + 1}. ${house.label}`),
  ];
  if (item === 'statement') lines.push('0. All properties');
  lines.push('Reply with the property number.');
  return lines.join('\n');
}

function statementPeriodText(): string {
  return [
    'Which statement period should I use?',
    '1. This month',
    '2. This year',
    '3. Last six months',
    'Reply with the period number.',
  ].join('\n');
}

function parseStatementPeriod(text: string): StatementPeriod | null {
  const normalized = text.trim().toLowerCase();
  if (normalized === '1' || normalized === 'this month') return 'this_month';
  if (normalized === '2' || normalized === 'this year') return 'this_year';
  if (normalized === '3' || normalized === 'last six months') return 'last_six_months';
  return null;
}

export function composeStatementAnswer(input: StatementCompositionInput): FinancialAnswer {
  const totalInvoiced = input.invoices.reduce((sum, invoice) => sum + Number(invoice.amount_due || 0), 0);
  const totalPaidAgainstInvoices = input.invoices.reduce((sum, invoice) => sum + Number(invoice.amount_paid || 0), 0);
  const totalPayments = input.payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const rows = [
    ...input.invoices.map((invoice) => ({
      date: invoice.created_at,
      text: `Invoice ${invoice.invoice_number}: ${formatNaira(Number(invoice.amount_due || 0))}`,
    })),
    ...input.payments.map((payment) => ({
      date: payment.payment_date,
      text: `Payment${payment.reference_number ? ` ${payment.reference_number}` : ''}: ${formatNaira(Number(payment.amount || 0))}`,
    })),
  ].sort((left, right) => right.date.localeCompare(left.date));
  const cap = 12;
  const omitted = Math.max(0, rows.length - cap);
  const lines = rows.slice(0, cap).reverse().map((row) => `${new Date(row.date).toLocaleDateString('en-NG')}: ${row.text}`);
  const scope = input.houseId ? 'selected property' : 'all properties';

  return {
    body: [
      `Statement (${input.period.replaceAll('_', ' ')}, ${scope})`,
      `Invoiced: ${formatNaira(totalInvoiced)} | Payments: ${formatNaira(totalPayments)}`,
      `Outstanding from invoices: ${formatNaira(Math.max(0, totalInvoiced - totalPaidAgainstInvoices))}`,
      ...(lines.length ? lines : ['No invoice or payment activity in this period.']),
      ...(omitted ? [`${omitted} older row(s) omitted. Choose a shorter period for more detail.`] : []),
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

function createSupabaseRepository(): WhatsAppFinancialRepository {
  return {
    async getSession(phoneNumber) {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from('whatsapp_sessions')
        .select('phone_number, resident_id, current_node, selected_house_id, pin_authenticated, expires_at')
        .eq('phone_number', phoneNumber)
        .gt('expires_at', new Date().toISOString())
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

    async getEstateContactLine() {
      const result = await getRawSettingsAsService(['estate_phone', 'estate_email']);
      // A settings error drops the line rather than the lock reply.
      if (result.status === 'error') return null;
      const [phone, email] = ['estate_phone', 'estate_email'].map((key) => {
        const value = result.values.get(key);
        return typeof value === 'string' ? value.trim() : '';
      });
      const contacts = [phone, email].filter(Boolean);
      return contacts.length ? `Contact the estate office on ${contacts.join(' or ')}.` : null;
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

    async getBalance(residentId, houseId) {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from('invoices')
        .select('amount_due, amount_paid')
        .eq('resident_id', residentId)
        .eq('house_id', houseId)
        .neq('status', 'void');
      if (error) throw error;
      const outstanding = (data || []).reduce((sum, invoice) => sum + Number(invoice.amount_due || 0) - Number(invoice.amount_paid || 0), 0);
      return { body: `Outstanding balance: ${formatNaira(Math.max(0, outstanding))}.` };
    },

    async getLastPayment(residentId, houseId) {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from('payment_records')
        .select('amount, payment_date, reference_number, method')
        .eq('resident_id', residentId)
        .eq('house_id', houseId)
        .eq('status', 'paid')
        .order('payment_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return { body: 'No paid payment record was found for this property.' };
      return {
        body: `Last payment: ${formatNaira(Number(data.amount))} on ${new Date(data.payment_date).toLocaleDateString('en-NG')}${data.reference_number ? ` (ref ${data.reference_number})` : ''}.`,
        metadata: { reference_number: data.reference_number, method: data.method },
      };
    },

    async getNextDue(residentId, houseId) {
      const supabase = createAdminClient();
      // Unpaid invoices only, filtered in the database: a page of all invoices hides newer unpaid ones (#811).
      const { data, error } = await supabase
        .from('invoices')
        .select('invoice_number, amount_due, amount_paid, due_date')
        .eq('resident_id', residentId)
        .eq('house_id', houseId)
        .in('status', ['unpaid', 'partially_paid'])
        .order('due_date', { ascending: true });
      if (error) throw error;
      const unpaid = (data || []).filter((invoice) => Number(invoice.amount_paid) < Number(invoice.amount_due));
      if (unpaid.length === 0) return { body: 'There is no outstanding due invoice for this property.' };
      const remaining = (invoice: (typeof unpaid)[number]) => Number(invoice.amount_due) - Number(invoice.amount_paid);
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
      const overdue = unpaid.filter((invoice) => invoice.due_date.slice(0, 10) < today);
      const next = unpaid.find((invoice) => invoice.due_date.slice(0, 10) >= today);
      const lines: string[] = [];
      if (overdue.length > 0) {
        const total = overdue.reduce((sum, invoice) => sum + remaining(invoice), 0);
        lines.push(`Overdue: ${formatNaira(total)} across ${overdue.length} invoice${overdue.length === 1 ? '' : 's'} (oldest due ${formatCalendarDate(overdue[0].due_date, 'en-NG')}).`);
      }
      if (next) lines.push(`Next due: ${formatNaira(remaining(next))} on ${formatCalendarDate(next.due_date, 'en-NG')} (invoice ${next.invoice_number}).`);
      return { body: lines.join('\n') };
    },

    async getWallet(residentId) {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from('resident_wallets')
        .select('balance')
        .eq('resident_id', residentId)
        .maybeSingle();
      if (error) throw error;
      return { body: `Wallet balance: ${formatNaira(Number(data?.balance || 0))}.` };
    },

    async getStatement(residentId, houseId, period, allowedHouseIds) {
      const now = new Date();
      const from = new Date(now);
      if (period === 'this_month') {
        from.setUTCDate(1);
        from.setUTCHours(0, 0, 0, 0);
      } else if (period === 'this_year') {
        from.setUTCMonth(0, 1);
        from.setUTCHours(0, 0, 0, 0);
      } else {
        from.setUTCDate(1);
        from.setUTCMonth(from.getUTCMonth() - 5);
        from.setUTCHours(0, 0, 0, 0);
      }

      const supabase = createAdminClient();
      let invoiceQuery = supabase
        .from('invoices')
        .select('invoice_number, amount_due, amount_paid, created_at, house:houses(short_name, house_number)')
        .eq('resident_id', residentId)
        .neq('status', 'void')
        .gte('created_at', from.toISOString())
        .lte('created_at', now.toISOString())
        .order('created_at', { ascending: true });
      let paymentQuery = supabase
        .from('payment_records')
        .select('amount, payment_date, reference_number, house:houses(short_name, house_number)')
        .eq('resident_id', residentId)
        .eq('status', 'paid')
        .gte('payment_date', from.toISOString())
        .lte('payment_date', now.toISOString())
        .order('payment_date', { ascending: true });

      if (houseId) {
        invoiceQuery = invoiceQuery.eq('house_id', houseId);
        paymentQuery = paymentQuery.eq('house_id', houseId);
      } else {
        invoiceQuery = invoiceQuery.in('house_id', allowedHouseIds);
        paymentQuery = paymentQuery.in('house_id', allowedHouseIds);
      }

      const [{ data: invoices, error: invoiceError }, { data: payments, error: paymentError }] = await Promise.all([
        invoiceQuery,
        paymentQuery,
      ]);
      if (invoiceError) throw invoiceError;
      if (paymentError) throw paymentError;

      return composeStatementAnswer({ period, houseId, invoices: invoices || [], payments: payments || [] });
    },

    async logDisclosure(input) {
      const supabase = createAdminClient();
      const { error } = await supabase.from('whatsapp_disclosure_logs').insert({
        resident_id: input.residentId,
        phone_number: input.phoneNumber,
        house_id: input.houseId,
        menu_item: input.menuItem,
        pin_authenticated: input.pinAuthenticated,
        metadata: input.metadata ?? null,
      });
      if (error) throw error;
    },
  };
}

export interface WhatsAppFinancialHandlerOptions {
  repository: WhatsAppFinancialRepository;
  optedIn: boolean;
  send?: (message: WhatsAppTextMessage) => Promise<{ success: boolean; error?: string }>;
  canLookup?: () => Promise<boolean>;
}

export async function canPerformWhatsAppFinancialLookup(): Promise<boolean> {
  // Runs from the inbound WhatsApp webhook -- unauthenticated -- so this
  // must read via the service-role client (see #136), or the cap always
  // reads null under the webhook regardless of what's configured.
  //
  // Fails CLOSED (#139): this setting gates how many financial disclosures
  // may happen per day, so a query error must be treated as "not
  // permitted" rather than silently falling back to the compiled-in
  // default of 50 -- an unreadable cap is not evidence the estate's
  // configured cap is 50, and financial data shouldn't be handed out on
  // that assumption. `absent` (no row -- nobody has configured a cap)
  // keeps the existing default of 50; that is a genuine unconfigured
  // state, not a transient failure.
  const capResult = await getSettingResultAsService('whatsapp_daily_financial_lookup_cap');
  if (capResult.status === 'error') return false;
  const configuredCap = capResult.status === 'ok' ? capResult.value : undefined;
  const dailyCap = typeof configuredCap === 'number' && Number.isInteger(configuredCap)
    ? configuredCap
    : 50;
  if (dailyCap <= 0) return false;

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { count, error } = await createAdminClient()
    .from('whatsapp_disclosure_logs')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', startOfDay.toISOString());

  return !error && (count || 0) < dailyCap;
}

async function sendFinancialReply(
  message: WhatsAppInboundMessage,
  body: string,
  send: WhatsAppFinancialHandlerOptions['send'],
  residentId: string
): Promise<void> {
  const result = await (send || ((outbound) =>
    // Reply to the person who just messaged us: exempt from the comms override (decision 8, #715).
    sendWhatsAppMessage(outbound, undefined, { purpose: 'inbound_reply' }, {
      residentId,
      inboundMessageId: message.id,
    })))({ to: message.from, body, idempotencySeed: message.id });
  if (!result.success) throw new Error(result.error || 'WhatsApp financial reply failed');
}

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

  if (!identity.financialEligible) {
    await sendFinancialReply(message, 'Your Resident record is connected to the community tier. Financial standing is not available for this role.', options.send, identity.id);
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
  const text = message.text?.trim() || '';
  let session = await options.repository.getSession(phoneNumber);
  if (session && Date.parse(session.expiresAt) <= Date.now()) {
    session = null;
  }
  if (!session || session.residentId !== identity.id) {
    session = {
      phoneNumber,
      residentId: identity.id,
      currentNode: 'menu',
      selectedHouseId: null,
      pinAuthenticated: false,
      expiresAt: expiry(),
    };
  }

  const pinCommand = text.match(/^PIN\s+([0-9]{4,6})$/i);
  if (pinCommand) {
    const pin = pinCommand[1];
    const existingHash = await options.repository.getPinHash(identity.id);
    if (existingHash) {
      // Count the attempt before checking it (#850), so concurrent guesses cannot outrun the lock.
      const attempt = await options.repository.claimPinAttempt(identity.id);
      if (attempt.status !== 'counted' || !verifyPin(pin, existingHash)) {
        const contactLine = await options.repository.getEstateContactLine();
        await sendFinancialReply(message, [pinRefusalText(attempt), contactLine].filter(Boolean).join('\n'), options.send, identity.id);
        return;
      }
      await options.repository.clearPinAttempts(identity.id, attempt.claimedAt);
      if (!existingHash.startsWith(SALTED_PREFIX)) await options.repository.setPinHash(identity.id, hashPin(pin));
    } else {
      await options.repository.setPinHash(identity.id, hashPin(pin));
    }
    session.pinAuthenticated = true;
    session.expiresAt = expiry();
    await options.repository.saveSession(session);
    await sendFinancialReply(message, existingHash ? 'PIN verified.' : 'PIN set and verified for this session.', options.send, identity.id);
    return;
  }

  const pinHash = await options.repository.getPinHash(identity.id);
  const forcePin = await options.repository.getForcePin();
  if ((forcePin || pinHash) && !session.pinAuthenticated) {
    await sendFinancialReply(
      message,
      pinHash
        ? 'Please reply PIN followed by your 4–6 digit PIN before viewing financial standing.'
        : `A security PIN is required before viewing financial standing. To set one, ${SET_PIN_HINT}.`,
      options.send, identity.id
    );
    return;
  }

  const propertyStep = session.currentNode.match(/^property_selection:(.+)$/);
  const statementStep = session.currentNode.match(/^statement_period:(.+)$/);
  const item = statementStep ? 'statement' : propertyStep ? (propertyStep[1] as FinancialMenuItem) : parseMenuItem(text);
  const statementPeriod = statementStep ? parseStatementPeriod(text) : null;
  const selectingAllStatement = propertyStep !== null && item === 'statement' && text === '0';
  if (text.toLowerCase() === 'menu' || (!statementStep && text === '0' && !selectingAllStatement) || !item) {
    session.currentNode = 'menu';
    session.expiresAt = expiry();
    await options.repository.saveSession(session);
    await sendFinancialReply(message, menuText(), options.send, identity.id);
    return;
  }

  const houses = await options.repository.getBillableHouses(identity.id);
  if (houses.length === 0) {
    await sendFinancialReply(message, 'Your Resident record is connected to the community tier. Financial standing is not available for this role.', options.send, identity.id);
    return;
  }

  if (statementStep) {
    if (!statementPeriod) {
      await sendFinancialReply(message, statementPeriodText(), options.send, identity.id);
      return;
    }
    const statementHouseId = statementStep[1] === 'all' ? null : statementStep[1];
    if (statementHouseId && !houses.some((house) => house.id === statementHouseId)) {
      session.currentNode = 'menu';
      session.selectedHouseId = null;
      session.expiresAt = expiry();
      await options.repository.saveSession(session);
      await sendFinancialReply(message, 'That property is no longer available for this Resident. Reply 5 to choose a property again.', options.send, identity.id);
      return;
    }
    const allowedHouseIds = houses.map((house) => house.id);
    if (options.canLookup && !(await options.canLookup())) {
      await sendFinancialReply(message, 'Daily financial lookup limit reached. Please try again tomorrow.', options.send, identity.id);
      return;
    }
    const answer = await options.repository.getStatement(identity.id, statementHouseId, statementPeriod, allowedHouseIds);
    // Log before sending (#795): a failed log then discloses nothing, and a provider retry cannot repeat an answer.
    await options.repository.logDisclosure({
      residentId: identity.id,
      phoneNumber,
      houseId: statementHouseId,
      menuItem: 'statement',
      pinAuthenticated: session.pinAuthenticated,
      metadata: answer.metadata,
    });
    await sendFinancialReply(message, `${answer.body}${!pinHash ? `\nTip: to lock financial answers, ${SET_PIN_HINT}.` : ''}`, options.send, identity.id);
    session.currentNode = 'menu';
    session.expiresAt = expiry();
    await options.repository.saveSession(session);
    return;
  }

  if (item === 'statement' && !propertyStep) {
    if (houses.length > 1) {
      session.currentNode = 'property_selection:statement';
      session.expiresAt = expiry();
      await options.repository.saveSession(session);
      await sendFinancialReply(message, propertyText(houses, 'statement'), options.send, identity.id);
      return;
    }
    session.currentNode = `statement_period:${houses[0]?.id || 'all'}`;
    session.expiresAt = expiry();
    await options.repository.saveSession(session);
    await sendFinancialReply(message, statementPeriodText(), options.send, identity.id);
    return;
  }

  if (propertyStep && item === 'statement') {
    const selectedIndex = Number.parseInt(text, 10) - 1;
    const selectedHouseId = text === '0' ? 'all' : houses[selectedIndex]?.id;
    if (!selectedHouseId) {
      await sendFinancialReply(message, propertyText(houses, 'statement'), options.send, identity.id);
      return;
    }
    session.currentNode = `statement_period:${selectedHouseId}`;
    session.expiresAt = expiry();
    await options.repository.saveSession(session);
    await sendFinancialReply(message, statementPeriodText(), options.send, identity.id);
    return;
  }

  if (propertyStep) {
    const selectedIndex = Number.parseInt(text, 10) - 1;
    if (!Number.isInteger(selectedIndex) || !houses[selectedIndex]) {
      await sendFinancialReply(message, propertyText(houses, item), options.send, identity.id);
      return;
    }
    session.selectedHouseId = houses[selectedIndex].id;
  } else if (!session.selectedHouseId || !houses.some((house) => house.id === session.selectedHouseId)) {
    if (houses.length > 1) {
      session.currentNode = `property_selection:${item}`;
      session.expiresAt = expiry();
      await options.repository.saveSession(session);
      await sendFinancialReply(message, propertyText(houses, item), options.send, identity.id);
      return;
    }
    session.selectedHouseId = houses[0].id;
  }

  const houseId = session.selectedHouseId;
  if (!houseId) return;
  if (options.canLookup && !(await options.canLookup())) {
    await sendFinancialReply(message, 'Daily financial lookup limit reached. Please try again tomorrow.', options.send, identity.id);
    return;
  }
  const answer = item === 'balance'
    ? await options.repository.getBalance(identity.id, houseId)
    : item === 'last_payment'
      ? await options.repository.getLastPayment(identity.id, houseId)
      : item === 'next_due'
        ? await options.repository.getNextDue(identity.id, houseId)
        : await options.repository.getWallet(identity.id);
  const body = `${answer.body}${!pinHash ? `\nTip: to lock financial answers, ${SET_PIN_HINT}.` : ''}`;
  // Log before sending (#795): see the statement branch above.
  await options.repository.logDisclosure({
    residentId: identity.id,
    phoneNumber,
    houseId,
    menuItem: item,
    pinAuthenticated: session.pinAuthenticated,
    metadata: answer.metadata,
  });
  await sendFinancialReply(message, body, options.send, identity.id);
  session.currentNode = 'menu';
  session.expiresAt = expiry();
  await options.repository.saveSession(session);
}

export function createSupabaseWhatsAppFinancialRepository(): WhatsAppFinancialRepository {
  return createSupabaseRepository();
}
