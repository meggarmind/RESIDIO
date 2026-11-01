/**
 * Pure matching and ranking for the merge dialog's "likely duplicates" list and its search (#1391).
 * No network: the server action fetches rows, this decides who is a likely duplicate.
 */

export type MergeCandidateRow = {
  id: string;
  first_name: string;
  last_name: string;
  resident_code: string;
  phone_primary: string | null;
  phone_secondary: string | null;
  account_status: string;
  merged_into_resident_id: string | null;
  houses: Array<{ id: string; label: string }>;
};

export type MergeCandidate = {
  id: string;
  name: string;
  resident_code: string;
  houses: string[];
  reason?: string;
};

export const MERGE_CANDIDATE_LIMIT = 6;

/** Digits only, then the last 10, so +2348023158172 and 08023158172 compare equal. */
export function normalisePhone(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 7) return null;
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function phoneSet(row: Pick<MergeCandidateRow, 'phone_primary' | 'phone_secondary'>): Set<string> {
  const set = new Set<string>();
  for (const p of [row.phone_primary, row.phone_secondary]) {
    const n = normalisePhone(p);
    if (n) set.add(n);
  }
  return set;
}

function nameWords(row: Pick<MergeCandidateRow, 'first_name' | 'last_name'>): Set<string> {
  return new Set(
    `${row.first_name} ${row.last_name}`
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter((w) => w.length >= 3)
  );
}

const fullName = (r: Pick<MergeCandidateRow, 'first_name' | 'last_name'>) => `${r.first_name} ${r.last_name}`.trim();

function toCandidate(row: MergeCandidateRow, reason?: string): MergeCandidate {
  return {
    id: row.id,
    name: fullName(row),
    resident_code: row.resident_code,
    houses: row.houses.map((h) => h.label),
    ...(reason ? { reason } : {}),
  };
}

function eligible(current: MergeCandidateRow, rows: MergeCandidateRow[]) {
  return rows.filter(
    (r) => r.id !== current.id && r.account_status !== 'archived' && !r.merged_into_resident_id
  );
}

export function findSuggestions(current: MergeCandidateRow, rows: MergeCandidateRow[]): MergeCandidate[] {
  const phones = phoneSet(current);
  const houseIds = new Set(current.houses.map((h) => h.id));
  const words = nameWords(current);

  const scored = eligible(current, rows).flatMap((row) => {
    const samePhone = [...phoneSet(row)].some((p) => phones.has(p));
    const sameHouse = row.houses.some((h) => houseIds.has(h.id));
    const similarName = [...nameWords(row)].some((w) => words.has(w));
    if (!samePhone && !sameHouse && !similarName) return [];
    const reasons = [samePhone && 'Same phone', sameHouse && 'Same house', similarName && 'Similar name'].filter(
      Boolean
    ) as string[];
    const rank = samePhone ? 0 : sameHouse ? 1 : 2;
    return [{ row, rank, reason: reasons.join(', ') }];
  });

  return scored
    .sort((a, b) => a.rank - b.rank || fullName(a.row).localeCompare(fullName(b.row)))
    .slice(0, MERGE_CANDIDATE_LIMIT)
    .map(({ row, reason }) => toCandidate(row, reason));
}

export function searchResidents(current: MergeCandidateRow, rows: MergeCandidateRow[], query?: string): MergeCandidate[] {
  const q = (query ?? '').trim().toLowerCase();
  if (q.length < 2) return [];
  const digits = q.replace(/\D/g, '');
  const digitQuery = digits.length >= 3 && digits.length === q.replace(/[\s+\-()]/g, '').length;

  return eligible(current, rows)
    .filter((row) => {
      const name = `${row.first_name} ${row.last_name}`.toLowerCase();
      const reversed = `${row.last_name} ${row.first_name}`.toLowerCase();
      if (name.includes(q) || reversed.includes(q)) return true;
      if (row.houses.some((h) => h.label.toLowerCase().includes(q))) return true;
      if (digitQuery) {
        if (row.resident_code.includes(digits)) return true;
        if (digits.length >= 10) {
          const wanted = normalisePhone(digits);
          return [row.phone_primary, row.phone_secondary].some((p) => normalisePhone(p) === wanted);
        }
        return [row.phone_primary, row.phone_secondary].some((p) => (p ?? '').replace(/\D/g, '').includes(digits));
      }
      return false;
    })
    .sort((a, b) => fullName(a).localeCompare(fullName(b)))
    .slice(0, MERGE_CANDIDATE_LIMIT)
    .map((row) => toCandidate(row));
}
