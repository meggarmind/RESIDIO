'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  getWhatsAppConnectionStatus,
  saveWhatsAppCredentials,
  disconnectWhatsApp,
  testWhatsAppConnection,
  type WhatsAppConnectionStatus,
} from '@/actions/whatsapp/connection';
import { TemplateContentSids } from '@/app/(dashboard)/settings/whatsapp/template-content-sids';

const DISCONNECTED_STATUS: WhatsAppConnectionStatus = {
  connected: false,
  provider: null,
  phoneNumberId: null,
  fromNumber: null,
  apiVersion: null,
  updatedAt: null,
  updatedByName: null,
  hasAccessToken: false,
  hasVerifyToken: false,
  hasAppSecret: false,
  hasAuthToken: false,
  templateContentSids: null,
};

function formatSavedAt(status: WhatsAppConnectionStatus): string {
  const when = status.updatedAt ? new Date(status.updatedAt).toLocaleString() : 'an unknown time';
  return status.updatedByName ? `Saved ${when} by ${status.updatedByName}` : `Saved ${when}`;
}

export function ConnectionSettings({
  initial,
  siteUrl,
}: {
  initial: WhatsAppConnectionStatus;
  siteUrl: string;
}) {
  const [status, setStatus] = useState(initial);
  const [provider, setProvider] = useState<'meta' | 'twilio'>(initial.provider || 'meta');
  const [showForm, setShowForm] = useState(!initial.connected);

  // Secret fields -- always start empty. Never pre-filled from the server;
  // getWhatsAppConnectionStatus() never returns a secret to pre-fill from.
  const [accessToken, setAccessToken] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [apiVersion, setApiVersion] = useState('');
  const [graphBaseUrl, setGraphBaseUrl] = useState('');
  const [accountSid, setAccountSid] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [fromNumber, setFromNumber] = useState('');

  const [message, setMessage] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  // The verify token is returned exactly once by saveWhatsAppCredentials().
  // Held only in local component state -- never persisted, never re-fetched.
  const [savedVerifyToken, setSavedVerifyToken] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const webhookUrl =
    provider === 'meta' ? `${siteUrl}/api/whatsapp/webhook` : `${siteUrl}/api/whatsapp/webhook/twilio`;

  function clearSecretFields() {
    setAccessToken('');
    setVerifyToken('');
    setAppSecret('');
    setAccountSid('');
    setAuthToken('');
  }

  function save() {
    setMessage(null);
    startTransition(async () => {
      const input =
        provider === 'meta'
          ? {
              provider: 'meta' as const,
              accessToken,
              phoneNumberId,
              verifyToken,
              appSecret,
              apiVersion: apiVersion.trim() || undefined,
              graphBaseUrl: graphBaseUrl.trim() || undefined,
            }
          : {
              provider: 'twilio' as const,
              accountSid,
              authToken,
              fromNumber,
            };

      const result = await saveWhatsAppCredentials(input);
      if (!result.success || !result.data) {
        setMessage(result.error || 'Failed to save WhatsApp credentials');
        return;
      }

      setSavedVerifyToken(result.data.verifyToken ?? null);
      clearSecretFields();
      setShowForm(false);

      const refreshed = await getWhatsAppConnectionStatus();
      if (refreshed.success && refreshed.data) {
        setStatus(refreshed.data);
      }
      setMessage('WhatsApp credentials saved');
    });
  }

  function disconnect() {
    setMessage(null);
    setTestMessage(null);
    startTransition(async () => {
      const result = await disconnectWhatsApp();
      if (!result.success) {
        setMessage(result.error || 'Failed to disconnect WhatsApp');
        return;
      }
      setStatus(DISCONNECTED_STATUS);
      setSavedVerifyToken(null);
      setShowForm(true);
      setMessage('WhatsApp disconnected. Falling back to environment variable credentials, if configured.');
    });
  }

  function test() {
    setTestMessage(null);
    startTransition(async () => {
      const result = await testWhatsAppConnection();
      if (!result.success || !result.data) {
        setTestMessage(result.error || 'Connection test failed');
        return;
      }
      setTestMessage(result.data.message);
    });
  }

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(`${label} copied`);
    } catch {
      setMessage(`Could not copy ${label.toLowerCase()}`);
    }
  }

  return (
    <div className="space-y-4">
      {status.connected ? (
        <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium capitalize">{status.provider} connected</span>
            <span className="text-xs text-muted-foreground">{formatSavedAt(status)}</span>
          </div>
          <p className="text-muted-foreground">
            {status.provider === 'meta'
              ? `Phone number ID: ${status.phoneNumberId || '—'} · API version: ${status.apiVersion || '—'}`
              : `From number: ${status.fromNumber || '—'}`}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Not connected. WhatsApp will fall back to environment variable credentials, if configured.
        </p>
      )}

      {status.connected && status.provider === 'twilio' && (
        <TemplateContentSids initial={status.templateContentSids} />
      )}

      <div className="flex flex-wrap items-center gap-3">
        {status.connected && !showForm && (
          <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => setShowForm(true)}>
            Replace credentials
          </Button>
        )}
        {status.connected && (
          <Button type="button" size="sm" variant="destructive" disabled={isPending} onClick={disconnect}>
            Disconnect
          </Button>
        )}
        <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={test}>
          Test connection
        </Button>
        {testMessage && <span className="text-xs text-muted-foreground">{testMessage}</span>}
      </div>

      {savedVerifyToken && (
        <div className="space-y-1 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
          <p className="font-medium">Meta webhook verify token (copy this now — it will not be shown again)</p>
          <div className="flex items-center gap-2">
            <code className="rounded bg-background px-2 py-1 font-mono text-xs">{savedVerifyToken}</code>
            <Button type="button" size="sm" variant="outline" onClick={() => copy(savedVerifyToken, 'Verify token')}>
              Copy
            </Button>
          </div>
        </div>
      )}

      {showForm && (
        <div className="space-y-3 rounded-md border p-3">
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Provider</span>
            <select
              value={provider}
              onChange={(event) => setProvider(event.target.value as 'meta' | 'twilio')}
              className="h-9 w-full rounded-md border bg-background px-3"
            >
              <option value="meta">Meta (WhatsApp Cloud API)</option>
              <option value="twilio">Twilio</option>
            </select>
          </label>

          {provider === 'meta' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Access token</span>
                <Input type="password" autoComplete="off" value={accessToken} onChange={(event) => setAccessToken(event.target.value)} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Phone number ID</span>
                <Input value={phoneNumberId} onChange={(event) => setPhoneNumberId(event.target.value)} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Verify token</span>
                <Input type="password" autoComplete="off" value={verifyToken} onChange={(event) => setVerifyToken(event.target.value)} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">App secret</span>
                <Input type="password" autoComplete="off" value={appSecret} onChange={(event) => setAppSecret(event.target.value)} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">API version (optional)</span>
                <Input value={apiVersion} onChange={(event) => setApiVersion(event.target.value)} placeholder="v23.0" />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Graph base URL (optional)</span>
                <Input value={graphBaseUrl} onChange={(event) => setGraphBaseUrl(event.target.value)} placeholder="https://graph.facebook.com" />
              </label>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Account SID</span>
                <Input type="password" autoComplete="off" value={accountSid} onChange={(event) => setAccountSid(event.target.value)} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Auth token</span>
                <Input type="password" autoComplete="off" value={authToken} onChange={(event) => setAuthToken(event.target.value)} />
              </label>
              <label className="space-y-1 text-sm sm:col-span-2">
                <span className="text-muted-foreground">From number</span>
                <Input value={fromNumber} onChange={(event) => setFromNumber(event.target.value)} placeholder="+15551234567" />
              </label>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button type="button" size="sm" disabled={isPending} onClick={save}>
              Save credentials
            </Button>
            {status.connected && (
              <Button type="button" size="sm" variant="ghost" disabled={isPending} onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="space-y-1 text-sm">
        <span className="text-muted-foreground">
          {provider === 'meta' ? 'Meta' : 'Twilio'} webhook callback URL
        </span>
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded bg-muted/50 px-2 py-1 font-mono text-xs">{webhookUrl}</code>
          <Button type="button" size="sm" variant="outline" onClick={() => copy(webhookUrl, 'Webhook URL')}>
            Copy
          </Button>
        </div>
      </div>

      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </div>
  );
}
