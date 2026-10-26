'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit/logger';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { MAX_LOGO_BYTES, SNIFFED_MIME, checkSizeCap, matchesAllowedType, type SniffedType } from '@/lib/uploads';

// PNG and JPEG only: SVG can carry script and the logos bucket is public, and WebP does not render in PDFs or every email client (#1202).
const ALLOWED_LOGO_TYPES: ReadonlyArray<SniffedType> = ['png', 'jpeg'];
const LOGO_EXTENSION: Record<string, string> = { png: 'png', jpeg: 'jpg' };

type UploadLogoResponse = {
  data: { url: string } | null;
  error: string | null;
};

/**
 * Validates the logo file by size and by content (magic bytes), never by the
 * client-supplied MIME type or file name.
 */
async function validateLogoFile(
  file: File
): Promise<{ valid: boolean; error: string | null; type: SniffedType | null }> {
  const sizeError = checkSizeCap(file.size, MAX_LOGO_BYTES, 'Logo');
  if (sizeError) return { valid: false, error: sizeError, type: null };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = matchesAllowedType(bytes, ALLOWED_LOGO_TYPES);
  if (!type) {
    return { valid: false, error: 'File type not allowed. Please upload a PNG or JPEG image.', type: null };
  }
  return { valid: true, error: null, type };
}

/**
 * Upload estate logo and update the setting
 */
export async function uploadEstateLogo(formData: FormData): Promise<UploadLogoResponse> {
  const auth = await authorizePermission(PERMISSIONS.SETTINGS_MANAGE_GENERAL);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };

  const supabase = await createServerSupabaseClient();

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { data: null, error: 'Not authenticated' };
  }

  // Extract file from form data
  const file = formData.get('file') as File;

  if (!file) {
    return { data: null, error: 'No file provided' };
  }

  // Validate file
  const validation = await validateLogoFile(file);
  if (!validation.valid || !validation.type) {
    return { data: null, error: validation.error };
  }

  // Get current logo URL to delete old file if exists
  const { data: currentSetting } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'estate_logo_url')
    .single();

  // Generate a unique file name
  const filePath = `estate-logo-${globalThis.crypto.randomUUID()}.${LOGO_EXTENSION[validation.type]}`;

  // Upload to Supabase Storage (using 'logos' bucket)
  const { error: uploadError } = await supabase.storage
    .from('logos')
    .upload(filePath, file, {
      contentType: SNIFFED_MIME[validation.type],
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) {
    console.error('Logo upload error:', uploadError);
    return { data: null, error: `Upload failed: ${uploadError.message}` };
  }

  // Get the public URL
  const { data: { publicUrl } } = supabase.storage
    .from('logos')
    .getPublicUrl(filePath);

  // Update or insert the setting
  const { data: savedSetting, error: settingError } = await supabase
    .from('system_settings')
    .upsert(
      { key: 'estate_logo_url', value: publicUrl, category: 'general' },
      { onConflict: 'key' }
    )
    .select('id')
    .single();

  if (settingError) {
    console.error('Setting update error:', settingError);
    // Try to delete the uploaded file
    await supabase.storage.from('logos').remove([filePath]);
    return { data: null, error: 'Failed to update setting' };
  }

  // Delete old logo file if exists
  if (currentSetting?.value && currentSetting.value !== publicUrl) {
    try {
      // Extract the file path from the old URL
      const oldUrl = currentSetting.value as string;
      const oldPath = oldUrl.split('/logos/').pop();
      if (oldPath) {
        await supabase.storage.from('logos').remove([oldPath]);
      }
    } catch {
      // Ignore errors when deleting old file
    }
  }

  // audit_logs.entity_id is a uuid: use the settings row id; the key goes in newValues (#594).
  if (savedSetting?.id) {
    await logAudit({
      action: 'UPDATE',
      entityType: 'system_settings',
      entityId: savedSetting.id,
      entityDisplay: 'Estate logo',
      oldValues: { value: currentSetting?.value ?? null },
      newValues: { key: 'estate_logo_url', value: publicUrl },
    });
  }

  revalidatePath('/settings');
  revalidatePath('/');
  return { data: { url: publicUrl }, error: null };
}

/**
 * Remove the estate logo
 */
export async function removeEstateLogo(): Promise<{ success: boolean; error: string | null }> {
  const auth = await authorizePermission(PERMISSIONS.SETTINGS_MANAGE_GENERAL);
  if (!auth.authorized) return { success: false, error: auth.error || 'Unauthorized' };

  const supabase = await createServerSupabaseClient();

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Get current logo URL
  const { data: currentSetting } = await supabase
    .from('system_settings')
    .select('id, value')
    .eq('key', 'estate_logo_url')
    .single();

  if (!currentSetting?.value) {
    return { success: true, error: null }; // No logo to remove
  }

  // Delete the file from storage
  try {
    const oldUrl = currentSetting.value as string;
    const oldPath = oldUrl.split('/logos/').pop();
    if (oldPath) {
      await supabase.storage.from('logos').remove([oldPath]);
    }
  } catch {
    // Continue even if file deletion fails
  }

  // Clear the setting
  const { error: settingError } = await supabase
    .from('system_settings')
    .update({ value: '' })
    .eq('key', 'estate_logo_url');

  if (settingError) {
    console.error('Setting update error:', settingError);
    return { success: false, error: 'Failed to remove logo' };
  }

  await logAudit({
    action: 'DELETE',
    entityType: 'system_settings',
    entityId: currentSetting.id,
    entityDisplay: 'Estate logo',
    oldValues: { value: currentSetting.value },
    newValues: { key: 'estate_logo_url', value: '' },
  });

  revalidatePath('/settings');
  revalidatePath('/');
  return { success: true, error: null };
}
