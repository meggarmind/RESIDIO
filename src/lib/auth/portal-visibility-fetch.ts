/**
 * Client-side reads for the resident-portal visibility inputs (#423).
 *
 * Deliberate exception to CORE.md section 13's schema-sync rule: the
 * `portal_access_override` column is NOT added to the AuthProvider's main
 * profile `.select()`. The migration that creates it may not be applied when
 * this code deploys, and a missing column would fail that query and break
 * login. Each read here is an independent, fail-closed query: any error or
 * missing row means "portal hidden" / "inherit" and never throws.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { parsePortalAccessOverride, type PortalAccessOverride } from '@/lib/auth/portal-visibility';

export async function fetchPortalAccessOverride(
  supabase: SupabaseClient,
  userId: string
): Promise<PortalAccessOverride> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('portal_access_override')
      .eq('id', userId)
      .maybeSingle();
    if (error || !data) return null;
    return parsePortalAccessOverride((data as { portal_access_override?: unknown }).portal_access_override);
  } catch {
    return null;
  }
}

export async function fetchResidentPortalEnabled(supabase: SupabaseClient): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'resident_portal_enabled')
      .maybeSingle();
    if (error || !data) return false;
    const value = (data as { value?: unknown }).value;
    return value === true || value === 'true';
  } catch {
    return false;
  }
}
