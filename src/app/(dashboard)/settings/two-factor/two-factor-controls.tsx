'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import {
  useConfirm2FASetup,
  useDisable2FA,
  useGenerateBackupCodes,
  useInitiate2FASetup,
  useRequestDisableCode,
  useTwoFactorStatus,
} from '@/hooks/use-two-factor';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium' }).format(new Date(value));
}

/** The base32 key in groups of four, easier to type into an app by hand. */
function groupKey(secret: string) {
  return secret.match(/.{1,4}/g)?.join(' ') ?? secret;
}

function CodeField({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Code from your authenticator app</Label>
      <Input
        id={id}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        className="max-w-40 font-mono tracking-[0.3em]"
      />
    </div>
  );
}

/** Backup codes, shown once, right after they are made. */
function BackupCodesDialog({ codes, onClose }: { codes: string[] | null; onClose: () => void }) {
  return (
    <Dialog open={codes !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Your backup codes</DialogTitle>
          <DialogDescription>
            Each code signs you in once if you lose your authenticator app. They are shown only now: save them somewhere safe.
          </DialogDescription>
        </DialogHeader>
        <ul className="grid grid-cols-2 gap-2 rounded-md border bg-muted p-4 font-mono text-sm" aria-label="Backup codes">
          {codes?.map((code) => <li key={code}>{code}</li>)}
        </ul>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              navigator.clipboard?.writeText(codes?.join('\n') ?? '').then(
                () => toast.success('Backup codes copied'),
                () => toast.error('Could not copy. Write the codes down instead.')
              );
            }}
          >
            Copy codes
          </Button>
          <Button type="button" onClick={onClose}>I have saved them</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Asks for a fresh code, then runs `onSubmit` with it. */
function CodeDialog({
  open,
  title,
  description,
  submitLabel,
  destructive,
  pending,
  onSubmit,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  submitLabel: string;
  destructive?: boolean;
  pending: boolean;
  onSubmit: (code: string) => void;
  onClose: () => void;
}) {
  const [code, setCode] = useState('');
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) { setCode(''); onClose(); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <CodeField id="two-factor-action-code" value={code} onChange={setCode} />
        <DialogFooter>
          <Button
            type="button"
            variant={destructive ? 'destructive' : 'default'}
            disabled={pending || code.length !== 6}
            onClick={() => onSubmit(code)}
          >
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Set up an authenticator app, show backup codes once, make new ones, or turn two-factor off. */
export function TwoFactorControls() {
  const { hasPermission } = useAuth();
  const canDisable = hasPermission(PERMISSIONS.TWO_FACTOR_DISABLE);
  const status = useTwoFactorStatus();
  const initiate = useInitiate2FASetup();
  const confirm = useConfirm2FASetup();
  const disable = useDisable2FA();
  const requestDisable = useRequestDisableCode();
  const regenerate = useGenerateBackupCodes();

  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [setupCode, setSetupCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [action, setAction] = useState<'disable' | 'backup' | null>(null);

  if (status.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (status.error || !status.data) {
    return <p className="text-sm text-destructive">{status.error?.message || 'Could not read your two-factor settings.'}</p>;
  }

  const state = status.data;

  if (!state.enabled) {
    return (
      <div className="space-y-4">
        <p className="text-sm">
          Two-factor login is <span className="font-medium">off</span>. Turn it on to ask for a code from your authenticator app each time you sign in.
        </p>
        {!setup ? (
          <Button
            type="button"
            size="sm"
            disabled={initiate.isPending}
            onClick={() => initiate.mutate({ method: 'authenticator' }, {
              onSuccess: (result) => {
                if (!result.secret || !result.qrCode) toast.error('Setup did not return a key. Please try again.');
                else setSetup({ secret: result.secret, uri: result.qrCode });
              },
              onError: (error) => toast.error(error.message),
            })}
          >
            Set up authenticator app
          </Button>
        ) : (
          <div className="space-y-4 rounded-md border p-4">
            <ol className="list-decimal space-y-2 pl-5 text-sm">
              <li>
                In your authenticator app (for example Google Authenticator, Microsoft Authenticator or 1Password), add an account and enter this key:
                <p className="mt-2 select-all rounded-md bg-muted px-3 py-2 font-mono text-sm tracking-wider" aria-label="Setup key">{groupKey(setup.secret)}</p>
                <a href={setup.uri} className="mt-1 inline-block text-sm text-primary underline">Open in an authenticator app on this device</a>
              </li>
              <li>Enter the 6-digit code the app shows.</li>
            </ol>
            <CodeField id="two-factor-setup-code" value={setupCode} onChange={setSetupCode} />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={confirm.isPending || setupCode.length !== 6}
                onClick={() => confirm.mutate({ code: setupCode, method: 'authenticator' }, {
                  onSuccess: (result) => {
                    toast.success('Two-factor login is on');
                    setSetup(null);
                    setSetupCode('');
                    setCodes(result.backupCodes ?? []);
                  },
                  onError: (error) => toast.error(error.message),
                })}
              >
                Turn on
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => { setSetup(null); setSetupCode(''); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        <BackupCodesDialog codes={codes} onClose={() => setCodes(null)} />
      </div>
    );
  }

  const usesAuthenticator = state.method === 'authenticator';

  return (
    <div className="space-y-4">
      <p className="text-sm">
        Two-factor login is <span className="font-medium">on</span>
        {usesAuthenticator ? ' with an authenticator app' : ` by ${state.method}`}
        {state.verifiedAt ? ` since ${formatDate(state.verifiedAt)}` : ''}.
      </p>
      <p className="text-sm text-muted-foreground">
        {state.backupCodesRemaining} unused backup {state.backupCodesRemaining === 1 ? 'code' : 'codes'} left.
      </p>
      <div className="flex flex-wrap gap-2">
        {usesAuthenticator && (
          <Button type="button" size="sm" variant="outline" onClick={() => setAction('backup')}>
            Make new backup codes
          </Button>
        )}
        {canDisable && (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={requestDisable.isPending}
            onClick={() => {
              if (usesAuthenticator) return setAction('disable');
              requestDisable.mutate(undefined, {
                onSuccess: (result) => { toast.success(result.message); setAction('disable'); },
                onError: (error) => toast.error(error.message),
              });
            }}
          >
            Turn off
          </Button>
        )}
      </div>
      <CodeDialog
        open={action === 'backup'}
        title="Make new backup codes"
        description="Your old backup codes stop working. Enter a new code from your authenticator app; a code you already used is refused."
        submitLabel="Make new codes"
        pending={regenerate.isPending}
        onClose={() => setAction(null)}
        onSubmit={(code) => regenerate.mutate(code, {
          onSuccess: (result) => { setAction(null); setCodes(result.codes ?? []); },
          onError: (error) => toast.error(error.message),
        })}
      />
      <CodeDialog
        open={action === 'disable'}
        title="Turn off two-factor login"
        description="Signing in will need only your password. Enter a new code; a code you already used is refused. Your backup codes are deleted."
        submitLabel="Turn off"
        destructive
        pending={disable.isPending}
        onClose={() => setAction(null)}
        onSubmit={(code) => disable.mutate(code, {
          onSuccess: () => { setAction(null); toast.success('Two-factor login is off'); },
          onError: (error) => toast.error(error.message),
        })}
      />
      <BackupCodesDialog codes={codes} onClose={() => setCodes(null)} />
    </div>
  );
}
