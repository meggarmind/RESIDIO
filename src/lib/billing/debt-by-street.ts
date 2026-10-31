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
