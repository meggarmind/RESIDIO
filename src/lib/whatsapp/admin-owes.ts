import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuditEntry } from '@/lib/audit/recorder';
import { getDebtStatuses } from '@/lib/billing/debt-status';
import { ilikeAny } from '@/lib/postgrest-filter';
import { sanitizeSearchInput } from '@/lib/utils';
import { createAdminClient } from '@/lib/supabase/server';
import { formatBalance, formatDay, formatNaira } from '@/lib/whatsapp/assistant-format';
import { createSupabaseWhatsAppFinancialRepository, type OwedFigures } from '@/lib/whatsapp/financial';

/**
 * WhatsApp admin lookup of what a house owes (#981). An admin sends a house code or a name; the
 * answer is the figure the resident sees under "What I owe", the shared debt status (#980), the
 * oldest unpaid period and the wallet on its own line. The resident is not told. The access gate
 * (binding, authenticator session, permission, daily cap) is #972's and runs before this.
 */

export const OWES_LIST_MAX = 5;
export const OWES_PICK_MINUTES = 5;
export const OWES_USAGE = 'Send ADMIN OWES followed by a house code or a name, for example ADMIN OWES KOA-18A.';
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
  status: { label: string };
  owed: OwedFigures | null;
  oldestUnpaid: { periodStart: string | null; periodEnd: string | null; dueDate: string; invoiceNumber: string } | null;
  walletBalance: number;
}

export interface OwesRepository {
  searchHouseCodes(term: string): Promise<OwesCandidate[]>;
  searchResidents(words: string[]): Promise<OwesCandidate[]>;
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

export function composeAdminOwesAnswer(data: OwesHouseData): string {
  const lines = [`*What ${data.houseLabel} owes*`];
  if (!data.billedTo) {
    lines.push('No resident is billed for this house, so there is no figure to show.');
    return lines.join('\n');
  }
  lines.push(`Billed to: ${data.billedTo.name}`);
  const owed = data.owed;
  if (owed) {
    if (owed.rollForward) lines.push(`Outstanding: ${formatBalance(owed.outstanding)}`);
    else if (owed.invoiceCount === 0) lines.push('Outstanding: no bills on record');
    else lines.push(`Outstanding: ${owed.outstanding <= 0 ? 'nil, fully paid up' : formatNaira(owed.outstanding)}`);
    if (owed.overdue) {
      lines.push(`Overdue: ${formatNaira(owed.overdue.total)} across ${owed.overdue.count} ${owed.overdue.count === 1 ? 'invoice' : 'invoices'} (oldest due ${formatDay(owed.overdue.oldestDue)})`);
    }
    if (owed.awaitingVerification > 0) lines.push(`Awaiting verification: ${formatNaira(owed.awaitingVerification)}`);
  }
  lines.push(`Status: ${data.status.label}`);
  const oldest = data.oldestUnpaid;
  if (!oldest) {
    lines.push('Oldest unpaid: none');
  } else if (oldest.periodStart && oldest.periodEnd) {
    lines.push(`Oldest unpaid: ${formatDay(oldest.periodStart)} to ${formatDay(oldest.periodEnd)} (invoice ${oldest.invoiceNumber}, due ${formatDay(oldest.dueDate)})`);
  } else {
    lines.push(`Oldest unpaid: invoice ${oldest.invoiceNumber}, due ${formatDay(oldest.dueDate)}`);
  }
  lines.push(`Wallet: ${formatNaira(data.walletBalance)} (not netted against the outstanding figure)`);
  return lines.join('\n');
}

function candidateLine(candidate: OwesCandidate, index: number): string {
  return `${index + 1}. ${candidate.name ? `${candidate.name}, ` : ''}${candidate.houseLabel}`;
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
  const [byCode, byName] = await Promise.all([repository.searchHouseCodes(term), repository.searchResidents(words)]);

  const exact = byCode.find((candidate) => candidate.code?.toLowerCase() === term.toLowerCase());
  if (exact) return answerHouse(input, exact.houseId);

  const byHouse = new Map<string, OwesCandidate>();
  for (const candidate of [...byCode, ...byName]) {
    if (!byHouse.has(candidate.houseId) || candidate.name) byHouse.set(candidate.houseId, candidate);
  }
  const matches = [...byHouse.values()];

  if (matches.length === 0) return `No house or resident matches "${term}".`;
  if (matches.length === 1) return answerHouse(input, matches[0].houseId);
  if (matches.length > OWES_LIST_MAX) {
    return `More than ${OWES_LIST_MAX} matches for "${term}". Send a longer name or the house code.`;
  }

  await repository.saveChoices(input.requestId, matches, new Date(now.getTime() + OWES_PICK_MINUTES * 60 * 1000).toISOString());
  await input.audit({
    action: 'VERIFY',
    entityType: 'whatsapp_admin_requests',
    entityId: input.requestId,
    entityDisplay: `WhatsApp admin owes list for "${term}"`,
    description: 'Admin was shown a list of houses to pick from on WhatsApp',
    metadata: { channel: 'whatsapp_admin', query: term, listed: matches.map(({ houseId, name }) => ({ house_id: houseId, name })) },
  });
  return [
    `${matches.length} matches for "${term}". Send ADMIN and the number within ${OWES_PICK_MINUTES} minutes, for example ADMIN 1:`,
    ...matches.map(candidateLine),
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
      let query = client()
        .from('residents')
        .select('first_name, last_name, resident_houses!inner(house_id, house:houses(short_name, house_number, street:streets(name)))')
        .eq('resident_houses.is_active', true)
        .in('resident_houses.resident_role', BILLABLE_ROLES);
      // Every word must match the first or the last name.
      for (const word of words) query = query.or(ilikeAny(['first_name', 'last_name'], word));
      const { data, error } = await query.limit(20);
      if (error) throw error;
      return (data || []).flatMap((row) => {
        const links = row.resident_houses as unknown as { house_id: string; house: HouseRow | HouseRow[] | null }[];
        return links.flatMap((link) => {
          const house = first(link.house);
          if (!house) return [];
          return [{ houseId: link.house_id, houseLabel: houseLabel(house), code: house.short_name, name: `${row.first_name} ${row.last_name}`.trim() }];
        });
      });
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
      let oldestUnpaid: OwesHouseData['oldestUnpaid'] = null;
      if (residentId) {
        const [resident, figures, unpaid] = await Promise.all([
          supabase.from('residents').select('first_name, last_name').eq('id', residentId).maybeSingle(),
          financial.getOwed(residentId, houseId),
          supabase
            .from('invoices')
            .select('invoice_number, amount_due, amount_paid, due_date, period_start, period_end')
            .eq('resident_id', residentId)
            .eq('house_id', houseId)
            .in('status', ['unpaid', 'partially_paid'])
            .order('due_date', { ascending: true }),
        ]);
        if (resident.error) throw resident.error;
        if (unpaid.error) throw unpaid.error;
        billedTo = { residentId, name: `${resident.data?.first_name ?? ''} ${resident.data?.last_name ?? ''}`.trim() || 'Resident' };
        owed = figures;
        const oldest = (unpaid.data || []).find((invoice) => Number(invoice.amount_due) - Number(invoice.amount_paid) > 0);
        if (oldest) {
          oldestUnpaid = {
            periodStart: oldest.period_start,
            periodEnd: oldest.period_end,
            dueDate: String(oldest.due_date).slice(0, 10),
            invoiceNumber: oldest.invoice_number,
          };
        }
      }
      return {
        houseId,
        houseLabel: houseLabel(house as unknown as HouseRow),
        billedTo,
        status: { label: status?.label ?? 'Unknown' },
        owed,
        oldestUnpaid,
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
