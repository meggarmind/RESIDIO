'use client';

import { SettingsMergedPage } from '@/components/settings/settings-merged-page';
import { SettingsRow } from '@/components/settings/settings-row';
import { SettingsSection } from '@/components/settings/settings-section';
import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Link as LinkIcon,
  RefreshCw,
  Unlink,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useGmailConnectionStatus,
  useConnectGmail,
  useDisconnectGmail,
  useManualFetch,
} from '@/hooks/use-gmail-connection';
import { useCan } from '@/components/auth/can';
import { PERMISSIONS } from '@/lib/auth/action-roles';

/**
 * Gmail import — connection, credentials, and the operational console
 * (manual sync, import history) together, per ADR-0005: an Integration is
 * exempt from the configuration-only boundary the rest of Settings holds to.
 *
 * Was two near-identical pages (`/settings/email-integration` and its
 * `/config` child) rendering the same Gmail connection card; despite the
 * nav describing the child as "Email import rules", neither configured a
 * single rule. Merged into this one page, taking the child's richer markup
 * (status badge, Quick Actions) as the base. `/settings/email-integration/config`
 * is now a redirect stub here.
 */
export default function EmailIntegrationPage() {
  return (
    <Suspense fallback={<EmailIntegrationSkeleton />}>
      <EmailIntegrationContent />
    </Suspense>
  );
}

function EmailIntegrationSkeleton() {
  return (
    <div className="space-y-6">
      <div><Skeleton className="h-8 w-48" /><Skeleton className="h-4 w-96 mt-2" /></div>
      <Card><CardHeader><Skeleton className="h-6 w-40" /></CardHeader><CardContent><Skeleton className="h-24 w-full" /></CardContent></Card>
    </div>
  );
}

function EmailIntegrationContent() {
  const searchParams = useSearchParams();
  // The route needs only email_imports.view; each control is gated on what its action enforces.
  const canConfigure = useCan(PERMISSIONS.EMAIL_IMPORTS_CONFIGURE);
  const canTrigger = useCan(PERMISSIONS.EMAIL_IMPORTS_TRIGGER);
  const { data: connectionStatus, isLoading, refetch } = useGmailConnectionStatus();
  const connectMutation = useConnectGmail();
  const disconnectMutation = useDisconnectGmail();
  const manualFetchMutation = useManualFetch();

  useEffect(() => {
    const success = searchParams.get('success');
    const error = searchParams.get('error');
    if (success) {
      toast.success(decodeURIComponent(success));
      refetch();
      window.history.replaceState({}, '', '/settings/email-integration');
    } else if (error) {
      toast.error(decodeURIComponent(error));
      window.history.replaceState({}, '', '/settings/email-integration');
    }
  }, [searchParams, refetch]);

  const formatDate = (date: string | null) => {
    if (!date) return 'Never';
    return new Date(date).toLocaleString();
  };

  return (
    <SettingsMergedPage description="Connect your Gmail account to automatically import bank statements and transaction alerts.">
      <SettingsSection
        id="connection"
        title="Connection"
        summary={isLoading ? 'Loading' : connectionStatus?.connected ? `Connected as ${connectionStatus.email}` : 'Not connected'}
        instant
      >
        <SettingsRow rowId="gmail-connection" stacked>
          {() => (
            <div className="space-y-4">
              {isLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-8 w-48" />
                </div>
              ) : connectionStatus?.connected ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-success/10 rounded-lg border border-success/20">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="h-6 w-6 text-success" />
                      <div>
                        <p className="font-medium">Connected</p>
                        <p className="text-sm text-muted-foreground">{connectionStatus.email}</p>
                      </div>
                    </div>
                    {canConfigure && (
                    <ConfirmAction
                      trigger={
                        <Button variant="outline" disabled={disconnectMutation.isPending}>
                          <Unlink className="h-4 w-4 mr-2" /> Disconnect
                        </Button>
                      }
                      title="Disconnect Gmail?"
                      description={`Bank alert emails stop being fetched from ${connectionStatus.email} until someone connects Gmail again, which needs a fresh Google sign-in.`}
                      confirmLabel="Disconnect"
                      destructive
                      onConfirm={() => disconnectMutation.mutate()}
                    />
                    )}
                  </div>
                  <Separator />
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Last Sync</p>
                      <p className="font-medium text-sm">{formatDate(connectionStatus.lastSyncAt)}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Status</p>
                      <Badge variant={connectionStatus.lastSyncStatus === 'success' ? 'default' : connectionStatus.lastSyncStatus === 'error' ? 'destructive' : 'secondary'}>
                        {connectionStatus.lastSyncStatus || 'pending'}
                      </Badge>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Emails Fetched</p>
                      <p className="font-medium text-sm">{connectionStatus.lastSyncEmailsCount || 0}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Message</p>
                      <p className="font-medium text-sm truncate" title={connectionStatus.lastSyncMessage || ''}>{connectionStatus.lastSyncMessage || '-'}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-muted/50 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <AlertCircle className="h-6 w-6 text-muted-foreground" />
                      <div>
                        <p className="font-medium">Not Connected</p>
                        <p className="text-sm text-muted-foreground">Connect your Gmail account to start importing emails</p>
                      </div>
                    </div>
                    {canConfigure && (
                      <Button onClick={() => connectMutation.mutate()} disabled={connectMutation.isPending}>
                        <LinkIcon className="h-4 w-4 mr-2" />
                        {connectMutation.isPending ? 'Connecting...' : 'Connect Gmail'}
                      </Button>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground p-4 bg-info/10 rounded-lg">
                    <p className="font-medium text-info mb-2">How it works:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>You&apos;ll be redirected to Google to authorize read-only email access</li>
                      <li>Only emails from First Bank will be fetched</li>
                      <li>Emails are processed hourly or when manually triggered</li>
                      <li>Transaction data is extracted and matched to residents</li>
                    </ul>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-4 text-sm">
                <p className="text-muted-foreground">
                  PDF statement passwords are in{' '}
                  <Link href="/settings/banking#bank-accounts" className="text-primary underline">Banking &gt; Bank accounts</Link>.
                  The limit above which matched payments wait for approval is in{' '}
                  <Link href="/settings/banking#approval-limit" className="text-primary underline">Banking &gt; Approval limit</Link>.
                </p>
              </div>
            </div>
          )}
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        id="sync"
        title="Sync"
        summary={connectionStatus?.connected ? `Last sync: ${formatDate(connectionStatus.lastSyncAt)}` : 'Connect Gmail to sync'}
        instant
      >
        <SettingsRow rowId="gmail-sync" stacked>
          {() =>
            connectionStatus?.connected ? (
              <div className="flex flex-wrap gap-4">
                <Link href="/payments/email-imports" className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2">
                  <Clock className="h-4 w-4 mr-2" /> View Import History
                </Link>
                {canTrigger && (
                  <Button variant="outline" onClick={() => manualFetchMutation.mutate()} disabled={manualFetchMutation.isPending}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${manualFetchMutation.isPending ? 'animate-spin' : ''}`} />
                    {manualFetchMutation.isPending ? 'Fetching...' : 'Manual Fetch'}
                  </Button>
                )}
              </div>

            ) : (
              <p className="text-sm text-muted-foreground">Connect Gmail first. Then you can fetch emails now and open the import history.</p>
            )
          }
        </SettingsRow>
      </SettingsSection>
    </SettingsMergedPage>
  );
}
