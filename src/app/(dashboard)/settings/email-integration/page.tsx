'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Link as LinkIcon,
  Mail,
  RefreshCw,
  Settings,
  Unlink,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useGmailConnectionStatus,
  useConnectGmail,
  useDisconnectGmail,
} from '@/hooks/use-gmail-connection';

// Wrapper component to handle Suspense for useSearchParams
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
      <div>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96 mt-2" />
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

function EmailIntegrationContent() {
  const searchParams = useSearchParams();
  const { data: connectionStatus, isLoading, refetch } = useGmailConnectionStatus();
  const connectMutation = useConnectGmail();
  const disconnectMutation = useDisconnectGmail();

  // Handle success/error from OAuth callback
  useEffect(() => {
    const success = searchParams.get('success');
    const error = searchParams.get('error');

    if (success) {
      toast.success(decodeURIComponent(success));
      refetch();
      // Clean URL
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Email Integration</h1>
        <p className="text-muted-foreground mt-1">
          Connect your Gmail account to automatically import bank statements and transaction alerts.
        </p>
      </div>

      {/* Gmail Connection Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Gmail Connection
          </CardTitle>
          <CardDescription>
            Connect a Gmail account to receive bank statements from First Bank
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-8 w-48" />
            </div>
          ) : connectionStatus?.connected ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-900">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                  <div>
                    <p className="font-medium">Connected</p>
                    <p className="text-sm text-muted-foreground">
                      {connectionStatus.email}
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => disconnectMutation.mutate()}
                  disabled={disconnectMutation.isPending}
                >
                  <Unlink className="h-4 w-4 mr-2" />
                  Disconnect
                </Button>
              </div>

              <Separator />

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Last Sync</p>
                  <p className="font-medium text-sm">
                    {formatDate(connectionStatus.lastSyncAt)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge
                    variant={
                      connectionStatus.lastSyncStatus === 'success'
                        ? 'default'
                        : connectionStatus.lastSyncStatus === 'error'
                          ? 'destructive'
                          : 'secondary'
                    }
                  >
                    {connectionStatus.lastSyncStatus || 'pending'}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Emails Fetched</p>
                  <p className="font-medium text-sm">
                    {connectionStatus.lastSyncEmailsCount || 0}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Message</p>
                  <p className="font-medium text-sm truncate" title={connectionStatus.lastSyncMessage || ''}>
                    {connectionStatus.lastSyncMessage || '-'}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border">
                <div className="flex items-center gap-3">
                  <AlertCircle className="h-6 w-6 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Not Connected</p>
                    <p className="text-sm text-muted-foreground">
                      Connect your Gmail account to start importing emails
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => connectMutation.mutate()}
                  disabled={connectMutation.isPending}
                >
                  <LinkIcon className="h-4 w-4 mr-2" />
                  {connectMutation.isPending ? 'Connecting...' : 'Connect Gmail'}
                </Button>
              </div>

              <div className="text-sm text-muted-foreground p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                <p className="font-medium text-blue-700 dark:text-blue-400 mb-2">
                  How it works:
                </p>
                <ul className="list-disc list-inside space-y-1">
                  <li>You&apos;ll be redirected to Google to authorize read-only email access</li>
                  <li>Only emails from First Bank will be fetched</li>
                  <li>Emails are processed hourly or when manually triggered</li>
                  <li>Transaction data is extracted and matched to residents</li>
                </ul>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bank Account Passwords - Moved to Bank Accounts Settings */}
      <Card className="bg-muted/30">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">PDF Statement Passwords</p>
              <p className="text-sm text-muted-foreground">
                Manage PDF passwords in the Bank Accounts settings.
              </p>
            </div>
            <Button variant="outline" asChild>
              <a href="/settings/bank-accounts">
                <Settings className="h-4 w-4 mr-2" />
                Bank Accounts
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      {connectionStatus?.connected && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <Button variant="outline" asChild>
                <a href="/payments/email-imports">
                  <Clock className="h-4 w-4 mr-2" />
                  View Import History
                </a>
              </Button>
              <Button variant="outline" disabled>
                <RefreshCw className="h-4 w-4 mr-2" />
                Manual Fetch (Coming Soon)
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
