/**
 * Gmail API Client
 *
 * Wrapper around the Google APIs library for Gmail operations.
 * Uses OAuth 2.0 for authentication with refresh token support.
 */

import { google, gmail_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { decrypt, encrypt } from './oauth-encryption';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// Gmail API scopes - read-only access
export const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

// First Bank sender patterns
export const FIRST_BANK_SENDERS = [
  'firstbanknigeria.com',
  'firstbank.com',
  'alert@firstbanknigeria.com',
  'noreply@firstbanknigeria.com',
];

/**
 * Create an OAuth2 client with credentials from environment.
 */
export function createOAuth2Client(): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Missing Google OAuth environment variables');
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Generate the OAuth consent URL for Gmail access.
 */
export function getGmailAuthUrl(): string {
  const oauth2Client = createOAuth2Client();

  return oauth2Client.generateAuthUrl({
    access_type: 'offline', // Required to get refresh token
    scope: GMAIL_SCOPES,
    prompt: 'consent', // Force consent to always get refresh token
  });
}

/**
 * Exchange an authorization code for OAuth tokens.
 */
export async function exchangeAuthCode(
  code: string
): Promise<{ accessToken: string; refreshToken: string; expiry: Date }> {
  const oauth2Client = createOAuth2Client();

  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error('Failed to get OAuth tokens');
  }

  // Calculate expiry date (tokens.expiry_date is in milliseconds)
  const expiry = tokens.expiry_date
    ? new Date(tokens.expiry_date)
    : new Date(Date.now() + 3600 * 1000); // Default 1 hour

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiry,
  };
}

/**
 * Refresh an expired access token using the refresh token.
 */
export async function refreshAccessToken(
  refreshTokenEncrypted: string
): Promise<{ accessToken: string; expiry: Date }> {
  const oauth2Client = createOAuth2Client();
  const refreshToken = decrypt(refreshTokenEncrypted);

  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const { credentials } = await oauth2Client.refreshAccessToken();

  if (!credentials.access_token) {
    throw new Error('Failed to refresh access token');
  }

  const expiry = credentials.expiry_date
    ? new Date(credentials.expiry_date)
    : new Date(Date.now() + 3600 * 1000);

  return {
    accessToken: credentials.access_token,
    expiry,
  };
}

/**
 * Get an authenticated Gmail client.
 * Automatically refreshes the token if expired.
 */
export async function getGmailClient(): Promise<gmail_v1.Gmail | null> {
  const supabase = await createServerSupabaseClient();

  // Get active credentials
  const { data: credentials, error } = await supabase
    .from('gmail_oauth_credentials')
    .select('*')
    .eq('is_active', true)
    .single();

  if (error || !credentials) {
    return null;
  }

  const oauth2Client = createOAuth2Client();
  let accessToken = decrypt(credentials.access_token_encrypted);
  const tokenExpiry = new Date(credentials.token_expiry);

  // Refresh if token is expired or expires in next 5 minutes
  const now = new Date();
  const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

  if (tokenExpiry < fiveMinutesFromNow) {
    try {
      const refreshed = await refreshAccessToken(
        credentials.refresh_token_encrypted
      );
      accessToken = refreshed.accessToken;

      // Update stored token
      await supabase
        .from('gmail_oauth_credentials')
        .update({
          access_token_encrypted: encrypt(refreshed.accessToken),
          token_expiry: refreshed.expiry.toISOString(),
        })
        .eq('id', credentials.id);
    } catch (refreshError) {
      console.error('Failed to refresh Gmail access token:', refreshError);

      // Mark connection as inactive
      await supabase
        .from('gmail_oauth_credentials')
        .update({
          is_active: false,
          last_sync_status: 'error',
          last_sync_message: 'Token refresh failed. Please reconnect.',
        })
        .eq('id', credentials.id);

      return null;
    }
  }

  oauth2Client.setCredentials({ access_token: accessToken });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

/**
 * List messages from First Bank senders.
 */
export async function listFirstBankMessages(
  gmail: gmail_v1.Gmail,
  options: {
    maxResults?: number;
    afterDate?: Date;
    pageToken?: string;
  } = {}
): Promise<{
  messages: gmail_v1.Schema$Message[];
  nextPageToken?: string | null;
}> {
  const { maxResults = 50, afterDate, pageToken } = options;

  // Build search query for First Bank emails
  const senderQuery = FIRST_BANK_SENDERS.map((s) => `from:${s}`).join(' OR ');
  let query = `(${senderQuery})`;

  // Add date filter if specified
  if (afterDate) {
    const dateStr = afterDate.toISOString().split('T')[0].replace(/-/g, '/');
    query += ` after:${dateStr}`;
  }

  const response = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults,
    pageToken: pageToken || undefined,
  });

  return {
    messages: response.data.messages || [],
    nextPageToken: response.data.nextPageToken,
  };
}

/**
 * Get full message content by ID.
 */
export async function getMessage(
  gmail: gmail_v1.Gmail,
  messageId: string
): Promise<gmail_v1.Schema$Message> {
  const response = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  });

  return response.data;
}

/**
 * Get attachment content by ID.
 */
export async function getAttachment(
  gmail: gmail_v1.Gmail,
  messageId: string,
  attachmentId: string
): Promise<Buffer> {
  const response = await gmail.users.messages.attachments.get({
    userId: 'me',
    messageId,
    id: attachmentId,
  });

  if (!response.data.data) {
    throw new Error('Attachment data not found');
  }

  // Gmail returns base64url encoded data
  return Buffer.from(response.data.data, 'base64url');
}

/**
 * Extract email metadata from a Gmail message.
 */
export function extractEmailMetadata(message: gmail_v1.Schema$Message): {
  subject: string | null;
  from: string | null;
  to: string | null;
  date: Date | null;
  threadId: string | null;
} {
  const headers = message.payload?.headers || [];

  const getHeader = (name: string): string | null => {
    const header = headers.find(
      (h) => h.name?.toLowerCase() === name.toLowerCase()
    );
    return header?.value || null;
  };

  const dateStr = getHeader('Date');
  let date: Date | null = null;
  if (dateStr) {
    try {
      date = new Date(dateStr);
    } catch {
      date = null;
    }
  }

  return {
    subject: getHeader('Subject'),
    from: getHeader('From'),
    to: getHeader('To'),
    date,
    threadId: message.threadId || null,
  };
}

/**
 * Extract body content from a Gmail message.
 * Handles both simple and multipart messages.
 */
export function extractEmailBody(message: gmail_v1.Schema$Message): {
  text: string | null;
  html: string | null;
} {
  const payload = message.payload;
  let text: string | null = null;
  let html: string | null = null;

  if (!payload) {
    return { text, html };
  }

  const decodeBody = (data: string | undefined | null): string => {
    if (!data) return '';
    return Buffer.from(data, 'base64url').toString('utf8');
  };

  // Simple message (no parts)
  if (payload.body?.data) {
    const content = decodeBody(payload.body.data);
    if (payload.mimeType === 'text/html') {
      html = content;
    } else {
      text = content;
    }
    return { text, html };
  }

  // Multipart message
  const parts = payload.parts || [];

  const findPart = (
    parts: gmail_v1.Schema$MessagePart[],
    mimeType: string
  ): gmail_v1.Schema$MessagePart | null => {
    for (const part of parts) {
      if (part.mimeType === mimeType && part.body?.data) {
        return part;
      }
      if (part.parts) {
        const found = findPart(part.parts, mimeType);
        if (found) return found;
      }
    }
    return null;
  };

  const textPart = findPart(parts, 'text/plain');
  const htmlPart = findPart(parts, 'text/html');

  if (textPart?.body?.data) {
    text = decodeBody(textPart.body.data);
  }
  if (htmlPart?.body?.data) {
    html = decodeBody(htmlPart.body.data);
  }

  return { text, html };
}

/**
 * Extract attachment metadata from a Gmail message.
 */
export function extractAttachments(message: gmail_v1.Schema$Message): Array<{
  id: string;
  filename: string;
  mimeType: string;
  size: number;
}> {
  const attachments: Array<{
    id: string;
    filename: string;
    mimeType: string;
    size: number;
  }> = [];

  const extractFromParts = (parts: gmail_v1.Schema$MessagePart[]) => {
    for (const part of parts) {
      if (part.filename && part.body?.attachmentId) {
        attachments.push({
          id: part.body.attachmentId,
          filename: part.filename,
          mimeType: part.mimeType || 'application/octet-stream',
          size: part.body.size || 0,
        });
      }
      if (part.parts) {
        extractFromParts(part.parts);
      }
    }
  };

  if (message.payload?.parts) {
    extractFromParts(message.payload.parts);
  }

  return attachments;
}
