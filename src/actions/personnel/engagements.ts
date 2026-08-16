'use server';

import { authorizePermission } from '@/lib/auth/authorize';
import { logAudit } from '@/lib/audit/logger';
import { createAdminClient } from '@/lib/supabase/server';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import type { Personnel, PersonnelEngagement, PersonnelInsert } from '@/types/database';
import { revalidatePath } from 'next/cache';

interface EstateEngagementInput {
  personnelId: string;
  responsibility?: string | null;
  startDate: string;
  endDate?: string | null;
}

export interface ActiveResidentHouseOption {
  id: string;
  houseNumber: string;
  streetName: string | null;
  residentName: string;
}

const sanitize = (value?: string | null) => value?.trim() || null;

export async function createPersonnelWithEstateEngagement(
  personnel: PersonnelInsert,
  engagement: Omit<EstateEngagementInput, 'personnelId'>
): Promise<{ data: Personnel | null; error: string | null }> {
  const { authorized } = await authorizePermission(PERMISSIONS.VENDORS_MANAGE);
  if (!authorized) return { data: null, error: 'Unauthorized' };

  const supabase = createAdminClient();
  const { data: personnelId, error } = await supabase.rpc('create_personnel_with_estate_engagement', {
    p_personnel: personnel,
    p_responsibility: sanitize(engagement.responsibility),
    p_start_date: engagement.startDate,
    p_end_date: engagement.endDate || null,
  });
  if (error || !personnelId) return { data: null, error: error?.message || 'Failed to create personnel engagement.' };

  const { data, error: readError } = await supabase.from('vendors').select('*').eq('id', personnelId).single();
  if (readError) return { data: null, error: 'Personnel was created but could not be read.' };

  const { data: createdEngagement, error: engagementReadError } = await supabase
    .from('personnel_engagements')
    .select('id')
    .eq('personnel_id', personnelId)
    .eq('accountability_scope', 'estate')
    .single();
  if (engagementReadError || !createdEngagement) return { data: null, error: 'Personnel was created but its engagement could not be read.' };

  await logAudit({ action: 'CREATE', entityType: 'vendors', entityId: data.id, entityDisplay: `Personnel: ${data.name}`, newValues: data });
  await logAudit({ action: 'CREATE', entityType: 'personnel_engagements', entityId: createdEngagement.id, entityDisplay: 'Estate engagement', newValues: { personnel_id: personnelId, accountability_scope: 'estate' } });
  revalidatePath('/personnel');
  return { data: data as Personnel, error: null };
}

export async function createEstateEngagement(
  input: EstateEngagementInput
): Promise<{ data: PersonnelEngagement | null; error: string | null }> {
  const { authorized } = await authorizePermission(PERMISSIONS.VENDORS_MANAGE);
  if (!authorized) return { data: null, error: 'Unauthorized' };

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('personnel_engagements')
    .insert({
      personnel_id: input.personnelId,
      accountability_scope: 'estate',
      responsibility: sanitize(input.responsibility),
      start_date: input.startDate,
      end_date: input.endDate || null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return { data: null, error: 'This personnel record already has an active Estate engagement.' };
    }
    return { data: null, error: 'Failed to create Estate engagement.' };
  }

  await logAudit({
    action: 'CREATE',
    entityType: 'personnel_engagements',
    entityId: data.id,
    entityDisplay: 'Estate engagement',
    newValues: data,
  });

  revalidatePath('/personnel');

  return { data, error: null };
}

export async function updateEstateEngagement(
  engagementId: string,
  input: Omit<EstateEngagementInput, 'personnelId'>
): Promise<{ data: PersonnelEngagement | null; error: string | null }> {
  const { authorized } = await authorizePermission(PERMISSIONS.VENDORS_MANAGE);
  if (!authorized) return { data: null, error: 'Unauthorized' };

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('personnel_engagements')
    .update({
      responsibility: sanitize(input.responsibility),
      start_date: input.startDate,
      end_date: input.endDate || null,
    })
    .eq('id', engagementId)
    .eq('accountability_scope', 'estate')
    .select()
    .single();

  if (error) return { data: null, error: 'Failed to update Estate engagement.' };

  await logAudit({
    action: 'UPDATE',
    entityType: 'personnel_engagements',
    entityId: data.id,
    entityDisplay: 'Estate engagement',
    newValues: data,
  });

  revalidatePath('/personnel');

  return { data, error: null };
}

export async function getActiveResidentHouses(): Promise<{ data: ActiveResidentHouseOption[]; error: string | null }> {
  const { authorized } = await authorizePermission(PERMISSIONS.VENDORS_VIEW);
  if (!authorized) return { data: [], error: 'Unauthorized' };
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('resident_houses')
    .select('id, resident_id, house_id')
    .eq('is_active', true);
  if (error) return { data: [], error: 'Failed to fetch active Resident Houses' };
  const residentIds = [...new Set((data ?? []).map((row) => row.resident_id))];
  const houseIds = [...new Set((data ?? []).map((row) => row.house_id))];
  const [{ data: residents }, { data: houses }] = await Promise.all([
    residentIds.length ? supabase.from('residents').select('id, first_name, last_name').in('id', residentIds) : { data: [] },
    houseIds.length ? supabase.from('houses').select('id, house_number, street_id').in('id', houseIds) : { data: [] },
  ]);
  const streetIds = [...new Set((houses ?? []).map((house) => house.street_id).filter((id): id is string => !!id))];
  const { data: streets } = streetIds.length ? await supabase.from('streets').select('id, name').in('id', streetIds) : { data: [] };
  const residentsById = new Map((residents ?? []).map((resident) => [resident.id, `${resident.first_name} ${resident.last_name}`]));
  const streetsById = new Map((streets ?? []).map((street) => [street.id, street.name]));
  const housesById = new Map((houses ?? []).map((house) => [house.id, house]));
  return {
    data: (data ?? []).map((row) => ({
      id: row.id,
      houseNumber: housesById.get(row.house_id)?.house_number ?? 'House',
      streetName: housesById.get(row.house_id)?.street_id ? streetsById.get(housesById.get(row.house_id)?.street_id as string) ?? null : null,
      residentName: residentsById.get(row.resident_id) ?? 'Resident',
    })),
    error: null,
  };
}

export async function createResidentHouseEngagement(input: {
  personnelId: string;
  residentHouseId: string;
  responsibility?: string | null;
  startDate: string;
  endDate?: string | null;
}): Promise<{ data: PersonnelEngagement | null; error: string | null }> {
  const { authorized } = await authorizePermission(PERMISSIONS.VENDORS_MANAGE);
  if (!authorized) return { data: null, error: 'Unauthorized' };
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('create_personnel_resident_house_engagement', {
    p_personnel_id: input.personnelId,
    p_resident_house_id: input.residentHouseId,
    p_responsibility: sanitize(input.responsibility),
    p_start_date: input.startDate,
    p_end_date: input.endDate || null,
  });
  if (error || !data) {
    if (error?.code === '23505') return { data: null, error: 'This personnel already has an active engagement for that Resident House.' };
    return { data: null, error: error?.message || 'Failed to create Resident-House engagement.' };
  }
  const { data: engagement, error: readError } = await supabase.from('personnel_engagements').select('*').eq('id', data).single();
  if (readError || !engagement) return { data: null, error: 'Engagement was created but could not be read.' };
  await logAudit({ action: 'CREATE', entityType: 'personnel_engagements', entityId: engagement.id, entityDisplay: 'Resident-House engagement', newValues: engagement });
  revalidatePath('/personnel');
  return { data: engagement as PersonnelEngagement, error: null };
}

export async function updateResidentHouseEngagement(
  engagementId: string,
  input: Omit<EstateEngagementInput, 'personnelId'>
): Promise<{ data: PersonnelEngagement | null; error: string | null }> {
  const { authorized } = await authorizePermission(PERMISSIONS.VENDORS_MANAGE);
  if (!authorized) return { data: null, error: 'Unauthorized' };
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('personnel_engagements')
    .update({
      responsibility: sanitize(input.responsibility),
      start_date: input.startDate,
      end_date: input.endDate || null,
    })
    .eq('id', engagementId)
    .eq('accountability_scope', 'resident_house')
    .select()
    .single();
  if (error) return { data: null, error: 'Failed to update Resident-House engagement.' };
  await logAudit({
    action: 'UPDATE',
    entityType: 'personnel_engagements',
    entityId: data.id,
    entityDisplay: 'Resident-House engagement',
    newValues: data,
  });
  revalidatePath('/personnel');
  return { data, error: null };
}

export async function endPersonnelEngagement(engagementId: string, endDate = new Date().toISOString().slice(0, 10)) {
  const { authorized } = await authorizePermission(PERMISSIONS.VENDORS_MANAGE);
  if (!authorized) return { data: null, error: 'Unauthorized' };
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('personnel_engagements')
    .update({ end_date: endDate })
    .eq('id', engagementId)
    .is('end_date', null)
    .select()
    .single();
  if (error) return { data: null, error: 'Failed to end engagement.' };
  await logAudit({ action: 'UPDATE', entityType: 'personnel_engagements', entityId: data.id, entityDisplay: 'Ended personnel engagement', newValues: data });
  revalidatePath('/personnel');
  return { data, error: null };
}
