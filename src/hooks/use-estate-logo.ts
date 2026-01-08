import { useGeneralSettings } from './use-settings';

/**
 * Hook to get the estate logo URL from system settings
 *
 * Returns the estate logo URL if one has been uploaded, null otherwise.
 * The logo is stored in the `estate_logo_url` key in system_settings.
 *
 * @example
 * const { logoUrl, isLoading } = useEstateLogo();
 * if (logoUrl) {
 *   return <img src={logoUrl} alt="Estate Logo" />;
 * }
 */
export function useEstateLogo() {
  const { data: settings, isLoading, error } = useGeneralSettings();

  const logoUrl = settings?.find(s => s.key === 'estate_logo_url')?.value as string | null;

  // Only return a valid URL, not empty string
  const validLogoUrl = logoUrl && logoUrl.trim() !== '' ? logoUrl : null;

  return {
    logoUrl: validLogoUrl,
    isLoading,
    error,
  };
}
