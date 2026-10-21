import { useMemo } from 'react';
import { useSystemSettings } from '@/hooks/use-settings';

/** The system settings as a key -> value map, plus the query's loading flag. */
export function useSystemSettingValues() {
  const { data, isLoading } = useSystemSettings();
  const values = useMemo(
    () => Object.fromEntries((data ?? []).map((setting) => [setting.key, setting.value])) as Record<string, unknown>,
    [data],
  );
  return { values, isLoading };
}
