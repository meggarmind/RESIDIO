'use client';

import { useEffect } from 'react';
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
import Link from 'next/link';
import {
  useGmailConnectionStatus,
  useConnectGmail,
  useDisconnectGmail,
  useManualFetch,
} from '@/hooks/use-gmail-connection';

export default function EmailIntegrationConfigPage() {
  const searchParams = useSearchParams();
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
      window.history.replaceState({}, '', '/settings/email-integration/config');
    } else if (error) {
      toast.error(decodeURIComponent(error));
      window.history.replaceState({}, '', '/settings/email-integration/config');
    }
  }, [searchParams, refetch]);

  const formatDate = (date: string | null) => {
    if (!date) return 'Never';
    return new Date(date).toLocaleString();
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Import Configuration</h3>
        <p className="text-sm text-muted-foreground">
          Configure email import rules and connection details.
        </p>
      </div>
      <Separator />

      {/* Gmail Connection Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Gmail Connection
          </CardTitle>
          <CardDescription>Connect a Gmail account to receive bank statements</CardDescription>
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
                    <p className="text-sm text-muted-foreground">{connectionStatus.email}</p>
                  </div>
                </div>
                <Button variant="outline" onClick={() => disconnectMutation.mutate()} disabled={disconnectMutation.isPending}>
                  <Unlink className="h-4 w-4 mr-2" /> Disconnect
                </Button>
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
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border">
                <div className="flex items-center gap-3">
                  <AlertCircle className="h-6 w-6 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Not Connected</p>
                    <p className="text-sm text-muted-foreground">Connect your Gmail account to start importing emails</p>
                  </div>
                </div>
                <Button onClick={() => connectMutation.mutate()} disabled={connectMutation.isPending}>
                  <LinkIcon className="h-4 w-4 mr-2" />
                  {connectMutation.isPending ? 'Connecting...' : 'Connect Gmail'}
                </Button>
              </div>
            </div>
          )}
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
              <Link href="/payments/email-imports" className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2">
                <Clock className="h-4 w-4 mr-2" /> View Import History
              </Link>
              <Button variant="outline" onClick={() => manualFetchMutation.mutate()} disabled={manualFetchMutation.isPending}>
                <RefreshCw className={`h-4 w-4 mr-2 ${manualFetchMutation.isPending ? 'animate-spin' : ''}`} />
                {manualFetchMutation.isPending ? 'Fetching...' : 'Manual Fetch'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
