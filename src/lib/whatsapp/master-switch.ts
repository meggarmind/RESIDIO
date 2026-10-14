/**
 * WhatsApp master switch (`whatsapp_enabled`) as seen by the inbound
 * WhatsApp Assistant. The outbound path reads the same setting in
 * `send-policy.ts`; this is the inbound counterpart so the switch is a real
 * kill switch (#547).
 *
 * Service-role read: the inbound webhook has no user session. Fails CLOSED,
 * like the outbound policy: absent, error, or any value other than `true`
 * means off.
 */

import { getSettingResultAsService } from '@/lib/settings/service';

export type WhatsAppMasterSwitch =
  | { on: true }
  | { on: false; reason: 'absent' | 'error' | 'disabled' };

export async function isWhatsAppMasterSwitchOn(): Promise<WhatsAppMasterSwitch> {
  const result = await getSettingResultAsService('whatsapp_enabled');
  if (result.status === 'absent') return { on: false, reason: 'absent' };
  if (result.status === 'error') return { on: false, reason: 'error' };
  return result.value === true ? { on: true } : { on: false, reason: 'disabled' };
}
