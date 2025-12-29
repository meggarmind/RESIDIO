'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

// Allowed image types for logo
const ALLOWED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/svg+xml',
] as const;

// Max logo file size: 2MB
const MAX_LOGO_FILE_SIZE = 2 * 1024 * 1024;

type UploadLogoResponse = {
  data: { url: string } | null;
  error: string | null;
};

/**
 * Validates the logo file before upload
 */
function validateLogoFile(file: File): { valid: boolean; error: string | null } {
  // Check file size
  if (file.size > MAX_LOGO_FILE_SIZE) {
    return {
      valid: false,
      error: `File size exceeds maximum allowed (${MAX_LOGO_FILE_SIZE / 1024 / 1024}MB)`,
    };
  }

  // Check MIME type
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as typeof ALLOWED_IMAGE_TYPES[number])) {
    return {
      valid: false,
      error: 'File type not allowed. Please upload PNG, JPG, WebP, or SVG images.',
    };
  }

  return { valid: true, error: null };
}

/**
 * Upload estate logo and update the setting
 */
export async function uploadEstateLogo(formData: FormData): Promise<UploadLogoResponse> {
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
  const validation = validateLogoFile(file);
  if (!validation.valid) {
    return { data: null, error: validation.error };
  }

  // Get current logo URL to delete old file if exists
  const { data: currentSetting } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'estate_logo_url')
    .single();

  // Generate a unique file name
  const timestamp = Date.now();
  const extension = file.name.split('.').pop()?.toLowerCase() || 'png';
  const filePath = `estate-logo-${timestamp}.${extension}`;

  // Upload to Supabase Storage (using 'logos' bucket)
  const { error: uploadError } = await supabase.storage
    .from('logos')
    .upload(filePath, file, {
      contentType: file.type,
      cacheControl: '3600',
      upsert: true,
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
  const { error: settingError } = await supabase
    .from('system_settings')
    .upsert(
      { key: 'estate_logo_url', value: publicUrl, category: 'general' },
      { onConflict: 'key' }
    );

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

  revalidatePath('/settings');
  revalidatePath('/');
  return { data: { url: publicUrl }, error: null };
}

/**
 * Remove the estate logo
 */
export async function removeEstateLogo(): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Get current logo URL
  const { data: currentSetting } = await supabase
    .from('system_settings')
    .select('value')
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

  revalidatePath('/settings');
  revalidatePath('/');
  return { success: true, error: null };
}
