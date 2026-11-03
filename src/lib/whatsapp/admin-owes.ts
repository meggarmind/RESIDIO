import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuditEntry } from '@/lib/audit/recorder';
import { getDebtStatuses, type DebtStatus } from '@/lib/billing/debt-status';
import { ilikeAny } from '@/lib/postgrest-filter';
import { sanitizeSearchInput } from '@/lib/utils';
import { createAdminClient } from '@/lib/supabase/server';
import { formatDay, formatMonth, formatNaira } from '@/lib/whatsapp/assistant-format';
import { createSupabaseWhatsAppFinancialRepository, creditLine, type OwedFigures } from '@/lib/whatsapp/financial';

/**
 * WhatsApp admin lookup of what a house owes (#981). An admin sends a house code, a name or a payer alias; the
 * answer is the figure the resident sees under "What I owe", the shared debt status (#980), the
 * months it covers, the last payment and what the wallet credit pays for. The resident is not told. The access gate
 * (binding, authenticator session, permission, daily cap) is #972's and runs before this.
 */

export const OWES_LIST_MAX = 20;
export const OWES_PICK_MINUTES = 5;
export const OWES_USAGE = 'Send a house code, a name or a payer alias, for example KOA-18A.';
/** Asked when Resident status is chosen from Admin tools (#1292). */
export const OWES_PROMPT = `Resident status. ${OWES_USAGE}`;
const MAX_QUERY_LENGTH = 60;
const BILLABLE_ROLES = ['resident_landlord', 'non_resident_landlord', 'tenant', 'developer'];

export interface OwesCandidate {
  houseId: string;
  houseLabel: string;
  /** The house's short code, when it has one. */
  code: string | null;
  /** The matched person for a name search; null for a house code match. */
  name: string | null;
}

export interface OwesHouseData {
  houseId: string;
  houseLabel: string;
  /** The resident the house is billed to (tenant, else landlord); null when it has none. */
  billedTo: { residentId: string; name: string } | null;
  /** The shared debt status key (#980); null when the house has no status row. */
  status: { key: DebtStatus | null; label: string };
  owed: OwedFigures | null;
  /** The first and the last month (first days) with an unpaid bill, and how many such bills; null when none. */
  unpaidMonths: { from: string; to: string; count: number } | null;
  /** Every verified payment in the calendar month of the latest one (`month` is `YYYY-MM`); null when there is none. */
  lastPayment: { month: string; payments: { amount: number; date: string }[] } | null;
  /** For a paid-up house: the first and the last month (first days) the last month's payments paid; null otherwise. */
  paidMonths?: { from: string; to: string } | null;
  walletBalance: number;
}

export interface OwesRepository {
  searchHouseCodes(term: string): Promise<OwesCandidate[]>;
  searchResidents(words: string[]): Promise<OwesCandidate[]>;
  /** Houses of the residents whose active payer alias contains every word; the candidate carries the resident's name. */
  searchAliases(words: string[]): Promise<OwesCandidate[]>;
  /** The name shown for each house (active tenant, else resident landlord, else non-resident landlord), in one read; a house with none is left out. */
  loadHouseResidentNames(houseIds: string[]): Promise<Record<string, string>>;
  loadHouse(houseId: string): Promise<OwesHouseData | null>;
  /** Keeps the pick-list on the request until `expiresAt`. */
  saveChoices(requestId: string, choices: OwesCandidate[], expiresAt: string): Promise<void>;
  /** The binding's latest pick-list and when it expires, null when there is none. */
  loadChoices(bindingId: string): Promise<{ choices: OwesCandidate[]; expiresAt: string } | null>;
  clearChoices(bindingId: string): Promise<void>;
  logDisclosure(input: { residentId: string; phoneNumber: string; houseId: string; adminProfileId: string }): Promise<void>;
}

export interface OwesParams {
  query?: string;
  pick?: number;
}

/** Reads the free-form `params` JSON of a request. */
export function toOwesParams(params: Record<string, unknown> | undefined): OwesParams {
  const pick = Number(params?.pick);
  return {
    query: typeof params?.query === 'string' ? params.query : undefined,
    pick: Number.isInteger(pick) && pick > 0 ? pick : undefined,
  };
}

/** `Oct 2026`, or `Dec 2025 to Oct 2026` for a range. */
function monthRange(range: { from: string; to: string }): string {
  return range.from.slice(0, 7) === range.to.slice(0, 7) ? formatMonth(range.from) : `${formatMonth(range.from)} to ${formatMonth(range.to)}`;
}

/** `₦25k` for whole thousands, else full naira (`₦12,500`). */
function shortNaira(amount: number): string {
  if (amount > 0 && amount % 1000 === 0) return `₦${amount / 1000}k`;
  return `₦${amount.toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;
}

/** The icon after the house code (owner, 1 Nov 2026): paid up, paid up with credit, arrears, outstanding. */
function statusIcon(key: DebtStatus | null): string {
  if (key === 'arrears') return ' ⛔';
  if (key === 'outstanding') return ' ⚠️';
  if (key === 'credit') return ' ✅';
  if (key === 'paid_in_full') return ' 🟢';
  return '';
}

function statusWord(status: OwesHouseData['status']): string {
  if (status.key === 'arrears' || status.key === 'outstanding') return 'Outstanding';
  if (status.key) return 'Paid up';
  return status.label;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** `Next Payment Due January 2027.` */
function nextPaymentDueLine(due: string): string {
  const [year, month] = due.split('-').map(Number);
  return `Next Payment Due ${MONTH_NAMES[month - 1]} ${year}.`;
}

/**
 * The months a payment paid when every payment goes to the oldest bill first: `paidBefore` is what earlier
 * payments paid, `amount` the payment. Credit left after the last bill pays `creditMonths` ahead.
 */
export function monthsPaidBy(
  bills: { periodStart: string; amount: number }[],
  paidBefore: number,
  amount: number,
  creditMonths: string[] = [],
): { from: string; to: string } | null {
  let billed = 0;
  let from: string | null = null;
  let to: string | null = null;
  for (const bill of [...bills].sort((a, b) => a.periodStart.localeCompare(b.periodStart))) {
    const start = billed;
    billed += bill.amount;
    if (bill.amount <= 0 || billed <= paidBefore || start >= paidBefore + amount) continue;
    from ??= bill.periodStart;
    to = bill.periodStart;
  }
  if (paidBefore + amount > billed && creditMonths.length) {
    from ??= creditMonths[0];
    to = creditMonths[creditMonths.length - 1];
  }
  return from && to ? { from, to } : null;
}

function lastPaidLine(lastPayment: OwesHouseData['lastPayment'], paidMonths?: OwesHouseData['paidMonths']): string {
  if (!lastPayment) return 'No payment on record.';
  const payments = [...lastPayment.payments].sort((a, b) => a.date.localeCompare(b.date));
  const total = payments.reduce((sum, payment) => sum + payment.amount, 0);
  // Owner sample (1 Nov 2026): `Last paid: ₦120,000.00 in Mar 2026 (Nov 2025 - Oct 2026)`.
  const range = !paidMonths ? '' : paidMonths.from.slice(0, 7) === paidMonths.to.slice(0, 7)
    ? ` (${formatMonth(paidMonths.from)})`
    : ` (${formatMonth(paidMonths.from)} - ${formatMonth(paidMonths.to)})`;
  const line = `Last paid: ${formatNaira(total)} in ${formatMonth(`${lastPayment.month}-01`)}${range}`;
  if (payments.length < 2) return range ? line : `${line}.`;
  const parts = payments.map((payment) => `${shortNaira(payment.amount)} on ${formatDay(payment.date).slice(0, -5)}`);
  return `${line}, in ${payments.length} payments (${parts.join(', ')})`;
}

/**
 * Short lines so a long name does not wrap on a phone (owner, 1 Nov 2026), for example
 * `*OJO.K-4* ⚠️` / `Name: CONSTANCE OKA` / `Status: Outstanding` /
 * `Outstanding of *₦10,000.00* for 2 months (Sep 2026 to Oct 2026).` / `Last paid: ₦100,000.00 in Jun 2025.`
 * A paid-up house shows when the next payment is due in place of the credit line.
 */
export function composeAdminOwesAnswer(data: OwesHouseData): string {
  if (!data.billedTo) return [`*${data.houseLabel}*`, 'No resident is billed for this house, so there is no figure to show.'].join('\n');
  const lines = [`*${data.houseLabel}*${statusIcon(data.status.key)}`, `Name: ${data.billedTo.name}`, `Status: ${statusWord(data.status)}`];
  const owed = data.owed;
  if (!owed || owed.invoiceCount === 0) lines.push('No bills on record.');
  else if (owed.outstanding > 0) {
    const months = data.unpaidMonths;
    lines.push(`Outstanding of *${formatNaira(owed.outstanding)}*${months ? ` for ${months.count} ${months.count === 1 ? 'month' : 'months'} (${monthRange(months)})` : ''}.`);
  } else if (owed.outstanding < 0) lines.push(`Outstanding: nothing, ${formatNaira(-owed.outstanding)} in credit.`);
  lines.push(lastPaidLine(data.lastPayment, data.paidMonths));
  // The wallet pays bills as they are made, so credit next to an open bill is for another charge category.
  if (owed?.nextPaymentDue && owed.outstanding <= 0 && !owed.rollForward) lines.push(nextPaymentDueLine(owed.nextPaymentDue));
  else if (owed?.credit) lines.push(creditLine(owed.credit));
  else if (data.walletBalance > 0 && (owed?.outstanding ?? 0) > 0) lines.push(`Credit: ${formatNaira(data.walletBalance)} (not for these bills)`);
  else if (data.walletBalance > 0 && !owed?.rollForward) lines.push(`Credit: ${formatNaira(data.walletBalance)}`);
  if (owed && owed.awaitingVerification > 0) lines.push(`Awaiting verification: ${formatNaira(owed.awaitingVerification)}`);
  return lines.join('\n');
}

/** The order a house's resident is chosen in, as `get_debt_statuses` does: tenant, else resident landlord, else non-resident landlord. */
export const HOUSE_NAME_ROLES = ['tenant', 'resident_landlord', 'non_resident_landlord'];

/** The name of the first link in `HOUSE_NAME_ROLES` order; null when none of the links has one. */
export function pickHouseResidentName(links: { role: string; name: string }[]): string | null {
  const ranked = links.filter((link) => HOUSE_NAME_ROLES.includes(link.role) && link.name).sort((a, b) => HOUSE_NAME_ROLES.indexOf(a.role) - HOUSE_NAME_ROLES.indexOf(b.role));
  return ranked[0]?.name ?? null;
}

/** `3. GLB-20A (Ohioma)`; a house with no resident shows `(no resident)`. */
function candidateLine(candidate: OwesCandidate, index: number): string {
  return `${index + 1}. ${candidate.code ?? candidate.houseLabel} (${candidate.name || 'no resident'})`;
}

export interface OwesRunInput {
  params: OwesParams;
  repository: OwesRepository;
  requestId: string;
  adminProfileId: string;
  phoneNumber: string;
  bindingId: string;
  now: Date;
  audit(entry: AuditEntry): Promise<void>;
}

async function answerHouse(input: OwesRunInput, houseId: string): Promise<string> {
  const data = await input.repository.loadHouse(houseId);
  if (!data) return 'That house could not be found.';
  if (data.billedTo) {
    await input.repository.logDisclosure({
      residentId: data.billedTo.residentId,
      phoneNumber: input.phoneNumber,
      houseId,
      adminProfileId: input.adminProfileId,
    });
  }
  await input.audit({
    action: 'VERIFY',
    entityType: 'houses',
    entityId: houseId,
    entityDisplay: data.houseLabel,
    description: 'Admin looked up what a house owes on WhatsApp',
    metadata: { channel: 'whatsapp_admin', billed_resident_id: data.billedTo?.residentId ?? null },
  });
  return composeAdminOwesAnswer(data);
}

export async function runAdminOwesLookup(input: OwesRunInput): Promise<string> {
  const { params, repository, now } = input;

  if (params.pick !== undefined) {
    const list = await repository.loadChoices(input.bindingId);
    const choices = list && Date.parse(list.expiresAt) > now.getTime() ? list.choices : null;
    if (!choices) return `There is no list to pick from, or it ran out after ${OWES_PICK_MINUTES} minutes. ${OWES_USAGE}`;
    const chosen = choices[params.pick - 1];
    if (!chosen) return `Pick a number from 1 to ${choices.length}.`;
    await repository.clearChoices(input.bindingId);
    return answerHouse(input, chosen.houseId);
  }

  const term = (params.query ?? '').trim().slice(0, MAX_QUERY_LENGTH);
  if (!term) return OWES_USAGE;
  // A new lookup replaces any list still waiting for a number.
  await repository.clearChoices(input.bindingId);

  const words = term.split(/\s+/).slice(0, 4);
  const [byCode, byName, byAlias] = await Promise.all([repository.searchHouseCodes(term), repository.searchResidents(words), repository.searchAliases(words)]);

  const exact = byCode.find((candidate) => candidate.code?.toLowerCase() === term.toLowerCase());
  if (exact) return answerHouse(input, exact.houseId);

  const byHouse = new Map<string, OwesCandidate>();
  for (const candidate of [...byCode, ...byAlias, ...byName]) {
    if (!byHouse.has(candidate.houseId) || candidate.name) byHouse.set(candidate.houseId, candidate);
  }
  const matches = [...byHouse.values()].sort((a, b) => (a.code ?? a.houseLabel).localeCompare(b.code ?? b.houseLabel, 'en', { numeric: true }));

  if (matches.length === 0) return `No house or resident matches "${term}".`;
  if (matches.length === 1) return answerHouse(input, matches[0].houseId);
  if (matches.length > OWES_LIST_MAX) {
    return `More than ${OWES_LIST_MAX} matches for "${term}". Send a longer name or the house code.`;
  }

  // A code match has no name yet: read the names of the listed houses in one query.
  const names = await repository.loadHouseResidentNames(matches.filter((match) => !match.name).map((match) => match.houseId));
  const listed = matches.map((match) => (match.name ? match : { ...match, name: names[match.houseId] ?? null }));

  await repository.saveChoices(input.requestId, listed, new Date(now.getTime() + OWES_PICK_MINUTES * 60 * 1000).toISOString());
  await input.audit({
    action: 'VERIFY',
    entityType: 'whatsapp_admin_requests',
    entityId: input.requestId,
    entityDisplay: `WhatsApp admin owes list for "${term}"`,
    description: 'Admin was shown a list of houses to pick from on WhatsApp',
    metadata: { channel: 'whatsapp_admin', query: term, listed: listed.map(({ houseId, name }) => ({ house_id: houseId, name })) },
  });
  return [
    `${matches.length} matches for "${term}". Reply with the number within ${OWES_PICK_MINUTES} minutes, for example 1:`,
    ...listed.map(candidateLine),
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Repository

type HouseRow = { short_name: string | null; house_number: string; street: { name: string } | { name: string }[] | null };

function houseLabel(house: HouseRow): string {
  const street = Array.isArray(house.street) ? house.street[0]?.name : house.street?.name;
  return house.short_name || `${house.house_number}, ${street || 'Estate'}`;
}

const first = <T>(value: T | T[] | null): T | null => (Array.isArray(value) ? value[0] ?? null : value);

export function createSupabaseOwesRepository(): OwesRepository {
  const client = () => createAdminClient() as unknown as SupabaseClient;
  const financial = createSupabaseWhatsAppFinancialRepository();
  const residentsWithHouses = () =>
    client()
      .from('residents')
      .select('first_name, last_name, resident_houses!resident_houses_resident_id_fkey!inner(house_id, house:houses(short_name, house_number, street:streets(name)))')
      .eq('resident_houses.is_active', true)
      .in('resident_houses.resident_role', BILLABLE_ROLES);
  /** One candidate per billable house of each resident row. */
  const candidatesOf = (data: Record<string, unknown>[] | null): OwesCandidate[] =>
    (data || []).flatMap((row) => {
      const links = row.resident_houses as unknown as { house_id: string; house: HouseRow | HouseRow[] | null }[];
      return links.flatMap((link) => {
        const house = first(link.house);
        if (!house) return [];
        return [{ houseId: link.house_id, houseLabel: houseLabel(house), code: house.short_name, name: `${row.first_name} ${row.last_name}`.trim() }];
      });
    });

  return {
    async searchHouseCodes(term) {
      const houses = () => client().from('houses').select('id, short_name, house_number, street:streets(name)').eq('is_active', true);
      // The exact code is read on its own so the contains limit can never cut it off.
      const [exact, contains] = await Promise.all([
        houses().ilike('short_name', sanitizeSearchInput(term)).limit(1),
        houses().or(ilikeAny(['short_name'], term)).limit(OWES_LIST_MAX + 1),
      ]);
      if (exact.error) throw exact.error;
      if (contains.error) throw contains.error;
      const rows = [...(exact.data || []), ...(contains.data || []).filter((row) => row.id !== exact.data?.[0]?.id)];
      return rows.map((row) => ({ houseId: row.id as string, houseLabel: houseLabel(row as unknown as HouseRow), code: (row.short_name as string | null) ?? null, name: null }));
    },

    async searchResidents(words) {
      let query = residentsWithHouses();
      // Every word must match the first or the last name.
      for (const word of words) query = query.or(ilikeAny(['first_name', 'last_name'], word));
      const { data, error } = await query.limit(OWES_LIST_MAX + 1);
      if (error) throw error;
      return candidatesOf(data);
    },

    async searchAliases(words) {
      if (words.length === 0) return [];
      let aliases = client().from('resident_payment_aliases').select('resident_id').eq('is_active', true);
      // Every word must match the alias.
      for (const word of words) aliases = aliases.or(ilikeAny(['alias_name'], word));
      const { data: aliasRows, error: aliasError } = await aliases.limit(OWES_LIST_MAX + 1);
      if (aliasError) throw aliasError;
      const ids = [...new Set((aliasRows || []).map((row) => row.resident_id as string))];
      if (ids.length === 0) return [];
      const { data, error } = await residentsWithHouses().in('id', ids);
      if (error) throw error;
      return candidatesOf(data);
    },

    async loadHouseResidentNames(houseIds) {
      if (houseIds.length === 0) return {};
      // resident_houses has two foreign keys to residents (resident_id, sponsor_resident_id): name the one.
      const { data, error } = await client()
        .from('resident_houses')
        .select('house_id, resident_role, resident:residents!resident_houses_resident_id_fkey(first_name, last_name)')
        .in('house_id', houseIds)
        .eq('is_active', true)
        .in('resident_role', HOUSE_NAME_ROLES);
      if (error) throw error;
      const byHouseId = new Map<string, { role: string; name: string }[]>();
      for (const row of data || []) {
        const resident = first(row.resident as unknown as { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null);
        const name = `${resident?.first_name ?? ''} ${resident?.last_name ?? ''}`.trim();
        const houseId = row.house_id as string;
        byHouseId.set(houseId, [...(byHouseId.get(houseId) ?? []), { role: row.resident_role as string, name }]);
      }
      const names: Record<string, string> = {};
      for (const [houseId, links] of byHouseId) {
        const name = pickHouseResidentName(links);
        if (name) names[houseId] = name;
      }
      return names;
    },

    async loadHouse(houseId) {
      const supabase = client();
      const { data: house, error } = await supabase
        .from('houses')
        .select('id, short_name, house_number, street:streets(name)')
        .eq('id', houseId)
        .maybeSingle();
      if (error) throw error;
      if (!house) return null;

      const [status] = await getDebtStatuses(createAdminClient(), { houseIds: [houseId] });
      const residentId = status?.residentId ?? null;
      let billedTo: OwesHouseData['billedTo'] = null;
      let owed: OwedFigures | null = null;
      let unpaidMonths: OwesHouseData['unpaidMonths'] = null;
      let lastPayment: OwesHouseData['lastPayment'] = null;
      let paidMonths: OwesHouseData['paidMonths'] = null;
      if (residentId) {
        const [resident, figures, unpaid, latest] = await Promise.all([
          supabase.from('residents').select('first_name, last_name').eq('id', residentId).maybeSingle(),
          financial.getOwed(residentId, houseId),
          supabase
            .from('invoices')
            .select('amount_due, amount_paid, due_date, period_start')
            .eq('resident_id', residentId)
            .eq('house_id', houseId)
            .in('status', ['unpaid', 'partially_paid'])
            .order('due_date', { ascending: true }),
          supabase
            .from('payment_records')
            .select('payment_date')
            .eq('resident_id', residentId)
            .eq('house_id', houseId)
            .eq('status', 'paid')
            .eq('is_verified', true)
            .order('payment_date', { ascending: false })
            .limit(1),
        ]);
        if (resident.error) throw resident.error;
        if (unpaid.error) throw unpaid.error;
        if (latest.error) throw latest.error;
        billedTo = { residentId, name: `${resident.data?.first_name ?? ''} ${resident.data?.last_name ?? ''}`.trim() || 'Resident' };
        owed = figures;
        const months = (unpaid.data || [])
          .filter((invoice) => Number(invoice.amount_due) - Number(invoice.amount_paid) > 0 && invoice.period_start)
          .map((invoice) => String(invoice.period_start).slice(0, 10))
          .sort();
        if (months.length) unpaidMonths = { from: months[0], to: months[months.length - 1], count: new Set(months.map((m) => m.slice(0, 7))).size };
        if (latest.data?.length) {
          // Every verified payment of that calendar month, so a month paid in two parts shows its total.
          const month = String(latest.data[0].payment_date).slice(0, 7);
          const [year, monthNumber] = month.split('-').map(Number);
          const next = monthNumber === 12 ? `${year + 1}-01` : `${year}-${String(monthNumber + 1).padStart(2, '0')}`;
          const inMonth = await supabase
            .from('payment_records')
            .select('amount, payment_date')
            .eq('resident_id', residentId)
            .eq('house_id', houseId)
            .eq('status', 'paid')
            .eq('is_verified', true)
            .gte('payment_date', `${month}-01`)
            .lt('payment_date', `${next}-01`)
            .order('payment_date', { ascending: true });
          if (inMonth.error) throw inMonth.error;
          lastPayment = { month, payments: (inMonth.data || []).map((row) => ({ amount: Number(row.amount || 0), date: String(row.payment_date).slice(0, 10) })) };
          if (status?.status === 'paid_in_full' || status?.status === 'credit') {
            // Which bills those payments paid, oldest bill first (owner, 1 Nov 2026).
            const [bills, earlier] = await Promise.all([
              supabase
                .from('invoices')
                .select('period_start, amount_due')
                .eq('resident_id', residentId)
                .eq('house_id', houseId)
                .eq('invoice_type', 'SERVICE_CHARGE')
                .neq('status', 'void')
                .not('period_start', 'is', null),
              supabase
                .from('payment_records')
                .select('amount')
                .eq('resident_id', residentId)
                .eq('house_id', houseId)
                .eq('status', 'paid')
                .eq('is_verified', true)
                .lt('payment_date', `${month}-01`),
            ]);
            if (bills.error) throw bills.error;
            if (earlier.error) throw earlier.error;
            paidMonths = monthsPaidBy(
              (bills.data || []).map((bill) => ({ periodStart: String(bill.period_start).slice(0, 10), amount: Number(bill.amount_due || 0) })),
              (earlier.data || []).reduce((sum, row) => sum + Number(row.amount || 0), 0),
              lastPayment.payments.reduce((sum, payment) => sum + payment.amount, 0),
              figures?.credit?.months ?? [],
            );
          }
        }
      }
      return {
        houseId,
        houseLabel: houseLabel(house as unknown as HouseRow),
        billedTo,
        status: { key: status?.status ?? null, label: status?.label ?? 'Unknown' },
        owed,
        unpaidMonths,
        lastPayment,
        paidMonths,
        walletBalance: status?.walletBalance ?? 0,
      };
    },

    async saveChoices(requestId, choices, expiresAt) {
      const { error } = await client()
        .from('whatsapp_admin_requests')
        .update({ params: { choices, choicesExpiresAt: expiresAt } })
        .eq('id', requestId);
      if (error) throw error;
    },

    async loadChoices(bindingId) {
      const { data, error } = await client()
        .from('whatsapp_admin_requests')
        .select('params')
        .eq('binding_id', bindingId)
        .eq('action', 'owes')
        .eq('status', 'done')
        .not('params->choices', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      const params = data?.params as { choices?: OwesCandidate[]; choicesExpiresAt?: string } | undefined;
      if (!params?.choices || !params.choicesExpiresAt) return null;
      return { choices: params.choices, expiresAt: params.choicesExpiresAt };
    },

    async clearChoices(bindingId) {
      const { error } = await client()
        .from('whatsapp_admin_requests')
        .update({ params: {} })
        .eq('binding_id', bindingId)
        .eq('action', 'owes')
        .not('params->choices', 'is', null);
      if (error) throw error;
    },

    async logDisclosure(input) {
      await financial.logDisclosure({
        residentId: input.residentId,
        phoneNumber: input.phoneNumber,
        houseId: input.houseId,
        menuItem: 'admin_owes',
        pinAuthenticated: true,
        metadata: { admin_profile_id: input.adminProfileId, via: 'whatsapp_admin' },
      });
    },
  };
}
