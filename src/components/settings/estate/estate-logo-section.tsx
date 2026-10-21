'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { ImageIcon, Loader2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { Skeleton } from '@/components/ui/skeleton';
import { useGeneralSettings, useRemoveEstateLogo, useUploadEstateLogo } from '@/hooks/use-settings';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { SettingsRow } from '@/components/settings/settings-row';
import { SettingsSection } from '@/components/settings/settings-section';

/** Logo of /settings/estate (from the old Branding page). Upload and Remove act at once. */
export function EstateLogoSection() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.SETTINGS_MANAGE_GENERAL);
  const { data: generalSettings, isLoading } = useGeneralSettings();
  const uploadLogo = useUploadEstateLogo();
  const removeLogo = useRemoveEstateLogo();
  const [confirmRemove, setConfirmRemove] = useState(false);

  const logoUrl = String(generalSettings?.find((setting) => setting.key === 'estate_logo_url')?.value ?? '');

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Please upload a PNG, JPG, or WebP image');
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

  return (
    <>
      <ConfirmAction
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="Remove the estate logo?"
        description="The logo is removed straight away wherever the app shows it. To get it back you have to upload the file again."
        confirmLabel="Remove logo"
        destructive
        onConfirm={() => removeLogo.mutate()}
      />
      <SettingsSection
        id="logo"
        title="Logo"
        summary={isLoading ? 'Loading' : logoUrl ? 'Logo uploaded' : 'No logo yet'}
        permissions={[PERMISSIONS.SETTINGS_MANAGE_GENERAL]}
        instant
      >
        <SettingsRow rowId="estate-logo">
          {({ controlId }) =>
            isLoading ? (
              <Skeleton className="h-20 w-20 rounded-lg" />
            ) : (
              <>
                {logoUrl ? (
                  <div className="relative h-20 w-20 overflow-hidden rounded-lg border bg-muted">
                    <Image src={logoUrl} alt="Estate Logo" fill className="object-contain" unoptimized />
                  </div>
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-lg border-2 border-dashed border-primary/50 bg-primary/10 text-muted-foreground">
                    <ImageIcon className="h-8 w-8" aria-hidden />
                  </div>
                )}
                {canManage && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp"
                      onChange={handleLogoUpload}
                      className="hidden"
                      id={controlId}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-11 md:min-h-8"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadLogo.isPending}
                    >
                      {uploadLogo.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                      {logoUrl ? 'Replace Logo' : 'Upload Logo'}
                    </Button>
                    {logoUrl && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmRemove(true)}
                        disabled={removeLogo.isPending}
                        className="min-h-11 text-destructive hover:text-destructive md:min-h-8"
                      >
                        {removeLogo.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <X className="mr-2 h-4 w-4" />}
                        Remove
                      </Button>
                    )}
                  </>
                )}
              </>
            )
          }
        </SettingsRow>
      </SettingsSection>
    </>
  );
}
