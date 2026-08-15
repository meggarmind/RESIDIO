'use server';

import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import {
  InvoiceGenerationRequestSchema,
  resolveBillableCandidates,
  resolveInvoiceGenerationEligibility,
  type BillingProfileVersion,
  type GenerationHouse,
  type GenerationProfile,
} from '@/lib/billing/invoice-generation';
import { getSystemSetting } from '@/lib/settings/get-system-setting';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export interface PreviewInvoiceItem {
  houseId: string;
  houseNumber: string;
  streetName: string;
  residentId: string;
  residentName: string;
  residentCode: string;
  periodStart: string;
  periodEnd: string;
  amount: number;
  isProRata: boolean;
  isNew: boolean;
  walletBalance: number;
  walletAfterDeduction: number;
  billingProfileName: string;
}

export interface GeneratePreviewResult {
  success: boolean;
  preview: PreviewInvoiceItem[];
  skipList: Array<{ house: string; reason: string }>;
  summary: {
    totalHouses: number;
    eligibleHouses: number;
    totalResidents: number;
    newInvoices: number;
    existingInvoices: number;
    totalAmount: number;
    totalWalletDeductions: number;
    warnings: string[];
  };
  error: string | null;
}

const emptyResult = (error: string | null = null): GeneratePreviewResult => ({
  success: !error,
  preview: [],
  skipList: [],
  summary: { totalHouses: 0, eligibleHouses: 0, totalResidents: 0, newInvoices: 0, existingInvoices: 0, totalAmount: 0, totalWalletDeductions: 0, warnings: [] },
  error,
});

const monthString = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;

/**
 * Previews the same versioned candidates that generation will process. This
 * remains read-only; Task 3 turns the returned candidates into a durable run.
 */
export async function generateInvoicesPreview(
  targetDate: Date = new Date(),
  houseId?: string,
  streetId?: string,
  residentId?: string,
  options?: {
    mode?: 'selected_month' | 'backfill';
    fromMonth?: string;
    walletAllocation?: boolean;
    sendEmails?: boolean;
    assessLateFees?: boolean;
  },
): Promise<GeneratePreviewResult> {
  const auth = await authorizePermission(PERMISSIONS.BILLING_CREATE_INVOICE);
  if (!auth.authorized) return emptyResult(auth.error || 'Unauthorized');

  const supabase = await createServerSupabaseClient();
  let housesQuery = supabase.from('houses').select(`
    id, house_number, street_id, house_type_id, billing_profile_id, property_status, is_active,
    street:streets(name), resident_houses(id, resident_id, resident_role, move_in_date, is_active,
      resident:residents!resident_id(id, first_name, last_name, resident_code, account_status))
  `).eq('is_active', true);
  if (houseId) housesQuery = housesQuery.eq('id', houseId);
  if (streetId) housesQuery = housesQuery.eq('street_id', streetId);
  const { data: houses, error: housesError } = await housesQuery;
  if (housesError) return emptyResult(housesError.message);

  const houseTypeIds = [...new Set((houses || []).map((house) => house.house_type_id).filter((id): id is string => Boolean(id)))];
  const { data: houseTypes, error: houseTypesError } = houseTypeIds.length
    ? await supabase.from('house_types').select('id, billing_profile_id').in('id', houseTypeIds)
    : { data: [], error: null };
  if (houseTypesError) return emptyResult(houseTypesError.message);
  const profileForHouseType = new Map((houseTypes || []).map((houseType) => [houseType.id, houseType.billing_profile_id]));
  const profileIds = [...new Set((houses || []).map((house) => house.billing_profile_id || profileForHouseType.get(house.house_type_id || '')).filter((id): id is string => Boolean(id)))];
  if (!profileIds.length) return { ...emptyResult(), summary: { ...emptyResult().summary, totalHouses: houses?.length || 0 } };

  const [{ data: profiles, error: profilesError }, { data: versions, error: versionsError }] = await Promise.all([
    supabase.from('billing_profiles').select('id, name, target_type, applicable_roles, is_one_time').in('id', profileIds).eq('is_active', true),
    supabase.from('billing_profile_versions').select('id, billing_profile_id, effective_from, billing_profile_version_items(id, name, amount, frequency, is_mandatory)').in('billing_profile_id', profileIds),
  ]);
  if (profilesError || versionsError) return emptyResult(profilesError?.message || versionsError?.message || 'Could not load billing profiles');

  const generationProfiles: GenerationProfile[] = (profiles || [])
    .filter((profile) => !profile.is_one_time)
    .map((profile) => ({ id: profile.id, name: profile.name, targetType: profile.target_type as GenerationProfile['targetType'], applicableRoles: profile.applicable_roles as GenerationProfile['applicableRoles'] }));
  const generationVersions: BillingProfileVersion[] = (versions || []).map((version) => ({
    id: version.id,
    billingProfileId: version.billing_profile_id,
    effectiveFrom: version.effective_from,
    items: (version.billing_profile_version_items || []).map((item) => ({ id: item.id, name: item.name, amount: Number(item.amount), frequency: item.frequency, isMandatory: item.is_mandatory })),
  }));
  const generationHouses: GenerationHouse[] = (houses || []).map((house) => ({
    id: house.id,
    label: house.house_number,
    streetId: house.street_id,
    billingProfileId: house.billing_profile_id || profileForHouseType.get(house.house_type_id || '') || null,
    propertyStatus: house.property_status || 'occupied',
    isActive: house.is_active,
    residents: (house.resident_houses || []).map((link) => {
      const resident = Array.isArray(link.resident) ? link.resident[0] : link.resident;
      return { id: link.resident_id, name: resident ? `${resident.first_name} ${resident.last_name}` : 'Unknown resident', accountStatus: resident?.account_status || 'inactive', role: link.resident_role, moveInDate: link.move_in_date, isActive: link.is_active };
    }),
  }));

  try {
    const [billVacantHouses, billUnderRenovation, billUnderConstruction, dueWindowSetting] = await Promise.all([
      getSystemSetting(supabase, 'bill_vacant_houses'),
      getSystemSetting(supabase, 'bill_under_renovation_houses'),
      getSystemSetting(supabase, 'bill_under_construction_houses'),
      getSystemSetting(supabase, 'invoice_due_window_days'),
    ]);
     const request = InvoiceGenerationRequestSchema.parse({
       mode: options?.mode ?? 'selected_month',
       targetMonth: monthString(targetDate),
       fromMonth: options?.fromMonth,
       trigger: 'manual',
       houseId,
       streetId,
       residentId,
       walletAllocation: options?.walletAllocation ?? false,
       sendEmails: options?.sendEmails ?? false,
       assessLateFees: options?.assessLateFees ?? false,
     });
     const resolution = resolveBillableCandidates({
       request,
      profiles: generationProfiles,
      versions: generationVersions,
      houses: generationHouses,
      eligibility: resolveInvoiceGenerationEligibility({
        billVacantHouses,
        billUnderRenovation,
        billUnderConstruction,
        dueWindowDays: dueWindowSetting,
      }),
    });
    const preview = await Promise.all(resolution.candidates.map(async (candidate) => {
      const [existingResult, walletResult] = await Promise.all([
        supabase.from('invoices').select('id').eq('resident_id', candidate.residentId).eq('house_id', candidate.houseId!).eq('billing_profile_version_id', candidate.billingProfileVersionId).eq('period_start', candidate.periodStart).eq('period_end', candidate.periodEnd).maybeSingle(),
        supabase.from('resident_wallets').select('balance').eq('resident_id', candidate.residentId).maybeSingle(),
      ]);
      const house = generationHouses.find((item) => item.id === candidate.houseId)!;
      const resident = house.residents.find((item) => item.id === candidate.residentId)!;
      const sourceHouse = (houses || []).find((item) => item.id === candidate.houseId)!;
      const street = Array.isArray(sourceHouse.street) ? sourceHouse.street[0] : sourceHouse.street;
      const walletBalance = Number(walletResult.data?.balance || 0);
      const isNew = !existingResult.data;
      return {
        houseId: house.id, houseNumber: house.label, streetName: street?.name || '', residentId: resident.id, residentName: resident.name,
        residentCode: ((Array.isArray(sourceHouse.resident_houses) ? sourceHouse.resident_houses : []).find((link) => link.resident_id === resident.id)?.resident as { resident_code?: string } | null)?.resident_code || '',
        periodStart: candidate.periodStart, periodEnd: candidate.periodEnd, amount: candidate.amountDue, isProRata: candidate.isProRata,
         isNew, walletBalance, walletAfterDeduction: isNew && request.walletAllocation ? Math.max(0, walletBalance - candidate.amountDue) : walletBalance,
        billingProfileName: generationProfiles.find((profile) => profile.id === candidate.billingProfileId)?.name || 'Billing profile',
      } satisfies PreviewInvoiceItem;
    }));
    const newInvoices = preview.filter((item) => item.isNew);
    return {
      success: true,
      preview,
      skipList: resolution.skips.map(({ house, reason }) => ({ house, reason })),
      summary: {
        totalHouses: houses?.length || 0,
        eligibleHouses: new Set(preview.map((item) => item.houseId)).size,
        totalResidents: new Set(preview.map((item) => item.residentId)).size,
        newInvoices: newInvoices.length,
        existingInvoices: preview.length - newInvoices.length,
        totalAmount: newInvoices.reduce((sum, item) => sum + item.amount, 0),
         totalWalletDeductions: request.walletAllocation ? newInvoices.reduce((sum, item) => sum + Math.min(item.amount, item.walletBalance), 0) : 0,
         warnings: [
           ...resolution.skips.map(({ house, reason }) => `${house}: ${reason}`),
           ...(request.mode === 'backfill' && !request.walletAllocation ? ['Wallet allocation is disabled for this backfill.'] : []),
           ...(request.mode === 'backfill' && !request.sendEmails ? ['Invoice emails are disabled for this backfill.'] : []),
           ...(request.mode === 'backfill' && !request.assessLateFees ? ['Late-fee assessment is disabled for this backfill.'] : []),
         ],
      },
      error: null,
    };
  } catch (error) {
    return emptyResult(error instanceof Error ? error.message : 'Could not resolve invoice candidates');
  }
}
