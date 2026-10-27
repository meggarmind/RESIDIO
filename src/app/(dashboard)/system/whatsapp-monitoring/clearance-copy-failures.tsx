'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { retryWhatsAppClearanceCopy } from '@/actions/whatsapp/admin-console';

export type ClearanceCopyFailure = {
  id: string;
  error: string | null;
  attempts: number;
  updated_at: string;
  recipient: { first_name: string; last_name: string; resident_code: string } | null;
  document: { title: string } | null;
};

function RetryButton({ copyId }: { copyId: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={isPending}
      onClick={() => startTransition(async () => {
        const result = await retryWhatsAppClearanceCopy(copyId);
        if (!result.success) toast.error(result.error || 'Failed to retry the copy');
        else toast.success('Copy sent');
      })}
    >
      Retry
    </Button>
  );
}

/** Copies of issued clearance certificates that did not reach their recipient (#816 decision 24). */
export function ClearanceCopyFailures({ rows }: { rows: ClearanceCopyFailure[] }) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.WHATSAPP_MANAGE);
  const when = (value: string) => new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Clearance certificate copies not sent</CardTitle>
        <CardDescription>A copy that failed never held up the resident&apos;s own certificate. Fix the cause (for example the recipient&apos;s opt-in), then retry.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-2 pr-4">Recipient</th>
                <th className="pb-2 pr-4">Certificate</th>
                <th className="pb-2 pr-4">Why</th>
                <th className="pb-2 pr-4">Tries</th>
                <th className="pb-2 pr-4">Last try</th>
                {canManage ? <th className="pb-2">Action</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={canManage ? 6 : 5} className="py-3 text-muted-foreground">Every certificate copy was sent.</td></tr>
              ) : rows.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="py-3 pr-4">{row.recipient ? `${row.recipient.first_name} ${row.recipient.last_name}` : 'Unknown'}</td>
                  <td className="py-3 pr-4">{row.document?.title ?? 'Certificate'}</td>
                  <td className="py-3 pr-4">{row.error ?? 'Not sent'}</td>
                  <td className="py-3 pr-4">{row.attempts}</td>
                  <td className="py-3 pr-4 text-xs text-muted-foreground">{when(row.updated_at)}</td>
                  {canManage ? <td className="py-3"><RetryButton copyId={row.id} /></td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
