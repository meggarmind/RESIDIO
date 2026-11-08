import { DEBT_STATUSES, type DebtStatus } from '@/lib/billing/debt-status';

/** One street's house count per debt status (#1347). */
export interface StreetDebtCounts {
  streetName: string;
  total: number;
  counts: Record<DebtStatus, number>;
}

export interface DebtByStreet {
  streets: StreetDebtCounts[];
  totals: Record<DebtStatus, number>;
  totalHouses: number;
  /** The editable label for each status (Settings > Debt Status). */
  labels: Record<DebtStatus, string>;
  /** When the counts were read, ISO. */
  asAt: string;
}

const emptyCounts = (): Record<DebtStatus, number> =>
  Object.fromEntries(DEBT_STATUSES.map((status) => [status, 0])) as Record<DebtStatus, number>;

const byName = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });

/**
 * Counts houses per street and debt status. A house with no status row is left out, as the debt
 * status report leaves it out. Streets are in name order.
 */
export function summarizeDebtByStreet(
  houses: { id: string; streetName: string }[],
  statuses: { houseId: string; status: DebtStatus }[],
  labels: Record<DebtStatus, string>,
  asAt: Date = new Date(),
): DebtByStreet {
  const statusOf = new Map(statuses.map((row) => [row.houseId, row.status]));
  const streets = new Map<string, StreetDebtCounts>();
  const totals = emptyCounts();
  let totalHouses = 0;
  for (const house of houses) {
    const status = statusOf.get(house.id);
    if (!status) continue;
    let street = streets.get(house.streetName);
    if (!street) {
      street = { streetName: house.streetName, total: 0, counts: emptyCounts() };
      streets.set(house.streetName, street);
    }
    street.counts[status] += 1;
    street.total += 1;
    totals[status] += 1;
    totalHouses += 1;
  }
  return {
    streets: [...streets.values()].sort((a, b) => byName(a.streetName, b.streetName)),
    totals,
    totalHouses,
    labels,
    asAt: asAt.toISOString(),
  };
}

/** One street's money for the Collection rate by street report (#1403). */
export interface StreetCollection {
  streetName: string;
  houseCount: number;
  billed: number;
  collected: number;
  owed: number;
  /** Collected as a percentage of billed, one decimal; null when nothing was billed. */
  collectionRate: number | null;
}

const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Collected as a percentage of billed, one decimal; null when nothing was billed. */
export const collectionRate = (collected: number, billed: number): number | null =>
  billed > 0 ? Math.round((collected / billed) * 1000) / 10 : null;

/**
 * Money per street over the same houses and streets as `summarizeDebtByStreet`. `billed` is what the
 * invoices ask for, `collected` what has been paid against them (never more than billed on one
 * invoice), `owed` the rest, so billed = collected + owed. A street with houses but no invoices is
 * listed with zeros. Streets are in name order.
 */
export function summarizeCollectionByStreet(
  houses: { id: string; streetName: string }[],
  invoices: { houseId: string; amountDue: number; amountPaid: number }[],
): StreetCollection[] {
  const streetOf = new Map(houses.map((house) => [house.id, house.streetName]));
  const streets = new Map<string, StreetCollection>();
  for (const house of houses) {
    const street = streets.get(house.streetName) ?? { streetName: house.streetName, houseCount: 0, billed: 0, collected: 0, owed: 0, collectionRate: null };
    street.houseCount += 1;
    streets.set(house.streetName, street);
  }
  for (const invoice of invoices) {
    const name = streetOf.get(invoice.houseId);
    if (name === undefined) continue;
    const street = streets.get(name)!;
    const due = Number(invoice.amountDue) || 0;
    const paid = Math.min(Math.max(Number(invoice.amountPaid) || 0, 0), due);
    street.billed += due;
    street.collected += paid;
    street.owed += due - paid;
  }
  return [...streets.values()]
    .map((street) => {
      const billed = cents(street.billed);
      const collected = cents(street.collected);
      return { ...street, billed, collected, owed: cents(billed - collected), collectionRate: collectionRate(collected, billed) };
    })
    .sort((a, b) => byName(a.streetName, b.streetName));
}
