'use client';

import { Facebook, Globe, Instagram, Twitter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { SettingsRow } from '@/components/settings/settings-row';
import { SettingsSection } from '@/components/settings/settings-section';
import { SettingsSkeleton } from '@/components/settings/settings-states';
import { OfficeHoursEditor } from '@/components/settings/estate/office-hours-editor';
import {
  ASSISTANT_KEYS,
  DETAILS_KEYS,
  SOCIAL_KEYS,
  type EstateFormState,
} from '@/components/settings/estate/use-estate-form';

const GENERAL = [PERMISSIONS.SETTINGS_MANAGE_GENERAL];

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <p id={id} role="alert" className="w-full text-xs text-destructive">{message}</p> : null;
}

function Loading() {
  return <SettingsSkeleton rows={3} className="p-4 md:p-5" />;
}

/** Details of /settings/estate (from the old Estate Information page). */
export function EstateDetailsSection({ estate }: { estate: EstateFormState }) {
  const { form, errors, errorProps, set, isLoading } = estate;
  const summary = isLoading
    ? 'Loading'
    : [form.estate_name, form.estate_email, form.estate_phone].filter(Boolean).join(', ') || 'Nothing entered yet';

  return (
    <SettingsSection id="details" title="Details" summary={summary} permissions={GENERAL} {...estate.section(DETAILS_KEYS)}>
      {isLoading ? (
        <Loading />
      ) : (
        <>
          <SettingsRow rowId="estate-name">
            {({ controlId }) => (
              <Input id={controlId} placeholder="Residio Estate" value={form.estate_name} onChange={(e) => set('estate_name', e.target.value)} />
            )}
          </SettingsRow>
          <SettingsRow rowId="estate-email">
            {({ controlId }) => (
              <>
                <Input
                  id={controlId}
                  type="email"
                  placeholder="contact@estate.com"
                  value={form.estate_email}
                  {...errorProps('estate_email', controlId)}
                  onChange={(e) => set('estate_email', e.target.value)}
                />
                <FieldError id={`${controlId}-error`} message={errors.estate_email} />
              </>
            )}
          </SettingsRow>
          <SettingsRow rowId="estate-address">
            {({ controlId }) => (
              <Input id={controlId} placeholder="123 Estate Road, City, State" value={form.estate_address} onChange={(e) => set('estate_address', e.target.value)} />
            )}
          </SettingsRow>
          <SettingsRow rowId="estate-phone">
            {({ controlId }) => (
              <Input id={controlId} type="tel" placeholder="+234 123 456 7890" value={form.estate_phone} onChange={(e) => set('estate_phone', e.target.value)} />
            )}
          </SettingsRow>
          <SettingsRow rowId="estate-website">
            {({ controlId }) => (
              <>
                <div className="relative w-full">
                  <Globe aria-hidden className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id={controlId}
                    type="url"
                    placeholder="https://www.estate.com"
                    className="pl-10"
                    value={form.estate_website_url}
                    {...errorProps('estate_website_url', controlId)}
                    onChange={(e) => set('estate_website_url', e.target.value)}
                  />
                </div>
                <FieldError id={`${controlId}-error`} message={errors.estate_website_url} />
              </>
            )}
          </SettingsRow>
          <SettingsRow rowId="estate-office-hours" stacked>
            <div className="w-full">
              <OfficeHoursEditor
                value={form.estate_office_hours}
                error={errors.estate_office_hours}
                onChange={(value) => set('estate_office_hours', value)}
              />
            </div>
          </SettingsRow>
        </>
      )}
    </SettingsSection>
  );
}

/** Assistant of /settings/estate: the floating assistant in the admin dashboard. */
export function EstateAssistantSection({ estate }: { estate: EstateFormState }) {
  const { form, set, isLoading } = estate;
  const summary = isLoading
    ? 'Loading'
    : `${form.disable_ai_assistant ? 'Hidden' : 'Shown'}, greeting ${form.ai_assistant_greeting_enabled ? 'on' : 'off'}${
        form.assistant_name ? `, called ${form.assistant_name}` : ''
      }`;

  return (
    <SettingsSection id="assistant" title="Assistant" summary={summary} permissions={GENERAL} {...estate.section(ASSISTANT_KEYS)}>
      {isLoading ? (
        <Loading />
      ) : (
        <>
          <SettingsRow rowId="assistant-visible">
            {({ controlId }) => (
              <Switch id={controlId} checked={!form.disable_ai_assistant} onCheckedChange={(checked) => set('disable_ai_assistant', !checked)} />
            )}
          </SettingsRow>
          <SettingsRow rowId="assistant-greeting">
            {({ controlId }) => (
              <Switch id={controlId} checked={form.ai_assistant_greeting_enabled} onCheckedChange={(checked) => set('ai_assistant_greeting_enabled', checked)} />
            )}
          </SettingsRow>
          <SettingsRow rowId="assistant-name">
            {({ controlId, helpId }) => (
              <Input
                id={controlId}
                placeholder="Estate Assistant"
                value={form.assistant_name}
                aria-describedby={helpId}
                onChange={(e) => set('assistant_name', e.target.value)}
              />
            )}
          </SettingsRow>
        </>
      )}
    </SettingsSection>
  );
}

const SOCIAL_ROWS = [
  { rowId: 'social-facebook', field: 'estate_facebook_url', icon: Facebook, placeholder: 'https://facebook.com/yourestate' },
  { rowId: 'social-twitter', field: 'estate_twitter_url', icon: Twitter, placeholder: 'https://twitter.com/yourestate' },
  { rowId: 'social-instagram', field: 'estate_instagram_url', icon: Instagram, placeholder: 'https://instagram.com/yourestate' },
] as const;

/** Social links of /settings/estate. */
export function EstateSocialSection({ estate }: { estate: EstateFormState }) {
  const { form, errors, errorProps, set, isLoading } = estate;
  const linked = SOCIAL_ROWS.filter(({ field }) => form[field]).length;

  return (
    <SettingsSection
      id="social"
      title="Social links"
      summary={isLoading ? 'Loading' : `${linked} of ${SOCIAL_ROWS.length} linked`}
      permissions={GENERAL}
      defaultCollapsed
      {...estate.section(SOCIAL_KEYS)}
    >
      {isLoading ? (
        <Loading />
      ) : (
        SOCIAL_ROWS.map(({ rowId, field, icon: Icon, placeholder }) => (
          <SettingsRow key={rowId} rowId={rowId}>
            {({ controlId }) => (
              <>
                <div className="relative w-full">
                  <Icon aria-hidden className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id={controlId}
                    type="url"
                    placeholder={placeholder}
                    className="pl-10"
                    value={form[field]}
                    {...errorProps(field, controlId)}
                    onChange={(e) => set(field, e.target.value)}
                  />
                </div>
                <FieldError id={`${controlId}-error`} message={errors[field]} />
              </>
            )}
          </SettingsRow>
        ))
      )}
    </SettingsSection>
  );
}
