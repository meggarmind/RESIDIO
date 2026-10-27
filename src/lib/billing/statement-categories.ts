import { DEFAULT_CHARGE_CATEGORY, type ChargeCategory } from '@/lib/billing/charge-categories';
import {
  buildStatementLedger,
  type LedgerInvoice,
  type LedgerPayment,
  type LedgerWalletTransaction,
} from '@/lib/billing/statement-ledger';
import type {
  CategoryStatementSection,
  CollectionStatementLine,
  CollectionsStatementSection,
} from '@/lib/billing/account-statement-data';

/**
 * Statement by wallet category (#1196). Every invoice, payment and wallet row carries a category
 * (#1189, #1190); a section is the ledger of one category with its own opening and running balance.
 * Collections (#1194) are listed apart and never enter a balance.
 */

type Categorised = { charge_category?: string | null };

export function categoryOf(row: Categorised): string {
  return row.charge_category || DEFAULT_CHARGE_CATEGORY;
}

const isMoney = (value: number) => Math.abs(value) >= 0.005;

/**
 * One section per category that has rows in the period or a balance carried in, in the categories'
 * sort order. A statement with nothing at all still shows the default category, so it is never blank.
 */
export function buildCategorySections(input: {
  categories: Pick<ChargeCategory, 'code' | 'name'>[];
  /** Opening balance per category code; a missing code opens at zero. */
  openings: Map<string, number>;
  invoices: Array<LedgerInvoice & Categorised>;
  payments: Array<LedgerPayment & Categorised>;
  walletTransactions: Array<LedgerWalletTransaction & Categorised>;
  mode?: 'detailed' | 'summary';
}): CategoryStatementSection[] {
  const names = new Map(input.categories.map((category) => [category.code, category.name]));
  const codes = input.categories.map((category) => category.code);
  // A row whose category is not in the list still gets a section rather than vanishing.
  for (const code of [
    ...input.openings.keys(),
    ...input.invoices.map(categoryOf),
    ...input.payments.map(categoryOf),
    ...input.walletTransactions.map(categoryOf),
  ]) {
    if (!names.has(code)) {
      names.set(code, code);
      codes.push(code);
    }
  }

  const sections: CategoryStatementSection[] = [];
  for (const code of codes) {
    const invoices = input.invoices.filter((row) => categoryOf(row) === code);
    const payments = input.payments.filter((row) => categoryOf(row) === code);
    const walletTransactions = input.walletTransactions.filter((row) => categoryOf(row) === code);
    const openingBalance = input.openings.get(code) ?? 0;
    if (!invoices.length && !payments.length && !walletTransactions.length && !isMoney(openingBalance)) continue;

    const ledger = buildStatementLedger({ openingBalance, invoices, payments, walletTransactions, mode: input.mode });
    sections.push({
      code,
      name: names.get(code) ?? code,
      openingBalance,
      closingBalance: ledger.closingBalance,
      summary: ledger.summary,
      transactions: ledger.transactions,
    });
  }

  if (sections.length === 0) {
    const code = codes.includes(DEFAULT_CHARGE_CATEGORY) ? DEFAULT_CHARGE_CATEGORY : (codes[0] ?? DEFAULT_CHARGE_CATEGORY);
    const ledger = buildStatementLedger({ openingBalance: 0, invoices: [], payments: [], walletTransactions: [] });
    sections.push({
      code,
      name: names.get(code) ?? 'Dues',
      openingBalance: 0,
      closingBalance: 0,
      summary: ledger.summary,
      transactions: [],
    });
  }
  return sections;
}

export interface CollectionPaymentRow {
  id: string;
  amount: number | string;
  quantity: number | null;
  unit_price: number | string | null;
  payment_date: string;
  reference: string | null;
  receipt_number: string;
  collection: { name: string } | { name: string }[] | null;
}

/** The Collections section: each payment in the order given, and their total in kobo-safe arithmetic. */
export function buildCollectionsSection(rows: CollectionPaymentRow[]): CollectionsStatementSection | undefined {
  if (rows.length === 0) return undefined;
  const lines: CollectionStatementLine[] = rows.map((row) => {
    const collection = Array.isArray(row.collection) ? row.collection[0] : row.collection;
    return {
      id: `col-${row.id}`,
      date: row.payment_date,
      collection_name: collection?.name ?? 'Collection',
      receipt_number: row.receipt_number,
      reference: row.reference,
      quantity: row.quantity,
      unit_price: row.unit_price == null ? null : Number(row.unit_price),
      amount: Number(row.amount),
    };
  });
  const totalKobo = lines.reduce((sum, line) => sum + Math.round(line.amount * 100), 0);
  return { lines, total: totalKobo / 100 };
}

/** Rows the statement lists, for the chat-or-email choice: every category row and every collection line. */
export function statementRowCount(statement: {
  transactions: unknown[];
  collections?: { lines: unknown[] };
}): number {
  return statement.transactions.length + (statement.collections?.lines.length ?? 0);
}
