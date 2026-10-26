import type { StatementTransaction } from '@/actions/billing/get-account-statement';
import { chargeLabel } from '@/lib/whatsapp/assistant-format';

export interface LedgerInvoice {
  id: string;
  invoice_number: string;
  amount_due: number | null;
  status: string;
  invoice_type: string;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
  billing_profile_name: string | null;
  charge_category?: string | null;
}

export interface LedgerPayment {
  id: string;
  amount: number | null;
  payment_date: string;
  reference_number: string | null;
  method: string | null;
  notes: string | null;
  charge_category?: string | null;
}

export interface LedgerWalletTransaction {
  id: string;
  type: 'credit' | 'debit';
  amount: number;
  description: string | null;
  reference_type: string | null;
  reference_id: string | null;
  created_at: string;
  /** The category of the wallet the row belongs to (#1189). */
  charge_category?: string | null;
}

// Wallet rows that only mirror an invoice settlement or a payment already listed on the statement.
export const MIRRORED_WALLET_REFERENCES = new Set(['invoice', 'payment']);

/** The date an invoice belongs to on a statement: the period it bills, else when it was raised. */
export function invoiceStatementDate(invoice: Pick<LedgerInvoice, 'period_start' | 'created_at'>): string {
  return invoice.period_start ?? invoice.created_at;
}

function formatPeriodDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Year and month index (0-11) of an instant on the Lagos calendar (UTC+1 all year, as the ledger dates it). */
function lagosYearMonth(dateStr: string): { year: number; month: number } {
  const lagos = new Date(Date.parse(dateStr) + 3_600_000);
  return { year: lagos.getUTCFullYear(), month: lagos.getUTCMonth() };
}

/**
 * Folds the invoice lines of one billing item and calendar year into one line (a lone invoice
 * stays as it is). The line sits at the last invoice's date and the running balance is redone,
 * so opening, closing and the totals match the detailed statement.
 */
function summariseInvoices(transactions: StatementTransaction[], names: Map<string, string>, openingBalance: number) {
  const groups = new Map<string, StatementTransaction[]>();
  for (const tx of transactions) {
    if (tx.type !== 'invoice') continue;
    const key = `${names.get(tx.id)}|${lagosYearMonth(tx.date).year}`;
    groups.set(key, [...(groups.get(key) ?? []), tx]);
  }

  const folded = new Set<string>();
  const result: StatementTransaction[] = [];
  for (const tx of transactions) {
    const key = `${names.get(tx.id)}|${lagosYearMonth(tx.date).year}`;
    const members = tx.type === 'invoice' ? groups.get(key)! : [];
    if (members.length < 2) {
      result.push({ ...tx });
      continue;
    }
    if (folded.has(key) || tx !== members[members.length - 1]) continue;
    folded.add(key);
    const first = lagosYearMonth(members[0].date);
    const last = lagosYearMonth(tx.date);
    const months = first.month === last.month ? MONTHS[last.month] : `${MONTHS[first.month]}–${MONTHS[last.month]}`;
    result.push({
      id: `inv-grp-${key}`,
      date: tx.date,
      type: 'invoice',
      description: `${names.get(tx.id)} · ${months} ${last.year} · ${members.length} invoices`,
      reference: null,
      debit: members.reduce((sum, m) => sum + m.debit, 0),
      credit: 0,
      balance: 0,
      invoice_count: members.length,
    });
  }

  let balance = openingBalance;
  for (const tx of result) {
    balance += tx.debit - tx.credit;
    tx.balance = balance;
  }
  return result;
}

export function buildStatementLedger(input: {
  openingBalance: number;
  invoices: LedgerInvoice[];
  payments: LedgerPayment[];
  walletTransactions: LedgerWalletTransaction[];
  /** `summary` folds monthly invoices into one line per billing item per year; payments stay line by line. */
  mode?: 'detailed' | 'summary';
}) {
  const { openingBalance } = input;
  const transactions: StatementTransaction[] = [];
  const itemNames = new Map<string, string>();

  for (const invoice of input.invoices) {
    const amount = invoice.amount_due || 0;
    itemNames.set(`inv-${invoice.id}`, chargeLabel({ invoice_type: invoice.invoice_type, profileName: invoice.billing_profile_name, periodStart: null }));
    transactions.push({
      id: `inv-${invoice.id}`,
      date: invoiceStatementDate(invoice),
      type: 'invoice',
      description: `Invoice #${invoice.invoice_number} - ${chargeLabel({ invoice_type: invoice.invoice_type, profileName: invoice.billing_profile_name, periodStart: invoice.period_start })}`,
      reference: invoice.invoice_number,
      debit: amount,
      credit: 0,
      balance: 0,
      invoice_id: invoice.id,
      invoice_status: invoice.status as StatementTransaction['invoice_status'],
      invoice_type: invoice.invoice_type as StatementTransaction['invoice_type'],
      period: invoice.period_start && invoice.period_end
        ? `${formatPeriodDate(invoice.period_start)} - ${formatPeriodDate(invoice.period_end)}`
        : undefined,
    });
  }

  for (const payment of input.payments) {
    transactions.push({
      id: `pay-${payment.id}`,
      date: payment.payment_date,
      type: 'payment',
      description: `Payment${payment.method ? ` (${payment.method})` : ''}${payment.notes ? ` - ${payment.notes}` : ''}`,
      reference: payment.reference_number,
      debit: 0,
      credit: payment.amount || 0,
      balance: 0,
      payment_id: payment.id,
    });
  }

  for (const tx of input.walletTransactions) {
    if (tx.reference_type && MIRRORED_WALLET_REFERENCES.has(tx.reference_type)) continue;
    const isCredit = tx.type === 'credit';
    transactions.push({
      id: `wtx-${tx.id}`,
      date: tx.created_at,
      type: isCredit ? 'wallet_credit' : 'wallet_debit',
      description: tx.description || (isCredit ? 'Wallet Credit' : 'Wallet Debit'),
      reference: tx.reference_id,
      debit: isCredit ? 0 : tx.amount,
      credit: isCredit ? tx.amount : 0,
      balance: 0,
    });
  }

  // Charges before receipts on the same day, so a same-day payment never shows as an advance.
  const order = { invoice: 0, wallet_debit: 1, payment: 2, wallet_credit: 3 } as const;
  transactions.sort((a, b) =>
    new Date(a.date).getTime() - new Date(b.date).getTime() || order[a.type] - order[b.type]);

  let balance = openingBalance;
  for (const tx of transactions) {
    balance += tx.debit - tx.credit;
    tx.balance = balance;
  }

  const sumOf = (type: StatementTransaction['type'], field: 'debit' | 'credit') =>
    transactions.filter((t) => t.type === type).reduce((sum, t) => sum + t[field], 0);
  const summary = {
    totalInvoiced: sumOf('invoice', 'debit'),
    totalPaid: sumOf('payment', 'credit'),
    totalCredits: sumOf('wallet_credit', 'credit'),
    totalDebits: sumOf('wallet_debit', 'debit'),
    netChange: 0,
  };
  summary.netChange = summary.totalInvoiced + summary.totalDebits - summary.totalPaid - summary.totalCredits;

  return {
    transactions: input.mode === 'summary' ? summariseInvoices(transactions, itemNames, openingBalance) : transactions,
    // The monthly lines, kept for the optional statement appendix.
    monthlyInvoices: transactions.filter((t) => t.type === 'invoice'),
    summary,
    closingBalance: openingBalance + summary.netChange,
  };
}
