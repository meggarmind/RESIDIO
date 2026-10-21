'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertCircle, AlertTriangle, Loader2, TestTube } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  getCommsOverrideState,
  updateCommsOverrideSettings,
  setDebugMode,
  type CommsOverrideState,
} from '@/actions/settings/comms-override';
import { isValidOverrideEmail, isValidOverridePhone } from '@/lib/comms-override/resolver';
import { overrideNumberConflict } from '@/lib/comms-override/number-conflict';
import { DEBUG_DURATION_MAX, DEBUG_DURATION_MIN } from '@/lib/comms-override/limits';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { useTestEmail } from '@/hooks/use-email';
import { SettingsRow } from '@/components/settings/settings-row';
import { SettingsSection } from '@/components/settings/settings-section';

function useCanManageComms() {
  const { hasPermission } = useAuth();
  return hasPermission(PERMISSIONS.SETTINGS_MANAGE_GENERAL);
}

const QUERY_KEY = ['comms-override-state'];

/** Testing: redirect outbound messages to override contacts, Debug Mode and the test email. */
export function TestingSection() {
  const { data, isLoading, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const result = await getCommsOverrideState();
      if (result.error || !result.data) throw new Error(result.error || 'Failed to load');
      return result.data;
    },
  });

  if (isLoading || error || !data) {
    return (
      <SettingsSection
        id="testing"
        title="Testing"
        summary={isLoading ? 'Loading' : 'Could not load the communications override'}
        permissions={[PERMISSIONS.SETTINGS_MANAGE_GENERAL]}
        defaultCollapsed
        // While loading, keep the footer (disabled) so its height is reserved and the page does not jump when the form arrives.
        instant={!isLoading}
      >
        <div className="p-4 md:p-5">
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error instanceof Error ? error.message : 'Failed to load the communications override.'}</AlertDescription>
            </Alert>
          )}
        </div>
      </SettingsSection>
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
  const canManage = useCanManageComms();
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
  const fromConflict = overrideNumberConflict({ phone, whatsappPhone }, data.whatsappFromNumber);
  const phoneError =
    phone.trim() !== '' && !isValidOverridePhone(phone.trim())
      ? 'Use international format, e.g. +2348012345678.'
      : fromConflict?.field === 'phone' ? fromConflict.message : null;
  const whatsappError =
    whatsappPhone.trim() !== '' && !isValidOverridePhone(whatsappPhone.trim())
      ? 'Use international format, e.g. +2348012345678.'
      : fromConflict?.field === 'whatsappPhone' ? fromConflict.message : null;
  const hasErrors = Boolean(emailError || phoneError || whatsappError);
  const blankWhileActive = data.effectiveEnabled && (email.trim() === '' || phone.trim() === '');

  const isDirty =
    (data.isProduction && enabled !== data.storedEnabled) ||
    email !== data.email ||
    phone !== data.phone ||
    whatsappPhone !== data.whatsappPhone;
  const discard = () => {
    setEnabled(data.storedEnabled);
    setEmail(data.email);
    setPhone(data.phone);
    setWhatsappPhone(data.whatsappPhone);
  };
  const redirectOn = data.effectiveEnabled || data.debugEffective;
  const summary = `Redirect ${data.effectiveEnabled ? 'on' : 'off'}${
    data.isProduction ? '' : ' (forced on: non-production)'
  }, Debug Mode ${data.debugEffective ? 'on' : 'off'}${redirectOn ? '. Messages go to the override contacts, not residents.' : ''}`;

  return (
    <SettingsSection
      id="testing"
      title="Testing"
      summary={summary}
      permissions={[PERMISSIONS.SETTINGS_MANAGE_GENERAL]}
      defaultCollapsed
      warning={redirectOn}
      isDirty={isDirty}
      isSaving={save.isPending}
      canSave={!hasErrors}
      saveBlockedReason="Fix the override contacts first."
      onSave={() => save.mutateAsync()}
      onDiscard={discard}
    >
      <p className="px-4 pt-4 text-sm text-muted-foreground md:px-5">
        Redirects outbound email, SMS and WhatsApp to the contacts below, so UAT data never messages real people. Environment:{' '}
        <strong>{data.environment}</strong>.
      </p>

      {blankWhileActive && (
        <div className="px-4 pt-4 md:px-5">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              The redirect is active but an override email or phone is blank. Messages that need a blank value are blocked, not sent.
            </AlertDescription>
          </Alert>
        </div>
      )}

      <SettingsRow rowId="redirect-all">
        {({ controlId }) => (
          <Switch
            id={controlId}
            checked={data.isProduction ? enabled : true}
            onCheckedChange={setEnabled}
            disabled={!canManage || !data.isProduction || save.isPending}
          />
        )}
      </SettingsRow>
      {!data.isProduction && (
        <p className="px-4 pb-4 text-sm text-muted-foreground md:px-5">
          Outside production the redirect is always on and cannot be turned off here.
        </p>
      )}

      <SettingsRow rowId="override-contacts" stacked>
        <div className="w-full max-w-md space-y-4">
          <div className="space-y-1">
            <Label htmlFor="comms-override-email">Override email</Label>
            <Input id="comms-override-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" disabled={!canManage} aria-invalid={!!emailError} aria-describedby={emailError ? 'comms-override-email-error' : undefined} />
            {emailError && <p id="comms-override-email-error" role="alert" className="text-xs text-destructive">{emailError}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="comms-override-phone">Override phone (SMS and WhatsApp)</Label>
            <Input id="comms-override-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+2348012345678" disabled={!canManage} aria-invalid={!!phoneError} aria-describedby={phoneError ? 'comms-override-phone-error' : undefined} />
            {phoneError && <p id="comms-override-phone-error" role="alert" className="text-xs text-destructive">{phoneError}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="comms-override-whatsapp">WhatsApp number (optional)</Label>
            <Input id="comms-override-whatsapp" value={whatsappPhone} onChange={(e) => setWhatsappPhone(e.target.value)} placeholder="Falls back to the override phone" disabled={!canManage} aria-invalid={!!whatsappError} aria-describedby={whatsappError ? 'comms-override-whatsapp-error' : undefined} />
            {whatsappError && <p id="comms-override-whatsapp-error" role="alert" className="text-xs text-destructive">{whatsappError}</p>}
          </div>
        </div>
      </SettingsRow>

      <SettingsRow rowId="debug-mode" stacked>
        <DebugMode data={data} />
      </SettingsRow>

      <TestEmailRow />
    </SettingsSection>
  );
}

/** Send a test email to check delivery. Moved from the Email Debug page (#934). */
function TestEmailRow() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.SETTINGS_MANAGE_GENERAL);
  const testEmail = useTestEmail();
  const [address, setAddress] = useState('');

  return (
    <SettingsRow rowId="test-email">
      {({ controlId }) => (
        <>
          <Input
            id={controlId}
            type="email"
            placeholder="test@example.com"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            disabled={!canManage}
            className="max-w-xs"
          />
          <Button
            variant="outline"
            onClick={() => address && testEmail.mutate({ email: address })}
            disabled={!canManage || !address || testEmail.isPending}
          >
            {testEmail.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TestTube className="mr-2 h-4 w-4" />}
            Send Test
          </Button>
        </>
      )}
    </SettingsRow>
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

function DebugMode({ data }: { data: CommsOverrideState }) {
  const canManage = useCanManageComms();
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
    <div className="w-full space-y-4 text-sm">
      <p className="text-muted-foreground">
        Redirects every outbound email, SMS and WhatsApp message to the override contacts, whatever a resident&apos;s own setting says,
        and turns itself off when the time runs out.
      </p>
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
            {canManage && (
              <Button variant="outline" className="min-h-11 md:min-h-9" onClick={() => run.mutate({ enabled: false })} disabled={run.isPending}>
                {run.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Turn off Debug Mode
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p>Debug Mode is <strong>off</strong>.</p>
            {canManage && data.debugMode && (
              // The stored switch is still on (expired, or no usable expiry): always allow switching it off.
              <Button variant="outline" className="min-h-11 md:min-h-9" onClick={() => run.mutate({ enabled: false })} disabled={run.isPending}>
                {run.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Turn off Debug Mode
              </Button>
            )}
            {!canEnable && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Debug Mode cannot be turned on while the {missing.join(' and ')} {missing.length > 1 ? 'are' : 'is'} blank or invalid:
                  with nowhere to redirect to, every message would be blocked. Set and save the override contacts above first.
                </AlertDescription>
              </Alert>
            )}
            {canManage && (
            <div className="flex flex-wrap items-end gap-3">
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
                  aria-invalid={!durationValid}
                  aria-describedby={!durationValid ? 'comms-debug-duration-error' : undefined}
                />
              </div>
              <Button
                className="min-h-11 md:min-h-9"
                onClick={() => run.mutate({ enabled: true, durationMinutes: durationNumber })}
                disabled={run.isPending || !canEnable || !durationValid}
              >
                {run.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Turn on Debug Mode
              </Button>
            </div>
            )}
            {canManage && !durationValid && (
              <p id="comms-debug-duration-error" role="alert" className="text-xs text-destructive">Enter a whole number from {DEBUG_DURATION_MIN} to {DEBUG_DURATION_MAX}.</p>
            )}
          </div>
        )}
    </div>
  );
}
