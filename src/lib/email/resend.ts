/**
 * Resend client configuration for Residio
 */
import { Resend } from 'resend';

// Initialize Resend client (may be null if not configured)
export const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

// Email configuration from environment variables
export const emailConfig = {
  fromAddress: process.env.EMAIL_FROM_ADDRESS || 'noreply@residio.estate',
  replyTo: process.env.EMAIL_REPLY_TO_ADDRESS || undefined,
};

// Check if email is properly configured
export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}
