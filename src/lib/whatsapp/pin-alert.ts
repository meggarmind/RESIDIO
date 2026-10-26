import { createAdminClient } from '@/lib/supabase/server';
import { sendEmail, getEstateEmailSettings } from '@/lib/email/send-email';
import { resolveResidentOverride } from '@/lib/comms-override/resident-flag';
import { maskPhone } from '@/lib/utils';
import { WhatsAppPinAlertEmail, whatsAppPinAlertSubject, type WhatsAppPinAlertEvent } from '@/emails/whatsapp-pin-alert';

export type { WhatsAppPinAlertEvent };

/**
 * Emails the resident when their WhatsApp PIN is set, changed or reset (#892), naming the WhatsApp
 * number masked. Sends nothing when no email is on file. Without `phoneNumbers` (a reset from the
 * dashboard) the resident's linked numbers are named. Throws when a send is attempted and fails.
 */
export async function sendWhatsAppPinAlert(
  residentId: string,
  event: WhatsAppPinAlertEvent,
  phoneNumbers?: string[]
): Promise<{ sent: boolean }> {
  const supabase = createAdminClient();
  const { data: resident, error } = await supabase
    .from('residents')
    .select('id, first_name, last_name, email')
    .eq('id', residentId)
    .maybeSingle();
  if (error) throw error;
  const email = resident?.email?.trim();
  if (!resident || !email) return { sent: false };

  let numbers = phoneNumbers;
  if (!numbers) {
    const { data: links, error: linkError } = await supabase
      .from('whatsapp_optins')
      .select('phone_number')
      .eq('resident_id', residentId)
      .is('deactivated_at', null);
    if (linkError) throw linkError;
    numbers = (links || []).map((link) => link.phone_number);
  }

  // Communications override (#716): fail closed.
  const override = await resolveResidentOverride([residentId]);
  if (!override.ok) throw new Error(override.error);

  const estate = await getEstateEmailSettings();

  const result = await sendEmail({
    to: { email, name: `${resident.first_name} ${resident.last_name}`, residentId },
    subject: whatsAppPinAlertSubject(event),
    react: WhatsAppPinAlertEmail({
      firstName: resident.first_name,
      event,
      maskedNumbers: [...new Set(numbers)].map((number) => maskPhone(number)),
      ...estate,
    }),
    emailType: 'notification',
    residentOverride: override.residentOverride,
    metadata: { purpose: 'whatsapp_pin_alert', event },
  });
  if (!result.success) throw new Error(result.error || 'WhatsApp PIN alert email failed');
  return { sent: true };
}
