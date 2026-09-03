'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, ShieldAlert, Database } from 'lucide-react';
import Link from 'next/link';
import { useSystemSettings } from '@/hooks/use-settings';

function settingsToObject(settings: { key: string; value: unknown }[] | undefined): Record<string, unknown> {
  if (!settings) return {};
  return settings.reduce((acc, setting) => {
    acc[setting.key] = setting.value;
    return acc;
  }, {} as Record<string, unknown>);
}

export default function SystemOverviewPage() {
  const { data: systemSettings } = useSystemSettings();

  const settingsObj = settingsToObject(systemSettings);
  const maintenanceMode = settingsObj.maintenance_mode === true;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">System Overview</h3>
        <p className="text-sm text-muted-foreground">
          Monitor system health and access administrative tools.
        </p>
      </div>

      {maintenanceMode && (
        <Card className="border-amber-300 bg-amber-50/30 dark:bg-amber-950/30">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <ShieldAlert className="h-5 w-5 text-amber-600" />
              <div>
                <p className="font-medium text-amber-800 dark:text-amber-200">Maintenance Mode Active</p>
                <p className="text-sm text-amber-700 dark:text-amber-300">Non-admin users cannot access the application.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/settings/system/maintenance">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldAlert className="h-4 w-4" />
                Maintenance Mode
              </CardTitle>
              <CardDescription>
                Enable maintenance mode and configure the maintenance message.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <Badge variant={maintenanceMode ? 'destructive' : 'outline'}>
                  {maintenanceMode ? 'Active' : 'Inactive'}
                </Badge>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/settings/system/data">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Database className="h-4 w-4" />
                Data & Retention
              </CardTitle>
              <CardDescription>
                Configure data retention policies and prune old data.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Retention and cleanup tools</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
