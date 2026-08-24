'use server';

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { sanitizeSearchInput } from '@/lib/utils';
import type { ResidentWithHouses } from '@/types/database';
import type { ResidentSearchParams } from '@/lib/validators/resident';

// Type moved to avoid 'use server' export restriction
type GetResidentsResponse = {
  data: ResidentWithHouses[];
  count: number;
  error: string | null;
};

export async function getResidents(params: Partial<ResidentSearchParams> = {}): Promise<GetResidentsResponse> {
  const auth = await authorizePermission(PERMISSIONS.RESIDENTS_VIEW);
  if (!auth.authorized) {
    return { data: [], count: 0, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();
  const { search, status, verification, contact_verification, type, street_id, house_id, resident_role, sort_by, sort_order, page = 1, limit = 20 } = params;

  // Join with resident_houses and houses for filtering
  // If we filter by house-related fields, we use inner join (via !inner)
  // to filter the parent residents records.
  let selectQuery = `
    id, resident_code, first_name, last_name, email, phone_primary,
    resident_type, verification_status, account_status, entity_type,
    company_name, email_verified_at, phone_verified_at, created_at,
    resident_houses!resident_id(
      id, resident_id, house_id, resident_role, is_primary, move_in_date,
      move_out_date, is_active, sponsor_resident_id,
      house:houses(
        id, house_number, street_id, house_type_id, short_name,
        is_occupied, is_active,
        street:streets(id, name),
        house_type:house_types(id, name)
      )
    )
  `;

  // Determine if we need to use inner join for filtering
  const needsInnerJoin = !!(street_id || house_id || resident_role);
  if (needsInnerJoin) {
    // Use resident_id!inner to specify the FK and enable inner join filtering
    selectQuery = `
      id, resident_code, first_name, last_name, email, phone_primary,
      resident_type, verification_status, account_status, entity_type,
      company_name, email_verified_at, phone_verified_at, created_at,
      resident_houses!resident_id!inner(
        id, resident_id, house_id, resident_role, is_primary, move_in_date,
        move_out_date, is_active, sponsor_resident_id,
        house:houses!inner(
          id, house_number, street_id, house_type_id, short_name,
          is_occupied, is_active,
          street:streets(id, name),
          house_type:house_types(id, name)
        )
      )
    `;
  }

  let query = supabase
    .from('residents')
    .select(selectQuery, { count: 'exact' });

  // Apply basic filters
  if (search) {
    const sanitized = sanitizeSearchInput(search);
    query = query.or(`first_name.ilike.%${sanitized}%,last_name.ilike.%${sanitized}%,resident_code.eq.${search},phone_primary.ilike.%${sanitized}%`);
  }
  if (status) {
    query = query.eq('account_status', status);
  }
  if (verification) {
    query = query.eq('verification_status', verification);
  }
  if (type) {
    query = query.eq('resident_type', type);
  }

  // Apply house-related filters at database level
  if (street_id) {
    query = query.eq('resident_houses.house.street_id', street_id)
      .eq('resident_houses.is_active', true);
  }

  if (house_id) {
    query = query.eq('resident_houses.house_id', house_id)
      .eq('resident_houses.is_active', true);
  }

  if (resident_role && resident_role.length > 0) {
    query = query.in('resident_houses.resident_role', resident_role)
      .eq('resident_houses.is_active', true);
  }

  if (contact_verification === 'verified') {
    query = query.or('email.is.null,email_verified_at.not.is.null')
      .not('phone_verified_at', 'is', null);
  } else if (contact_verification === 'unverified') {
    query = query.is('email_verified_at', null)
      .is('phone_verified_at', null);
  } else if (contact_verification === 'partial') {
    query = query.or('email_verified_at.is.null,phone_verified_at.is.null')
      .or('email_verified_at.not.is.null,phone_verified_at.not.is.null');
  }

  // Pagination + sorting
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const ascending = sort_order !== 'desc';
  if (sort_by === 'resident_code') {
    query = query.range(from, to).order('resident_code', { ascending });
  } else if (sort_by === 'first_name') {
    query = query.range(from, to).order('first_name', { ascending }).order('last_name', { ascending });
  } else if (sort_by === 'house_number') {
    // house_number lives on the joined houses table — sort by it via referencedTable
    query = query.range(from, to).order('house_number', { ascending, referencedTable: 'resident_houses.house' });
  } else {
    query = query.range(from, to).order('created_at', { ascending: false });
  }

  const { data, error, count } = await query;

  return {
    data: (data as unknown as ResidentWithHouses[]) ?? [],
    count: count ?? 0,
    error: error?.message ?? null,
  };
}

/**
 * Get all active residents (simple list for dropdowns)
 */
export async function getActiveResidents(): Promise<{
  data: Array<{ id: string; first_name: string; last_name: string; resident_code: string }>;
  error: string | null;
}> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('residents')
    .select('id, first_name, last_name, resident_code')
    .eq('account_status', 'active')
    .order('first_name');

  return {
    data: data || [],
    error: error?.message ?? null,
  };
}
