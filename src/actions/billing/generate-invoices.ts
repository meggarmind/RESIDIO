'use server';

import { debitWalletForInvoice } from '@/actions/billing/wallet';
import { sendInvoiceEmail } from '@/actions/email/send-invoice-email';
import { sendInvoiceGenerationAlert } from '@/actions/email/send-admin-alert';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { createLogger } from '@/lib/logger';
import { getSystemSetting } from '@/lib/settings/get-system-setting';
import {
  resolveBillableCandidates,
  type BillingProfileVersion,
  type GenerationHouse,
  type GenerationProfile,
} from '@/lib/billing/invoice-generation';
import { createAdminClient, createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

const log = createLogger('[Billing]');

export type InvoiceGenerationTrigger = 'manual' | 'cron' | 'api';

interface SkipReason { house: string; reason: string }
interface GenerateInvoicesResult {
  success: boolean;
  generated: number;
  skipped: number;
  skipReasons: SkipReason[];
  errors: string[];
  logId?: string;
  durationMs?: number;
}

const targetMonth = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;

/**
 * Compatibility entry point retained for existing cron/API callers. Candidate
 * selection lives exclusively in the shared engine; Task 3 replaces this
 * immediate processing path with durable approved runs.
 */
export async function generateMonthlyInvoices(
  upToDate: Date = new Date(),
  triggerType: InvoiceGenerationTrigger = 'manual',
  options?: { debitWallet?: boolean; sendEmails?: boolean },
): Promise<GenerateInvoicesResult> {
  const startedAt = Date.now();
  const debitWallet = options?.debitWallet ?? triggerType === 'manual';
  const sendEmails = options?.sendEmails ?? triggerType === 'manual';
  if (triggerType === 'manual') {
    const auth = await authorizePermission(PERMISSIONS.BILLING_CREATE_INVOICE);
    if (!auth.authorized) return { success: false, generated: 0, skipped: 0, skipReasons: [], errors: [auth.error || 'Unauthorized'] };
  }

  const supabase = triggerType === 'manual' ? await createServerSupabaseClient() : createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  const period = targetMonth(upToDate);
  const result: GenerateInvoicesResult = { success: true, generated: 0, skipped: 0, skipReasons: [], errors: [] };
  const { error: lockError } = await supabase.from('invoice_generation_locks').insert({ period, started_by: user?.id || null });
  if (lockError) return { ...result, success: false, errors: [`Another generation run is already in progress for ${period.slice(0, 7)}`] };

  try {
    const [billVacantHouses, billUnderRenovation, billUnderConstruction, dueWindowSetting] = await Promise.all([
      getSystemSetting(supabase, 'bill_vacant_houses'),
      getSystemSetting(supabase, 'bill_under_renovation_houses'),
      getSystemSetting(supabase, 'bill_under_construction_houses'),
      getSystemSetting(supabase, 'invoice_due_window_days'),
    ]);
    const { data: houses, error: housesError } = await supabase.from('houses').select(`
      id, house_number, house_type_id, billing_profile_id, street_id, property_status, is_active,
      resident_houses(id, resident_id, resident_role, move_in_date, is_active,
        resident:residents!resident_id(id, first_name, last_name, account_status))
    `).eq('is_active', true);
    if (housesError) throw new Error(`Failed to fetch houses: ${housesError.message}`);

    const houseTypeIds = [...new Set((houses || []).map((house) => house.house_type_id).filter((id): id is string => Boolean(id)))];
    const { data: houseTypes, error: houseTypesError } = houseTypeIds.length
      ? await supabase.from('house_types').select('id, billing_profile_id').in('id', houseTypeIds)
      : { data: [], error: null };
    if (houseTypesError) throw new Error(`Failed to fetch house types: ${houseTypesError.message}`);
    const profileForHouseType = new Map((houseTypes || []).map((houseType) => [houseType.id, houseType.billing_profile_id]));
    const profileIds = [...new Set((houses || []).map((house) => house.billing_profile_id || profileForHouseType.get(house.house_type_id || '')).filter((id): id is string => Boolean(id)))];
    if (!profileIds.length) return result;

    const [{ data: profiles, error: profilesError }, { data: versions, error: versionsError }] = await Promise.all([
      supabase.from('billing_profiles').select('id, name, target_type, applicable_roles, is_one_time').in('id', profileIds).eq('is_active', true),
      supabase.from('billing_profile_versions').select('id, billing_profile_id, effective_from, billing_profile_version_items(id, name, amount, frequency, is_mandatory)').in('billing_profile_id', profileIds),
    ]);
    if (profilesError || versionsError) throw new Error(profilesError?.message || versionsError?.message || 'Could not load billing profiles');

    const generationProfiles: GenerationProfile[] = (profiles || []).filter((profile) => !profile.is_one_time).map((profile) => ({
      id: profile.id, name: profile.name, targetType: profile.target_type as GenerationProfile['targetType'], applicableRoles: profile.applicable_roles as GenerationProfile['applicableRoles'],
    }));
    const generationVersions: BillingProfileVersion[] = (versions || []).map((version) => ({
      id: version.id, billingProfileId: version.billing_profile_id, effectiveFrom: version.effective_from,
      items: (version.billing_profile_version_items || []).map((item) => ({ id: item.id, name: item.name, amount: Number(item.amount), frequency: item.frequency, isMandatory: item.is_mandatory })),
    }));
    const generationHouses: GenerationHouse[] = (houses || []).map((house) => ({
      id: house.id, label: house.house_number, streetId: house.street_id,
      billingProfileId: house.billing_profile_id || profileForHouseType.get(house.house_type_id || '') || null,
      propertyStatus: house.property_status || 'occupied', isActive: house.is_active,
      residents: (house.resident_houses || []).map((link) => {
        const resident = Array.isArray(link.resident) ? link.resident[0] : link.resident;
        return { id: link.resident_id, name: resident ? `${resident.first_name} ${resident.last_name}` : 'Unknown resident', accountStatus: resident?.account_status || 'inactive', role: link.resident_role, moveInDate: link.move_in_date, isActive: link.is_active };
      }),
    }));
    const resolution = resolveBillableCandidates({
      request: { mode: 'selected_month', targetMonth: period, trigger: triggerType },
      profiles: generationProfiles, versions: generationVersions, houses: generationHouses,
      eligibility: {
        billVacantHouses: billVacantHouses === true,
        billUnderRenovation: billUnderRenovation === true,
        billUnderConstruction: billUnderConstruction === true,
        dueWindowDays: Number(dueWindowSetting) || 30,
      },
    });
    result.skipped += resolution.skips.length;
    result.skipReasons.push(...resolution.skips.map(({ house, reason }) => ({ house, reason })));

    for (const candidate of resolution.candidates) {
      const house = generationHouses.find((item) => item.id === candidate.houseId)!;
      const profile = generationProfiles.find((item) => item.id === candidate.billingProfileId)!;
      const { data: existing } = await supabase.from('invoices').select('id').eq('resident_id', candidate.residentId).eq('house_id', candidate.houseId!).eq('billing_profile_version_id', candidate.billingProfileVersionId).eq('period_start', candidate.periodStart).eq('period_end', candidate.periodEnd).maybeSingle();
      if (existing) { result.skipped++; continue; }

      const invoiceNumber = `INV-${candidate.periodStart.slice(0, 7).replace('-', '')}-${candidate.houseId!.replaceAll('-', '').slice(0, 8).toUpperCase()}-${candidate.residentId.replaceAll('-', '').slice(0, 8).toUpperCase()}-${candidate.billingProfileVersionId.replaceAll('-', '').slice(0, 8).toUpperCase()}`;
      const { data: invoice, error: invoiceError } = await supabase.from('invoices').insert({
        resident_id: candidate.residentId, house_id: candidate.houseId, billing_profile_id: candidate.billingProfileId,
        billing_profile_version_id: candidate.billingProfileVersionId, invoice_number: invoiceNumber, amount_due: candidate.amountDue,
        amount_paid: 0, status: 'unpaid', invoice_type: 'SERVICE_CHARGE', due_date: candidate.dueDate,
        period_start: candidate.periodStart, period_end: candidate.periodEnd, created_by: user?.id || null,
        rate_snapshot: { billing_profile_id: profile.id, billing_profile_name: profile.name, captured_at: new Date().toISOString(), items: candidate.invoiceItems, total_amount: candidate.amountDue },
      }).select('id').single();
      if (invoiceError || !invoice) {
        if (invoiceError?.code === '23505') { result.skipped++; continue; }
        result.errors.push(`Invoice for ${house.label} (${candidate.periodStart}): ${invoiceError?.message || 'could not be created'}`);
        continue;
      }
      const { error: itemsError } = await supabase.from('invoice_items').insert(candidate.invoiceItems.map((item) => ({ invoice_id: invoice.id, description: candidate.isProRata ? `${item.name} (Pro-rata)` : item.name, amount: item.amount })));
      if (itemsError) { result.errors.push(`Items for ${house.label} (${candidate.periodStart}): ${itemsError.message}`); continue; }
      result.generated++;
      if (debitWallet) await debitWalletForInvoice(candidate.residentId, invoice.id);
      if (sendEmails) sendInvoiceEmail(invoice.id).catch((error) => log.error(`Failed to send invoice email for ${invoiceNumber}`, error));
    }
  } catch (error) {
    result.success = false;
    result.errors.push(error instanceof Error ? error.message : String(error));
  } finally {
    await supabase.from('invoice_generation_locks').delete().eq('period', period);
  }

  result.durationMs = Date.now() - startedAt;
  const { data: logEntry, error: logError } = await supabase.from('invoice_generation_log').insert({
    generated_by: user?.id || null, trigger_type: triggerType, target_period: period, generated_count: result.generated,
    skipped_count: result.skipped, error_count: result.errors.length, skip_reasons: result.skipReasons,
    errors: result.errors.length ? result.errors : null, duration_ms: result.durationMs,
  }).select('id').single();
  if (!logError && logEntry) {
    result.logId = logEntry.id;
    await logAudit({ action: 'GENERATE', entityType: 'invoice_generation_log', entityId: logEntry.id, entityDisplay: `Invoice Generation - ${result.generated} invoices`, newValues: { generated_count: result.generated, skipped_count: result.skipped, error_count: result.errors.length, target_period: period }, description: `${triggerType} invoice generation`, metadata: { trigger_type: triggerType, duration_ms: result.durationMs } });
  }
  if (result.errors.length) sendInvoiceGenerationAlert(result.generated, result.skipped, result.errors.length, result.errors, triggerType).catch((error) => log.error('Failed to send invoice generation alert', error));
  revalidatePath('/billing');
  return result;
}
