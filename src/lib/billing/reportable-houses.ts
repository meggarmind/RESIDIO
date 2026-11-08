/**
 * Which houses the estate-wide debt reports count, and how they are read (#982, #1347, #1403).
 * One definition for the WhatsApp debt status report, the Collections chart by street and the
 * Collection rate by street report, so the three cannot disagree on the houses or their streets.
 * Takes the Supabase client as an argument, so it needs no session and no server-only imports.
 */

/** Houses in these states are left out, with unverified identifiers and houses without an active primary resident. */
export const DEBT_REPORT_EXCLUDED_PROPERTY_STATUSES = ['vacant', 'under_renovation', 'under_construction'];

/** The primary resident roles, as get_debt_statuses picks the house's resident. */
export const DEBT_REPORT_PRIMARY_ROLES = ['tenant', 'resident_landlord', 'non_resident_landlord'];

export interface DebtReportHouse {
  id: string;
  houseCode: string;
  /** The house number as the estate writes it, shown in the report's No column. */
  houseNumber: string;
  streetId: string;
  streetName: string;
}

export interface HouseRow {
  id: string;
  house_number: string;
  short_name: string | null;
  identifier_unverified: boolean;
  property_status: string;
  is_active: boolean;
  street: { id: string; name: string } | { id: string; name: string }[] | null;
  resident_houses: { is_active: boolean; resident_role: string }[] | null;
}

/** The report's eligibility rule: an active, verified, lived-in house with an active primary resident. */
export function isReportableHouse(row: HouseRow): boolean {
  return (
    row.is_active &&
    !row.identifier_unverified &&
    !DEBT_REPORT_EXCLUDED_PROPERTY_STATUSES.includes(row.property_status) &&
    (row.resident_houses ?? []).some((link) => link.is_active && DEBT_REPORT_PRIMARY_ROLES.includes(link.resident_role))
  );
}

export const byName = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });

type HouseReadClient = {
  from: (table: 'houses') => {
    select: (columns: string) => {
      eq: (column: string, value: boolean) => {
        range: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
      };
    };
  };
};

/** Reportable houses, ordered by street then house number. Reads with the given client. */
export async function readReportableHouses(client: unknown): Promise<DebtReportHouse[]> {
  const { data, error } = await (client as HouseReadClient)
    .from('houses')
    .select('id, house_number, short_name, identifier_unverified, property_status, is_active, street:streets(id, name), resident_houses(is_active, resident_role)')
    .eq('is_active', true)
    .range(0, 4999);
  if (error) throw new Error(`Debt report houses could not be read: ${error.message}`);
  return ((data ?? []) as unknown as HouseRow[])
    .filter(isReportableHouse)
    .flatMap((row) => {
      const street = Array.isArray(row.street) ? row.street[0] : row.street;
      return street ? [{ id: row.id, houseCode: row.short_name?.trim() || row.house_number, houseNumber: row.house_number, streetId: street.id, streetName: street.name }] : [];
    })
    .sort((a, b) => byName(a.streetName, b.streetName) || byName(a.houseCode, b.houseCode));
}
