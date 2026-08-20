'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Globe, Facebook, Instagram, Twitter, Save, Loader2 } from 'lucide-react';
import { useGeneralSettings, useUpdateSettings, useUpdateSetting } from '@/hooks/use-settings';

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
};

const EMPTY_FORM: EstateForm = {
  estate_name: '', estate_address: '', estate_phone: '', estate_email: '',
  estate_logo_url: '', estate_website_url: '', estate_facebook_url: '',
  estate_twitter_url: '', estate_instagram_url: '', assistant_name: '',
};

export default function EstateInfoPage() {
  const { data: generalSettings, isLoading: isLoadingSettings } = useGeneralSettings();
  const updateSettings = useUpdateSettings();
  const updateSetting = useUpdateSetting();

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
  }), [settingsObj]);

  const [localOverrides, setLocalOverrides] = useState<Partial<EstateForm>>({});
  const estateForm = useMemo(() => ({ ...EMPTY_FORM, ...serverForm, ...localOverrides }), [serverForm, localOverrides]);
  const isDirty = Object.keys(localOverrides).length > 0;

  const isAssistantDisabled = String(settingsObj.disable_ai_assistant) === 'true';
  const isAssistantGreetingEnabled = String(settingsObj.ai_assistant_greeting_enabled) !== 'false';

  const handleInputChange = (field: keyof EstateForm, value: string) => {
    setLocalOverrides(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveEstateInfo = async () => {
    updateSettings.mutate(estateForm, {
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
                      onChange={(e) => handleInputChange('estate_email', e.target.value)}
                    />
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
                        onChange={(e) => handleInputChange('estate_website_url', e.target.value)}
                      />
                    </div>
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
                    checked={!isAssistantDisabled}
                    onCheckedChange={(checked) => updateSetting.mutate({ key: 'disable_ai_assistant', value: !checked })}
                    disabled={updateSetting.isPending}
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
                    checked={isAssistantGreetingEnabled}
                    onCheckedChange={(checked) => updateSetting.mutate({ key: 'ai_assistant_greeting_enabled', value: checked })}
                    disabled={updateSetting.isPending}
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
                      onChange={(e) => handleInputChange('estate_facebook_url', e.target.value)}
                    />
                  </div>
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
                      onChange={(e) => handleInputChange('estate_twitter_url', e.target.value)}
                    />
                  </div>
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
                      onChange={(e) => handleInputChange('estate_instagram_url', e.target.value)}
                    />
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {!isLoadingSettings && (
          <div className="flex justify-end">
            <Button
              onClick={handleSaveEstateInfo}
              disabled={!isDirty || updateSettings.isPending}
            >
              {updateSettings.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Save className="mr-2 h-4 w-4" />
              Save Changes
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
