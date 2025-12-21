/**
 * Email system types for Residio
 */

export type EmailType =
  | 'payment_reminder'
  | 'invoice_generated'
  | 'welcome'
  | 'notification'
  | 'test';

export interface EmailRecipient {
  email: string;
  name: string;
  residentId?: string;
}

export interface SendEmailOptions {
  to: EmailRecipient | EmailRecipient[];
  subject: string;
  react: React.ReactElement;
  emailType: EmailType;
  metadata?: Record<string, unknown>;
}

export interface SendEmailResult {
  success: boolean;
  resendId?: string;
  error?: string;
}

export interface EmailLogEntry {
  recipientEmail: string;
  recipientName?: string;
  residentId?: string;
  emailType: EmailType;
  subject: string;
  resendId?: string;
  status: 'pending' | 'sent' | 'failed';
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

// Estate settings needed for email templates
export interface EstateEmailSettings {
  estateName: string;
  estateEmail?: string;
  estatePhone?: string;
  estateAddress?: string;
  estateWebsite?: string;
}
