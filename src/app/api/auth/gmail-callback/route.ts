/**
 * Gmail OAuth Callback Route
 *
 * Handles the OAuth redirect from Google after user grants permission.
 * Exchanges the authorization code for tokens and stores them encrypted.
 */

import { NextResponse } from 'next/server';
import { exchangeGmailCode } from '@/actions/email-imports/gmail-oauth';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  // Handle user denied access
  if (error) {
    const errorMessage = encodeURIComponent(
      error === 'access_denied'
        ? 'Gmail access was denied. Please try again and grant access.'
        : `Gmail authentication failed: ${error}`
    );
    return NextResponse.redirect(
      `${origin}/settings/email-integration?error=${errorMessage}`
    );
  }

  // No code means invalid request
  if (!code) {
    return NextResponse.redirect(
      `${origin}/settings/email-integration?error=${encodeURIComponent('No authorization code received')}`
    );
  }

  // Exchange code for tokens
  const result = await exchangeGmailCode(code);

  if (result.error) {
    return NextResponse.redirect(
      `${origin}/settings/email-integration?error=${encodeURIComponent(result.error)}`
    );
  }

  // Success - redirect with success message
  return NextResponse.redirect(
    `${origin}/settings/email-integration?success=${encodeURIComponent(`Gmail connected: ${result.data?.email}`)}`
  );
}
