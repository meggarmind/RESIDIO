'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { updateWhatsAppPendingContact } from '@/actions/whatsapp/identity';

export function PendingContactActions({ phoneNumber }: { phoneNumber: string }) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.WHATSAPP_MANAGE);
  const [isPending, startTransition] = useTransition();
  const [residentId, setResidentId] = useState('');
  const update = (status: 'attached' | 'ignored') => startTransition(async () => {
    const result = await updateWhatsAppPendingContact({ phoneNumber, status, residentId: residentId || undefined });
    if (!result.success) toast.error(result.error || 'Failed to update pending contact');
    else toast.success(status === 'attached' ? 'Contact attached' : 'Contact ignored');
  });

  if (!canManage) return null;

  return (
    <div className="flex items-center gap-2">
      <input
        className="h-8 w-28 rounded-md border bg-background px-2 text-xs"
        placeholder="Resident ID"
        value={residentId}
        onChange={(event) => setResidentId(event.target.value)}
        aria-label="Resident ID to attach"
      />
      <Button size="sm" variant="outline" disabled={isPending || !residentId} onClick={() => update('attached')}>Attach</Button>
      <Button size="sm" variant="ghost" disabled={isPending} onClick={() => update('ignored')}>Ignore</Button>
    </div>
  );
}
