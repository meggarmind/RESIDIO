'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { resetWhatsAppSession } from '@/actions/whatsapp/identity';

export function SessionReset({ phoneNumber }: { phoneNumber: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={isPending}
      onClick={() => startTransition(() => { void resetWhatsAppSession(phoneNumber); })}
    >
      Reset
    </Button>
  );
}
