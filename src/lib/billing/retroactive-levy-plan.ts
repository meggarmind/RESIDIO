import { resolvePayer, type BillingPayer } from '@/lib/billing/payer';

/**
 * Dry run of `generateRetroactiveLevies` (#790): which houses would be charged which
 * one-time levies, computed from rows already read. Mirrors the skip rules of
 * `generateLeviesForHouse` in '@/actions/billing/generate-levies' -- keep them in step.
 */

export type LevyPlanProfile = {
  id: string;
  name: string;
  payer: string;
  target_type: string;
  applicable_roles: string[] | null;
  is_development_levy: boolean | null;
  charge_category: string;
  billing_items: { amount: number | null }[] | null;
};

export type RetroactiveLevyPlan = {
  autoGenerateEnabled: boolean;
  housesChecked: number;
  houses: number;
  invoices: number;
  totalAmount: number;
  alreadyCharged: number;
  /** The invoices and naira total above, split by the profile's charge category. */
  byCategory: Record<string, { invoices: number; totalAmount: number }>;
  /** Houses where a landlord-paid levy was not raised because no landlord is on record. */
  warnings: string[];
};

export function planRetroactiveLevies(input: {
  autoGenerateEnabled: boolean;
  houses: { id: string; label: string; vacant: boolean; newNeverOccupied: boolean }[];
  residentLinks: { house_id: string; resident_id: string; resident_role: string }[];
  profiles: LevyPlanProfile[];
  history: { house_id: string; billing_profile_id: string }[];
}): RetroactiveLevyPlan {
  const plan: RetroactiveLevyPlan = {
    autoGenerateEnabled: input.autoGenerateEnabled,
    housesChecked: input.houses.length,
    houses: 0,
    invoices: 0,
    totalAmount: 0,
    alreadyCharged: 0,
    byCategory: {},
    warnings: [],
  };
  // Every house returns early when the setting is off, so nothing is generated.
  if (!input.autoGenerateEnabled) return plan;

  const residentsByHouse = new Map<string, { id: string; role: string }[]>();
  for (const link of input.residentLinks) {
    const list = residentsByHouse.get(link.house_id) ?? [];
    list.push({ id: link.resident_id, role: link.resident_role });
    residentsByHouse.set(link.house_id, list);
  }
  const charged = new Set(input.history.map((h) => `${h.house_id}:${h.billing_profile_id}`));

  for (const house of input.houses) {
    const houseId = house.id;
    const residents = residentsByHouse.get(houseId) ?? [];
    let houseInvoices = 0;
    for (const profile of input.profiles) {
      const { payer, reason } = resolvePayer({
        payer: profile.payer as BillingPayer,
        targetType: profile.target_type,
        house: { vacant: house.vacant, newNeverOccupied: house.newNeverOccupied },
        applicableRoles: profile.applicable_roles,
        residents,
      });
      if (!payer) {
        if (reason === 'No landlord on record' && !charged.has(`${houseId}:${profile.id}`)) {
          plan.warnings.push(`House ${house.label}: no landlord on record, so "${profile.name}" would not be raised`);
        }
        continue;
      }
      if (charged.has(`${houseId}:${profile.id}`)) {
        plan.alreadyCharged++;
        continue;
      }
      const total = (profile.billing_items || []).reduce((sum, item) => sum + (item.amount || 0), 0);
      if (total === 0) continue;
      houseInvoices++;
      plan.totalAmount += total;
      const category = plan.byCategory[profile.charge_category] ?? { invoices: 0, totalAmount: 0 };
      category.invoices++;
      category.totalAmount += total;
      plan.byCategory[profile.charge_category] = category;
    }
    if (houseInvoices > 0) {
      plan.houses++;
      plan.invoices += houseInvoices;
    }
  }
  return plan;
}
