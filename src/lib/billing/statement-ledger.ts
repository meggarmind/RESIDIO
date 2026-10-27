import type { StatementTransaction } from '@/actions/billing/get-account-statement';
import { invoiceLabel } from '@/lib/billing/invoice-label';

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
  /** The rates as billed; its item names label the invoice (#1253). */
  rate_snapshot?: unknown;
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

/** Months since year 0 of a period start, so two months in sequence differ by one. */
function monthIndex(dateStr: string): number {
  const { year, month } = lagosYearMonth(dateStr);
  return year * 12 + month;
}

/**
 * Folds each run of unpaid monthly invoices into one line (#1234). A run is two or more invoices in
 * sequence with the same billing item and amount, for months in sequence, each added in full to the
 * debt. Any other row stops the run, and so does an invoice the credit pays fully or partly: it
 * stays on its own line. The line sits at the first invoice's date and shows the balance at the end
 * of the run, so opening, closing and the totals match the detailed statement.
 */
function summariseInvoices(transactions: StatementTransaction[], names: Map<string, string>, periodStarts: Map<string, string>) {
  const runs: StatementTransaction[][] = [];
  let run: StatementTransaction[] = [];
  const close = () => {
    if (run.length) runs.push(run);
    run = [];
  };

  for (const tx of transactions) {
    const start = periodStarts.get(tx.id);
    // A balance in credit before the invoice means the credit pays some or all of it.
    const unpaid = tx.type === 'invoice' && start !== undefined && tx.balance - tx.debit > -0.005;
    if (!unpaid) {
      close();
      runs.push([tx]);
      continue;
    }
    const prev = run.at(-1);
    const continues = prev
      && names.get(prev.id) === names.get(tx.id)
      && prev.debit === tx.debit
      && monthIndex(periodStarts.get(prev.id)!) + 1 === monthIndex(start);
    if (!continues) close();
    run.push(tx);
  }
  close();

  return runs.map((members): StatementTransaction => {
    if (members.length < 2) return { ...members[0] };
    const first = members[0];
    const last = members[members.length - 1];
    const from = lagosYearMonth(periodStarts.get(first.id)!);
    const to = lagosYearMonth(periodStarts.get(last.id)!);
    const months = from.year === to.year
      ? `${MONTHS[from.month]} – ${MONTHS[to.month]} ${to.year}`
      : `${MONTHS[from.month]} ${from.year} – ${MONTHS[to.month]} ${to.year}`;
    return {
      id: `inv-run-${first.id}`,
      date: first.date,
      type: 'invoice',
      description: `${names.get(first.id)} · ${months} · ${members.length} invoices`,
      reference: first.reference && last.reference ? `${first.reference} – ${last.reference}` : null,
      debit: members.reduce((sum, m) => sum + m.debit, 0),
      credit: 0,
      balance: last.balance,
      invoice_count: members.length,
    };
  });
}

export function buildStatementLedger(input: {
  openingBalance: number;
  invoices: LedgerInvoice[];
  payments: LedgerPayment[];
  walletTransactions: LedgerWalletTransaction[];
  /** `summary` folds each run of unpaid monthly invoices into one line (#1234); payments stay line by line. */
  mode?: 'detailed' | 'summary';
}) {
  const { openingBalance } = input;
  const transactions: StatementTransaction[] = [];
  const itemNames = new Map<string, string>();
  const periodStarts = new Map<string, string>();

  for (const invoice of input.invoices) {
    const amount = invoice.amount_due || 0;
    if (invoice.period_start) periodStarts.set(`inv-${invoice.id}`, invoice.period_start);
    itemNames.set(`inv-${invoice.id}`, invoiceLabel({ invoice_type: invoice.invoice_type, rate_snapshot: invoice.rate_snapshot, profileName: invoice.billing_profile_name, periodStart: null }));
    transactions.push({
      id: `inv-${invoice.id}`,
      date: invoiceStatementDate(invoice),
      type: 'invoice',
      description: `Invoice #${invoice.invoice_number} - ${invoiceLabel({ invoice_type: invoice.invoice_type, rate_snapshot: invoice.rate_snapshot, profileName: invoice.billing_profile_name, periodStart: invoice.period_start })}`,
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
    transactions: input.mode === 'summary' ? summariseInvoices(transactions, itemNames, periodStarts) : transactions,
    // The monthly lines, kept for the optional statement appendix.
    monthlyInvoices: transactions.filter((t) => t.type === 'invoice'),
    summary,
    closingBalance: openingBalance + summary.netChange,
  };
}
