'use client';

import { useRef } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, Upload, X, ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useGeneralSettings, useUploadEstateLogo, useRemoveEstateLogo } from '@/hooks/use-settings';

function settingsToObject(settings: { key: string; value: unknown }[] | undefined): Record<string, string> {
  if (!settings) return {};
  return settings.reduce((acc, setting) => {
    acc[setting.key] = setting.value as string ?? '';
    return acc;
  }, {} as Record<string, string>);
}

export default function BrandingPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: generalSettings, isLoading: isLoadingSettings } = useGeneralSettings();
  const uploadLogo = useUploadEstateLogo();
  const removeLogo = useRemoveEstateLogo();

  const settingsObj = settingsToObject(generalSettings);
  const logoUrl = settingsObj.estate_logo_url || '';

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Please upload a PNG, JPG, WebP, or SVG image');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error('File size must be less than 2MB');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    uploadLogo.mutate(formData);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveLogo = () => {
    removeLogo.mutate();
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Branding</h3>
        <p className="text-sm text-muted-foreground">
          Customize the look and feel of your application with your estate logo.
        </p>
      </div>
      <Separator />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Estate Logo
          </CardTitle>
          <CardDescription>
            Upload your estate logo. Recommended size: 512x512px. Max 2MB.
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
            <div className="flex items-start gap-4">
              <div className="relative group">
                {logoUrl ? (
                  <div className="relative h-20 w-20 rounded-lg overflow-hidden border bg-muted">
                    <Image
                      src={logoUrl}
                      alt="Estate Logo"
                      fill
                      className="object-contain"
                      unoptimized
                    />
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

              <div className="flex-1 space-y-2">
                <div>
                  <p className="text-sm font-medium">Upload Logo</p>
                  <p className="text-xs text-muted-foreground">
                    Supported formats: PNG, JPG, WebP, SVG
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
                    {logoUrl ? 'Replace Logo' : 'Upload Logo'}
                  </Button>

                  {logoUrl && (
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
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
