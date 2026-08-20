'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Shield, Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import {
  useSecuritySettings,
  useUpdateSecuritySetting,
  useResetSecuritySettings,
} from '@/hooks/use-security';

export default function SecuritySettingsPage() {
  const { data: settings, isLoading: settingsLoading } = useSecuritySettings();
  const updateSetting = useUpdateSecuritySetting();
  const resetSettings = useResetSecuritySettings();
  const [showResetDialog, setShowResetDialog] = useState(false);

  const settingsMap = settings ? {
    auto_expire_contacts: settings.auto_expire_contacts,
    max_contacts_per_resident: settings.max_contacts_per_resident,
    expiry_warning_days: settings.expiry_warning_days,
  } : {};

  const handleResetSettings = () => {
    resetSettings.mutate(undefined, {
      onSuccess: () => {
        setShowResetDialog(false);
        toast.success('Security settings reset to defaults');
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">General Settings</h3>
          <p className="text-sm text-muted-foreground">
            Core security configuration and reset options.
          </p>
        </div>
        <Button variant="outline" onClick={() => setShowResetDialog(true)}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset to Defaults
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            <Shield className="inline-block mr-2 h-4 w-4" />
            Security Configuration
          </CardTitle>
          <CardDescription>
            Configure general security settings for the application.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {settingsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Auto-Expire Contacts</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically deactivate contacts after their validity period expires
                  </p>
                </div>
                <Switch
                  checked={settingsMap.auto_expire_contacts ?? true}
                  onCheckedChange={() => updateSetting.mutate({ key: 'security_auto_expire_contacts', value: !(settingsMap.auto_expire_contacts ?? true) })}
                  disabled={updateSetting.isPending}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Max Contacts Per Category</Label>
                  <p className="text-sm text-muted-foreground">
                    Maximum number of active contacts allowed per category
                  </p>
                </div>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={String(settingsMap.max_contacts_per_resident || 50)}
                  onChange={(e) => updateSetting.mutate({ key: 'security_max_contacts_per_resident', value: parseInt(e.target.value) || 50 })}
                  className="w-20 text-center"
                  disabled={updateSetting.isPending}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Warning Days Before Expiry</Label>
                  <p className="text-sm text-muted-foreground">
                    Days before contact expiry to trigger a warning notification
                  </p>
                </div>
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={String(settingsMap.expiry_warning_days?.[0] || 7)}
                  onChange={(e) => updateSetting.mutate({ key: 'security_expiry_warning_days', value: [parseInt(e.target.value) || 7] })}
                  className="w-20 text-center"
                  disabled={updateSetting.isPending}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Security Settings?</DialogTitle>
            <DialogDescription>
              This will reset all security settings to their default values. Permissions and
              contact categories will not be affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetDialog(false)}>Cancel</Button>
            <Button onClick={handleResetSettings} disabled={resetSettings.isPending}>
              {resetSettings.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reset Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
