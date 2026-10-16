/**
 * Vehicle plate normalisation (#302).
 *
 * MUST stay identical to the SQL expression behind the unique index
 * `uq_visitor_vehicles_active_plate`:
 *   upper(regexp_replace(plate_number, '[^A-Za-z0-9]', '', 'g'))
 * Characters are stripped before upper-casing so that locale-specific case
 * mappings (e.g. the German sharp s) can never introduce characters the SQL
 * expression would not produce.
 */
export function normalizePlate(plate: string): string {
  return plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}
