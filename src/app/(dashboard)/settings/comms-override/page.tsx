'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertCircle, AlertTriangle, Bug, Loader2, ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  getCommsOverrideState,
  updateCommsOverrideSettings,
  setDebugMode,
  type CommsOverrideState,
} from '@/actions/settings/comms-override';
import { isValidOverrideEmail, isValidOverridePhone } from '@/lib/comms-override/resolver';
import { DEBUG_DURATION_MAX, DEBUG_DURATION_MIN } from '@/lib/comms-override/settings';

const QUERY_KEY = ['comms-override-state'];

function PageHeader() {
  return (
    <div>
      <h3 className="text-lg font-medium flex items-center gap-2">
        <ShieldAlert className="h-5 w-5" /> Communications override
      </h3>
      <p className="text-sm text-muted-foreground">
        Redirects outbound email, SMS and WhatsApp to the contacts below, so UAT data never messages real people.
      </p>
    </div>
  );
}

export default function CommsOverridePage() {
  const { data, isLoading, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const result = await getCommsOverrideState();
      if (result.error || !result.data) throw new Error(result.error || 'Failed to load');
      return result.data;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader />
        <Separator />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error instanceof Error ? error.message : 'Failed to load the communications override.'}</AlertDescription>
      </Alert>
    );
  }

  // Keyed on the stored values so fresh server data re-initialises the form.
  return (
    <OverrideForm
      key={`${data.storedEnabled}|${data.email}|${data.phone}|${data.whatsappPhone}`}
      data={data}
    />
  );
}

function OverrideForm({ data }: { data: CommsOverrideState }) {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(data.storedEnabled);
  const [email, setEmail] = useState(data.email);
  const [phone, setPhone] = useState(data.phone);
  const [whatsappPhone, setWhatsappPhone] = useState(data.whatsappPhone);

  const save = useMutation({
    mutationFn: async () => {
      const result = await updateCommsOverrideSettings({ enabled, email, phone, whatsappPhone });
      if (!result.success) throw new Error(result.error || 'Failed to save');
    },
    onSuccess: () => {
      toast.success('Communications override saved');
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const emailError = email.trim() !== '' && !isValidOverrideEmail(email.trim()) ? 'Enter a valid email address.' : null;
  const phoneError = phone.trim() !== '' && !isValidOverridePhone(phone.trim()) ? 'Use international format, e.g. +2348012345678.' : null;
  const whatsappError = whatsappPhone.trim() !== '' && !isValidOverridePhone(whatsappPhone.trim()) ? 'Use international format, e.g. +2348012345678.' : null;
  const hasErrors = Boolean(emailError || phoneError || whatsappError);
  const blankWhileActive = data.effectiveEnabled && (email.trim() === '' || phone.trim() === '');

  return (
    <div className="space-y-6">
      <PageHeader />
      <Separator />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Effective state</CardTitle>
          <CardDescription>What the system is doing right now.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>Environment: <strong>{data.environment}</strong></p>
          <p>
            Redirect: <strong>{data.effectiveEnabled ? 'on' : 'off'}</strong>
            {!data.isProduction && ' (forced on: non-production)'}
          </p>
        </CardContent>
      </Card>

      <DebugModeCard data={data} />

      {blankWhileActive && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            The redirect is active but an override email or phone is blank. Messages that need a blank value are blocked, not sent.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Global switch</CardTitle>
          <CardDescription>
            {data.isProduction
              ? 'When on, every message that follows the global rule is redirected.'
              : 'Outside production the redirect is always on and cannot be turned off here.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <Label htmlFor="comms-override-enabled">Redirect outbound communications</Label>
            <Switch
              id="comms-override-enabled"
              checked={data.isProduction ? enabled : true}
              onCheckedChange={setEnabled}
              disabled={!data.isProduction || save.isPending}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Override contacts</CardTitle>
          <CardDescription>Redirected messages are delivered here. Leave blank only if you want those messages blocked.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="comms-override-email">Override email</Label>
            <Input id="comms-override-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            {emailError && <p className="text-xs text-destructive">{emailError}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="comms-override-phone">Override phone (SMS and WhatsApp)</Label>
            <Input id="comms-override-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+2348012345678" />
            {phoneError && <p className="text-xs text-destructive">{phoneError}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="comms-override-whatsapp">WhatsApp number (optional)</Label>
            <Input id="comms-override-whatsapp" value={whatsappPhone} onChange={(e) => setWhatsappPhone(e.target.value)} placeholder="Falls back to the override phone" />
            {whatsappError && <p className="text-xs text-destructive">{whatsappError}</p>}
          </div>
          <Button onClick={() => save.mutate()} disabled={save.isPending || hasErrors}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/** "1h 05m 09s" style remaining time; "0s" once past. */
function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}h ${pad(m)}m ${pad(sec)}s` : m > 0 ? `${m}m ${pad(sec)}s` : `${sec}s`;
}

function DebugModeCard({ data }: { data: CommsOverrideState }) {
  const queryClient = useQueryClient();
  const [duration, setDuration] = useState(String(data.debugDurationMinutes));
  const [now, setNow] = useState(() => Date.now());

  const expiryMs = data.debugExpiresAt ? Date.parse(data.debugExpiresAt) : NaN;
  const hasCountdown = data.debugMode && !Number.isNaN(expiryMs);
  const remaining = hasCountdown ? expiryMs - now : 0;
  const active = data.debugMode && (data.debugExpiryUnparseable || (hasCountdown && remaining > 0));

  // Tick once a second while there is a countdown; refetch the state when it runs out.
  useEffect(() => {
    if (!hasCountdown) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= expiryMs) {
        clearInterval(id);
        queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      }
    }, 1000);
    return () => clearInterval(id);
  }, [hasCountdown, expiryMs, queryClient]);

  const run = useMutation({
    mutationFn: async (input: { enabled: boolean; durationMinutes?: number }) => {
      const result = await setDebugMode(input);
      if (!result.success) throw new Error(result.error || 'Failed to change Debug Mode');
      return input.enabled;
    },
    onSuccess: (enabled) => {
      setNow(Date.now());
      toast.success(enabled ? 'Debug Mode is on' : 'Debug Mode is off');
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const durationNumber = Number(duration);
  const durationValid =
    duration.trim() !== '' && Number.isInteger(durationNumber) && durationNumber >= DEBUG_DURATION_MIN && durationNumber <= DEBUG_DURATION_MAX;
  const whatsappNumber = data.whatsappPhone || data.phone;
  const missing: string[] = [];
  if (!isValidOverrideEmail(data.email)) missing.push('override email');
  if (!isValidOverridePhone(data.phone)) missing.push('override phone');
  if (!isValidOverridePhone(whatsappNumber)) missing.push('WhatsApp number');
  const canEnable = missing.length === 0;

  return (
    <Card id="debug-mode">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Bug className="h-4 w-4" /> Debug Mode
        </CardTitle>
        <CardDescription>
          Redirects every outbound email, SMS and WhatsApp message to the override contacts, whatever a resident&apos;s own setting says,
          and turns itself off when the time runs out.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {data.debugExpiryUnparseable && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Debug Mode is on but its expiry (&quot;{data.debugExpiresAt}&quot;) cannot be read, so the redirect stays on. Turn Debug Mode off,
              then on again to set a valid expiry.
            </AlertDescription>
          </Alert>
        )}
        {data.debugMissingExpiry && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              The Debug Mode switch is on but no expiry is stored, so it counts as expired and redirects nothing. Turn it off, or enable it
              again with a duration.
            </AlertDescription>
          </Alert>
        )}
        {!data.isProduction && (
          <p className="text-muted-foreground">
            This is a non-production environment, which already redirects everything. Debug Mode can be switched here but adds nothing
            beyond that.
          </p>
        )}

        {active ? (
          <div className="space-y-3">
            <p>
              Debug Mode is <strong>on</strong>
              {hasCountdown && (
                <>
                  {' '}and expires in <strong data-testid="debug-countdown">{formatRemaining(remaining)}</strong> (at{' '}
                  {new Date(expiryMs).toLocaleString()})
                </>
              )}
              .
            </p>
            <Button variant="outline" onClick={() => run.mutate({ enabled: false })} disabled={run.isPending}>
              {run.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Turn off Debug Mode
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p>Debug Mode is <strong>off</strong>.</p>
            {!canEnable && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Debug Mode cannot be turned on while the {missing.join(' and ')} {missing.length > 1 ? 'are' : 'is'} blank or invalid:
                  with nowhere to redirect to, every message would be blocked. Set and save the override contacts below first.
                </AlertDescription>
              </Alert>
            )}
            <div className="flex items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor="comms-debug-duration">Duration (minutes, {DEBUG_DURATION_MIN} to {DEBUG_DURATION_MAX})</Label>
                <Input
                  id="comms-debug-duration"
                  type="number"
                  min={DEBUG_DURATION_MIN}
                  max={DEBUG_DURATION_MAX}
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className="w-32"
                />
              </div>
              <Button
                onClick={() => run.mutate({ enabled: true, durationMinutes: durationNumber })}
                disabled={run.isPending || !canEnable || !durationValid}
              >
                {run.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Turn on Debug Mode
              </Button>
            </div>
            {!durationValid && (
              <p className="text-xs text-destructive">Enter a whole number from {DEBUG_DURATION_MIN} to {DEBUG_DURATION_MAX}.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
