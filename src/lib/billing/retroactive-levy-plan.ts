import { Constants } from '@/types/database.generated';

/**
 * Dry run of `generateRetroactiveLevies` (#790): which houses would be charged which
 * one-time levies, computed from rows already read. Mirrors the skip rules of
 * `generateLeviesForHouse` in '@/actions/billing/generate-levies' -- keep them in step.
 */

export const LEVY_BILLABLE_ROLES = ['resident_landlord', 'non_resident_landlord', 'developer', 'tenant'] as const;

// `generateLeviesForHouse` picks the house's billable resident with
// `.order('resident_role', { ascending: true }).limit(1)`: Postgres sorts an enum by its
// declaration order, which Constants lists in the same order.
const ROLE_ORDER: readonly string[] = Constants.public.Enums.resident_role;

export type LevyPlanProfile = {
  id: string;
  name: string;
  target_type: string | null;
  applicable_roles: string[] | null;
  is_development_levy: boolean | null;
  billing_items: { amount: number | null }[] | null;
};

export type RetroactiveLevyPlan = {
  autoGenerateEnabled: boolean;
  housesChecked: number;
  houses: number;
  invoices: number;
  totalAmount: number;
  alreadyCharged: number;
};

export function planRetroactiveLevies(input: {
  autoGenerateEnabled: boolean;
  houseIds: string[];
  residentLinks: { house_id: string; resident_role: string }[];
  profiles: LevyPlanProfile[];
  history: { house_id: string; billing_profile_id: string }[];
}): RetroactiveLevyPlan {
  const plan: RetroactiveLevyPlan = {
    autoGenerateEnabled: input.autoGenerateEnabled,
    housesChecked: input.houseIds.length,
    houses: 0,
    invoices: 0,
    totalAmount: 0,
    alreadyCharged: 0,
  };
  // Every house returns early when the setting is off, so nothing is generated.
  if (!input.autoGenerateEnabled) return plan;

  const primaryRole = new Map<string, string>();
  for (const link of input.residentLinks) {
    if (!(LEVY_BILLABLE_ROLES as readonly string[]).includes(link.resident_role)) continue;
    const current = primaryRole.get(link.house_id);
    if (current === undefined || ROLE_ORDER.indexOf(link.resident_role) < ROLE_ORDER.indexOf(current)) {
      primaryRole.set(link.house_id, link.resident_role);
    }
  }
  const charged = new Set(input.history.map((h) => `${h.house_id}:${h.billing_profile_id}`));

  for (const houseId of input.houseIds) {
    const role = primaryRole.get(houseId);
    if (!role) continue;
    let houseInvoices = 0;
    for (const profile of input.profiles) {
      const isDevelopmentLevy = profile.is_development_levy === true || profile.name.toLowerCase().includes('development');
      if (isDevelopmentLevy && role === 'tenant') continue;
      if (profile.target_type === 'resident' && profile.applicable_roles && !profile.applicable_roles.includes(role)) continue;
      if (charged.has(`${houseId}:${profile.id}`)) {
        plan.alreadyCharged++;
        continue;
      }
      const total = (profile.billing_items || []).reduce((sum, item) => sum + (item.amount || 0), 0);
      if (total === 0) continue;
      houseInvoices++;
      plan.totalAmount += total;
    }
    if (houseInvoices > 0) {
      plan.houses++;
      plan.invoices += houseInvoices;
    }
  }
  return plan;
}
