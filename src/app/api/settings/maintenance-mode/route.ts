import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Public endpoint to check maintenance mode status
 * No authentication required - used by maintenance page
 */
export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Fetch maintenance mode setting
  const { data: modeSetting } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'maintenance_mode')
    .single();

  // Fetch maintenance message setting
  const { data: messageSetting } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'maintenance_message')
    .single();

  // Extract boolean from JSONB value
  const maintenanceMode = modeSetting?.value === true || modeSetting?.value === 'true';
  const message = typeof messageSetting?.value === 'string'
    ? messageSetting.value
    : 'System is currently undergoing maintenance. Please check back shortly.';

  return NextResponse.json({
    maintenance_mode: maintenanceMode,
    message,
  });
}
