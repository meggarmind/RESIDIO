'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { updateWhatsAppPendingContact } from '@/actions/whatsapp/identity';

export function PendingContactActions({ phoneNumber }: { phoneNumber: string }) {
  const [isPending, startTransition] = useTransition();
  const [residentId, setResidentId] = useState('');
  const update = (status: 'attached' | 'ignored') => startTransition(() => {
    void updateWhatsAppPendingContact({ phoneNumber, status, residentId: residentId || undefined });
  });

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
