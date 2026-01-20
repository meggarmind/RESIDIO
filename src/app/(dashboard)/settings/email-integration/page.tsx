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
  useManualFetch,
  useUpdateSyncCriteria,
  useResetEmailImports,
} from '@/hooks/use-gmail-connection';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useState } from 'react';

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
  const manualFetchMutation = useManualFetch();
  const updateCriteriaMutation = useUpdateSyncCriteria();
  const resetMutation = useResetEmailImports();

  const [senders, setSenders] = useState<string>('');
  const [keywords, setKeywords] = useState<string>('');
  const [daysBack, setDaysBack] = useState<number>(7);
  const [includeCredits, setIncludeCredits] = useState<boolean>(true);
  const [includeDebits, setIncludeDebits] = useState<boolean>(true);
  const [showDebugInfo, setShowDebugInfo] = useState<boolean>(false);

  // Initialize form when data loads
  useEffect(() => {
    if (connectionStatus?.syncCriteria) {
      setSenders(connectionStatus.syncCriteria.senders.join(', '));
      setKeywords(connectionStatus.syncCriteria.keywords.join(', '));
      setDaysBack(connectionStatus.syncCriteria.days_back || 7);
      setIncludeCredits(connectionStatus.syncCriteria.include_credits !== false);
      setIncludeDebits(connectionStatus.syncCriteria.include_debits !== false);
      setShowDebugInfo(connectionStatus.syncCriteria.show_debug_info || false);
    }
  }, [connectionStatus]);

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
              <Button
                variant="outline"
                onClick={() => manualFetchMutation.mutate()}
                disabled={manualFetchMutation.isPending}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${manualFetchMutation.isPending ? 'animate-spin' : ''}`} />
                {manualFetchMutation.isPending ? 'Fetching...' : 'Manual Fetch'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Import Configuration */}
      {connectionStatus?.connected && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Import Configuration
            </CardTitle>
            <CardDescription>
              Define which emails should be scanned for transaction data.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="senders">Authorized Senders (comma separated)</Label>
                <Input
                  id="senders"
                  placeholder="alert@bank.com, noreply@bank.com"
                  value={senders}
                  onChange={(e) => setSenders(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Only emails from these addresses will be processed.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="keywords">Keyword Filters (comma separated)</Label>
                <Input
                  id="keywords"
                  placeholder="alert, transaction, statement"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Emails must contain at least one of these keywords in the subject or body.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="daysBack">Default Scan Range (days)</Label>
                  <Input
                    id="daysBack"
                    type="number"
                    min={1}
                    max={90}
                    value={daysBack}
                    onChange={(e) => setDaysBack(parseInt(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Number of days back to look for new emails during each sync.
                  </p>
                </div>

                <div className="flex flex-col justify-center space-y-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="credits" className="flex flex-col gap-1">
                      <span>Include Credit Alerts</span>
                      <span className="font-normal text-xs text-muted-foreground">Inward payments/deposits</span>
                    </Label>
                    <Switch
                      id="credits"
                      checked={includeCredits}
                      onCheckedChange={setIncludeCredits}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="debits" className="flex flex-col gap-1">
                      <span>Include Debit Alerts</span>
                      <span className="font-normal text-xs text-muted-foreground">Outward payments/expenses</span>
                    </Label>
                    <Switch
                      id="debits"
                      checked={includeDebits}
                      onCheckedChange={setIncludeDebits}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="debug" className="flex flex-col gap-1">
                      <span>Show Debug Information</span>
                      <span className="font-normal text-xs text-muted-foreground">Display technical details in import reports</span>
                    </Label>
                    <Switch
                      id="debug"
                      checked={showDebugInfo}
                      onCheckedChange={setShowDebugInfo}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <Button
                onClick={() => {
                  updateCriteriaMutation.mutate({
                    senders: senders.split(',').map(s => s.trim()).filter(Boolean),
                    keywords: keywords.split(',').map(k => k.trim()).filter(Boolean),
                    days_back: daysBack,
                    include_credits: includeCredits,
                    include_debits: includeDebits,
                    show_debug_info: showDebugInfo,
                  });
                }}
                disabled={updateCriteriaMutation.isPending}
              >
                {updateCriteriaMutation.isPending ? 'Saving...' : 'Save Configuration'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Danger Zone */}
      {connectionStatus?.connected && (
        <Card className="border-red-200 dark:border-red-900 bg-red-50/10 dark:bg-red-950/5">
          <CardHeader>
            <CardTitle className="text-red-600 dark:text-red-400 flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Danger Zone
            </CardTitle>
            <CardDescription className="text-red-600/80 dark:text-red-400/80">
              Irreversible actions that affect your data.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">Reset Import Data</p>
                <p className="text-sm text-muted-foreground">
                  Permanently delete all imported emails and transactions. This allows you to re-import from scratch.
                </p>
              </div>
              <Button
                variant="destructive"
                onClick={() => {
                  if (confirm('Are you sure you want to delete ALL imported email data? This cannot be undone.')) {
                    resetMutation.mutate();
                  }
                }}
                disabled={resetMutation.isPending}
              >
                {resetMutation.isPending ? 'Resetting...' : 'Reset All Data'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
