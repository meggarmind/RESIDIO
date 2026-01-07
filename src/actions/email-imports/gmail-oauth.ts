'use server';

/**
 * Gmail OAuth Server Actions
 *
 * Handles Gmail OAuth connection, disconnection, and status checking.
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import {
  getGmailAuthUrl as getAuthUrl,
  exchangeAuthCode,
  getGmailClient,
  GMAIL_SCOPES,
} from '@/lib/email-imports/gmail-client';
import { encrypt, decrypt } from '@/lib/email-imports/oauth-encryption';
import type { GmailConnectionStatus } from '@/types/database';

// ============================================================
// Get Gmail OAuth Authorization URL
// ============================================================

export async function getGmailAuthUrl(): Promise<{
  data: { url: string } | null;
  error: string | null;
}> {
  // Check permission
  const auth = await authorizePermission(PERMISSIONS.EMAIL_IMPORTS_CONFIGURE);
  if (!auth.authorized) {
    return { data: null, error: auth.error || 'Unauthorized' };
  }

  try {
    const url = getAuthUrl();
    return { data: { url }, error: null };
  } catch (error) {
    console.error('Failed to generate Gmail auth URL:', error);
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Failed to generate auth URL',
    };
  }
}

// ============================================================
// Exchange OAuth Code for Tokens
// ============================================================

export async function exchangeGmailCode(code: string): Promise<{
  data: { email: string } | null;
  error: string | null;
}> {
  // Check permission
  const auth = await authorizePermission(PERMISSIONS.EMAIL_IMPORTS_CONFIGURE);
  if (!auth.authorized) {
    return { data: null, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  try {
    // Exchange code for tokens
    const tokens = await exchangeAuthCode(code);

    // Get user info to find email
    const { google } = await import('googleapis');
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: tokens.accessToken });

    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email;

    if (!email) {
      return { data: null, error: 'Could not get email from Google' };
    }

    // Deactivate any existing active connection
    await supabase
      .from('gmail_oauth_credentials')
      .update({ is_active: false })
      .eq('is_active', true);

    // Store encrypted credentials
    const { error: insertError } = await supabase
      .from('gmail_oauth_credentials')
      .insert({
        email_address: email,
        access_token_encrypted: encrypt(tokens.accessToken),
        refresh_token_encrypted: encrypt(tokens.refreshToken),
        token_expiry: tokens.expiry.toISOString(),
        scopes: GMAIL_SCOPES,
        is_active: true,
        created_by: auth.userId,
      });

    if (insertError) {
      console.error('Failed to store Gmail credentials:', insertError);
      return { data: null, error: 'Failed to store credentials' };
    }

    // Audit log
    await logAudit({
      action: 'CREATE',
      entityType: 'gmail_oauth_credentials',
      entityId: email,
      entityDisplay: `Gmail: ${email}`,
      newValues: { email, scopes: GMAIL_SCOPES },
    });

    return { data: { email }, error: null };
  } catch (error) {
    console.error('Failed to exchange Gmail code:', error);
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Failed to connect Gmail',
    };
  }
}

// ============================================================
// Get Gmail Connection Status
// ============================================================

export async function getGmailConnectionStatus(): Promise<{
  data: GmailConnectionStatus | null;
  error: string | null;
}> {
  // Check permission
  const auth = await authorizePermission(PERMISSIONS.EMAIL_IMPORTS_VIEW);
  if (!auth.authorized) {
    return { data: null, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  const { data: credentials, error } = await supabase
    .from('gmail_oauth_credentials')
    .select('*')
    .eq('is_active', true)
    .single();

  if (error || !credentials) {
    return {
      data: {
        connected: false,
        email: null,
        lastSyncAt: null,
        lastSyncStatus: null,
        lastSyncMessage: null,
        lastSyncEmailsCount: null,
      },
      error: null,
    };
  }

  // Verify token is still valid by attempting to use it
  let isValid = true;
  try {
    const gmail = await getGmailClient();
    if (!gmail) {
      isValid = false;
    }
  } catch {
    isValid = false;
  }

  if (!isValid) {
    return {
      data: {
        connected: false,
        email: credentials.email_address,
        lastSyncAt: credentials.last_sync_at,
        lastSyncStatus: 'error',
        lastSyncMessage: 'Token expired or invalid. Please reconnect.',
        lastSyncEmailsCount: credentials.last_sync_emails_count,
      },
      error: null,
    };
  }

  return {
    data: {
      connected: true,
      email: credentials.email_address,
      lastSyncAt: credentials.last_sync_at,
      lastSyncStatus: credentials.last_sync_status,
      lastSyncMessage: credentials.last_sync_message,
      lastSyncEmailsCount: credentials.last_sync_emails_count,
    },
    error: null,
  };
}

// ============================================================
// Disconnect Gmail
// ============================================================

export async function disconnectGmail(): Promise<{ error: string | null }> {
  // Check permission
  const auth = await authorizePermission(PERMISSIONS.EMAIL_IMPORTS_CONFIGURE);
  if (!auth.authorized) {
    return { error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  // Get current connection for audit log
  const { data: credentials } = await supabase
    .from('gmail_oauth_credentials')
    .select('*')
    .eq('is_active', true)
    .single();

  if (!credentials) {
    return { error: 'No active Gmail connection' };
  }

  // Try to revoke the token (best effort)
  try {
    const accessToken = decrypt(credentials.access_token_encrypted);
    // Revoke via Google's token revocation endpoint
    await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `token=${accessToken}`,
    });
  } catch (revokeError) {
    // Log but don't fail - token might already be invalid
    console.warn('Failed to revoke Gmail token:', revokeError);
  }

  // Deactivate the connection (soft delete)
  const { error } = await supabase
    .from('gmail_oauth_credentials')
    .update({ is_active: false })
    .eq('id', credentials.id);

  if (error) {
    return { error: error.message };
  }

  // Audit log
  await logAudit({
    action: 'DELETE',
    entityType: 'gmail_oauth_credentials',
    entityId: credentials.id,
    entityDisplay: `Gmail: ${credentials.email_address}`,
    oldValues: { email: credentials.email_address },
  });

  return { error: null };
}

// ============================================================
// Update Last Sync Status
// ============================================================

export async function updateGmailSyncStatus(params: {
  status: 'success' | 'error' | 'partial';
  message?: string;
  emailsCount?: number;
}): Promise<{ error: string | null }> {
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from('gmail_oauth_credentials')
    .update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: params.status,
      last_sync_message: params.message || null,
      last_sync_emails_count: params.emailsCount ?? 0,
    })
    .eq('is_active', true);

  if (error) {
    return { error: error.message };
  }

  return { error: null };
}
