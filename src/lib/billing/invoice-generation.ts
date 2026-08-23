import { z } from 'zod';

const monthString = z.string().regex(/^\d{4}-\d{2}-01$/, 'Month must be the first day of a month');

export const InvoiceGenerationRequestSchema = z.object({
  mode: z.enum(['selected_month', 'backfill']),
  targetMonth: monthString,
  fromMonth: monthString.optional(),
  houseId: z.string().uuid().optional(),
  streetId: z.string().uuid().optional(),
  residentId: z.string().uuid().optional(),
  walletAllocation: z.boolean().default(false),
  sendEmails: z.boolean().default(false),
  assessLateFees: z.boolean().default(false),
  confirmation: z.string().trim().min(1).optional(),
  trigger: z.enum(['manual', 'cron', 'api']),
}).superRefine((request, context) => {
  const selectors = [request.houseId, request.streetId, request.residentId].filter(Boolean);
  if (selectors.length > 1) {
    context.addIssue({ code: 'custom', message: 'Only one generation scope selector may be provided' });
  }
  if (request.mode === 'backfill' && !request.fromMonth) {
    context.addIssue({ code: 'custom', path: ['fromMonth'], message: 'Backfill requires a starting month' });
  }
  if (request.mode === 'selected_month' && request.fromMonth) {
    context.addIssue({ code: 'custom', path: ['fromMonth'], message: 'Selected-month runs cannot include a starting month' });
  }
  if (request.fromMonth && request.fromMonth > request.targetMonth) {
    context.addIssue({ code: 'custom', path: ['fromMonth'], message: 'Backfill start month cannot be after target month' });
  }
});

export type InvoiceGenerationRequest = z.infer<typeof InvoiceGenerationRequestSchema>;
export type InvoiceGenerationRequestInput = z.input<typeof InvoiceGenerationRequestSchema>;
export type GenerationTrigger = InvoiceGenerationRequest['trigger'];
export type BillableRole = 'resident_landlord' | 'non_resident_landlord' | 'tenant' | 'developer' | 'co_resident' | 'household_member' | 'domestic_staff' | 'caretaker';
export type HouseStatus = 'occupied' | 'vacant' | 'under_renovation' | 'under_construction' | string;

export interface BillingProfileVersionItem {
  id: string;
  name: string;
  amount: number;
  frequency: 'monthly' | 'yearly' | 'one_off';
  isMandatory?: boolean;
}

export interface BillingProfileVersion {
  id: string;
  billingProfileId: string;
  effectiveFrom: string;
  items: BillingProfileVersionItem[];
}

export interface GenerationProfile {
  id: string;
  name: string;
  targetType: 'house' | 'resident';
  applicableRoles: BillableRole[] | null;
}

export interface GenerationResidentRole {
  id: string;
  name: string;
  accountStatus: 'active' | 'inactive' | 'suspended' | 'archived' | string;
  role: BillableRole;
  moveInDate: string | null;
  isActive: boolean;
}

export interface GenerationHouse {
  id: string;
  label: string;
  streetId?: string | null;
  billingProfileId: string | null;
  propertyStatus: HouseStatus;
  isActive: boolean;
  residents: GenerationResidentRole[];
}

export interface InvoiceGenerationCandidate {
  residentId: string;
  houseId: string | null;
  billingProfileId: string;
  billingProfileVersionId: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  amountDue: number;
  isProRata: boolean;
  invoiceItems: Array<{ name: string; amount: number }>;
}

export interface CandidateSkip {
  houseId: string;
  house: string;
  reason: string;
}

export interface CandidateResolution {
  candidates: InvoiceGenerationCandidate[];
  skips: CandidateSkip[];
}

export interface ResolveBillableCandidatesInput {
  request: InvoiceGenerationRequestInput;
  profiles: GenerationProfile[];
  versions: BillingProfileVersion[];
  houses: GenerationHouse[];
  eligibility?: {
    billVacantHouses?: boolean;
    billUnderRenovation?: boolean;
    billUnderConstruction?: boolean;
    dueWindowDays?: number;
  };
}

export interface InvoiceGenerationEligibility {
  billVacantHouses: boolean;
  billUnderRenovation: boolean;
  billUnderConstruction: boolean;
  dueWindowDays: number;
}

export interface InvoiceGenerationEligibilityInput {
  billVacantHouses?: unknown;
  billUnderRenovation?: unknown;
  billUnderConstruction?: unknown;
  dueWindowDays?: unknown;
}

export const DEFAULT_INVOICE_GENERATION_ELIGIBILITY: InvoiceGenerationEligibility = {
  billVacantHouses: false,
  billUnderRenovation: false,
  billUnderConstruction: false,
  dueWindowDays: 30,
};

export function resolveInvoiceGenerationEligibility(
  settings: InvoiceGenerationEligibilityInput = {},
): InvoiceGenerationEligibility {
  return {
    billVacantHouses: settings.billVacantHouses === true,
    billUnderRenovation: settings.billUnderRenovation === true,
    billUnderConstruction: settings.billUnderConstruction === true,
    dueWindowDays: Number(settings.dueWindowDays) || DEFAULT_INVOICE_GENERATION_ELIGIBILITY.dueWindowDays,
  };
}

const ROLE_PRIORITY: BillableRole[] = ['tenant', 'resident_landlord'];

function parseMonth(month: string): Date {
  if (!/^\d{4}-\d{2}-01$/.test(month)) throw new Error('Month must be the first day of a month');
  const date = new Date(`${month}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== month) {
    throw new Error('Month must be the first day of a month');
  }
  return date;
}

function dateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function monthEnd(month: string): string {
  const start = parseMonth(month);
  return dateString(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)));
}

function addMonths(month: string, months: number): string {
  const start = parseMonth(month);
  return dateString(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 1)));
}

export function selectPeriods(request: Pick<InvoiceGenerationRequest, 'mode' | 'targetMonth' | 'fromMonth'>): string[] {
  parseMonth(request.targetMonth);
  if (request.mode === 'selected_month') return [request.targetMonth];
  if (!request.fromMonth) throw new Error('Backfill requires a starting month');
  parseMonth(request.fromMonth);
  if (request.fromMonth > request.targetMonth) throw new Error('Backfill start month cannot be after target month');

  const periods: string[] = [];
  for (let period = request.fromMonth; period <= request.targetMonth; period = addMonths(period, 1)) periods.push(period);
  return periods;
}

export function resolveProfileVersion(periodStart: string, versions: BillingProfileVersion[]): BillingProfileVersion {
  parseMonth(periodStart);
  for (const version of versions) parseMonth(version.effectiveFrom);
  const applicable = versions
    .filter((version) => version.effectiveFrom <= periodStart)
    .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom));
  if (applicable[0]) return applicable[0];

  const sorted = [...versions].sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom));
  if (sorted[0]) return sorted[0];

  throw new Error(`No billing profile version is effective for ${periodStart}`);
}

function resolveVersionForPeriod(
  periodStart: string,
  versions: BillingProfileVersion[],
): { version: BillingProfileVersion | null; skipReason: string | null } {
  try {
    return { version: resolveProfileVersion(periodStart, versions), skipReason: null };
  } catch {
    return { version: null, skipReason: `No billing profile version effective for ${periodStart}` };
  }
}

function isHouseEligible(house: GenerationHouse, eligibility: InvoiceGenerationEligibility): string | null {
  if (!house.isActive) return 'House is inactive';
  if (house.propertyStatus === 'vacant' && !eligibility.billVacantHouses) return 'Vacant (billing disabled)';
  if (house.propertyStatus === 'under_renovation' && !eligibility.billUnderRenovation) return 'Under renovation (billing disabled)';
  if (house.propertyStatus === 'under_construction' && !eligibility.billUnderConstruction) return 'Under construction (billing disabled)';
  return null;
}

function residentEligible(resident: GenerationResidentRole, profile: GenerationProfile): string | null {
  if (!resident.isActive) return 'Resident-house role is inactive';
  if (resident.accountStatus !== 'active') return `Resident is ${resident.accountStatus}`;
  if (profile.applicableRoles && !profile.applicableRoles.includes(resident.role)) return 'Resident role is not applicable';
  return null;
}

function evaluateCandidate(
  resident: GenerationResidentRole,
  house: GenerationHouse,
  profile: GenerationProfile,
  version: BillingProfileVersion,
  periodStart: string,
  dueWindowDays: number,
): { candidate: InvoiceGenerationCandidate | null; skipReason: string | null } {
  const monthlyItems = version.items.filter((item) => item.frequency === 'monthly');
  if (!monthlyItems.length) return { candidate: null, skipReason: 'No monthly billing items' };

  const periodEnd = monthEnd(periodStart);
  const periodStartDate = parseMonth(periodStart);
  const periodEndDate = new Date(`${periodEnd}T00:00:00.000Z`);
  const moveInDate = resident.moveInDate ? new Date(`${resident.moveInDate}T00:00:00.000Z`) : null;
  if (moveInDate && moveInDate > periodEndDate) {
    return { candidate: null, skipReason: 'Resident moved in after selected period' };
  }

  const isProRata = Boolean(moveInDate && moveInDate > periodStartDate && moveInDate <= periodEndDate);
  const totalDays = periodEndDate.getUTCDate();
  const activeDays = isProRata ? totalDays - moveInDate!.getUTCDate() + 1 : totalDays;
  const fraction = activeDays / totalDays;
  const invoiceItems = monthlyItems.map((item) => ({ name: item.name, amount: Math.round(item.amount * fraction * 100) / 100 }));
  const amountDue = Math.round(invoiceItems.reduce((total, item) => total + item.amount, 0) * 100) / 100;
  const dueDate = new Date(periodStartDate);
  dueDate.setUTCDate(dueDate.getUTCDate() + dueWindowDays);

  return {
    candidate: {
      residentId: resident.id,
      houseId: house.id,
      billingProfileId: profile.id,
      billingProfileVersionId: version.id,
      periodStart,
      periodEnd,
      dueDate: dateString(dueDate),
      amountDue,
      isProRata,
      invoiceItems,
    },
    skipReason: null,
  };
}

export function resolveBillableCandidates(input: ResolveBillableCandidatesInput): CandidateResolution {
  const request = InvoiceGenerationRequestSchema.parse(input.request);
  const periods = selectPeriods(request);
  const profiles = new Map(input.profiles.map((profile) => [profile.id, profile]));
  const eligibility = resolveInvoiceGenerationEligibility(input.eligibility);
  const candidates: InvoiceGenerationCandidate[] = [];
  const skips: CandidateSkip[] = [];

  for (const house of input.houses) {
    if (request.houseId && house.id !== request.houseId) continue;
    if (request.streetId && house.streetId !== request.streetId) continue;
    const eligibilityReason = isHouseEligible(house, eligibility);
    if (eligibilityReason) {
      skips.push({ houseId: house.id, house: house.label, reason: eligibilityReason });
      continue;
    }
    if (!house.billingProfileId || !profiles.has(house.billingProfileId)) {
      skips.push({ houseId: house.id, house: house.label, reason: 'No billing profile' });
      continue;
    }
    const profile = profiles.get(house.billingProfileId)!;
    const profileVersions = input.versions.filter((item) => item.billingProfileId === profile.id);
    const residentRoles = house.residents.filter((resident) => !request.residentId || resident.id === request.residentId);
    if (request.residentId && !residentRoles.length) {
      skips.push({ houseId: house.id, house: house.label, reason: 'Not in selected resident scope' });
      continue;
    }

    const eligibleResidents = residentRoles.filter((resident) => !residentEligible(resident, profile));
    if (profile.targetType === 'house') {
      const housePriority = house.propertyStatus === 'vacant'
        ? [...ROLE_PRIORITY, 'non_resident_landlord' as const]
        : ROLE_PRIORITY;

      const billable = housePriority
        .map((role) => eligibleResidents.find((resident) => resident.role === role))
        .find(Boolean);

      if (!billable) {
        const firstReason = residentRoles[0] ? residentEligible(residentRoles[0], profile) : 'No active residents';
        skips.push({ houseId: house.id, house: house.label, reason: firstReason || 'No billable resident found' });
        continue;
      }

      for (const period of periods) {
        const resolved = resolveVersionForPeriod(period, profileVersions);
        if (!resolved.version) {
          skips.push({ houseId: house.id, house: house.label, reason: resolved.skipReason! });
          continue;
        }
        const evaluation = evaluateCandidate(billable, house, profile, resolved.version, period, eligibility.dueWindowDays);
        if (evaluation.candidate) candidates.push(evaluation.candidate);
        else if (evaluation.skipReason) skips.push({ houseId: house.id, house: house.label, reason: evaluation.skipReason });
      }
      continue;
    }

    if (!eligibleResidents.length) {
      skips.push({ houseId: house.id, house: house.label, reason: residentRoles.length ? 'No eligible resident roles' : 'No active residents' });
      continue;
    }
    for (const resident of eligibleResidents) {
      for (const period of periods) {
        const resolved = resolveVersionForPeriod(period, profileVersions);
        if (!resolved.version) {
          skips.push({ houseId: house.id, house: house.label, reason: resolved.skipReason! });
          continue;
        }
        const evaluation = evaluateCandidate(resident, house, profile, resolved.version, period, eligibility.dueWindowDays);
        if (evaluation.candidate) candidates.push(evaluation.candidate);
        else if (evaluation.skipReason) skips.push({ houseId: house.id, house: house.label, reason: evaluation.skipReason });
      }
    }
  }
  return { candidates, skips };
}
