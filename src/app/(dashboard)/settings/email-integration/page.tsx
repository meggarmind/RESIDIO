'use client';

import { SettingsPageHeader } from '@/components/settings/settings-page-header';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/currency-input';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Link as LinkIcon,
  Mail,
  RefreshCw,
  Settings,
  ShieldCheck,
  Unlink,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useGmailConnectionStatus,
  useConnectGmail,
  useDisconnectGmail,
  useManualFetch,
} from '@/hooks/use-gmail-connection';
import { useSettings, useUpdateSetting } from '@/hooks/use-settings';
import { useCan } from '@/components/auth/can';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import {
  EMAIL_AUTO_PROCESS_LIMIT_KEY,
  EMAIL_AUTO_PROCESS_LIMIT_NGN,
  isValidEmailAutoProcessLimit,
} from '@/lib/email-imports/utils';

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
    <div className="space-y-6">
      <SettingsPageHeader description="Connect your Gmail account to automatically import bank statements and transaction alerts." />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" /> Gmail Connection
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
              {canTrigger && (
                <Button variant="outline" onClick={() => manualFetchMutation.mutate()} disabled={manualFetchMutation.isPending}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${manualFetchMutation.isPending ? 'animate-spin' : ''}`} />
                  {manualFetchMutation.isPending ? 'Fetching...' : 'Manual Fetch'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <AutoProcessLimitCard />

      <Card className="bg-muted/30">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">PDF Statement Passwords</p>
              <p className="text-sm text-muted-foreground">Manage PDF passwords in the Bank Accounts settings.</p>
            </div>
            <Button variant="outline" asChild>
              <a href="/settings/banking#bank-accounts"><Settings className="h-4 w-4 mr-2" /> Bank Accounts</a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * The email-import auto-process limit (#710). Shown with settings.view; saving
 * goes through updateSetting, which for this key needs settings.manage_general
 * and the super_admin role (owner decision), so the control is gated on both.
 */
function AutoProcessLimitCard() {
  const canView = useCan(PERMISSIONS.SETTINGS_VIEW);
  const { profile } = useAuth();
  const canEdit =
    useCan(PERMISSIONS.SETTINGS_MANAGE_GENERAL) && profile?.role_name === 'super_admin';
  const { data: settings, isLoading } = useSettings('email_integration');
  const updateSetting = useUpdateSetting();
  const [draft, setDraft] = useState<number | null>(null);

  if (!canView) return null;

  const stored = settings?.find((s) => s.key === EMAIL_AUTO_PROCESS_LIMIT_KEY)?.value;
  const current = stored === undefined ? EMAIL_AUTO_PROCESS_LIMIT_NGN : Number(stored);
  const value = draft ?? current;
  const canSave = canEdit && draft !== null && draft !== current && isValidEmailAutoProcessLimit(draft);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" /> Approval Limit
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-10 w-64" />
        ) : (
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label htmlFor="email-auto-process-limit">Auto-process limit (NGN)</Label>
              <p id="email-auto-process-limit-help" className="text-sm text-muted-foreground">
                Auto-matched payments above this amount wait for approval.
              </p>
              <CurrencyInput
                id="email-auto-process-limit"
                aria-describedby="email-auto-process-limit-help"
                value={value}
                onValueChange={setDraft}
                allowDecimals={false}
                className="w-48 text-right"
                disabled={!canEdit || updateSetting.isPending}
              />
            </div>
            {canEdit && (
              <Button
                onClick={() =>
                  updateSetting.mutate(
                    { key: EMAIL_AUTO_PROCESS_LIMIT_KEY, value: String(draft) },
                    { onSuccess: () => setDraft(null) }
                  )
                }
                disabled={!canSave || updateSetting.isPending}
              >
                {updateSetting.isPending ? 'Saving...' : 'Save'}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
