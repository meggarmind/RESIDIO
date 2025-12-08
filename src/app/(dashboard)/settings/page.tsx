'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

export default function SettingsPage() {
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
        <Card>
          <CardHeader>
            <CardTitle>Estate Information</CardTitle>
            <CardDescription>
              Basic information about the estate.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="estate-name">Estate Name</Label>
              <Input id="estate-name" placeholder="Residio Estate" defaultValue="Residio Estate" disabled />
              <p className="text-[0.8rem] text-muted-foreground">
                The name of the estate displayed on the dashboard.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="support-email">Support Email</Label>
              <Input id="support-email" type="email" placeholder="support@residio.com" disabled />
            </div>
          </CardContent>
          <div className="px-6 pb-6">
            <Button disabled>Save Changes</Button>
          </div>
        </Card>

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
                <p className="text-xs text-muted-foreground">Recommended size: 512x512px</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
