'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, CheckCircle2, Loader2, History } from 'lucide-react';
import { backfillOwnershipHistory, type BackfillResult } from '@/actions/settings/backfill-ownership-history';
import { toast } from 'sonner';

export default function SettingsPage() {
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<BackfillResult | null>(null);

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
