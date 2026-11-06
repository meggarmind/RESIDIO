/**
 * Wallet balances (#1403, layout B). Per resident: opening balance, credits, debits and closing
 * balance for the period, and the total credit residents hold with the estate.
 *
 * Wallets are per resident per charge (#1189), so each resident's row adds up all their wallets.
 *
 * How the figures are derived: the closing balance starts from `resident_wallets.balance` (the live
 * figure). Wallet transactions dated after the period end are taken back out of it, so for a period
 * that ends today or later the closing balance IS `resident_wallets.balance`. The opening balance is
 * then closing - credits + debits of the period. It uses no stored `balance_after`, so it cannot
 * disagree with the wallet balance. Days are UTC days, as the timestamps are stored.
 *
 * No authorization here: the callers authorize (see the header of report-generator.ts).
 */

import { fetchAllRows } from '@/lib/supabase/fetch-all-rows';
import type { ReportSupabaseClient } from '@/lib/reports/report-generator';
import type { SummaryReport, SummaryReportData } from '@/lib/reports/summary-report';
import { formatLongDate, formatMoney, monthKeysInRange, monthName, roundMoney } from '@/lib/reports/generators/finance-format';

type WalletRow = {
  id: string;
  resident_id: string;
  balance: number | string | null;
  resident: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null;
};
type TransactionRow = { id: string; wallet_id: string; type: 'credit' | 'debit'; amount: number | string | null; created_at: string };

const MAX_CHART_MONTHS = 12;
const one = <T,>(value: T | T[] | null): T | null => (Array.isArray(value) ? value[0] ?? null : value);

export async function generateWalletBalances(
  supabase: ReportSupabaseClient,
  dateRange: { startDate: string; endDate: string },
): Promise<SummaryReport> {
  const wallets = await fetchAllRows<WalletRow>((from, to) =>
    supabase
      .from('resident_wallets')
      .select('id, resident_id, balance, resident:residents(first_name, last_name)')
      .order('id')
      .range(from, to) as unknown as PromiseLike<{ data: WalletRow[] | null; error: { message: string } | null }>,
  );
  if (wallets.error !== null) {
    console.error('Error fetching wallets for wallet balances report:', wallets.error);
    throw new Error(wallets.error);
  }

  // Everything from the period start on: the period's own movements, and later ones to take back out.
  const transactions = await fetchAllRows<TransactionRow>((from, to) =>
    supabase
      .from('wallet_transactions')
      .select('id, wallet_id, type, amount, created_at')
      .gte('created_at', dateRange.startDate)
      .order('id')
      .range(from, to) as unknown as PromiseLike<{ data: TransactionRow[] | null; error: { message: string } | null }>,
  );
  if (transactions.error !== null) {
    console.error('Error fetching wallet transactions for wallet balances report:', transactions.error);
    throw new Error(transactions.error);
  }

  interface Resident { name: string; closingNow: number; credits: number; debits: number; afterNet: number }
  const residents = new Map<string, Resident>();
  const residentOfWallet = new Map<string, string>();
  for (const wallet of wallets.data) {
    residentOfWallet.set(wallet.id, wallet.resident_id);
    const person = one(wallet.resident);
    const entry = residents.get(wallet.resident_id) ?? {
      name: person ? `${person.first_name} ${person.last_name}`.trim() : 'Unknown resident',
      closingNow: 0, credits: 0, debits: 0, afterNet: 0,
    };
    entry.closingNow += Number(wallet.balance) || 0;
    residents.set(wallet.resident_id, entry);
  }

  const monthly = new Map<string, { credits: number; debits: number }>();
  for (const tx of transactions.data) {
    const residentId = residentOfWallet.get(tx.wallet_id);
    const entry = residentId ? residents.get(residentId) : undefined;
    if (!entry) continue;
    const amount = Number(tx.amount) || 0;
    const day = tx.created_at.slice(0, 10);
    if (day > dateRange.endDate) {
      entry.afterNet += tx.type === 'credit' ? amount : -amount;
      continue;
    }
    if (tx.type === 'credit') entry.credits += amount;
    else entry.debits += amount;
    const month = monthly.get(day.slice(0, 7)) ?? { credits: 0, debits: 0 };
    if (tx.type === 'credit') month.credits += amount;
    else month.debits += amount;
    monthly.set(day.slice(0, 7), month);
  }

  const lines = [...residents.values()]
    .map((r) => {
      const closing = roundMoney(r.closingNow - r.afterNet);
      const credits = roundMoney(r.credits);
      const debits = roundMoney(r.debits);
      return { name: r.name, opening: roundMoney(closing - credits + debits), credits, debits, closing };
    })
    .filter((l) => l.opening !== 0 || l.credits !== 0 || l.debits !== 0 || l.closing !== 0)
    .sort((a, b) => b.closing - a.closing || a.name.localeCompare(b.name, 'en'));

  const sum = (pick: (l: (typeof lines)[number]) => number) => roundMoney(lines.reduce((total, l) => total + pick(l), 0));
  const totals = { opening: sum((l) => l.opening), credits: sum((l) => l.credits), debits: sum((l) => l.debits), closing: sum((l) => l.closing) };
  const withCredit = lines.filter((l) => l.closing > 0).length;

  const months = monthKeysInRange(dateRange.startDate, dateRange.endDate).slice(-MAX_CHART_MONTHS);
  const bars = months.flatMap((key) => {
    const m = monthly.get(key) ?? { credits: 0, debits: 0 };
    return [
      { label: `${monthName(key)} credits`, value: roundMoney(m.credits), display: formatMoney(roundMoney(m.credits)), tone: 'good' as const },
      { label: `${monthName(key)} debits`, value: roundMoney(m.debits), display: formatMoney(roundMoney(m.debits)), tone: 'bad' as const },
    ];
  });

  const data: SummaryReportData = {
    summary: [
      { label: 'Resident credit held (NGN)', value: formatMoney(totals.closing), tone: 'neutral', hint: `Closing, ${formatLongDate(dateRange.endDate)}` },
      { label: 'Credits in period (NGN)', value: formatMoney(totals.credits), tone: 'good' },
      { label: 'Debits in period (NGN)', value: formatMoney(totals.debits), tone: 'neutral' },
      { label: 'Residents with credit', value: withCredit, tone: 'neutral' },
    ],
    chart: { title: 'Credits and debits by month (NGN)', bars },
    table: {
      columns: [
        { key: 'resident', label: 'Resident' },
        { key: 'opening', label: 'Opening balance', align: 'right' },
        { key: 'credits', label: 'Credits', align: 'right' },
        { key: 'debits', label: 'Debits', align: 'right' },
        { key: 'closing', label: 'Closing balance', align: 'right' },
      ],
      rows: lines.map((l) => ({ resident: l.name, opening: formatMoney(l.opening), credits: formatMoney(l.credits), debits: formatMoney(l.debits), closing: formatMoney(l.closing) })),
      totals: { resident: 'Total', opening: formatMoney(totals.opening), credits: formatMoney(totals.credits), debits: formatMoney(totals.debits), closing: formatMoney(totals.closing) },
    },
    notes: [
      `Period ${formatLongDate(dateRange.startDate)} to ${formatLongDate(dateRange.endDate)}. A resident's row adds up all their wallets (one per charge).`,
      'Credits are money paid into a wallet. Debits are money taken out, for example to settle an invoice. Closing balance = opening balance + credits - debits.',
      'For a period that ends today, the closing balance is the wallet balance now. Opening balance is worked back from it. Residents with no balance and no movement are left out.',
    ],
  };

  return { type: 'wallet_balances', layout: 'summary', data };
}
