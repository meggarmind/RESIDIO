'use server';

import { resend } from '@/lib/email/resend';

export async function getEmailStatus() {
  return {
    isConfigured: !!resend,
  };
}
