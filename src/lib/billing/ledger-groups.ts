export interface GroupableLedgerRow {
  id: string;
  type: string;
  created_at: string;
  amount: number;
  balance_after: number;
  reference_type?: string | null;
  invoice_item?: string | null;
  invoice_period_start?: string | null;
}

export interface InvoiceDebitGroup<T extends GroupableLedgerRow> {
  kind: 'group';
  id: string;
  item: string;
  /** Newest member first, as the ledger lists them. */
  rows: T[];
  total: number;
  /** Balance after the newest member. */
  closingBalance: number;
}

export type LedgerEntry<T extends GroupableLedgerRow> = { kind: 'row'; row: T } | InvoiceDebitGroup<T>;

/**
 * Combines invoice-settling debits for the same billing item into one entry; a lone debit,
 * credits and debits without an invoice stay single rows. Expects rows newest first and keeps
 * that order, placing a group where its newest member was.
 */
export function groupInvoiceDebits<T extends GroupableLedgerRow>(rows: T[]): LedgerEntry<T>[] {
  const groups = new Map<string, InvoiceDebitGroup<T>>();
  const entries: LedgerEntry<T>[] = [];
  for (const row of rows) {
    if (row.type !== 'debit' || row.reference_type !== 'invoice' || !row.invoice_item) {
      entries.push({ kind: 'row', row });
      continue;
    }
    const existing = groups.get(row.invoice_item);
    if (existing) {
      existing.rows.push(row);
      existing.total += Number(row.amount);
      continue;
    }
    const group: InvoiceDebitGroup<T> = {
      kind: 'group',
      id: `group-${row.invoice_item}`,
      item: row.invoice_item,
      rows: [row],
      total: Number(row.amount),
      closingBalance: Number(row.balance_after),
    };
    groups.set(row.invoice_item, group);
    entries.push(group);
  }
  return entries.map((entry) => (entry.kind === 'group' && entry.rows.length === 1 ? { kind: 'row', row: entry.rows[0] } : entry));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Month an invoice debit bills (its period, else when it was written) as year * 12 + month index. */
function monthIndex(row: GroupableLedgerRow): number {
  const period = row.invoice_period_start?.match(/^(\d{4})-(\d{2})/);
  if (period) return Number(period[1]) * 12 + Number(period[2]) - 1;
  const written = new Date(row.created_at);
  return written.getFullYear() * 12 + written.getMonth();
}

/** "Jan–Oct 2026", "Mar 2026", or "Nov 2025–Feb 2026" when the group crosses a year. */
export function groupPeriodLabel(rows: GroupableLedgerRow[]): string {
  const indexes = rows.map(monthIndex);
  const first = Math.min(...indexes);
  const last = Math.max(...indexes);
  const label = (index: number, withYear: boolean) => `${MONTHS[index % 12]}${withYear ? ` ${Math.floor(index / 12)}` : ''}`;
  if (first === last) return label(first, true);
  const sameYear = Math.floor(first / 12) === Math.floor(last / 12);
  return `${label(first, !sameYear)}–${label(last, true)}`;
}
