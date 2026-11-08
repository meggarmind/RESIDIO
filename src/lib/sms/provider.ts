import { getSettingValueAsService } from '@/lib/settings/service';
import { hollatagsProvider } from './providers/hollatags';
import { termiiProvider } from './providers/termii';
import { SMS_PROVIDER_SETTING_KEY, type SmsProvider, type SmsProviderName } from './providers/types';

/** Every provider, for the settings screen and the status read. */
export const SMS_PROVIDERS: Record<SmsProviderName, SmsProvider> = {
  termii: termiiProvider,
  hollatags: hollatagsProvider,
};

/**
 * The provider chosen in Settings -> Sending (#1462). Unset or unknown means
 * Termii, the provider that existed before the choice. There is no fallback
 * between providers: a chosen provider without credentials fails the send.
 */
export async function getActiveSmsProvider(): Promise<SmsProvider> {
  const chosen = await getSettingValueAsService(SMS_PROVIDER_SETTING_KEY);
  return chosen === 'hollatags' ? hollatagsProvider : termiiProvider;
}
