'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { sendEmail, getEstateEmailSettings } from '@/lib/email';
import { getSettingValue } from '@/actions/settings/get-settings';
import { WelcomeResidentEmail } from '@/emails';

interface SendWelcomeEmailResult {
  success: boolean;
  error?: string;
}

/**
 * Send a welcome email to a new resident
 */
export async function sendWelcomeEmail(residentId: string): Promise<SendWelcomeEmailResult> {
  // Check if welcome emails are enabled
  const enabled = await getSettingValue('email_welcome_enabled');
  if (enabled === false) {
    return { success: false, error: 'Welcome emails are disabled' };
  }

  const supabase = await createServerSupabaseClient();

  // Get resident with house info
  const { data: resident, error } = await supabase
    .from('residents')
    .select(
      `
      id,
      first_name,
      last_name,
      email,
      resident_code,
      resident_houses(
        house:houses(
          house_number,
          street:streets(name)
        )
      )
    `
    )
    .eq('id', residentId)
    .single();

  if (error || !resident) {
    return { success: false, error: 'Resident not found' };
  }

  if (!resident.email) {
    return { success: false, error: 'Resident has no email address' };
  }

  // Get estate settings
  const estateSettings = await getEstateEmailSettings();

  // Get first house info if available
  const firstHouse = (resident.resident_houses as any)?.[0]?.house;

  const result = await sendEmail({
    to: {
      email: resident.email,
      name: `${resident.first_name} ${resident.last_name}`,
      residentId: resident.id,
    },
    subject: `Welcome to ${estateSettings.estateName}!`,
    react: WelcomeResidentEmail({
      residentName: `${resident.first_name} ${resident.last_name}`,
      residentCode: resident.resident_code,
      houseNumber: firstHouse?.house_number,
      streetName: firstHouse?.street?.name,
      ...estateSettings,
    }),
    emailType: 'welcome',
    metadata: {
      residentId: resident.id,
      residentCode: resident.resident_code,
    },
  });

  return result;
}
