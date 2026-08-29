import { createServerSupabaseClient } from '@/lib/supabase/server';
import { extractRoleName, isAdminRoleName } from '@/lib/auth/action-roles';
import { NextResponse } from 'next/server';

/**
 * OAuth / email-confirmation callback.
 *
 * Exchanges the authorization code for a session, then routes on the account's
 * approval status before its role. A brand-new social login lands here with a
 * profile the handle_new_user() trigger created as `pending` — it must go to the
 * holding page, not the dashboard.
 */

/**
 * Only same-origin relative paths may be used as a post-login destination.
 * Rejects absolute URLs and protocol-relative `//evil.com` values, which would
 * otherwise turn this route into an open redirect.
 */
function safeNextPath(next: string | null): string | null {
  if (!next) return null;
  if (!next.startsWith('/')) return null;
  if (next.startsWith('//')) return null;
  return next;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;
  const code = requestUrl.searchParams.get('code');
  const next = safeNextPath(requestUrl.searchParams.get('next'));

  // The provider reports a denied consent screen (or its own failure) here
  // rather than by omitting the code, so handle it explicitly.
  const providerError = requestUrl.searchParams.get('error');
  if (providerError) {
    const description = requestUrl.searchParams.get('error_description');
    console.error('OAuth provider error:', providerError, description);
    const reason = providerError === 'access_denied' ? 'oauth_cancelled' : 'auth_failed';
    return NextResponse.redirect(`${origin}/login?error=${reason}`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !user) {
    console.error('OAuth callback error:', error);
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  // Join the role in the same round trip rather than issuing a second query.
  const { data: profile } = await supabase
    .from('profiles')
    .select('approval_status, resident_id, app_roles!profiles_role_id_fkey (name)')
    .eq('id', user.id)
    .single();

  // No profile row at all means the provisioning trigger did not fire. Fail
  // closed rather than letting an unprovisioned session through.
  if (!profile) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  switch (profile.approval_status) {
    case 'pending':
      return NextResponse.redirect(`${origin}/pending-approval`);
    case 'rejected':
    case 'suspended':
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/login?error=account_${profile.approval_status}`);
  }

  const roleName = extractRoleName(profile.app_roles);

  if (next) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  if (isAdminRoleName(roleName)) {
    return NextResponse.redirect(`${origin}/dashboard`);
  }

  if (roleName === 'resident' || profile.resident_id) {
    return NextResponse.redirect(`${origin}/portal`);
  }

  // Approved but with no role assigned — nothing to show. Treat as pending so
  // the user gets an explanation instead of an empty dashboard.
  return NextResponse.redirect(`${origin}/pending-approval`);
}
