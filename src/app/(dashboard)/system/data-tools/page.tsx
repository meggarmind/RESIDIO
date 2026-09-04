'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, AlertCircle, Archive } from 'lucide-react';
import { backfillOwnershipHistory } from '@/actions/settings/backfill-ownership-history';
import { toast } from 'sonner';

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

export default function DataToolsPage() {
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
        <h3 className="text-lg font-medium">Data Tools</h3>
        <p className="text-sm text-muted-foreground">
          Administrative utilities for maintaining data integrity and historical accuracy.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5" />
            Backfill Ownership History
          </CardTitle>
          <CardDescription>
            Scan all houses and create missing ownership history events.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This syncs the ownership history timeline with actual resident-house records,
            filling in any gaps from past data.
          </p>
          <div className="flex items-center gap-3">
            <Button
              onClick={handleBackfillOwnershipHistory}
              disabled={isBackfilling}
              variant="outline"
            >
              {isBackfilling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isBackfilling ? 'Running Backfill...' : 'Run Backfill'}
            </Button>
          </div>

          {backfillResult && (
            <div className={`mt-4 p-4 rounded-lg border ${backfillResult.success
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
        </CardContent>
      </Card>
    </div>
  );
}
