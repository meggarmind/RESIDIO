'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { sendEmail, getEstateEmailSettings } from '@/lib/email';
import { embed } from '@/lib/utils';
import { resolveResidentOverride } from '@/lib/comms-override/resident-flag';
import { getSettingValue } from '@/actions/settings/get-settings';
import { WelcomeResidentEmail } from '@/emails';
import { getEventContent, isEventChannelEnabled, renderEventText } from '@/lib/notifications/event-content';

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
  if (!(await isEventChannelEnabled('welcome_resident', 'email'))) {
    return { success: false, error: 'Welcome emails are switched off in message wording settings' };
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
      resident_houses!resident_houses_resident_id_fkey(
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

  // Communications override (#716): fail closed if the resident's flag cannot be read.
  const override = await resolveResidentOverride([resident.id]);
  if (!override.ok) {
    return { success: false, error: override.error };
  }

  // Get estate settings
  const estateSettings = await getEstateEmailSettings();

  // Get first house info if available
  const firstHouse = embed(embed(resident.resident_houses)?.house);

  const copy = await getEventContent('welcome_resident');
  const residentName = `${resident.first_name} ${resident.last_name}`;

  const result = await sendEmail({
    to: {
      email: resident.email,
      name: residentName,
      residentId: resident.id,
    },
    subject: renderEventText(copy.subject, {
      resident_name: residentName,
      resident_code: resident.resident_code,
      estate_name: estateSettings.estateName,
    }),
    react: WelcomeResidentEmail({
      copy,
      residentName: `${resident.first_name} ${resident.last_name}`,
      residentCode: resident.resident_code,
      houseNumber: firstHouse?.house_number,
      streetName: embed(firstHouse?.street)?.name,
      ...estateSettings,
    }),
    emailType: 'welcome',
    residentOverride: override.residentOverride,
    metadata: {
      residentId: resident.id,
      residentCode: resident.resident_code,
    },
  });

  return result;
}
