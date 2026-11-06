'use server';

import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { getSettingValueAsService } from '@/lib/settings/service';
import { isChannelImplemented } from '@/lib/notifications/types';
import { SMS_PROVIDERS } from '@/lib/sms/provider';
import {
  SMS_PROVIDER_NAMES,
  SMS_PROVIDER_SETTING_KEY,
  type SmsProviderName,
} from '@/lib/sms/providers/types';

export interface SmsProviderStatus {
  /** The provider `sendSms` uses now: the stored choice, Termii when unset or unknown. */
  provider: SmsProviderName;
  providers: { name: SmsProviderName; label: string; configured: boolean }[];
  /** False while SMS is switched off in code (`IMPLEMENTED_CHANNELS`). */
  smsSwitchedOn: boolean;
}

const PROVIDER_LABELS: Record<SmsProviderName, string> = {
  termii: 'Termii',
  hollatags: 'HollaTags',
};

/**
 * Active SMS provider and whether each provider has its credentials on the server (#1462).
 * Booleans only: credential values never leave the server. Saving goes through `updateSetting`.
 */
export async function getSmsProviderStatus(): Promise<{ data: SmsProviderStatus | null; error: string | null }> {
  const auth = await authorizePermission(PERMISSIONS.SETTINGS_MANAGE_GENERAL);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };

  const stored = await getSettingValueAsService(SMS_PROVIDER_SETTING_KEY);
  return {
    data: {
      provider: stored === 'hollatags' ? 'hollatags' : 'termii',
      providers: SMS_PROVIDER_NAMES.map((name) => ({
        name,
        label: PROVIDER_LABELS[name],
        configured: SMS_PROVIDERS[name].isConfigured(),
      })),
      smsSwitchedOn: isChannelImplemented('sms'),
    },
    error: null,
  };
}
