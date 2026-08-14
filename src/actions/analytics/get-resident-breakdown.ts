'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { RESIDENT_ROLE_LABELS, type ResidentRole, type PrimaryResidentRole } from '@/types/database';
import type { CategoryData } from '@/types/analytics';

const PRIMARY_ROLES: PrimaryResidentRole[] = ['resident_landlord', 'non_resident_landlord', 'tenant', 'developer'];

export interface ResidentRoleBreakdown {
  role: ResidentRole;
  label: string;
  count: number;
  isPrimary: boolean;
}

export interface ResidentAnalytics {
  byRole: ResidentRoleBreakdown[];
  byEntityType: CategoryData[];
  byResidentType: { primary: number; secondary: number };
  byAccountStatus: { active: number; inactive: number; pendingVerification: number };
  totalActiveAssignments: number;
  lastUpdated: string;
}

export async function getResidentAnalytics(): Promise<{ data: ResidentAnalytics | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  try {
    const [assignmentsResult, residentsResult] = await Promise.all([
      supabase.from('resident_houses').select('resident_role').eq('is_active', true),
      supabase.from('residents').select('entity_type, resident_type, account_status, verification_status'),
    ]);

    if (assignmentsResult.error) {
      return { data: null, error: assignmentsResult.error.message };
    }
    if (residentsResult.error) {
      return { data: null, error: residentsResult.error.message };
    }

    // Role breakdown (from resident_houses junction table, all 9 roles 0-filled)
    const roleCounts = new Map<ResidentRole, number>();
    (Object.keys(RESIDENT_ROLE_LABELS) as ResidentRole[]).forEach((role) => roleCounts.set(role, 0));
    assignmentsResult.data?.forEach((row) => {
      const role = row.resident_role as ResidentRole;
      roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
    });

    const byRole: ResidentRoleBreakdown[] = Array.from(roleCounts.entries()).map(([role, count]) => ({
      role,
      label: RESIDENT_ROLE_LABELS[role],
      count,
      isPrimary: (PRIMARY_ROLES as string[]).includes(role),
    }));

    // Entity type / resident type / account status breakdown (from residents table)
    const entityCounts = new Map<string, number>();
    const residentTypeCounts = { primary: 0, secondary: 0 };
    const accountStatusCounts = { active: 0, inactive: 0, pendingVerification: 0 };

    residentsResult.data?.forEach((row) => {
      const entityType = row.entity_type || 'individual';
      entityCounts.set(entityType, (entityCounts.get(entityType) ?? 0) + 1);

      if (row.resident_type === 'primary') residentTypeCounts.primary++;
      else if (row.resident_type === 'secondary') residentTypeCounts.secondary++;

      if (row.account_status === 'active') accountStatusCounts.active++;
      else if (row.account_status === 'inactive') accountStatusCounts.inactive++;
      if (row.verification_status === 'pending' || row.verification_status === 'submitted') {
        accountStatusCounts.pendingVerification++;
      }
    });

    const totalResidents = residentsResult.data?.length ?? 0;
    const byEntityType: CategoryData[] = Array.from(entityCounts.entries()).map(([category, count]) => ({
      category: category.charAt(0).toUpperCase() + category.slice(1),
      count,
      amount: 0,
      percentage: totalResidents > 0 ? Math.round((count / totalResidents) * 100) : 0,
    }));

    const data: ResidentAnalytics = {
      byRole,
      byEntityType,
      byResidentType: residentTypeCounts,
      byAccountStatus: accountStatusCounts,
      totalActiveAssignments: assignmentsResult.data?.length ?? 0,
      lastUpdated: new Date().toISOString(),
    };

    return { data, error: null };
  } catch (err) {
    console.error('[getResidentAnalytics] error:', err);
    return { data: null, error: 'Failed to fetch resident analytics' };
  }
}
