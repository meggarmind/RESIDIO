'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { sendEmail, getEstateEmailSettings } from '@/lib/email';
import { TestEmail } from '@/emails';

interface TestEmailInput {
  email: string;
}

interface TestEmailResult {
  success: boolean;
  error?: string;
}

/**
 * Send a test email to verify email configuration
 */
export async function testEmail(input: TestEmailInput): Promise<TestEmailResult> {
  const supabase = await createServerSupabaseClient();

  // Check auth
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }

  // Validate email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(input.email)) {
    return { success: false, error: 'Invalid email address' };
  }

  // Get estate settings for template
  const estateSettings = await getEstateEmailSettings();

  // Send test email
  const result = await sendEmail({
    to: {
      email: input.email,
      name: 'Test Recipient',
    },
    subject: `Test Email from ${estateSettings.estateName}`,
    react: TestEmail({
      ...estateSettings,
      recipientEmail: input.email,
    }),
    emailType: 'test',
    metadata: {
      triggeredBy: user.id,
    },
  });

  return result;
}
