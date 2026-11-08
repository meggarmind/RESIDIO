'use client';

import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import {
  useForgetAllRememberedComputers,
  useForgetRememberedComputer,
  useRememberedComputers,
} from '@/hooks/use-two-factor';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium' }).format(new Date(value));
}

/**
 * Remembered computers (#1390): computers where the second factor is skipped for 30 days, with
 * Forget and Forget all computers.
 */
export function RememberedComputers() {
  const { hasPermission } = useAuth();
  const computers = useRememberedComputers();
  const forget = useForgetRememberedComputer();
  const forgetAll = useForgetAllRememberedComputers();

  // The list and both Forget actions need two_factor.enable (CORE §6: the client check names the server's permission).
  if (!hasPermission(PERMISSIONS.TWO_FACTOR_ENABLE)) return null;

  const done = { onSuccess: (r: { message: string }) => toast.success(r.message), onError: (e: Error) => toast.error(e.message) };
  const busy = forget.isPending || forgetAll.isPending;

  return (
    <div className="space-y-3 rounded-md border p-4">
      <div className="space-y-1">
        <p className="text-sm font-medium">Remembered computers</p>
        <p className="text-sm text-muted-foreground">
          These computers sign in with your password only, for 30 days. Forget a computer you no longer use.
        </p>
      </div>
      {computers.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : computers.error ? (
        <p className="text-sm text-destructive">{computers.error.message}</p>
      ) : !computers.data?.length ? (
        <p className="text-sm text-muted-foreground">No remembered computers.</p>
      ) : (
        <>
          <ul className="divide-y" aria-label="Remembered computers">
            {computers.data.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="text-sm">
                  <p className="font-medium">
                    {c.device || 'Unknown browser'}
                    {c.current && <span className="ml-2 text-muted-foreground">(this computer)</span>}
                  </p>
                  <p className="text-muted-foreground">
                    Added {formatDate(c.createdAt)} · Last used {c.lastUsedAt ? formatDate(c.lastUsedAt) : 'never'}
                  </p>
                </div>
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => forget.mutate(c.id, done)}>
                  Forget
                </Button>
              </li>
            ))}
          </ul>
          <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={() => forgetAll.mutate(undefined, done)}>
            Forget all computers
          </Button>
        </>
      )}
    </div>
  );
}
