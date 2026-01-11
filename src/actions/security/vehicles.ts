'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { VisitorVehicle, VisitorVehicleWithContact } from '@/types/database';
import type {
  CreateVisitorVehicleData,
  UpdateVisitorVehicleData,
} from '@/lib/validators/security-contact';
import { hasSecurityPermission } from './settings';
import { logAudit } from '@/lib/audit/logger';
import { getChangedValues } from '@/lib/audit/helpers';

type VehicleResponse = {
  data: VisitorVehicle | null;
  error: string | null;
};

type VehiclesResponse = {
  data: VisitorVehicle[];
  count: number;
  error: string | null;
};

/**
 * Gets all vehicles for a specific security contact
 */
export async function getContactVehicles(contactId: string): Promise<VehiclesResponse> {
  const supabase = await createServerSupabaseClient();

  // Check permission
  const canView = await hasSecurityPermission('view_contacts');
  if (!canView) {
    return { data: [], count: 0, error: 'Permission denied' };
  }

  const { data, error, count } = await supabase
    .from('visitor_vehicles')
    .select('*', { count: 'exact' })
    .eq('contact_id', contactId)
    .eq('is_active', true)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Get contact vehicles error:', error);
    return { data: [], count: 0, error: 'Failed to fetch vehicles' };
  }

  return { data: data || [], count: count || 0, error: null };
}

/**
 * Gets a single vehicle by ID
 */
export async function getVehicle(vehicleId: string): Promise<VehicleResponse> {
  const supabase = await createServerSupabaseClient();

  const canView = await hasSecurityPermission('view_contacts');
  if (!canView) {
    return { data: null, error: 'Permission denied' };
  }

  const { data, error } = await supabase
    .from('visitor_vehicles')
    .select('*')
    .eq('id', vehicleId)
    .single();

  if (error) {
    console.error('Get vehicle error:', error);
    return { data: null, error: 'Vehicle not found' };
  }

  return { data, error: null };
}

/**
 * Searches vehicles by plate number across all contacts
 */
export async function searchVehicleByPlate(
  plateNumber: string
): Promise<{ data: VisitorVehicleWithContact | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  const canView = await hasSecurityPermission('view_contacts');
  if (!canView) {
    return { data: null, error: 'Permission denied' };
  }

  // Normalize plate number (remove spaces, uppercase)
  const normalizedPlate = plateNumber.replace(/\s+/g, '').toUpperCase();

  const { data, error } = await supabase
    .from('visitor_vehicles')
    .select(`
      *,
      contact:security_contacts(
        id,
        full_name,
        phone_primary,
        status,
        resident:residents(
          id,
          first_name,
          last_name,
          resident_code
        )
      )
    `)
    .ilike('plate_number', `%${normalizedPlate}%`)
    .eq('is_active', true)
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No rows returned
      return { data: null, error: null };
    }
    console.error('Search vehicle error:', error);
    return { data: null, error: 'Search failed' };
  }

  return { data: data as unknown as VisitorVehicleWithContact, error: null };
}

/**
 * Creates a new vehicle registration for a security contact
 */
export async function createVehicle(formData: CreateVisitorVehicleData): Promise<VehicleResponse> {
  const supabase = await createServerSupabaseClient();

  // Check permission
  const canRegister = await hasSecurityPermission('register_contacts');
  if (!canRegister) {
    return { data: null, error: 'Permission denied: Cannot register vehicles' };
  }

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { data: null, error: 'Unauthorized' };
  }

  // Verify contact exists
  const { data: contact, error: contactError } = await supabase
    .from('security_contacts')
    .select('id, full_name, status')
    .eq('id', formData.contact_id)
    .single();

  if (contactError || !contact) {
    return { data: null, error: 'Security contact not found' };
  }

  if (contact.status !== 'active') {
    return { data: null, error: 'Cannot add vehicles to inactive contacts' };
  }

  // Normalize plate number
  const normalizedPlate = formData.plate_number.replace(/\s+/g, '').toUpperCase();

  // Check for duplicate plate number
  const { data: existingVehicle } = await supabase
    .from('visitor_vehicles')
    .select('id')
    .eq('plate_number', normalizedPlate)
    .eq('is_active', true)
    .limit(1)
    .single();

  if (existingVehicle) {
    return { data: null, error: 'A vehicle with this plate number is already registered' };
  }

  // If this is marked as primary, unset other primary vehicles
  if (formData.is_primary) {
    await supabase
      .from('visitor_vehicles')
      .update({ is_primary: false })
      .eq('contact_id', formData.contact_id)
      .eq('is_primary', true);
  }

  // Create the vehicle
  const { data: vehicle, error: createError } = await supabase
    .from('visitor_vehicles')
    .insert({
      contact_id: formData.contact_id,
      vehicle_type: formData.vehicle_type || 'car',
      plate_number: normalizedPlate,
      make: formData.make || null,
      model: formData.model || null,
      color: formData.color || null,
      year: formData.year || null,
      photo_url: formData.photo_url || null,
      is_primary: formData.is_primary || false,
      notes: formData.notes || null,
      created_by: user.id,
    })
    .select()
    .single();

  if (createError) {
    console.error('Create vehicle error:', createError);
    return { data: null, error: 'Failed to create vehicle registration' };
  }

  // Audit log
  await logAudit({
    action: 'CREATE',
    entityType: 'visitor_vehicles',
    entityId: vehicle.id,
    entityDisplay: `${formData.vehicle_type?.toUpperCase() || 'CAR'} - ${normalizedPlate} (${contact.full_name})`,
    newValues: vehicle,
  });

  revalidatePath('/security');
  revalidatePath('/security/contacts');
  revalidatePath(`/security/contacts/${formData.contact_id}`);

  return { data: vehicle, error: null };
}

/**
 * Updates an existing vehicle registration
 */
export async function updateVehicle(formData: UpdateVisitorVehicleData): Promise<VehicleResponse> {
  const supabase = await createServerSupabaseClient();

  // Check permission
  const canUpdate = await hasSecurityPermission('update_contacts');
  if (!canUpdate) {
    return { data: null, error: 'Permission denied: Cannot update vehicles' };
  }

  const { id, ...updateData } = formData;

  // Get existing vehicle for audit
  const { data: existingVehicle, error: fetchError } = await supabase
    .from('visitor_vehicles')
    .select('*, contact:security_contacts(full_name)')
    .eq('id', id)
    .single();

  if (fetchError || !existingVehicle) {
    return { data: null, error: 'Vehicle not found' };
  }

  // Build update object
  const updateObject: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updateData)) {
    if (value !== undefined && value !== '') {
      if (key === 'plate_number' && typeof value === 'string') {
        updateObject[key] = value.replace(/\s+/g, '').toUpperCase();
      } else {
        updateObject[key] = value;
      }
    } else if (value === '') {
      updateObject[key] = null;
    }
  }

  if (Object.keys(updateObject).length === 0) {
    return { data: existingVehicle as VisitorVehicle, error: null };
  }

  // If setting as primary, unset other primary vehicles
  if (updateObject.is_primary === true) {
    await supabase
      .from('visitor_vehicles')
      .update({ is_primary: false })
      .eq('contact_id', existingVehicle.contact_id)
      .eq('is_primary', true)
      .neq('id', id);
  }

  const { data: vehicle, error: updateError } = await supabase
    .from('visitor_vehicles')
    .update(updateObject)
    .eq('id', id)
    .select()
    .single();

  if (updateError) {
    console.error('Update vehicle error:', updateError);
    return { data: null, error: 'Failed to update vehicle' };
  }

  // Audit log with changes
  const changes = getChangedValues(existingVehicle, vehicle);
  if (Object.keys(changes.new).length > 0) {
    const contactData = existingVehicle.contact as { full_name: string } | null;
    await logAudit({
      action: 'UPDATE',
      entityType: 'visitor_vehicles',
      entityId: vehicle.id,
      entityDisplay: `${vehicle.vehicle_type.toUpperCase()} - ${vehicle.plate_number} (${contactData?.full_name || 'Unknown'})`,
      oldValues: changes.old,
      newValues: changes.new,
    });
  }

  revalidatePath('/security');
  revalidatePath('/security/contacts');

  return { data: vehicle, error: null };
}

/**
 * Deactivates a vehicle registration (soft delete)
 */
export async function deactivateVehicle(
  vehicleId: string
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  // Check permission
  const canDelete = await hasSecurityPermission('suspend_revoke_contacts');
  if (!canDelete) {
    return { success: false, error: 'Permission denied' };
  }

  // Get existing vehicle for audit
  const { data: existingVehicle, error: fetchError } = await supabase
    .from('visitor_vehicles')
    .select('*, contact:security_contacts(full_name)')
    .eq('id', vehicleId)
    .single();

  if (fetchError || !existingVehicle) {
    return { success: false, error: 'Vehicle not found' };
  }

  // Soft delete by setting is_active to false
  const { error: updateError } = await supabase
    .from('visitor_vehicles')
    .update({ is_active: false })
    .eq('id', vehicleId);

  if (updateError) {
    console.error('Deactivate vehicle error:', updateError);
    return { success: false, error: 'Failed to deactivate vehicle' };
  }

  // Audit log
  const contactData = existingVehicle.contact as { full_name: string } | null;
  await logAudit({
    action: 'DELETE',
    entityType: 'visitor_vehicles',
    entityId: vehicleId,
    entityDisplay: `${existingVehicle.vehicle_type.toUpperCase()} - ${existingVehicle.plate_number} (${contactData?.full_name || 'Unknown'})`,
    oldValues: existingVehicle,
  });

  revalidatePath('/security');
  revalidatePath('/security/contacts');

  return { success: true, error: null };
}

/**
 * Sets a vehicle as primary for a contact
 */
export async function setPrimaryVehicle(
  vehicleId: string
): Promise<VehicleResponse> {
  const supabase = await createServerSupabaseClient();

  const canUpdate = await hasSecurityPermission('update_contacts');
  if (!canUpdate) {
    return { data: null, error: 'Permission denied' };
  }

  // Get the vehicle
  const { data: vehicle, error: fetchError } = await supabase
    .from('visitor_vehicles')
    .select('contact_id')
    .eq('id', vehicleId)
    .single();

  if (fetchError || !vehicle) {
    return { data: null, error: 'Vehicle not found' };
  }

  // Unset other primary vehicles for this contact
  await supabase
    .from('visitor_vehicles')
    .update({ is_primary: false })
    .eq('contact_id', vehicle.contact_id)
    .eq('is_primary', true);

  // Set this vehicle as primary
  const { data: updatedVehicle, error: updateError } = await supabase
    .from('visitor_vehicles')
    .update({ is_primary: true })
    .eq('id', vehicleId)
    .select()
    .single();

  if (updateError) {
    console.error('Set primary vehicle error:', updateError);
    return { data: null, error: 'Failed to set primary vehicle' };
  }

  revalidatePath('/security');
  revalidatePath('/security/contacts');

  return { data: updatedVehicle, error: null };
}
