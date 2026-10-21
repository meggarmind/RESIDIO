import { normalizePhoneNumber } from '@/lib/sms/termii';

/**
 * Deterministic "is this person already a resident?" rule (#820). Three keys, nothing fuzzy,
 * nothing scored. A candidate matches only on email alone, or on phone AND name together;
 * phone alone or name alone never matches (families and companies share phones):
 *   phone - normalised (normalizePhoneNumber) primary or secondary number, either side
 *   email - trimmed, case-insensitive
 *   name  - first + last name, or company name, trimmed, case-insensitive, otherwise exact
 * A match only prompts the admin. It never merges or links by itself.
 */
export type DuplicateMatchReason = 'phone' | 'email' | 'name';

export type DuplicateCandidate = {
  first_name: string;
  last_name: string;
  email?: string | null;
  phone_primary?: string | null;
  phone_secondary?: string | null;
  company_name?: string | null;
};

export type ExistingResidentRow = {
  id: string;
  resident_code: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone_primary: string | null;
  phone_secondary: string | null;
  company_name: string | null;
  account_status: string;
};

export type DuplicateResidentMatch = {
  resident_id: string;
  resident_code: string;
  name: string;
  account_status: string;
  reasons: DuplicateMatchReason[];
  /** House numbers of the resident's active links, for display only. */
  houses: string[];
};

const fold = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();

function phoneSet(...phones: Array<string | null | undefined>): Set<string> {
  const out = new Set<string>();
  for (const phone of phones) {
    if (phone && phone.trim()) out.add(normalizePhoneNumber(phone));
  }
  return out;
}

function nameKeys(first: string, last: string, company: string | null | undefined): Set<string> {
  const keys = new Set<string>();
  if (fold(first) && fold(last)) keys.add(`${fold(first)}|${fold(last)}`);
  if (fold(company)) keys.add(`company|${fold(company)}`);
  return keys;
}

/** Reasons the candidate matches this resident; empty when it does not. */
export function matchReasons(
  candidate: DuplicateCandidate,
  existing: ExistingResidentRow
): DuplicateMatchReason[] {
  const reasons: DuplicateMatchReason[] = [];

  const candidatePhones = phoneSet(candidate.phone_primary, candidate.phone_secondary);
  const existingPhones = phoneSet(existing.phone_primary, existing.phone_secondary);
  if ([...candidatePhones].some((phone) => existingPhones.has(phone))) reasons.push('phone');

  if (fold(candidate.email) && fold(candidate.email) === fold(existing.email)) reasons.push('email');

  const candidateNames = nameKeys(candidate.first_name, candidate.last_name, candidate.company_name);
  const existingNames = nameKeys(existing.first_name, existing.last_name, existing.company_name);
  if ([...candidateNames].some((key) => existingNames.has(key))) reasons.push('name');

  const qualifies = reasons.includes('email') || (reasons.includes('phone') && reasons.includes('name'));
  return qualifies ? reasons : [];
}

export function findMatches(
  candidate: DuplicateCandidate,
  rows: ExistingResidentRow[]
): Array<{ row: ExistingResidentRow; reasons: DuplicateMatchReason[] }> {
  return rows
    .map((row) => ({ row, reasons: matchReasons(candidate, row) }))
    .filter((match) => match.reasons.length > 0);
}
