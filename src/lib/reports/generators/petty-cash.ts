/**
 * Petty cash report (#1404, layout B): per petty cash account, the opening balance, top-ups, spend and
 * closing balance for the period, and optionally each spend line.
 *
 * Opening balance = initial float + top-ups before the period - spend before the period. Top-ups are
 * the bank statement rows matched to the account and already processed (`status = 'created'`) and the
 * email transactions matched to it and already processed (`auto_processed` or `processed`); both
 * imports add the amount to the balance. No column ties an email transaction to a bank row, so the
 * same transfer imported both ways would count twice. Spend is every expense of the account (`source_type =
 * 'petty_cash'`), whatever its status, because the balance trigger takes the money off on insert and
 * does not give it back on cancel.
 */
import type { ReportSupabaseClient } from '@/lib/reports/report-generator';
import type { SummaryCell, SummaryReport, SummaryReportData } from '@/lib/reports/summary-report';
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows';
import { summarizePettyCashAccount, type PettyCashAccountRow } from '@/lib/finance/petty-cash-summary';
import { cents, money, reportDate } from '@/lib/reports/generators/money-out';

interface TopUpRow { id: string; matched_petty_cash_account_id: string | null; amount: number | string | null; transaction_date: string | null }
interface SpendRow { id: string; petty_cash_account_id: string | null; amount: number | string | null; expense_date: string; description: string | null; status: string | null }

async function readAll<T>(label: string, page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const result = await fetchAllRows<T>(page);
  if (result.error !== null) {
    console.error(`Error fetching ${label} for petty cash report:`, result.error);
    throw new Error(result.error);
  }
  return result.data;
}

export async function generatePettyCash(
  supabase: ReportSupabaseClient,
  dateRange: { startDate: string; endDate: string },
  showSpendLines: boolean
): Promise<SummaryReport> {
  const { startDate, endDate } = dateRange;

  const accountRows = await readAll<PettyCashAccountRow>('accounts', (from, to) =>
    supabase.from('petty_cash_accounts').select('id, name, current_balance, initial_float, last_replenishment_at, is_active').order('id').range(from, to));
  const accounts = accountRows.map(summarizePettyCashAccount).sort((a, b) => a.name.localeCompare(b.name));

  const topUps = await readAll<TopUpRow>('top-ups', (from, to) =>
    supabase.from('bank_statement_rows').select('id, matched_petty_cash_account_id, amount, transaction_date')
      .not('matched_petty_cash_account_id', 'is', null).eq('status', 'created').lte('transaction_date', endDate).order('id').range(from, to));
  const emailTopUps = await readAll<TopUpRow>('email top-ups', (from, to) =>
    supabase.from('email_transactions').select('id, matched_petty_cash_account_id, amount, transaction_date')
      .not('matched_petty_cash_account_id', 'is', null).in('status', ['auto_processed', 'processed']).lte('transaction_date', endDate).order('id').range(from, to));
  const spendRows = await readAll<SpendRow>('spend', (from, to) =>
    supabase.from('expenses').select('id, petty_cash_account_id, amount, expense_date, description, status')
      .eq('source_type', 'petty_cash').not('petty_cash_account_id', 'is', null).lte('expense_date', endDate).order('id').range(from, to));

  const figures = new Map<string, { topUpsBefore: number; topUps: number; spendBefore: number; spend: number; lines: SpendRow[] }>();
  const figuresOf = (id: string) => {
    let f = figures.get(id);
    if (!f) { f = { topUpsBefore: 0, topUps: 0, spendBefore: 0, spend: 0, lines: [] }; figures.set(id, f); }
    return f;
  };
  for (const t of [...topUps, ...emailTopUps]) {
    if (!t.matched_petty_cash_account_id || !t.transaction_date) continue;
    const f = figuresOf(t.matched_petty_cash_account_id);
    const amount = Math.abs(Number(t.amount) || 0);
    if (t.transaction_date >= startDate) f.topUps += amount; else f.topUpsBefore += amount;
  }
  for (const s of spendRows) {
    if (!s.petty_cash_account_id) continue;
    const f = figuresOf(s.petty_cash_account_id);
    const amount = Number(s.amount) || 0;
    if (s.expense_date >= startDate) { f.spend += amount; f.lines.push(s); } else f.spendBefore += amount;
  }

  const lines = accounts.map((a) => {
    const f = figuresOf(a.id);
    const opening = cents(a.initialFloat + f.topUpsBefore - f.spendBefore);
    const topUps = cents(f.topUps);
    const spend = cents(f.spend);
    const closing = cents(opening + topUps - spend);
    return { account: a, opening, topUps, spend, closing, spendLines: f.lines.sort((x, y) => (x.expense_date < y.expense_date ? -1 : x.expense_date > y.expense_date ? 1 : 0)) };
  }).filter((l) => l.account.isActive || l.opening !== 0 || l.topUps !== 0 || l.spend !== 0 || l.closing !== 0);

  const sum = (pick: (l: (typeof lines)[number]) => number) => cents(lines.reduce((total, l) => total + pick(l), 0));
  const totals = { opening: sum((l) => l.opening), topUps: sum((l) => l.topUps), spend: sum((l) => l.spend), closing: sum((l) => l.closing) };

  const rows: Record<string, SummaryCell>[] = [];
  for (const l of lines) {
    rows.push({ account: l.account.name, opening: money(l.opening), topUps: money(l.topUps), spend: money(l.spend), closing: money(l.closing) });
    if (showSpendLines) {
      for (const s of l.spendLines) {
        rows.push({
          account: `    ${reportDate(s.expense_date)}, ${s.description || 'No description'}`,
          opening: null, topUps: null, spend: money(Number(s.amount) || 0), closing: null,
        });
      }
    }
  }

  // The balance on record also moves by cash collections and top-ups made by hand, which keep no history.
  const today = new Date().toISOString().slice(0, 10);
  const mismatched = endDate >= today ? lines.filter((l) => cents(l.account.currentBalance) !== l.closing) : [];

  const data: SummaryReportData = {
    summary: [
      { label: 'Accounts', value: lines.length, tone: 'neutral' },
      { label: 'Top-ups (NGN)', value: money(totals.topUps), tone: 'good' },
      { label: 'Spend (NGN)', value: money(totals.spend), tone: 'neutral' },
      { label: 'Closing balance (NGN)', value: money(totals.closing), tone: totals.closing < 0 ? 'bad' : 'neutral', hint: `On ${reportDate(endDate)}` },
    ],
    chart: {
      title: 'Spend by account (NGN)',
      bars: lines.map((l) => ({ label: l.account.name, value: l.spend, display: money(l.spend), tone: 'neutral' as const })),
    },
    table: {
      columns: [
        { key: 'account', label: 'Account' },
        { key: 'opening', label: 'Opening balance', align: 'right' },
        { key: 'topUps', label: 'Top-ups', align: 'right' },
        { key: 'spend', label: 'Spend', align: 'right' },
        { key: 'closing', label: 'Closing balance', align: 'right' },
      ],
      rows,
      totals: { account: 'Total', opening: money(totals.opening), topUps: money(totals.topUps), spend: money(totals.spend), closing: money(totals.closing) },
    },
    notes: [
      `Period: ${reportDate(startDate)} to ${reportDate(endDate)}. Opening balance is the starting float plus earlier top-ups, less earlier spend. Top-ups are bank statement rows and email transactions matched to the account.`,
      ...(mismatched.length > 0
        ? [`The balance now on record differs from the closing balance for: ${mismatched.map((l) => `${l.account.name} (${money(l.account.currentBalance)} on record)`).join('; ')}. Cash collections and top-ups made by hand change the balance but keep no history, so they are not in these figures.`]
        : []),
    ],
  };

  return { type: 'petty_cash', layout: 'summary', data };
}
