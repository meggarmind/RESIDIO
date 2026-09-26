'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import type { HouseType } from '@/types/database';
import type { HouseTypeFormData } from '@/lib/validators/house';
import { logAudit } from '@/lib/audit/logger';

type CreateHouseTypeResponse = {
  data: HouseType | null;
  error: string | null;
}

export async function createHouseType(formData: HouseTypeFormData): Promise<CreateHouseTypeResponse> {
  const auth = await authorizePermission(PERMISSIONS.SETTINGS_MANAGE_REFERENCE);
  if (!auth.authorized) {
    return { data: null, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('house_types')
    .insert({
      name: formData.name,
      description: formData.description || null,
      max_residents: formData.max_residents,
      billing_profile_id: formData.billing_profile_id || null, // Updated mapping
      created_by: auth.userId,
    })
    .select()
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  await logAudit({
    action: 'CREATE',
    entityType: 'house_types',
    entityId: data.id,
    entityDisplay: data.name,
    newValues: data,
  });

  return { data, error: null };
}
