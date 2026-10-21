'use client';

import { useMemo, useState } from 'react';
import { z } from 'zod';
import { useGeneralSettings, useUpdateSettings } from '@/hooks/use-settings';
import { officeHoursError } from '@/components/settings/estate/office-hours-editor';

export type EstateForm = {
  estate_name: string;
  estate_address: string;
  estate_phone: string;
  estate_email: string;
  estate_office_hours: string;
  estate_website_url: string;
  estate_facebook_url: string;
  estate_twitter_url: string;
  estate_instagram_url: string;
  assistant_name: string;
  disable_ai_assistant: boolean;
  ai_assistant_greeting_enabled: boolean;
};

type EstateKey = keyof EstateForm;

/** Which stored settings each section of /settings/estate saves. A save writes only its own keys. */
export const DETAILS_KEYS: EstateKey[] = [
  'estate_name', 'estate_email', 'estate_address', 'estate_phone', 'estate_website_url', 'estate_office_hours',
];
export const ASSISTANT_KEYS: EstateKey[] = ['disable_ai_assistant', 'ai_assistant_greeting_enabled', 'assistant_name'];
export const SOCIAL_KEYS: EstateKey[] = ['estate_facebook_url', 'estate_twitter_url', 'estate_instagram_url'];

const EMPTY_FORM: EstateForm = {
  estate_name: '', estate_address: '', estate_phone: '', estate_email: '', estate_office_hours: '',
  estate_website_url: '', estate_facebook_url: '', estate_twitter_url: '', estate_instagram_url: '',
  assistant_name: '', disable_ai_assistant: false, ai_assistant_greeting_enabled: true,
};

const optionalUrl = z.union([
  z.literal(''),
  z.url({ protocol: /^https?$/, error: 'Enter a full web address starting with https://' }),
]);

// Blank is allowed everywhere; what is filled in must be usable (#790).
const estateFormSchema = z.object({
  estate_email: z.union([z.literal(''), z.email({ error: 'Enter an email address such as contact@estate.com' })]),
  estate_website_url: optionalUrl,
  estate_facebook_url: optionalUrl,
  estate_twitter_url: optionalUrl,
  estate_instagram_url: optionalUrl,
});

function fieldErrors(form: EstateForm): Partial<Record<EstateKey, string>> {
  const result = estateFormSchema.safeParse(form);
  const errors: Partial<Record<EstateKey, string>> = {};
  const hoursError = officeHoursError(form.estate_office_hours);
  if (hoursError) errors.estate_office_hours = hoursError;
  if (result.success) return errors;
  for (const issue of result.error.issues) {
    const key = issue.path[0] as EstateKey;
    errors[key] ??= issue.message;
  }
  return errors;
}

function settingsToObject(settings: { key: string; value: unknown }[] | undefined): Record<string, string> {
  if (!settings) return {};
  return settings.reduce((acc, setting) => {
    acc[setting.key] = setting.value as string ?? '';
    return acc;
  }, {} as Record<string, string>);
}

/**
 * The estate settings the Details, Assistant and Social links sections edit, held once so a
 * summary can read what another section changed. Each section saves and discards only its own keys.
 */
export function useEstateForm() {
  const { data: generalSettings, isLoading } = useGeneralSettings();
  const updateSettings = useUpdateSettings();
  const settings = useMemo(() => settingsToObject(generalSettings), [generalSettings]);

  const serverForm = useMemo<EstateForm>(() => ({
    estate_name: settings.estate_name || '',
    estate_address: settings.estate_address || '',
    estate_phone: settings.estate_phone || '',
    estate_email: settings.estate_email || '',
    // Stored as a JSON string; tolerate a value already decoded to an array.
    estate_office_hours: typeof settings.estate_office_hours === 'string' ? settings.estate_office_hours : settings.estate_office_hours ? JSON.stringify(settings.estate_office_hours) : '',
    estate_website_url: settings.estate_website_url || '',
    estate_facebook_url: settings.estate_facebook_url || '',
    estate_twitter_url: settings.estate_twitter_url || '',
    estate_instagram_url: settings.estate_instagram_url || '',
    assistant_name: settings.assistant_name || '',
    disable_ai_assistant: String(settings.disable_ai_assistant) === 'true',
    ai_assistant_greeting_enabled: String(settings.ai_assistant_greeting_enabled) !== 'false',
  }), [settings]);

  const [overrides, setOverrides] = useState<Partial<EstateForm>>({});
  const form = useMemo(() => ({ ...EMPTY_FORM, ...serverForm, ...overrides }), [serverForm, overrides]);
  // Only fields edited here are checked, so an old stored value never blocks an unrelated save.
  const errors = Object.fromEntries(
    Object.entries(fieldErrors(form)).filter(([key]) => key in overrides)
  ) as Partial<Record<EstateKey, string>>;

  const set = <K extends EstateKey>(field: K, value: EstateForm[K]) =>
    setOverrides((prev) => ({ ...prev, [field]: value }));

  const without = (keys: EstateKey[]) =>
    setOverrides((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => !keys.includes(key as EstateKey))));

  /** Props for `SettingsSection`: dirty state and Save and Discard for the given keys only. */
  const section = (keys: EstateKey[]) => {
    const dirtyKeys = keys.filter((key) => key in overrides);
    return {
      isDirty: dirtyKeys.length > 0,
      isSaving: updateSettings.isPending,
      canSave: !keys.some((key) => errors[key]),
      onSave: async () => {
        await updateSettings.mutateAsync(Object.fromEntries(dirtyKeys.map((key) => [key, overrides[key]])));
        without(dirtyKeys);
      },
      onDiscard: () => without(keys),
    };
  };

  const errorProps = (field: EstateKey, id: string) =>
    errors[field] ? { 'aria-invalid': true, 'aria-describedby': `${id}-error` } : {};

  return { form, errors, errorProps, set, section, isLoading };
}

export type EstateFormState = ReturnType<typeof useEstateForm>;
