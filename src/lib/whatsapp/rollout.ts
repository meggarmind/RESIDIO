import { getSettingValue } from '@/actions/settings/get-settings';
import { createAdminClient } from '@/lib/supabase/server';

export type WhatsAppRolloutMode = 'disabled' | 'pilot' | 'estate';

function parseList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
}

export async function isWhatsAppRecipientAllowed(residentId: string): Promise<boolean> {
  const modeValue = await getSettingValue('whatsapp_rollout_mode');
  const mode: WhatsAppRolloutMode = modeValue === 'estate' || modeValue === 'pilot' ? modeValue : 'disabled';
  if (mode === 'disabled') return false;
  if (mode === 'estate') return true;

  const residentIds = parseList(await getSettingValue('whatsapp_pilot_resident_ids'));
  if (residentIds.includes(residentId)) return true;

  const streetId = await getSettingValue('whatsapp_pilot_street_id');
  if (!streetId) return false;
  const { data, error } = await createAdminClient()
    .from('resident_houses')
    .select('house:houses(street_id)')
    .eq('resident_id', residentId)
    .eq('is_active', true);
  if (error) return false;
  return (data || []).some((assignment) => {
    const house = Array.isArray(assignment.house) ? assignment.house[0] : assignment.house;
    return house?.street_id === String(streetId);
  });
}
