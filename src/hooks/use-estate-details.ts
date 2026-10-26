import { usableEstateLogoUrl } from '@/lib/branding/estate-logo';
import { useGeneralSettings } from './use-settings';

/**
 * Estate name, address and logo from Settings > Estate.
 * A key that is unset or blank is undefined, so a component's own default still applies.
 */
export function useEstateDetails() {
  const { data: settings } = useGeneralSettings();

  const value = (key: string) => {
    const raw = settings?.find((s) => s.key === key)?.value;
    return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
  };

  return {
    estateName: value('estate_name'),
    estateAddress: value('estate_address'),
    estateLogoUrl: usableEstateLogoUrl(settings?.find((s) => s.key === 'estate_logo_url')?.value),
  };
}
