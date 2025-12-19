'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { HouseType } from '@/types/database';
import type { HouseTypeFormData } from '@/lib/validators/house';

export interface CreateHouseTypeResponse {
  data: HouseType | null;
  error: string | null;
}

export async function createHouseType(formData: HouseTypeFormData): Promise<CreateHouseTypeResponse> {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { data: null, error: 'Unauthorized' };
  }

  const { data, error } = await supabase
    .from('house_types')
    .insert({
      name: formData.name,
      description: formData.description || null,
      max_residents: formData.max_residents,
      billing_profile_id: formData.billing_profile_id || null, // Updated mapping
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data, error: null };
}
