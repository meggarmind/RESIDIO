'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, CheckCircle2, Loader2, History, Save, Globe, Facebook, Instagram, Twitter } from 'lucide-react';
import { backfillOwnershipHistory, type BackfillResult } from '@/actions/settings/backfill-ownership-history';
import { toast } from 'sonner';
import { useGeneralSettings, useUpdateSettings } from '@/hooks/use-settings';

// Helper to convert settings array to key-value object
function settingsToObject(settings: { key: string; value: unknown }[] | undefined): Record<string, string> {
  if (!settings) return {};
  return settings.reduce((acc, setting) => {
    acc[setting.key] = setting.value as string ?? '';
    return acc;
  }, {} as Record<string, string>);
}

export default function SettingsPage() {
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<BackfillResult | null>(null);

  // Estate info form state
  const [estateForm, setEstateForm] = useState({
    estate_name: '',
    estate_address: '',
    estate_phone: '',
    estate_email: '',
    estate_logo_url: '',
    estate_website_url: '',
    estate_facebook_url: '',
    estate_twitter_url: '',
    estate_instagram_url: '',
  });
  const [isDirty, setIsDirty] = useState(false);

  const { data: generalSettings, isLoading: isLoadingSettings } = useGeneralSettings();
  const updateSettings = useUpdateSettings();

  // Load settings into form when data is fetched
  useEffect(() => {
    if (generalSettings) {
      const settingsObj = settingsToObject(generalSettings);
      setEstateForm({
        estate_name: settingsObj.estate_name || '',
        estate_address: settingsObj.estate_address || '',
        estate_phone: settingsObj.estate_phone || '',
        estate_email: settingsObj.estate_email || '',
        estate_logo_url: settingsObj.estate_logo_url || '',
        estate_website_url: settingsObj.estate_website_url || '',
        estate_facebook_url: settingsObj.estate_facebook_url || '',
        estate_twitter_url: settingsObj.estate_twitter_url || '',
        estate_instagram_url: settingsObj.estate_instagram_url || '',
      });
      setIsDirty(false);
    }
  }, [generalSettings]);

  const handleInputChange = (field: keyof typeof estateForm, value: string) => {
    setEstateForm(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
  };

  const handleSaveEstateInfo = async () => {
    updateSettings.mutate(estateForm, {
      onSuccess: () => {
        setIsDirty(false);
      }
    });
  };

  const handleBackfillOwnershipHistory = async () => {
    setIsBackfilling(true);
    setBackfillResult(null);

    try {
      const result = await backfillOwnershipHistory();
      setBackfillResult(result);

      if (result.success) {
        const created = (result.summary?.ownershipEndEventsCreated || 0) + (result.summary?.moveOutEventsCreated || 0);
        if (created > 0) {
          toast.success(`Backfill complete. ${created} history event(s) created.`);
        } else {
          toast.info('Backfill complete. No missing events found.');
        }
      } else {
        toast.error(result.error || 'Backfill failed');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setIsBackfilling(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">General Settings</h3>
        <p className="text-sm text-muted-foreground">
          Configure general application information.
        </p>
      </div>
      <Separator />

      <div className="space-y-6">
        {/* Estate Information Card */}
        <Card>
          <CardHeader>
            <CardTitle>Estate Information</CardTitle>
            <CardDescription>
              Basic information about the estate displayed throughout the application.
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

        {/* Social Links Card */}
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

        {/* Save Button */}
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

        {/* Branding Card */}
        <Card>
          <CardHeader>
            <CardTitle>Branding</CardTitle>
            <CardDescription>
              Customize the look and feel of your application.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-lg bg-primary/10 border-2 border-dashed border-primary/50 flex items-center justify-center text-muted-foreground">
                Logo
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">Application Logo</p>
                <p className="text-xs text-muted-foreground">
                  Logo upload coming soon. Recommended size: 512x512px
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Data Management Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Data Management
            </CardTitle>
            <CardDescription>
              Administrative tools for maintaining data integrity.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Backfill Ownership History</h4>
              <p className="text-sm text-muted-foreground">
                Scan all houses and create missing ownership history events. This syncs the
                ownership history timeline with actual resident-house records, filling in any
                gaps from past data.
              </p>
              <div className="flex items-center gap-3 mt-3">
                <Button
                  onClick={handleBackfillOwnershipHistory}
                  disabled={isBackfilling}
                  variant="outline"
                >
                  {isBackfilling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isBackfilling ? 'Running Backfill...' : 'Run Backfill'}
                </Button>
              </div>

              {/* Show backfill results */}
              {backfillResult && (
                <div className={`mt-4 p-4 rounded-lg border ${
                  backfillResult.success
                    ? 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800'
                    : 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    {backfillResult.success ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                    )}
                    <span className="font-medium text-sm">
                      {backfillResult.success ? 'Backfill Complete' : 'Backfill Failed'}
                    </span>
                  </div>

                  {backfillResult.error && (
                    <p className="text-sm text-red-600 dark:text-red-400">{backfillResult.error}</p>
                  )}

                  {backfillResult.summary && (
                    <div className="text-sm space-y-1 mt-2">
                      <p>Houses processed: {backfillResult.summary.housesProcessed}</p>
                      <p>Ownership end events created: {backfillResult.summary.ownershipEndEventsCreated}</p>
                      <p>Move-out events created: {backfillResult.summary.moveOutEventsCreated}</p>
                      {backfillResult.summary.errors.length > 0 && (
                        <div className="mt-2">
                          <p className="font-medium text-amber-600 dark:text-amber-400">
                            Warnings ({backfillResult.summary.errors.length}):
                          </p>
                          <ul className="list-disc list-inside text-xs text-muted-foreground">
                            {backfillResult.summary.errors.slice(0, 5).map((error, i) => (
                              <li key={i}>{error}</li>
                            ))}
                            {backfillResult.summary.errors.length > 5 && (
                              <li>...and {backfillResult.summary.errors.length - 5} more</li>
                            )}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
