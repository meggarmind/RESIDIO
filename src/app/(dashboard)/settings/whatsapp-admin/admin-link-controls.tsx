'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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
import { createWhatsAppAdminLinkCode, unlinkMyWhatsAppAdminNumber, type WhatsAppAdminAccessState } from '@/actions/whatsapp/admin-access';

const INELIGIBLE_TEXT: Record<NonNullable<WhatsAppAdminAccessState['ineligible']>, string> = {
  account_inactive: 'Your account is not active.',
  role_not_allowed: 'Your role does not have WhatsApp admin access.',
  missing_permission: 'Your role does not have WhatsApp admin access.',
  authenticator_off: 'Turn on authenticator app 2FA for your account before linking a number.',
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

/** Shows the link state, issues a one-time link code (shown once) and unlinks. */
export function AdminLinkControls({ state }: { state: WhatsAppAdminAccessState }) {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const canLink = hasPermission(PERMISSIONS.WHATSAPP_ADMIN_QUERY);
  const [issued, setIssued] = useState<{ code: string; expiresAt: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      {state.binding ? (
        <p className="text-sm">
          Linked to <span className="font-medium">{state.binding.maskedNumber}</span> since {formatTime(state.binding.boundAt)}.
          {' '}The link ends by {formatTime(state.binding.endsAt)} unless you use it or link again.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">No WhatsApp number is linked.</p>
      )}
      {state.ineligible && <p className="text-sm text-destructive">{INELIGIBLE_TEXT[state.ineligible]}</p>}
      {canLink && <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={isPending || state.ineligible !== null}
          onClick={() => startTransition(async () => {
            const result = await createWhatsAppAdminLinkCode();
            if (!result.success || !result.data) toast.error(result.error || 'Failed to create link code');
            else setIssued(result.data);
          })}
        >
          {state.binding ? 'Link a different number' : 'Create link code'}
        </Button>
        {state.binding && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => startTransition(async () => {
              const result = await unlinkMyWhatsAppAdminNumber();
              if (!result.success) toast.error(result.error || 'Failed to unlink');
              else {
                toast.success('WhatsApp number unlinked');
                router.refresh();
              }
            })}
          >
            Unlink
          </Button>
        )}
      </div>}
      <Dialog open={issued !== null} onOpenChange={(open) => { if (!open) { setIssued(null); router.refresh(); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Admin link code</DialogTitle>
            <DialogDescription>
              From the WhatsApp number you want to link, send ADMIN LINK followed by this code to the estate WhatsApp number. This code is shown once. It expires {issued ? formatTime(issued.expiresAt) : ''}.
            </DialogDescription>
          </DialogHeader>
          <p className="rounded-md border bg-muted py-4 text-center font-mono text-3xl tracking-[0.3em]" aria-live="polite">
            {issued?.code}
          </p>
          <DialogFooter>
            <Button type="button" onClick={() => { setIssued(null); router.refresh(); }}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
