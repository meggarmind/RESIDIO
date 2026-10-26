import { DEFAULT_CHARGE_CATEGORY } from '@/lib/billing/charge-categories';
import { resolvePayer, type BillingPayer } from '@/lib/billing/payer';

/**
 * The admin house view of obligations by role (#1196): what the occupant owes in dues and what the
 * landlord owes in levies, and who paid. Invoices carry the payer class of the billing profile that
 * made them; a legacy invoice with no profile is an occupant charge, as billing treats it.
 */

export const OBLIGATION_ROLE_LABELS: Record<BillingPayer, string> = {
  occupant: 'Occupant dues',
  landlord: 'Landlord levies',
};

export interface ObligationInvoice {
  resident_id: string;
  charge_category: string | null;
  amount_due: number;
  amount_paid: number;
  payer: BillingPayer | null;
}

export interface ObligationPayment {
  resident_id: string;
  amount: number;
  payment_date: string;
  paid_by_resident_id: string | null;
  paid_by_name: string | null;
}

export interface HouseParty {
  id: string;
  role: string;
}

export interface CategoryAmounts {
  code: string;
  name: string;
  billed: number;
  paid: number;
  outstanding: number;
}

export interface ObligationParty {
  id: string;
  name: string;
  /** Currently the party billing resolves to for this class of charge. */
  current: boolean;
  billed: number;
  paid: number;
  outstanding: number;
  byCategory: CategoryAmounts[];
}

export interface ObligationGroup {
  role: BillingPayer;
  label: string;
  parties: ObligationParty[];
  billed: number;
  paid: number;
  outstanding: number;
}

export interface PaymentSource {
  creditedToId: string;
  creditedToName: string;
  /** Null when the account holder paid for themselves. */
  paidByName: string | null;
  amount: number;
  count: number;
  lastDate: string;
}

export interface HouseObligations {
  groups: ObligationGroup[];
  payments: PaymentSource[];
}

const kobo = (amount: number) => Math.round(Number(amount) * 100);

export function buildHouseObligations(input: {
  house: { vacant: boolean; newNeverOccupied: boolean };
  parties: HouseParty[];
  invoices: ObligationInvoice[];
  payments: ObligationPayment[];
  categories: Array<{ code: string; name: string }>;
  names: Map<string, string>;
}): HouseObligations {
  const categoryNames = new Map(input.categories.map((category) => [category.code, category.name]));
  const nameOf = (id: string) => input.names.get(id) ?? 'Unknown resident';
  const roles: BillingPayer[] = ['occupant', 'landlord'];

  const groups = roles.map<ObligationGroup>((role) => {
    const invoices = input.invoices.filter((invoice) => (invoice.payer ?? 'occupant') === role);
    const amounts = new Map<string, Map<string, { billed: number; paid: number }>>();
    for (const invoice of invoices) {
      const byCategory = amounts.get(invoice.resident_id) ?? new Map<string, { billed: number; paid: number }>();
      const code = invoice.charge_category || DEFAULT_CHARGE_CATEGORY;
      const entry = byCategory.get(code) ?? { billed: 0, paid: 0 };
      entry.billed += kobo(invoice.amount_due);
      entry.paid += kobo(invoice.amount_paid);
      byCategory.set(code, entry);
      amounts.set(invoice.resident_id, byCategory);
    }

    // Billing resolves one party per class today; show them even before their first invoice.
    const resolved = resolvePayer({
      payer: role,
      targetType: 'house',
      house: input.house,
      applicableRoles: null,
      residents: input.parties,
    }).payer;
    if (resolved && !amounts.has(resolved.id)) amounts.set(resolved.id, new Map());

    const parties = [...amounts.entries()].map<ObligationParty>(([id, byCategory]) => {
      const rows = [...byCategory.entries()].map<CategoryAmounts>(([code, entry]) => ({
        code,
        name: categoryNames.get(code) ?? code,
        billed: entry.billed / 100,
        paid: entry.paid / 100,
        outstanding: Math.max(0, entry.billed - entry.paid) / 100,
      }));
      const billed = rows.reduce((sum, row) => sum + kobo(row.billed), 0);
      const paid = rows.reduce((sum, row) => sum + kobo(row.paid), 0);
      return {
        id,
        name: nameOf(id),
        current: resolved?.id === id,
        billed: billed / 100,
        paid: paid / 100,
        outstanding: rows.reduce((sum, row) => sum + kobo(row.outstanding), 0) / 100,
        byCategory: rows,
      };
    });
    parties.sort((a, b) => Number(b.current) - Number(a.current) || b.outstanding - a.outstanding || a.name.localeCompare(b.name));

    return {
      role,
      label: OBLIGATION_ROLE_LABELS[role],
      parties,
      billed: parties.reduce((sum, party) => sum + kobo(party.billed), 0) / 100,
      paid: parties.reduce((sum, party) => sum + kobo(party.paid), 0) / 100,
      outstanding: parties.reduce((sum, party) => sum + kobo(party.outstanding), 0) / 100,
    };
  });

  const sources = new Map<string, PaymentSource & { kobo: number }>();
  for (const payment of input.payments) {
    const paidByName = payment.paid_by_resident_id && payment.paid_by_resident_id !== payment.resident_id
      ? nameOf(payment.paid_by_resident_id)
      : payment.paid_by_name?.trim() || null;
    const key = `${payment.resident_id}|${paidByName ?? ''}`;
    const entry = sources.get(key) ?? {
      creditedToId: payment.resident_id,
      creditedToName: nameOf(payment.resident_id),
      paidByName,
      amount: 0,
      kobo: 0,
      count: 0,
      lastDate: payment.payment_date,
    };
    entry.kobo += kobo(payment.amount);
    entry.count += 1;
    if (payment.payment_date > entry.lastDate) entry.lastDate = payment.payment_date;
    sources.set(key, entry);
  }
  const payments = [...sources.values()]
    .map(({ kobo: total, ...rest }) => ({ ...rest, amount: total / 100 }))
    .sort((a, b) => b.lastDate.localeCompare(a.lastDate));

  return { groups, payments };
}
