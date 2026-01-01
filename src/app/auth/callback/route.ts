import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const origin = requestUrl.origin;

  if (code) {
    const supabase = await createServerSupabaseClient();

    // Exchange code for session
    const { data: { user }, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('OAuth callback error:', error);
      return NextResponse.redirect(`${origin}/login?error=auth_failed`);
    }

    if (user) {
      // Get user profile to determine routing
      const { data: profile } = await supabase
        .from('profiles')
        .select('role_id, resident_id')
        .eq('id', user.id)
        .single();

      // Get role information
      let roleName: string | null = null;
      if (profile?.role_id) {
        const { data: role } = await supabase
          .from('app_roles')
          .select('name')
          .eq('id', profile.role_id)
          .single();
        roleName = role?.name || null;
      }

      // Role-based routing
      const adminRoles = ['super_admin', 'chairman', 'vice_chairman', 'financial_officer', 'security_officer', 'secretary', 'project_manager'];

      if (roleName && adminRoles.includes(roleName)) {
        return NextResponse.redirect(`${origin}/dashboard`);
      } else if (roleName === 'resident' || profile?.resident_id) {
        return NextResponse.redirect(`${origin}/portal`);
      } else {
        // New user or no role - route to portal
        return NextResponse.redirect(`${origin}/portal`);
      }
    }
  }

  // Default fallback
  return NextResponse.redirect(`${origin}/login`);
}
