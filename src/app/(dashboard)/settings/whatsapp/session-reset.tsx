'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { resetWhatsAppSession } from '@/actions/whatsapp/identity';

export function SessionReset({ phoneNumber }: { phoneNumber: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={isPending}
      onClick={() => startTransition(async () => {
        const result = await resetWhatsAppSession(phoneNumber);
        if (!result.success) toast.error(result.error || 'Failed to reset session');
        else toast.success('Session reset');
      })}
    >
      Reset
    </Button>
  );
}
