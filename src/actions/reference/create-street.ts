'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import type { Street } from '@/types/database';
import type { StreetFormData } from '@/lib/validators/house';
import { logAudit } from '@/lib/audit/logger';

type CreateStreetResponse = {
  data: Street | null;
  error: string | null;
}

export async function createStreet(formData: StreetFormData): Promise<CreateStreetResponse> {
  const auth = await authorizePermission(PERMISSIONS.SETTINGS_MANAGE_REFERENCE);
  if (!auth.authorized) {
    return { data: null, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('streets')
    .insert({
      name: formData.name,
      short_name: formData.short_name || null,
      description: formData.description || null,
      created_by: auth.userId,
    })
    .select()
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  await logAudit({
    action: 'CREATE',
    entityType: 'streets',
    entityId: data.id,
    entityDisplay: data.name,
    newValues: data,
  });

  return { data, error: null };
}
