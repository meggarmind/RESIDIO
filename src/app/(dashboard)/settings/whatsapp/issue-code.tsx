'use client';

import { useState, useTransition } from 'react';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
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
import { createWhatsAppLinkToken } from '@/actions/whatsapp/identity';

type Issued = { code: string; expiresAt: string };
type Result = { success: boolean; data: Issued | null; error: string | null };

export const IDENTITY_CHECK =
  'Confirm the resident’s identity first: in person, or by calling from the estate phone and checking two facts from the record (house number, resident code, last payment amount). A call-back to the WhatsApp number alone does not count.';

function formatTime(value: string) {
  return new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

/**
 * Confirm, run the action, then show the code once. The code lives only in this component's
 * state and is dropped when the dialog closes.
 */
export function CodeAction({ label, title, description, codeTitle, codeHint, run }: {
  label: string;
  title: string;
  description: string;
  codeTitle: string;
  codeHint: string;
  run: () => Promise<Result>;
}) {
  const { hasPermission } = useAuth();
  const [issued, setIssued] = useState<Issued | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!hasPermission(PERMISSIONS.WHATSAPP_MANAGE)) return null;

  return (
    <>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button type="button" size="sm" variant="outline" disabled={isPending}>{label}</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description} {IDENTITY_CHECK}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => startTransition(async () => {
                const result = await run();
                if (!result.success || !result.data) toast.error(result.error || 'Failed to create code');
                else setIssued(result.data);
              })}
            >
              I have confirmed identity
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={issued !== null} onOpenChange={(open) => { if (!open) setIssued(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{codeTitle}</DialogTitle>
            <DialogDescription>
              {codeHint} This code is shown once. It expires {issued ? formatTime(issued.expiresAt) : ''}.
            </DialogDescription>
          </DialogHeader>
          <p className="rounded-md border bg-muted py-4 text-center font-mono text-3xl tracking-[0.3em]" aria-live="polite">
            {issued?.code}
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                if (!issued) return;
                try {
                  await navigator.clipboard.writeText(issued.code);
                  toast.success('Code copied');
                } catch {
                  toast.error('Could not copy. Read the code out instead.');
                }
              }}
            >
              <Copy className="mr-2 h-4 w-4" />Copy
            </Button>
            <Button type="button" onClick={() => setIssued(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function IssueLinkCode({ residentId, residentName }: { residentId: string; residentName: string }) {
  return (
    <CodeAction
      label="Issue link code"
      title="Issue WhatsApp link code"
      description={`A link code lets the number that sends it see ${residentName}'s financial standing. It is valid for 15 minutes.`}
      codeTitle="Link code"
      codeHint="The resident replies LINK followed by this code from their WhatsApp number."
      run={() => createWhatsAppLinkToken(residentId, 'link')}
    />
  );
}

export function IssueSetupCode({ residentId, residentName }: { residentId: string; residentName: string }) {
  return (
    <CodeAction
      label="Issue setup code"
      title="Issue WhatsApp PIN setup code"
      description={`A setup code lets ${residentName} set their first WhatsApp PIN. It is valid for 10 minutes and replaces any earlier setup code.`}
      codeTitle="PIN setup code"
      codeHint="The resident enters this code when WhatsApp asks for the setup code from the estate office."
      run={() => createWhatsAppLinkToken(residentId, 'pin_setup')}
    />
  );
}
