'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ArrowRight,
  AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';
import { useNotificationTemplates, useNotificationSchedules } from '@/hooks/use-notifications';

export default function SettingsPage() {
  const { data: templates } = useNotificationTemplates();
  const { data: schedules } = useNotificationSchedules();

  const activeTemplates = templates?.filter(t => t.is_active).length || 0;
  const totalTemplates = templates?.length || 0;
  const activeSchedules = schedules?.filter(s => s.is_active).length || 0;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Settings Overview</h3>
        <p className="text-sm text-muted-foreground">
          Configure your estate management system. Select a section below to get started.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/settings/estate-info">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
            <CardHeader>
              <CardTitle className="text-base">Estate Information</CardTitle>
              <CardDescription>
                Update your estate name, address, contact details, and social links.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Name, address, website</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/settings/appearance">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
            <CardHeader>
              <CardTitle className="text-base">Appearance</CardTitle>
              <CardDescription>
                Customize the look and feel of your application.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Theme and display settings</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/settings/branding">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
            <CardHeader>
              <CardTitle className="text-base">Branding</CardTitle>
              <CardDescription>
                Upload your estate logo and customize visual identity.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Logo and visual identity</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/settings/data-management">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
            <CardHeader>
              <CardTitle className="text-base">Data Management</CardTitle>
              <CardDescription>
                Administrative tools for maintaining data integrity.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Backfill and maintenance tools</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/settings/notifications">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
            <CardHeader>
              <CardTitle className="text-base">Notifications</CardTitle>
              <CardDescription>
                Manage notification templates, schedules, and reminders.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant={activeTemplates > 0 ? 'default' : 'outline'}>
                    {activeTemplates}/{totalTemplates} templates
                  </Badge>
                  <Badge variant={activeSchedules > 0 ? 'default' : 'outline'}>
                    {activeSchedules} schedules
                  </Badge>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/settings/whatsapp">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
            <CardHeader>
              <CardTitle className="text-base">WhatsApp Operations</CardTitle>
              <CardDescription>
                Review consent status and pending WhatsApp contacts.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Consent and pending contacts</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
            <div>
              <h4 className="font-medium text-amber-800 dark:text-amber-200">
                Data Management Note
              </h4>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                The data management section contains administrative tools that modify historical records.
                Use with caution and ensure you have backups before making changes.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
