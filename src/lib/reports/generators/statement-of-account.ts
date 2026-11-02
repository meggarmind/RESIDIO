/**
 * Statement of account (#1402): every charge and payment of one house or one resident in a period,
 * line by line, with a running balance.
 *
 * The balance is the roll-forward account balance of `resident_account_balance` (#863), the figure the
 * admin Account Statement and the WhatsApp "What I owe" show:
 *   balance = invoices that are not void (dated by period_start, else created_at in Lagos)
 *           - verified paid payments (dated by payment_date)
 *           + / - wallet movements that are not mirrors (resident statement only)
 * Wallet rows with reference_type 'invoice' or 'payment' only echo a payment applied to an invoice, or
 * a payment going into the wallet. The payment and the invoice are already lines, so these rows are
 * left out (MIRRORED_WALLET_REFERENCES). A wallet belongs to a resident, not to a house, so a house
 * statement has no wallet rows (#863 decision 7). The lines come from `buildStatementLedger`, the same
 * ledger the Account Statement uses; the result is checked against `resident_account_balance`.
 *
 * Server only: no authorization here. Callers are `generateReportWithClient`'s callers (#483).
 */

import { fetchAllRows } from '@/lib/supabase/fetch-all-rows';
import { buildStatementLedger, MIRRORED_WALLET_REFERENCES } from '@/lib/billing/statement-ledger';
import { categoryOf } from '@/lib/billing/statement-categories';
import { fetchAccountBalance } from '@/lib/billing/account-balance';
import { formatCalendarDate } from '@/lib/utils/calendar-date';
import type { ReportSupabaseClient } from '@/lib/reports/report-generator';
import type { SummaryCell, SummaryReport, SummaryReportData } from '@/lib/reports/summary-report';

export type StatementSubject = { kind: 'house' | 'resident'; id: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** The chart shows at most this many months (the latest ones), as the dues sheet does. */
const MAX_CHART_MONTHS = 24;
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const money = (amount: number) => amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const reportDate = (value: string) => formatCalendarDate(value, 'en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
const isMoney = (value: number) => Math.abs(value) >= 0.005;
/** The Lagos calendar day of an instant (Africa/Lagos is UTC+1 all year), as resident_account_balance dates it. */
const lagosDate = (instant: string) => new Date(Date.parse(instant) + 3_600_000).toISOString().slice(0, 10);
const validDate = (d: string) => ISO_DATE.test(d) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;

type Person = { first_name: string | null; last_name: string | null; entity_type?: string | null; company_name?: string | null } | null;
type HouseRef = { house_number: string | null; street: { name: string | null } | null } | null;

type InvoiceRow = {
  id: string;
  invoice_number: string;
  amount_due: number | string | null;
  amount_paid: number | string | null;
  status: string;
  invoice_type: string;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
  charge_category: string | null;
  rate_snapshot: unknown;
  house_id: string | null;
  resident_id: string;
  billing_profile: { name: string } | { name: string }[] | null;
  items: { id: string; description: string | null; amount: number | string | null; created_at: string }[] | null;
  resident: Person;
  house: HouseRef;
};

type PaymentRow = {
  id: string;
  amount: number | string | null;
  payment_date: string;
  reference_number: string | null;
  method: string | null;
  notes: string | null;
  charge_category: string | null;
  status: string;
  is_verified: boolean;
  house_id: string | null;
  resident_id: string;
  resident: Person;
  house: HouseRef;
};

type WalletRow = {
  id: string;
  wallet_id: string;
  type: 'credit' | 'debit';
  amount: number | string;
  description: string | null;
  reference_type: string | null;
  reference_id: string | null;
  created_at: string;
};

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

const personName = (p: Person) =>
  !p ? '' : p.entity_type === 'corporate' && p.company_name ? p.company_name : [p.first_name, p.last_name].filter(Boolean).join(' ');
const houseName = (h: HouseRef) => (!h ? '' : [h.house_number, h.street?.name].filter(Boolean).join(', '));

async function readAll<T>(what: string, fetchPage: (from: number, to: number) => Page<T>): Promise<T[]> {
  const result = await fetchAllRows<T>(fetchPage);
  if (result.error !== null) {
    console.error(`Error fetching ${what} for the statement of account:`, result.error);
    throw new Error(result.error);
  }
  return result.data;
}

/** Month keys ('YYYY-MM') from the month of `from` to the month of `to`. */
function monthKeys(from: string, to: string): string[] {
  const keys: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const last = to.slice(0, 7);
  while (`${y}-${String(m).padStart(2, '0')}` <= last) {
    keys.push(`${y}-${String(m).padStart(2, '0')}`);
    if (++m > 12) { m = 1; y++; }
  }
  return keys;
}

export async function generateStatementOfAccount(
  supabase: ReportSupabaseClient,
  dateRange: { startDate: string; endDate: string },
  subject: StatementSubject
): Promise<SummaryReport> {
  if (!UUID.test(subject.id)) throw new Error('Choose the house or the resident for the statement.');
  const { startDate: from, endDate: to } = dateRange;
  if (!validDate(from) || !validDate(to) || from > to) throw new Error('Choose a period with a start date on or before its end date.');

  const isHouse = subject.kind === 'house';
  const column = isHouse ? 'house_id' : 'resident_id';

  // Who the statement is for.
  let subjectLabel: string;
  if (isHouse) {
    const { data, error } = await supabase.from('houses').select('id, house_number, street:streets(name)').eq('id', subject.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('House not found');
    subjectLabel = houseName(data as unknown as HouseRef);
  } else {
    const { data, error } = await supabase
      .from('residents')
      .select('id, first_name, last_name, resident_code, entity_type, company_name')
      .eq('id', subject.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Resident not found');
    const resident = data as unknown as Person & { resident_code: string | null };
    subjectLabel = [personName(resident), resident?.resident_code].filter(Boolean).join(' · ');
  }

  const { data: categoryRows, error: categoryError } = await supabase.from('charge_categories').select('code, name').order('sort_order');
  if (categoryError) throw new Error(categoryError.message);
  const categoryNames = new Map(((categoryRows ?? []) as { code: string; name: string }[]).map((c) => [c.code, c.name]));
  const categoryName = (code: string) => categoryNames.get(code) ?? code;

  // Every row of the account, from the start, so the opening balance is the sum of what came before.
  const invoices = await readAll<InvoiceRow>('invoices', (a, b) =>
    supabase
      .from('invoices')
      .select(`id, invoice_number, amount_due, amount_paid, status, invoice_type, period_start, period_end, created_at,
        charge_category, rate_snapshot, house_id, resident_id,
        billing_profile:billing_profiles(name),
        items:invoice_items(id, description, amount, created_at),
        resident:residents!resident_id(first_name, last_name, entity_type, company_name),
        house:houses!house_id(house_number, street:streets(name))`)
      .eq(column, subject.id)
      .neq('status', 'void')
      .order('id')
      .range(a, b) as unknown as Page<InvoiceRow>
  );
  // Paid and pending: a verified paid payment is in the balance; the others are only "awaiting verification".
  const allPayments = await readAll<PaymentRow>('payments', (a, b) =>
    supabase
      .from('payment_records')
      .select(`id, amount, payment_date, reference_number, method, notes, charge_category, status, is_verified, house_id, resident_id,
        resident:residents!resident_id(first_name, last_name, entity_type, company_name),
        house:houses!house_id(house_number, street:streets(name))`)
      .eq(column, subject.id)
      .in('status', ['paid', 'pending'])
      .order('id')
      .range(a, b) as unknown as Page<PaymentRow>
  );
  const payments = allPayments.filter((p) => p.status === 'paid' && p.is_verified);
  const awaitingVerification = allPayments
    .filter((p) => !p.is_verified && p.payment_date <= to)
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  let walletRows: (WalletRow & { amount: number; charge_category: string })[] = [];
  if (!isHouse) {
    const { data: wallets, error: walletError } = await supabase.from('resident_wallets').select('id, charge_category').eq('resident_id', subject.id);
    if (walletError) throw new Error(walletError.message);
    const walletCategory = new Map(((wallets ?? []) as { id: string; charge_category: string }[]).map((w) => [w.id, w.charge_category]));
    if (walletCategory.size > 0) {
      const rows = await readAll<WalletRow>('wallet movements', (a, b) =>
        supabase
          .from('wallet_transactions')
          .select('id, wallet_id, type, amount, description, reference_type, reference_id, created_at')
          .in('wallet_id', [...walletCategory.keys()])
          .order('id')
          .range(a, b) as unknown as Page<WalletRow>
      );
      walletRows = rows
        .filter((w) => !(w.reference_type && MIRRORED_WALLET_REFERENCES.has(w.reference_type)))
        .map((w) => ({ ...w, amount: Number(w.amount) || 0, charge_category: walletCategory.get(w.wallet_id) ?? 'dues' }));
    }
  }

  // Dates as resident_account_balance has them.
  const invoiceDate = (i: InvoiceRow) => i.period_start ?? lagosDate(i.created_at);
  const walletDate = (w: WalletRow) => lagosDate(w.created_at);

  let opening = 0;
  for (const i of invoices) if (invoiceDate(i) < from) opening += Number(i.amount_due) || 0;
  for (const p of payments) if (p.payment_date < from) opening -= Number(p.amount) || 0;
  for (const w of walletRows) if (walletDate(w) < from) opening += w.type === 'credit' ? -w.amount : w.amount;

  const inPeriod = (d: string) => d >= from && d <= to;
  const periodInvoices = invoices.filter((i) => inPeriod(invoiceDate(i)));
  const periodPayments = payments.filter((p) => inPeriod(p.payment_date));
  const periodWallet = walletRows.filter((w) => inPeriod(walletDate(w)));

  const ledger = buildStatementLedger({
    openingBalance: opening,
    invoices: periodInvoices.map((i) => {
      const bp = Array.isArray(i.billing_profile) ? i.billing_profile[0] : i.billing_profile;
      return { ...i, amount_due: Number(i.amount_due) || 0, billing_profile_name: bp?.name ?? null };
    }),
    payments: periodPayments.map((p) => ({ ...p, amount: Number(p.amount) || 0 })),
    walletTransactions: periodWallet,
  });
  const closing = ledger.closingBalance;
  const charged = ledger.summary.totalInvoiced + ledger.summary.totalDebits;
  const paid = ledger.summary.totalPaid + ledger.summary.totalCredits;

  const invoiceById = new Map(periodInvoices.map((i) => [i.id, i]));
  const paymentById = new Map(periodPayments.map((p) => [p.id, p]));
  const walletById = new Map(periodWallet.map((w) => [w.id, w]));
  // On a house statement each line names the resident; on a resident statement, the house.
  const party = (row: { resident: Person; house: HouseRef }) => {
    const text = isHouse ? personName(row.resident) : houseName(row.house);
    return text ? ` (${text})` : '';
  };

  const months = new Map<string, { charged: number; paid: number }>();
  const addToMonth = (date: string, charge: number, payment: number) => {
    const m = months.get(date.slice(0, 7)) ?? { charged: 0, paid: 0 };
    m.charged += charge;
    m.paid += payment;
    months.set(date.slice(0, 7), m);
  };

  // The first column is keyed `debtor` so the server PDF gives it the wide column (as on the dues sheet).
  const rows: Record<string, SummaryCell>[] = [
    { date: reportDate(from), debtor: 'Opening balance', category: null, charged: null, paid: null, balance: money(opening) },
  ];
  for (const tx of ledger.transactions) {
    const id = tx.id.slice(tx.id.indexOf('-') + 1);
    if (tx.type === 'invoice') {
      const invoice = invoiceById.get(id)!;
      const date = invoiceDate(invoice);
      // One line per invoice line; a remainder line keeps the invoice's total when its lines do not add up to it.
      const items = [...(invoice.items ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
      const lines = items.map((item) => ({ text: `${invoice.invoice_number}: ${item.description || 'Invoice line'}`, amount: Number(item.amount) || 0 }));
      const rest = tx.debit - lines.reduce((sum, l) => sum + l.amount, 0);
      if (lines.length === 0) lines.push({ text: tx.description, amount: tx.debit });
      else if (isMoney(rest)) lines.push({ text: `${invoice.invoice_number}: rest of the invoice amount`, amount: rest });
      let running = tx.balance - tx.debit;
      lines.forEach((line, n) => {
        running = n === lines.length - 1 ? tx.balance : running + line.amount;
        rows.push({
          date: reportDate(date),
          debtor: `${line.text}${party(invoice)}`,
          category: categoryName(categoryOf(invoice)),
          charged: money(line.amount),
          paid: null,
          balance: money(running),
        });
      });
      addToMonth(date, tx.debit, 0);
    } else if (tx.type === 'payment') {
      const payment = paymentById.get(id)!;
      rows.push({
        date: reportDate(payment.payment_date),
        debtor: `${tx.description}${payment.reference_number ? `, ref ${payment.reference_number}` : ''}${party(payment)}`,
        category: categoryName(categoryOf(payment)),
        charged: null,
        paid: money(tx.credit),
        balance: money(tx.balance),
      });
      addToMonth(payment.payment_date, 0, tx.credit);
    } else {
      const movement = walletById.get(id)!;
      const date = walletDate(movement);
      rows.push({
        date: reportDate(date),
        debtor: `Wallet ${tx.type === 'wallet_credit' ? 'credit' : 'debit'}${movement.description ? `: ${movement.description}` : ''}`,
        category: categoryName(movement.charge_category),
        charged: tx.debit ? money(tx.debit) : null,
        paid: tx.credit ? money(tx.credit) : null,
        balance: money(tx.balance),
      });
      addToMonth(date, tx.debit, tx.credit);
    }
  }

  const allMonths = monthKeys(from, to);
  const chartMonths = allMonths.slice(-MAX_CHART_MONTHS);
  const bars = chartMonths.flatMap((key) => {
    const m = months.get(key) ?? { charged: 0, paid: 0 };
    const label = `${MONTH_ABBR[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
    return [
      { label: `${label} charged`, value: m.charged, display: money(m.charged), tone: 'bad' as const },
      { label: `${label} paid`, value: m.paid, display: money(m.paid), tone: 'good' as const },
    ];
  });

  // The figure the house page (get_house_payment_status) or the resident page (get_resident_cross_property_payment_summary)
  // shows as outstanding: unpaid on each invoice, today. It reads amount_paid, so it moves when money is applied, not when it is paid.
  const unpaidOnInvoices = invoices
    .filter((i) => isHouse || i.house_id !== null)
    .reduce((sum, i) => sum + Math.max((Number(i.amount_due) || 0) - (Number(i.amount_paid) || 0), 0), 0);

  const today = lagosDate(new Date().toISOString());
  const notes = [
    'Balance: invoices (not void) less verified payments' + (isHouse ? '.' : ', plus or less wallet movements.') +
      ' A positive balance is owed; a negative balance is credit. It is the balance of the Account Statement.',
    isHouse
      ? 'No wallet lines: a wallet belongs to a resident, not to a house. A payment counts on the day it is paid, also when it is still in a wallet and not yet applied to an invoice.'
      : 'Wallet lines that only move a payment into the wallet, or apply wallet money to an invoice, are not shown: that payment and that invoice are already lines.',
    `Unpaid on invoices today, as the ${isHouse ? 'house' : 'resident'} page shows it: ${money(unpaidOnInvoices)}.` +
      (to >= today && isMoney(unpaidOnInvoices - closing)
        ? ' It is different from the balance here because that figure changes only when money is applied to an invoice: money not yet applied (wallet credit), an applied payment that is not verified, and an invoice dated after the period make the two figures different.'
        : ''),
  ];
  if (isMoney(awaitingVerification)) notes.push(`Payments of ${money(awaitingVerification)} are awaiting verification. They are not in the balance.`);
  if (allMonths.length > chartMonths.length) notes.push(`The period is longer than ${MAX_CHART_MONTHS} months, so the chart shows the latest ${MAX_CHART_MONTHS}.`);

  // Check the lines against resident_account_balance, the function behind the Account Statement. A house is the sum over its residents.
  const residentIds = isHouse ? [...new Set([...invoices, ...payments].map((r) => r.resident_id))] : [subject.id];
  try {
    const balances = await Promise.all(
      residentIds.map((residentId) => fetchAccountBalance(supabase, { residentId, houseId: isHouse ? subject.id : null, fromDate: from, toDate: to }))
    );
    const checked = balances.reduce((sum, b) => sum + b.closingBalance, 0);
    if (isMoney(checked - closing)) {
      console.error('[statement-of-account] lines disagree with resident_account_balance', { subject, from, to, closing, checked });
      notes.push(`Check: the account balance is ${money(checked)}, which is different from the lines. Report this.`);
    }
  } catch (error) {
    console.error('[statement-of-account] account balance check could not run', { subject, from, to, error });
  }

  const data: SummaryReportData = {
    summary: [
      { label: 'Opening balance (NGN)', value: money(opening), tone: opening > 0.005 ? 'bad' : 'neutral', hint: `On ${reportDate(from)}` },
      { label: 'Charged (NGN)', value: money(charged), tone: 'neutral' },
      { label: 'Paid (NGN)', value: money(paid), tone: 'good' },
      {
        label: to >= today ? 'Owed now (NGN)' : 'Owed at end of period (NGN)',
        value: money(closing),
        tone: closing > 0.005 ? 'bad' : 'good',
        hint: closing < -0.005 ? `In credit on ${reportDate(to)}` : `On ${reportDate(to)}`,
      },
    ],
    chart: { title: 'Charged and paid by month (NGN)', bars },
    table: {
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'debtor', label: 'Item' },
        { key: 'category', label: 'Charge type' },
        { key: 'charged', label: 'Charge', align: 'right' },
        { key: 'paid', label: 'Payment', align: 'right' },
        { key: 'balance', label: 'Balance', align: 'right' },
      ],
      rows,
      totals: { date: null, debtor: 'Total', category: null, charged: money(charged), paid: money(paid), balance: money(closing) },
    },
    notes,
    subject: `${subjectLabel}, ${reportDate(from)} to ${reportDate(to)}`,
  };

  return { type: 'statement_of_account', layout: 'summary', data };
}
