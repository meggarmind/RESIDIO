'use server';

import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
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
  const auth = await authorizePermission(PERMISSIONS.SETTINGS_MANAGE_GENERAL);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
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
      triggeredBy: auth.userId,
    },
  });

  return result;
}
