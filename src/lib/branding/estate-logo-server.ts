import { getRawSettingsAsService } from '@/lib/settings/service';
import { estateLogoDataUri } from './estate-logo';

/**
 * The estate logo URL for server-made PDFs, or undefined for none. Service-role read, so
 * cron and webhook renders (no session) see it too.
 */
export async function getEstateLogoUrl(): Promise<string | undefined> {
  const settings = await getRawSettingsAsService(['estate_logo_url']);
  return settings.status === 'ok' ? estateLogoDataUri(settings.values.get('estate_logo_url')) : undefined;
}
