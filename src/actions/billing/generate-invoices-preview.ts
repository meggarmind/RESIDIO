'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import type { InvoiceType } from '@/types/database';
import type { BillingProfileWithItems } from '@/types/billing';

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

export async function generateInvoicesPreview(
  targetDate: Date = new Date(),
  houseId?: string,
  streetId?: string,
  residentId?: string
): Promise<GeneratePreviewResult> {
  const auth = await authorizePermission(PERMISSIONS.BILLING_CREATE_INVOICE);
  if (!auth.authorized) return { success: false, preview: [], skipList: [], summary: { totalHouses: 0, eligibleHouses: 0, totalResidents: 0, newInvoices: 0, existingInvoices: 0, totalAmount: 0, totalWalletDeductions: 0, warnings: [] }, error: auth.error || 'Unauthorized' };

  const supabase = await createServerSupabaseClient();
  const targetMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
  const targetEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59);

  const preview: PreviewInvoiceItem[] = [];
  const skipList: Array<{ house: string; reason: string }> = [];
  const warnings: string[] = [];

  let houseQuery = supabase.from('houses').select('id, house_number, house_type_id, billing_profile_id, is_occupied, property_status, street:streets(name)').eq('is_active', true);
  if (houseId) houseQuery = houseQuery.eq('id', houseId);
  if (streetId) houseQuery = houseQuery.eq('street_id', streetId);

  const { data: houses, error: housesError } = await houseQuery;
  if (housesError) return { success: false, preview: [], skipList: [], summary: { totalHouses: 0, eligibleHouses: 0, totalResidents: 0, newInvoices: 0, existingInvoices: 0, totalAmount: 0, totalWalletDeductions: 0, warnings: [] }, error: housesError.message };

  for (const house of houses || []) {
    const houseLabel = `${house.house_number}`;

    // Get billing profile
    let billingProfile: BillingProfileWithItems | null = null;
    if (house.billing_profile_id) {
      const { data } = await supabase.from('billing_profiles').select('id, name, target_type, applicable_roles, is_one_time, billing_items(id, name, amount, frequency, is_mandatory)').eq('id', house.billing_profile_id).eq('is_active', true).single();
      billingProfile = data;
    }
    if (!billingProfile && house.house_type_id) {
      const { data: ht } = await supabase.from('house_types').select('billing_profile_id, billing_profile:billing_profiles(id, name, target_type, applicable_roles, is_one_time, billing_items(id, name, amount, frequency, is_mandatory))').eq('id', house.house_type_id).single();
      if (ht?.billing_profile) {
        const bp = Array.isArray(ht.billing_profile) ? ht.billing_profile[0] : ht.billing_profile;
        billingProfile = bp as unknown as BillingProfileWithItems;
      }
    }

    if (!billingProfile || billingProfile.is_one_time || billingProfile.target_type !== 'house') {
      skipList.push({ house: houseLabel, reason: billingProfile ? 'One-time or not house-targeted' : 'No billing profile' });
      continue;
    }

    // Get active residents
    const { data: links } = await supabase.from('resident_houses').select('id, resident_id, resident_role, move_in_date, resident:residents!resident_id(id, first_name, last_name, resident_code, account_status)').eq('house_id', house.id).eq('is_active', true);

    const activeLinks = links || [];
    if (activeLinks.length === 0) {
      skipList.push({ house: houseLabel, reason: 'No active residents' });
      warnings.push(`House ${houseLabel} is vacant`);
      continue;
    }

    // Find billable resident
    const tenant = activeLinks.find((l) => l.resident_role === 'tenant');
    const residentLandlord = activeLinks.find((l) => l.resident_role === 'resident_landlord');
    const billableLink = tenant || residentLandlord;
    if (!billableLink) {
      skipList.push({ house: houseLabel, reason: 'No tenant or resident landlord' });
      continue;
    }

    const resident = (billableLink.resident as unknown as { id: string; first_name: string; last_name: string; resident_code: string; account_status: string });
    if (resident.account_status !== 'active') {
      skipList.push({ house: houseLabel, reason: `Resident is ${resident.account_status}` });
      continue;
    }

    if (residentId && resident.id !== residentId) {
      skipList.push({ house: houseLabel, reason: 'Not in selected resident scope' });
      continue;
    }

    const monthlyItems = (billingProfile.billing_items || []).filter((i) => i.frequency === 'monthly');
    if (monthlyItems.length === 0) {
      skipList.push({ house: houseLabel, reason: 'No monthly billing items' });
      continue;
    }

    const fullMonthTotal = monthlyItems.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
    const moveInDate = new Date(billableLink.move_in_date || '2020-01-01');

    // Generate preview for active months from move-in to target
    let currentDate = new Date(Math.max(moveInDate.getFullYear(), targetMonth.getFullYear()), Math.max(moveInDate.getMonth(), 0), 1);
    if (currentDate.getTime() > targetMonth.getTime()) currentDate = targetMonth;

    while (currentDate <= targetEnd) {
      const periodStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const periodEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      const totalDays = periodEnd.getDate();

      const isFirstMonth = currentDate.getFullYear() === moveInDate.getFullYear() && currentDate.getMonth() === moveInDate.getMonth();
      let fraction = 1;
      let activeDays = totalDays;
      if (isFirstMonth) {
        activeDays = totalDays - moveInDate.getDate() + 1;
        fraction = activeDays / totalDays;
      }
      const amount = Math.round(fullMonthTotal * fraction);

      // Check if invoice already exists
      const { data: existing } = await supabase.from('invoices').select('id').eq('resident_id', resident.id).eq('house_id', house.id).eq('billing_profile_id', billingProfile.id).eq('period_start', periodStart.toISOString().split('T')[0]).eq('period_end', periodEnd.toISOString().split('T')[0]).maybeSingle();

      // Get wallet balance
      const { data: wallet } = await supabase.from('resident_wallets').select('balance').eq('resident_id', resident.id).single();
      const walletBalance = Number(wallet?.balance) || 0;

      const streetName = house.street ? (Array.isArray(house.street) ? (house.street[0] as { name: string })?.name || '' : (house.street as { name: string })?.name || '') : '';

      preview.push({
        houseId: house.id,
        houseNumber: house.house_number,
        streetName,
        residentId: resident.id,
        residentName: `${resident.first_name} ${resident.last_name}`,
        residentCode: resident.resident_code,
        periodStart: periodStart.toISOString().split('T')[0],
        periodEnd: periodEnd.toISOString().split('T')[0],
        amount,
        isProRata: isFirstMonth,
        isNew: !existing,
        walletBalance,
        walletAfterDeduction: !existing ? Math.max(0, walletBalance - amount) : walletBalance,
        billingProfileName: billingProfile.name,
      });

      currentDate.setMonth(currentDate.getMonth() + 1);
    }
  }

  const newInvoices = preview.filter((p) => p.isNew);
  const existingInvoices = preview.filter((p) => !p.isNew);

  return {
    success: true,
    preview,
    skipList,
    summary: {
      totalHouses: houses?.length || 0,
      eligibleHouses: new Set(preview.map((p) => p.houseId)).size,
      totalResidents: new Set(preview.map((p) => p.residentId)).size,
      newInvoices: newInvoices.length,
      existingInvoices: existingInvoices.length,
      totalAmount: newInvoices.reduce((s, p) => s + p.amount, 0),
      totalWalletDeductions: newInvoices.reduce((s, p) => s + Math.min(p.amount, p.walletBalance), 0),
      warnings,
    },
    error: null,
  };
}
