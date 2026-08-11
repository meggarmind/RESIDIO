/**
 * Read-only snapshot for reconciling the reviewed legacy tracker ledger.
 *
 * This intentionally performs no database writes. It creates a local JSON
 * snapshot containing only the fields needed to match streets, houses,
 * residents, assignments, and payment aliases.
 */
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL_CLOUD;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY_CLOUD;

if (!url || !serviceRoleKey) {
  throw new Error('Cloud Supabase configuration is unavailable.');
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function allRows<T>(table: string, select: string): Promise<T[]> {
  const pageSize = 1_000;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < pageSize) return rows;
  }
}

async function allRowsForHouses<T>(table: string, select: string, houseIds: string[]): Promise<T[]> {
  const pageSize = 1_000;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .in('house_id', houseIds)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < pageSize) return rows;
  }
}

async function main() {
  const streets = await allRows<Record<string, unknown>>(
    'streets',
    'id,name,short_name,is_active'
  );
  const targetStreetShortNames = new Set(['OJO.K', 'IBB', 'GLB', 'KOA']);
  const targetStreets = streets.filter((street) =>
    targetStreetShortNames.has(String(street.short_name ?? '').toUpperCase())
  );
  const streetIds = targetStreets.map((street) => String(street.id));

  const { data: houses, error: housesError } = await supabase
    .from('houses')
    .select('id,street_id,house_number,short_name,is_active,is_occupied,property_status,notes')
    .in('street_id', streetIds);
  if (housesError) throw housesError;

  const houseIds = (houses ?? []).map((house) => house.id);
  const { data: assignmentRows, error: assignmentError } = houseIds.length
    ? await supabase
        .from('resident_houses')
        .select('id,resident_id,house_id,resident_role,is_primary,is_active,is_live_in,move_in_date,move_out_date,sponsor_resident_id,tags')
        .in('house_id', houseIds)
    : { data: [], error: null };
  if (assignmentError) throw assignmentError;
  const assignments = assignmentRows ?? [];

  const [residents, aliases, payments] = await Promise.all([
    allRows<Record<string, unknown>>(
      'residents',
      'id,resident_code,first_name,last_name,company_name,entity_type,resident_type,account_status,notes'
    ),
    allRows<Record<string, unknown>>(
      'resident_payment_aliases',
      'id,resident_id,alias_name,is_active,notes'
    ),
    allRowsForHouses<Record<string, unknown>>(
      'payment_records',
      'id,resident_id,house_id,amount,payment_date,status,is_verified,method,notes,reference_number',
      houseIds
    ),
  ]);

  const snapshot = {
    generated_at: new Date().toISOString(),
    mode: 'read_only',
    streets: targetStreets,
    houses: houses ?? [],
    assignments,
    residents,
    aliases,
    payments,
  };
  const output = path.join('docs', 'importdata', 'db-reconciliation-snapshot.json');
  fs.writeFileSync(output, JSON.stringify(snapshot, null, 2) + '\n');

  const ledger = fs.readFileSync(path.join('docs', 'importdata', 'legacy-record-ledger.md'), 'utf8');
  const headings = [...ledger.matchAll(/^## (L-\d+) — ([A-Z.]+) \/ House (.+)$/gm)]
    .map((match) => ({ id: match[1], street: match[2], legacy_house: match[3].trim() }));
  const legacyLabelOverrides: Record<string, string> = {
    // The screenshot and database use 18 F-2; the ledger heading accidentally
    // captured the separator as E in this one label.
    'L-0047': '18 F-2',
  };
  const normalise = (value: string) => value
    .replace(/`/g, '')
    .replace(/\s*\(.+\)\s*$/, '')
    .replace(/FLAT/gi, 'FLT')
    .replace(/\?/g, 'QMARK')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  const residentsById = new Map(residents.map((resident) => [String(resident.id), resident]));
  const paymentsByHouseId = new Map<string, typeof payments>();
  for (const payment of payments) {
    const housePayments = paymentsByHouseId.get(String(payment.house_id)) ?? [];
    housePayments.push(payment);
    paymentsByHouseId.set(String(payment.house_id), housePayments);
  }
  const assignmentsByHouseId = new Map<string, typeof assignments>();
  for (const assignment of assignments) {
    const houseAssignments = assignmentsByHouseId.get(String(assignment.house_id)) ?? [];
    houseAssignments.push(assignment);
    assignmentsByHouseId.set(String(assignment.house_id), houseAssignments);
  }
  const housesByStreet = new Map<string, typeof houses>();
  for (const street of targetStreets) {
    housesByStreet.set(String(street.short_name).toUpperCase(), (houses ?? []).filter((house) => house.street_id === street.id));
  }
  const houseMatches = headings.map((entry) => {
    const legacyHouse = legacyLabelOverrides[entry.id] ?? entry.legacy_house;
    const candidates = (housesByStreet.get(entry.street) ?? []).filter((house) => {
      const legacy = normalise(legacyHouse);
      return normalise(house.house_number) === legacy || normalise(house.short_name ?? '') === legacy;
    });
    return {
      ...entry,
      reconciled_house_label: legacyHouse,
      status: candidates.length === 1 ? 'matched' : candidates.length === 0 ? 'unmatched' : 'ambiguous',
      candidates: candidates.map((house) => ({
        id: house.id,
        house_number: house.house_number,
        short_name: house.short_name,
        assignments: (assignmentsByHouseId.get(house.id) ?? []).map((assignment) => {
          const resident = residentsById.get(String(assignment.resident_id));
          return {
            ...assignment,
            resident_name: resident ? `${resident.first_name} ${resident.last_name}`.trim() : null,
            resident_code: resident?.resident_code ?? null,
          };
        }),
        payment_count: (paymentsByHouseId.get(house.id) ?? []).length,
      })),
    };
  });
  fs.writeFileSync(
    path.join('docs', 'importdata', 'house-reconciliation-report.json'),
    JSON.stringify({ generated_at: snapshot.generated_at, house_matches: houseMatches }, null, 2) + '\n'
  );

  console.log(JSON.stringify({
    output,
    streets: targetStreets.length,
    houses: houses?.length ?? 0,
    assignments: assignments.length,
    residents: residents.length,
    aliases: aliases.length,
    payments: payments.length,
    legacy_house_entries: houseMatches.length,
    matched_houses: houseMatches.filter((entry) => entry.status === 'matched').length,
    unmatched_houses: houseMatches.filter((entry) => entry.status === 'unmatched').length,
    ambiguous_houses: houseMatches.filter((entry) => entry.status === 'ambiguous').length,
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
