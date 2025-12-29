'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, CheckCircle2, Loader2, History, Save, Globe, Facebook, Instagram, Twitter, Upload, X, ImageIcon } from 'lucide-react';
import { backfillOwnershipHistory } from '@/actions/settings/backfill-ownership-history';
import { toast } from 'sonner';
import { useGeneralSettings, useUpdateSettings, useUploadEstateLogo, useRemoveEstateLogo } from '@/hooks/use-settings';

// Type for backfill result (defined inline since it's from 'use server' file)
type BackfillResult = {
  success: boolean;
  error: string | null;
  summary: {
    housesProcessed: number;
    ownershipEndEventsCreated: number;
    moveOutEventsCreated: number;
    errors: string[];
  } | null;
};

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
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  const uploadLogo = useUploadEstateLogo();
  const removeLogo = useRemoveEstateLogo();

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

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Please upload a PNG, JPG, WebP, or SVG image');
      return;
    }

    // Validate file size (2MB max)
    if (file.size > 2 * 1024 * 1024) {
      toast.error('File size must be less than 2MB');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    uploadLogo.mutate(formData);

    // Reset the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveLogo = () => {
    removeLogo.mutate();
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
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              Branding
            </CardTitle>
            <CardDescription>
              Customize the look and feel of your application with your estate logo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoadingSettings ? (
              <div className="flex items-center gap-4">
                <Skeleton className="h-20 w-20 rounded-lg" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start gap-4">
                  {/* Logo Preview */}
                  <div className="relative group">
                    {estateForm.estate_logo_url ? (
                      <div className="relative h-20 w-20 rounded-lg overflow-hidden border bg-muted">
                        <Image
                          src={estateForm.estate_logo_url}
                          alt="Estate Logo"
                          fill
                          className="object-contain"
                          unoptimized
                        />
                        {/* Remove button overlay */}
                        <button
                          onClick={handleRemoveLogo}
                          disabled={removeLogo.isPending}
                          className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                          title="Remove logo"
                        >
                          {removeLogo.isPending ? (
                            <Loader2 className="h-5 w-5 text-white animate-spin" />
                          ) : (
                            <X className="h-5 w-5 text-white" />
                          )}
                        </button>
                      </div>
                    ) : (
                      <div className="h-20 w-20 rounded-lg bg-primary/10 border-2 border-dashed border-primary/50 flex items-center justify-center text-muted-foreground">
                        <ImageIcon className="h-8 w-8" />
                      </div>
                    )}
                  </div>

                  {/* Upload Controls */}
                  <div className="flex-1 space-y-2">
                    <div>
                      <p className="text-sm font-medium">Estate Logo</p>
                      <p className="text-xs text-muted-foreground">
                        Upload your estate logo. Recommended size: 512x512px. Max 2MB.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                        onChange={handleLogoUpload}
                        className="hidden"
                        id="logo-upload"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadLogo.isPending}
                      >
                        {uploadLogo.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="mr-2 h-4 w-4" />
                        )}
                        {estateForm.estate_logo_url ? 'Replace Logo' : 'Upload Logo'}
                      </Button>

                      {estateForm.estate_logo_url && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleRemoveLogo}
                          disabled={removeLogo.isPending}
                          className="text-destructive hover:text-destructive"
                        >
                          {removeLogo.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <X className="mr-2 h-4 w-4" />
                          )}
                          Remove
                        </Button>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Supported formats: PNG, JPG, WebP, SVG
                    </p>
                  </div>
                </div>
              </>
            )}
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
