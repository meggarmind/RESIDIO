'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { resetWhatsAppSession } from '@/actions/whatsapp/identity';

export function SessionReset({ phoneNumber }: { phoneNumber: string }) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.WHATSAPP_MANAGE);
  const [isPending, startTransition] = useTransition();

  if (!canManage) return null;

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
