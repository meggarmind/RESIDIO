'use client';

import { useState, useMemo } from 'react';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Globe, Facebook, Instagram, Twitter } from 'lucide-react';
import { ResidentPortalCard } from './resident-portal-card';
import { useGeneralSettings, useUpdateSettings } from '@/hooks/use-settings';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { StickySaveBar } from '@/components/settings/sticky-save-bar';

function settingsToObject(settings: { key: string; value: unknown }[] | undefined): Record<string, string> {
  if (!settings) return {};
  return settings.reduce((acc, setting) => {
    acc[setting.key] = setting.value as string ?? '';
    return acc;
  }, {} as Record<string, string>);
}

type EstateForm = {
  estate_name: string;
  estate_address: string;
  estate_phone: string;
  estate_email: string;
  estate_logo_url: string;
  estate_website_url: string;
  estate_facebook_url: string;
  estate_twitter_url: string;
  estate_instagram_url: string;
  assistant_name: string;
  disable_ai_assistant: boolean;
  ai_assistant_greeting_enabled: boolean;
};

const EMPTY_FORM: EstateForm = {
  estate_name: '', estate_address: '', estate_phone: '', estate_email: '',
  estate_logo_url: '', estate_website_url: '', estate_facebook_url: '',
  estate_twitter_url: '', estate_instagram_url: '', assistant_name: '',
  disable_ai_assistant: false, ai_assistant_greeting_enabled: true,
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

function fieldErrors(form: EstateForm): Partial<Record<keyof EstateForm, string>> {
  const result = estateFormSchema.safeParse(form);
  if (result.success) return {};
  const errors: Partial<Record<keyof EstateForm, string>> = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0] as keyof EstateForm;
    errors[key] ??= issue.message;
  }
  return errors;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <p id={id} role="alert" className="text-xs text-destructive">{message}</p> : null;
}

export default function EstateInfoPage() {
  const { data: generalSettings, isLoading: isLoadingSettings } = useGeneralSettings();
  const updateSettings = useUpdateSettings();

  const settingsObj = useMemo(() => settingsToObject(generalSettings), [generalSettings]);

  const serverForm = useMemo<EstateForm>(() => ({
    estate_name: settingsObj.estate_name || '',
    estate_address: settingsObj.estate_address || '',
    estate_phone: settingsObj.estate_phone || '',
    estate_email: settingsObj.estate_email || '',
    estate_logo_url: settingsObj.estate_logo_url || '',
    estate_website_url: settingsObj.estate_website_url || '',
    estate_facebook_url: settingsObj.estate_facebook_url || '',
    estate_twitter_url: settingsObj.estate_twitter_url || '',
    estate_instagram_url: settingsObj.estate_instagram_url || '',
    assistant_name: settingsObj.assistant_name || '',
    disable_ai_assistant: String(settingsObj.disable_ai_assistant) === 'true',
    ai_assistant_greeting_enabled: String(settingsObj.ai_assistant_greeting_enabled) !== 'false',
  }), [settingsObj]);

  const [localOverrides, setLocalOverrides] = useState<Partial<EstateForm>>({});
  const estateForm = useMemo(() => ({ ...EMPTY_FORM, ...serverForm, ...localOverrides }), [serverForm, localOverrides]);
  const isDirty = Object.keys(localOverrides).length > 0;
  // Only fields edited here are checked, so an old stored value never blocks an unrelated save.
  const errors = Object.fromEntries(
    Object.entries(fieldErrors(estateForm)).filter(([key]) => key in localOverrides)
  ) as Partial<Record<keyof EstateForm, string>>;
  const hasErrors = Object.keys(errors).length > 0;
  useUnsavedChangesGuard(isDirty);

  const handleInputChange = <K extends keyof EstateForm>(field: K, value: EstateForm[K]) => {
    setLocalOverrides(prev => ({ ...prev, [field]: value }));
  };
  const errorProps = (field: keyof EstateForm, id: string) =>
    errors[field] ? { 'aria-invalid': true, 'aria-describedby': `${id}-error` } : {};

  const handleSaveEstateInfo = async () => {
    if (hasErrors) return;
    updateSettings.mutate(localOverrides, {
      onSuccess: () => {
        setLocalOverrides({});
      }
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Estate Information</h3>
        <p className="text-sm text-muted-foreground">
          Basic information about the estate displayed throughout the application.
        </p>
      </div>
      <Separator />

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Estate Details</CardTitle>
            <CardDescription>
              Core information about your estate.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoadingSettings ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="estate-name">Estate Name</Label>
                    <Input
                      id="estate-name"
                      placeholder="Residio Estate"
                      value={estateForm.estate_name}
                      onChange={(e) => handleInputChange('estate_name', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="estate-email">Contact Email</Label>
                    <Input
                      id="estate-email"
                      type="email"
                      placeholder="contact@estate.com"
                      value={estateForm.estate_email}
                      {...errorProps('estate_email', 'estate-email')}
                      onChange={(e) => handleInputChange('estate_email', e.target.value)}
                    />
                    <FieldError id="estate-email-error" message={errors.estate_email} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="estate-address">Address</Label>
                  <Input
                    id="estate-address"
                    placeholder="123 Estate Road, City, State"
                    value={estateForm.estate_address}
                    onChange={(e) => handleInputChange('estate_address', e.target.value)}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="estate-phone">Phone Number</Label>
                    <Input
                      id="estate-phone"
                      type="tel"
                      placeholder="+234 123 456 7890"
                      value={estateForm.estate_phone}
                      onChange={(e) => handleInputChange('estate_phone', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="estate-website">Website URL</Label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="estate-website"
                        type="url"
                        placeholder="https://www.estate.com"
                        className="pl-10"
                        value={estateForm.estate_website_url}
                        {...errorProps('estate_website_url', 'estate-website')}
                        onChange={(e) => handleInputChange('estate_website_url', e.target.value)}
                      />
                    </div>
                    <FieldError id="estate-website-error" message={errors.estate_website_url} />
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Estate Assistant</CardTitle>
            <CardDescription>
              Control the floating assistant available throughout the admin dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {isLoadingSettings ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-6">
                  <div className="space-y-1">
                    <Label htmlFor="assistant-visible">Show Estate Assistant</Label>
                    <p className="text-sm text-muted-foreground">
                      Make the floating assistant visible for all dashboard users.
                    </p>
                  </div>
                  <Switch
                    id="assistant-visible"
                    checked={!estateForm.disable_ai_assistant}
                    onCheckedChange={(checked) => handleInputChange('disable_ai_assistant', !checked)}
                  />
                </div>

                <div className="flex items-center justify-between gap-6">
                  <div className="space-y-1">
                    <Label htmlFor="assistant-greeting">Send an opening greeting</Label>
                    <p className="text-sm text-muted-foreground">
                      Start a new conversation with a personalized greeting.
                    </p>
                  </div>
                  <Switch
                    id="assistant-greeting"
                    checked={estateForm.ai_assistant_greeting_enabled}
                    onCheckedChange={(checked) => handleInputChange('ai_assistant_greeting_enabled', checked)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="assistant-name">Assistant name</Label>
                  <Input
                    id="assistant-name"
                    placeholder="Estate Assistant"
                    value={estateForm.assistant_name}
                    onChange={(e) => handleInputChange('assistant_name', e.target.value)}
                  />
                  <p className="text-[0.8rem] text-muted-foreground">
                    Defaults to &quot;[Estate Name] Assistant&quot; when left blank.
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <ResidentPortalCard />

        <Card>
          <CardHeader>
            <CardTitle>Social Links</CardTitle>
            <CardDescription>
              Connect your estate&apos;s social media profiles.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoadingSettings ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="facebook-url">Facebook</Label>
                  <div className="relative">
                    <Facebook className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="facebook-url"
                      type="url"
                      placeholder="https://facebook.com/yourestate"
                      className="pl-10"
                      value={estateForm.estate_facebook_url}
                      {...errorProps('estate_facebook_url', 'facebook-url')}
                      onChange={(e) => handleInputChange('estate_facebook_url', e.target.value)}
                    />
                  </div>
                  <FieldError id="facebook-url-error" message={errors.estate_facebook_url} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="twitter-url">Twitter / X</Label>
                  <div className="relative">
                    <Twitter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="twitter-url"
                      type="url"
                      placeholder="https://twitter.com/yourestate"
                      className="pl-10"
                      value={estateForm.estate_twitter_url}
                      {...errorProps('estate_twitter_url', 'twitter-url')}
                      onChange={(e) => handleInputChange('estate_twitter_url', e.target.value)}
                    />
                  </div>
                  <FieldError id="twitter-url-error" message={errors.estate_twitter_url} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="instagram-url">Instagram</Label>
                  <div className="relative">
                    <Instagram className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="instagram-url"
                      type="url"
                      placeholder="https://instagram.com/yourestate"
                      className="pl-10"
                      value={estateForm.estate_instagram_url}
                      {...errorProps('estate_instagram_url', 'instagram-url')}
                      onChange={(e) => handleInputChange('estate_instagram_url', e.target.value)}
                    />
                  </div>
                  <FieldError id="instagram-url-error" message={errors.estate_instagram_url} />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {!isLoadingSettings && (
          <StickySaveBar
            isDirty={isDirty}
            isSaving={updateSettings.isPending}
            canSave={!hasErrors}
            onSave={handleSaveEstateInfo}
            onDiscard={() => setLocalOverrides({})}
          />
        )}
      </div>
    </div>
  );
}
