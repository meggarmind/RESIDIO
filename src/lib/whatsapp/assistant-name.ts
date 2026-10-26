import { getRawSettingsAsService } from '@/lib/settings/service';

/** The Assistant's name: the Settings "Assistant name" when set, else "<estate name> Assistant" (#1201). */
export function resolveAssistantName(assistantName: unknown, estateName: string): string {
  return typeof assistantName === 'string' && assistantName.trim() ? assistantName.trim() : `${estateName} Assistant`;
}

export async function loadAssistantName(): Promise<string> {
  const settings = await getRawSettingsAsService(['assistant_name', 'estate_name']);
  const values = settings.status === 'ok' ? settings.values : new Map<string, unknown>();
  const estate = values.get('estate_name');
  return resolveAssistantName(values.get('assistant_name'), typeof estate === 'string' && estate.trim() ? estate.trim() : 'Residio Estate');
}
